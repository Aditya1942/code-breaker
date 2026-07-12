// Client-side replacement for the old API routes. Every write here must
// match a rules case in firestore.rules exactly (field sets are validated
// with diff().affectedKeys().hasOnly(...) — a stray field = permission-denied).
import {
  Timestamp,
  deleteDoc,
  doc,
  runTransaction,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth } from "./firebase";
import { db } from "./firebase";
import { score } from "./game";

export const MAX_TIMEOUTS = 20;
export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

export type RoomStatus = "LOBBY" | "PLAYING" | "FINISHED";

export type MemberInfo = {
  username: string;
  ready: boolean;
  joinedAt: Timestamp;
  lastSeenAt: Timestamp;
};

export type RoomDoc = {
  status: RoomStatus;
  hostUid: string;
  memberUids: string[];
  members: Record<string, MemberInfo>;
  turnSeconds: number;
  currentTurnUid: string | null;
  turnEndsAt: Timestamp | null;
  guessCount: number;
  timeoutCount: number;
  winnerUid: string | null;
  winningGuessId: string | null;
  revealedSecrets: Record<string, string>;
  createdAt: Timestamp;
  expireAt: Timestamp;
};

export type GuessDoc = {
  seq: number;
  uid: string;
  value: string;
  isTimeout: boolean;
  status: "pending" | "scored";
  digits: number | null;
  placed: number | null;
  createdAt: Timestamp;
  scoredAt: Timestamp | null;
  expireAt: Timestamp;
};

export class RoomError extends Error {
  constructor(public code: "not-found" | "full" | "conflict", message: string) {
    super(message);
  }
}

const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/I/0/1

function randomKey(): string {
  let key = "";
  for (let i = 0; i < 6; i++) {
    key += KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)];
  }
  return key;
}

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in");
  return u.uid;
}

export function roomRef(key: string) {
  return doc(db, "rooms", key);
}

function guessRef(key: string, gid: string) {
  return doc(db, "rooms", key, "guesses", gid);
}

export function privateRef(key: string, ownerUid: string) {
  return doc(db, "rooms", key, "private", ownerUid);
}

function expireAt(): Timestamp {
  return Timestamp.fromMillis(Date.now() + ROOM_TTL_MS);
}

function otherOf(room: RoomDoc, id: string): string {
  return room.memberUids[0] === id ? room.memberUids[1] : room.memberUids[0];
}

export async function createRoom(username: string): Promise<string> {
  const me = uid();
  for (let attempt = 0; attempt < 5; attempt++) {
    const key = randomKey();
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef(key));
        if (snap.exists()) throw new RoomError("conflict", "key collision");
        const now = Timestamp.now();
        const room: RoomDoc = {
          status: "LOBBY",
          hostUid: me,
          memberUids: [me],
          members: {
            [me]: { username, ready: false, joinedAt: now, lastSeenAt: now },
          },
          turnSeconds: 60,
          currentTurnUid: null,
          turnEndsAt: null,
          guessCount: 0,
          timeoutCount: 0,
          winnerUid: null,
          winningGuessId: null,
          revealedSecrets: {},
          createdAt: now,
          expireAt: expireAt(),
        };
        tx.set(roomRef(key), room);
      });
      return key;
    } catch (e) {
      if (e instanceof RoomError && e.code === "conflict") continue;
      throw e;
    }
  }
  throw new Error("Could not create room, try again");
}

export async function joinRoom(key: string, username: string): Promise<void> {
  const me = uid();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(key));
    if (!snap.exists()) throw new RoomError("not-found", "Room not found");
    const room = snap.data() as RoomDoc;
    if (room.memberUids.includes(me)) return; // idempotent
    if (room.memberUids.length >= 2) throw new RoomError("full", "Room is full");
    const now = Timestamp.now();
    tx.update(roomRef(key), {
      memberUids: [...room.memberUids, me],
      [`members.${me}`]: {
        username,
        ready: false,
        joinedAt: now,
        lastSeenAt: now,
      } satisfies MemberInfo,
    });
  });
}

export function heartbeat(key: string): Promise<void> {
  return updateDoc(roomRef(key), {
    [`members.${uid()}.lastSeenAt`]: Timestamp.now(),
  });
}

export function setTurnSeconds(key: string, turnSeconds: number): Promise<void> {
  return updateDoc(roomRef(key), { turnSeconds });
}

export async function readyUp(key: string, secret: string): Promise<void> {
  const me = uid();
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(key));
    if (!snap.exists()) throw new RoomError("not-found", "Room not found");
    const room = snap.data() as RoomDoc;
    if (room.status !== "LOBBY") throw new RoomError("conflict", "Game already started");
    if (room.memberUids.length !== 2)
      throw new RoomError("conflict", "Need 2 players to start");

    tx.set(privateRef(key, me), {
      secret,
      createdAt: Timestamp.now(),
      expireAt: expireAt(),
    });

    const opponentReady = room.members[otherOf(room, me)]?.ready === true;
    if (opponentReady) {
      // Second-ready client starts the game (rules only require a valid member + deadline).
      const first = room.memberUids[Math.floor(Math.random() * 2)];
      tx.update(roomRef(key), {
        [`members.${me}.ready`]: true,
        status: "PLAYING",
        currentTurnUid: first,
        turnEndsAt: Timestamp.fromMillis(Date.now() + room.turnSeconds * 1000),
      });
    } else {
      tx.update(roomRef(key), { [`members.${me}.ready`]: true });
    }
  });
}

export async function submitGuess(
  key: string,
  room: RoomDoc,
  value: string
): Promise<void> {
  const me = uid();
  const gid = `g${room.guessCount}`;
  const batch = writeBatch(db);
  batch.set(guessRef(key, gid), {
    seq: room.guessCount,
    uid: me,
    value,
    isTimeout: false,
    status: "pending",
    digits: null,
    placed: null,
    createdAt: Timestamp.now(),
    scoredAt: null,
    expireAt: expireAt(),
  } satisfies GuessDoc);
  batch.update(roomRef(key), {
    currentTurnUid: otherOf(room, me),
    turnEndsAt: Timestamp.fromMillis(Date.now() + room.turnSeconds * 1000),
    guessCount: room.guessCount + 1,
  });
  await batch.commit();
}

// The "referee" write: opponent scores my pending guess against their secret.
export async function scorePendingGuess(
  key: string,
  gid: string,
  guess: GuessDoc,
  mySecret: string
): Promise<void> {
  const me = uid();
  const { digits, placed } = score(mySecret, guess.value);
  const batch = writeBatch(db);
  batch.update(guessRef(key, gid), {
    status: "scored",
    digits,
    placed,
    scoredAt: Timestamp.now(),
  });
  if (placed === 4) {
    batch.update(roomRef(key), {
      status: "FINISHED",
      winnerUid: guess.uid,
      winningGuessId: gid,
      currentTurnUid: null,
      turnEndsAt: null,
      [`revealedSecrets.${me}`]: mySecret,
    });
  }
  await batch.commit();
}

// Fallback: I saw my own guess scored with placed===4 but the room is still
// PLAYING (scorer crashed before finishing). Rules verify the guess doc.
export function claimWin(key: string, gid: string, mySecret: string): Promise<void> {
  return updateDoc(roomRef(key), {
    status: "FINISHED",
    winnerUid: uid(),
    winningGuessId: gid,
    currentTurnUid: null,
    turnEndsAt: null,
    [`revealedSecrets.${uid()}`]: mySecret,
  });
}

export function revealSecret(key: string, mySecret: string): Promise<void> {
  return updateDoc(roomRef(key), {
    [`revealedSecrets.${uid()}`]: mySecret,
  });
}

// Turn deadline passed: any member appends a timeout row and flips the turn.
// Transaction re-reads the room so concurrent sweeps serialize (the loser
// sees a fresh turnEndsAt and aborts). At MAX_TIMEOUTS the room dies.
export async function sweepTimeout(key: string): Promise<void> {
  const me = uid();
  let zombie = false;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(key));
    if (!snap.exists()) return;
    const room = snap.data() as RoomDoc;
    if (room.status !== "PLAYING" || !room.turnEndsAt) return;
    if (room.turnEndsAt.toMillis() > Date.now()) return; // already swept
    if (!room.memberUids.includes(me)) return;

    const timedOut = room.currentTurnUid!;
    tx.set(guessRef(key, `g${room.guessCount}`), {
      seq: room.guessCount,
      uid: timedOut,
      value: "",
      isTimeout: true,
      status: "scored",
      digits: 0,
      placed: 0,
      createdAt: Timestamp.now(),
      scoredAt: Timestamp.now(),
      expireAt: expireAt(),
    } satisfies GuessDoc);
    tx.update(roomRef(key), {
      currentTurnUid: otherOf(room, timedOut),
      turnEndsAt: Timestamp.fromMillis(Date.now() + room.turnSeconds * 1000),
      guessCount: room.guessCount + 1,
      timeoutCount: room.timeoutCount + 1,
    });
    zombie = room.timeoutCount + 1 >= MAX_TIMEOUTS;
  });
  if (zombie) {
    // Separate delete: rules allow member delete once timeoutCount >= 20.
    // Subcollection docs are orphaned but the expireAt TTL policy reaps them.
    await deleteDoc(roomRef(key)).catch(() => {});
  }
}
