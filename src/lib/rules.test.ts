// Security-rules tests. Needs the Firestore emulator:
//   yarn test:rules   (wraps `firebase emulators:exec`)
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

const PROJECT = "demo-code-breaker";
const KEY = "ABCDEF";
const ALICE = "alice-uid";
const BOB = "bob-uid";
const EVE = "eve-uid";

let env: RulesTestEnvironment;

function ts(offsetMs: number) {
  return Timestamp.fromMillis(Date.now() + offsetMs);
}

function member(username: string, ready = false) {
  return { username, ready, joinedAt: ts(0), lastSeenAt: ts(0) };
}

function baseRoom(overrides: Record<string, unknown> = {}) {
  return {
    status: "LOBBY",
    hostUid: ALICE,
    memberUids: [ALICE],
    members: { [ALICE]: member("Alice") },
    turnSeconds: 60,
    currentTurnUid: null,
    turnEndsAt: null,
    guessCount: 0,
    timeoutCount: 0,
    winnerUid: null,
    winningGuessId: null,
    revealedSecrets: {},
    createdAt: ts(0),
    expireAt: ts(12 * 3600 * 1000),
    ...overrides,
  };
}

function playingRoom(overrides: Record<string, unknown> = {}) {
  return baseRoom({
    status: "PLAYING",
    memberUids: [ALICE, BOB],
    members: { [ALICE]: member("Alice", true), [BOB]: member("Bob", true) },
    currentTurnUid: ALICE,
    turnEndsAt: ts(60_000),
    ...overrides,
  });
}

// Seed state with rules disabled, then act as a user.
async function seed(room: Record<string, unknown>, extra?: (db: Firestore) => Promise<void>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, "rooms", KEY), room);
    if (extra) await extra(db);
  });
}

function as(uid: string): Firestore {
  return env.authenticatedContext(uid).firestore() as unknown as Firestore;
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe("room create", () => {
  it("allows a valid LOBBY room by its host", async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), "rooms", KEY), baseRoom()));
  });
  it("rejects creating a room for someone else", async () => {
    await assertFails(
      setDoc(doc(as(EVE), "rooms", KEY), baseRoom()) // hostUid = ALICE
    );
  });
  it("rejects a non-LOBBY create", async () => {
    await assertFails(
      setDoc(doc(as(ALICE), "rooms", KEY), baseRoom({ status: "PLAYING" }))
    );
  });
});

describe("join", () => {
  it("allows the second player to append themself", async () => {
    await seed(baseRoom());
    await assertSucceeds(
      updateDoc(doc(as(BOB), "rooms", KEY), {
        memberUids: [ALICE, BOB],
        [`members.${BOB}`]: member("Bob"),
      })
    );
  });
  it("rejects a third player", async () => {
    await seed(
      baseRoom({
        memberUids: [ALICE, BOB],
        members: { [ALICE]: member("Alice"), [BOB]: member("Bob") },
      })
    );
    await assertFails(
      updateDoc(doc(as(EVE), "rooms", KEY), {
        memberUids: [ALICE, BOB, EVE],
        [`members.${EVE}`]: member("Eve"),
      })
    );
  });
});

describe("private secret docs", () => {
  it("owner can write in LOBBY and read back", async () => {
    await seed(baseRoom({ memberUids: [ALICE, BOB], members: { [ALICE]: member("Alice"), [BOB]: member("Bob") } }));
    const mine = doc(as(ALICE), "rooms", KEY, "private", ALICE);
    await assertSucceeds(setDoc(mine, { secret: "0123", createdAt: ts(0), expireAt: ts(1000) }));
    await assertSucceeds(getDoc(mine));
  });
  it("opponent cannot read my secret", async () => {
    await seed(playingRoom(), async (db) => {
      await setDoc(doc(db, "rooms", KEY, "private", ALICE), { secret: "0123" });
    });
    await assertFails(getDoc(doc(as(BOB), "rooms", KEY, "private", ALICE)));
  });
  it("secret is frozen once PLAYING", async () => {
    await seed(playingRoom(), async (db) => {
      await setDoc(doc(db, "rooms", KEY, "private", ALICE), { secret: "0123" });
    });
    await assertFails(
      setDoc(doc(as(ALICE), "rooms", KEY, "private", ALICE), {
        secret: "4567",
        createdAt: ts(0),
        expireAt: ts(1000),
      })
    );
  });
});

describe("settings", () => {
  it("host can change the timer in LOBBY", async () => {
    await seed(baseRoom({ memberUids: [ALICE, BOB], members: { [ALICE]: member("Alice"), [BOB]: member("Bob") } }));
    await assertSucceeds(updateDoc(doc(as(ALICE), "rooms", KEY), { turnSeconds: 90 }));
  });
  it("non-host cannot", async () => {
    await seed(baseRoom({ memberUids: [ALICE, BOB], members: { [ALICE]: member("Alice"), [BOB]: member("Bob") } }));
    await assertFails(updateDoc(doc(as(BOB), "rooms", KEY), { turnSeconds: 90 }));
  });
  it("invalid value rejected", async () => {
    await seed(baseRoom());
    await assertFails(updateDoc(doc(as(ALICE), "rooms", KEY), { turnSeconds: 45 }));
  });
});

describe("heartbeat", () => {
  it("member may bump own lastSeenAt only", async () => {
    await seed(playingRoom());
    await assertSucceeds(
      updateDoc(doc(as(BOB), "rooms", KEY), { [`members.${BOB}.lastSeenAt`]: ts(0) })
    );
    await assertFails(
      updateDoc(doc(as(BOB), "rooms", KEY), { [`members.${ALICE}.lastSeenAt`]: ts(0) })
    );
    await assertFails(
      updateDoc(doc(as(BOB), "rooms", KEY), { [`members.${BOB}.ready`]: false })
    );
  });
});

describe("ready + start", () => {
  const lobbyTwo = () =>
    baseRoom({
      memberUids: [ALICE, BOB],
      members: { [ALICE]: member("Alice"), [BOB]: member("Bob") },
    });

  it("first ready marks only own entry", async () => {
    await seed(lobbyTwo());
    await assertSucceeds(
      updateDoc(doc(as(ALICE), "rooms", KEY), { [`members.${ALICE}.ready`]: true })
    );
  });
  it("second ready may start the game", async () => {
    await seed(
      baseRoom({
        memberUids: [ALICE, BOB],
        members: { [ALICE]: member("Alice", true), [BOB]: member("Bob") },
      })
    );
    await assertSucceeds(
      updateDoc(doc(as(BOB), "rooms", KEY), {
        [`members.${BOB}.ready`]: true,
        status: "PLAYING",
        currentTurnUid: ALICE,
        turnEndsAt: ts(60_000),
      })
    );
  });
  it("cannot start while opponent not ready", async () => {
    await seed(lobbyTwo());
    await assertFails(
      updateDoc(doc(as(BOB), "rooms", KEY), {
        [`members.${BOB}.ready`]: true,
        status: "PLAYING",
        currentTurnUid: BOB,
        turnEndsAt: ts(60_000),
      })
    );
  });
});

function guessDoc(uid: string, seq: number, value: string) {
  return {
    seq,
    uid,
    value,
    isTimeout: false,
    status: "pending",
    digits: null,
    placed: null,
    createdAt: ts(0),
    scoredAt: null,
    expireAt: ts(1000),
  };
}

function guessBatch(db: Firestore, uid: string, other: string, seq: number, value = "4271") {
  const b = writeBatch(db);
  b.set(doc(db, "rooms", KEY, "guesses", `g${seq}`), guessDoc(uid, seq, value));
  b.update(doc(db, "rooms", KEY), {
    currentTurnUid: other,
    turnEndsAt: ts(60_000),
    guessCount: seq + 1,
  });
  return b.commit();
}

describe("guessing", () => {
  it("current player can guess (create + flip batch)", async () => {
    await seed(playingRoom());
    await assertSucceeds(guessBatch(as(ALICE), ALICE, BOB, 0));
  });
  it("out-of-turn guess rejected", async () => {
    await seed(playingRoom());
    await assertFails(guessBatch(as(BOB), BOB, ALICE, 0));
  });
  it("guess after deadline rejected", async () => {
    await seed(playingRoom({ turnEndsAt: ts(-10_000) }));
    await assertFails(guessBatch(as(ALICE), ALICE, BOB, 0));
  });
  it("wrong seq rejected", async () => {
    await seed(playingRoom({ guessCount: 3 }));
    await assertFails(guessBatch(as(ALICE), ALICE, BOB, 0));
  });
});

describe("feedback", () => {
  const seeded = () =>
    seed(playingRoom({ currentTurnUid: BOB, guessCount: 1 }), async (db) => {
      await setDoc(doc(db, "rooms", KEY, "guesses", "g0"), guessDoc(ALICE, 0, "4271"));
    });

  it("opponent scores a pending guess", async () => {
    await seeded();
    await assertSucceeds(
      updateDoc(doc(as(BOB), "rooms", KEY, "guesses", "g0"), {
        status: "scored",
        digits: 2,
        placed: 1,
        scoredAt: ts(0),
      })
    );
  });
  it("guesser cannot score own guess", async () => {
    await seeded();
    await assertFails(
      updateDoc(doc(as(ALICE), "rooms", KEY, "guesses", "g0"), {
        status: "scored",
        digits: 2,
        placed: 1,
        scoredAt: ts(0),
      })
    );
  });
  it("cannot tamper with the guess value", async () => {
    await seeded();
    await assertFails(
      updateDoc(doc(as(BOB), "rooms", KEY, "guesses", "g0"), {
        status: "scored",
        digits: 2,
        placed: 1,
        scoredAt: ts(0),
        value: "9999",
      })
    );
  });
  it("placed > digits rejected", async () => {
    await seeded();
    await assertFails(
      updateDoc(doc(as(BOB), "rooms", KEY, "guesses", "g0"), {
        status: "scored",
        digits: 1,
        placed: 3,
        scoredAt: ts(0),
      })
    );
  });
});

describe("timeouts", () => {
  function timeoutBatch(db: Firestore, seq: number, timedOut: string, next: string, counts: { g: number; t: number }) {
    const b = writeBatch(db);
    b.set(doc(db, "rooms", KEY, "guesses", `g${seq}`), {
      seq,
      uid: timedOut,
      value: "",
      isTimeout: true,
      status: "scored",
      digits: 0,
      placed: 0,
      createdAt: ts(0),
      scoredAt: ts(0),
      expireAt: ts(1000),
    });
    b.update(doc(db, "rooms", KEY), {
      currentTurnUid: next,
      turnEndsAt: ts(60_000),
      guessCount: counts.g + 1,
      timeoutCount: counts.t + 1,
    });
    return b.commit();
  }

  it("either member may sweep after the deadline", async () => {
    await seed(playingRoom({ turnEndsAt: ts(-5_000) }));
    await assertSucceeds(timeoutBatch(as(BOB), 0, ALICE, BOB, { g: 0, t: 0 }));
  });
  it("sweep before the deadline rejected", async () => {
    await seed(playingRoom({ turnEndsAt: ts(60_000) }));
    await assertFails(timeoutBatch(as(BOB), 0, ALICE, BOB, { g: 0, t: 0 }));
  });
  it("room delete only at 20 timeouts", async () => {
    await seed(playingRoom({ timeoutCount: 5 }));
    await assertFails(deleteDoc(doc(as(ALICE), "rooms", KEY)));
    await seed(playingRoom({ timeoutCount: 20 }));
    await assertSucceeds(deleteDoc(doc(as(ALICE), "rooms", KEY)));
  });
});

describe("finish + reveal", () => {
  it("self-win requires a scored 4-placed guess", async () => {
    await seed(playingRoom({ guessCount: 1 }), async (db) => {
      await setDoc(doc(db, "rooms", KEY, "guesses", "g0"), {
        ...guessDoc(ALICE, 0, "4271"),
        status: "scored",
        digits: 4,
        placed: 4,
      });
      await setDoc(doc(db, "rooms", KEY, "private", ALICE), { secret: "0123" });
    });
    await assertSucceeds(
      updateDoc(doc(as(ALICE), "rooms", KEY), {
        status: "FINISHED",
        winnerUid: ALICE,
        winningGuessId: "g0",
        currentTurnUid: null,
        turnEndsAt: null,
        [`revealedSecrets.${ALICE}`]: "0123",
      })
    );
  });
  it("self-win without a winning guess rejected", async () => {
    await seed(playingRoom({ guessCount: 1 }), async (db) => {
      await setDoc(doc(db, "rooms", KEY, "guesses", "g0"), {
        ...guessDoc(ALICE, 0, "4271"),
        status: "scored",
        digits: 2,
        placed: 1,
      });
    });
    await assertFails(
      updateDoc(doc(as(ALICE), "rooms", KEY), {
        status: "FINISHED",
        winnerUid: ALICE,
        winningGuessId: "g0",
        currentTurnUid: null,
        turnEndsAt: null,
      })
    );
  });
  it("revealed secret must match the private doc", async () => {
    await seed(playingRoom({ status: "FINISHED", winnerUid: ALICE, currentTurnUid: null, turnEndsAt: null }), async (db) => {
      await setDoc(doc(db, "rooms", KEY, "private", BOB), { secret: "4567" });
    });
    await assertFails(
      updateDoc(doc(as(BOB), "rooms", KEY), { [`revealedSecrets.${BOB}`]: "1111" })
    );
    await assertSucceeds(
      updateDoc(doc(as(BOB), "rooms", KEY), { [`revealedSecrets.${BOB}`]: "4567" })
    );
  });
});
