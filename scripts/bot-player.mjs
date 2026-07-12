// E2E helper: a second player for local emulator testing.
// Usage: node scripts/bot-player.mjs ROOMKEY [secret]
// Mirrors the exact write shapes in src/lib/rooms.ts (rules-validated).
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import {
  Timestamp,
  collection,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

const key = process.argv[2];
const mySecret = process.argv[3] ?? "0123";
if (!key) {
  console.error("usage: node scripts/bot-player.mjs ROOMKEY [secret]");
  process.exit(1);
}

const app = initializeApp({ apiKey: "demo-key", projectId: "demo-code-breaker" });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);

const cred = await signInAnonymously(auth);
const me = cred.user.uid;
console.log(`[bot] signed in as ${me}`);

const roomRef = doc(db, "rooms", key);
const guessRef = (gid) => doc(db, "rooms", key, "guesses", gid);
const ttl = () => Timestamp.fromMillis(Date.now() + 12 * 3600 * 1000);

function score(secret, guess) {
  let digits = 0, placed = 0;
  for (let i = 0; i < 4; i++) {
    if (secret[i] === guess[i]) placed++;
    if (secret.includes(guess[i])) digits++;
  }
  return { digits, placed };
}

function randomCode() {
  const pool = [..."0123456789"];
  let code = "";
  for (let i = 0; i < 4; i++) code += pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  return code;
}

// join
await runTransaction(db, async (tx) => {
  const snap = await tx.get(roomRef);
  if (!snap.exists()) throw new Error("room not found");
  const room = snap.data();
  if (room.memberUids.includes(me)) return;
  if (room.memberUids.length >= 2) throw new Error("room full");
  const now = Timestamp.now();
  tx.update(roomRef, {
    memberUids: [...room.memberUids, me],
    [`members.${me}`]: { username: "BotBob", ready: false, joinedAt: now, lastSeenAt: now },
  });
});
console.log("[bot] joined room", key);

let readyDone = false;
let guessInFlight = false;
const scored = new Set();
let guesses = [];

onSnapshot(query(collection(db, "rooms", key, "guesses"), orderBy("seq")), (snap) => {
  guesses = snap.docs.map((d) => ({ gid: d.id, ...d.data() }));
});

onSnapshot(roomRef, async (snap) => {
  if (!snap.exists()) {
    console.log("[bot] room deleted, exiting");
    process.exit(0);
  }
  const room = snap.data();

  if (room.status === "LOBBY" && room.memberUids.length === 2 && !readyDone) {
    readyDone = true;
    await runTransaction(db, async (tx) => {
      const s = await tx.get(roomRef);
      const r = s.data();
      tx.set(doc(db, "rooms", key, "private", me), {
        secret: mySecret,
        createdAt: Timestamp.now(),
        expireAt: ttl(),
      });
      const other = r.memberUids.find((u) => u !== me);
      if (r.members[other]?.ready) {
        const first = r.memberUids[Math.floor(Math.random() * 2)];
        tx.update(roomRef, {
          [`members.${me}.ready`]: true,
          status: "PLAYING",
          currentTurnUid: first,
          turnEndsAt: Timestamp.fromMillis(Date.now() + r.turnSeconds * 1000),
        });
      } else {
        tx.update(roomRef, { [`members.${me}.ready`]: true });
      }
    });
    console.log("[bot] ready with secret", mySecret);
  }

  if (room.status === "PLAYING") {
    // referee: score opponent pending guesses
    for (const g of guesses) {
      if (g.status !== "pending" || g.uid === me || scored.has(g.gid)) continue;
      scored.add(g.gid);
      const { digits, placed } = score(mySecret, g.value);
      const batch = writeBatch(db);
      batch.update(guessRef(g.gid), { status: "scored", digits, placed, scoredAt: Timestamp.now() });
      if (placed === 4) {
        batch.update(roomRef, {
          status: "FINISHED",
          winnerUid: g.uid,
          winningGuessId: g.gid,
          currentTurnUid: null,
          turnEndsAt: null,
          [`revealedSecrets.${me}`]: mySecret,
        });
      }
      await batch.commit();
      console.log(`[bot] scored ${g.value} -> digits ${digits} placed ${placed}`);
    }

    // my turn: make a random guess after a short think
    if (room.currentTurnUid === me && !guessInFlight) {
      guessInFlight = true;
      setTimeout(async () => {
        try {
          const value = randomCode();
          const other = room.memberUids.find((u) => u !== me);
          const gid = `g${room.guessCount}`;
          const batch = writeBatch(db);
          batch.set(guessRef(gid), {
            seq: room.guessCount,
            uid: me,
            value,
            isTimeout: false,
            status: "pending",
            digits: null,
            placed: null,
            createdAt: Timestamp.now(),
            scoredAt: null,
            expireAt: ttl(),
          });
          batch.update(roomRef, {
            currentTurnUid: other,
            turnEndsAt: Timestamp.fromMillis(Date.now() + room.turnSeconds * 1000),
            guessCount: room.guessCount + 1,
          });
          await batch.commit();
          console.log("[bot] guessed", value);
        } catch (e) {
          console.log("[bot] guess failed:", e.message);
        } finally {
          guessInFlight = false;
        }
      }, 1500);
    }
  }

  if (room.status === "FINISHED") {
    if (!room.revealedSecrets[me]) {
      await updateDoc(roomRef, { [`revealedSecrets.${me}`]: mySecret });
      console.log("[bot] revealed secret");
    }
    console.log(`[bot] game over. winner=${room.winnerUid} reveals=${JSON.stringify(room.revealedSecrets)}`);
    setTimeout(() => process.exit(0), 2000);
  }
});

// heartbeat
setInterval(() => {
  updateDoc(roomRef, { [`members.${me}.lastSeenAt`]: Timestamp.now() }).catch(() => {});
}, 30_000);
