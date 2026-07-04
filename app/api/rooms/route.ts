import { getDb, findGame, gameOwnerKey, type Game } from "@/lib/db";
import { getUser } from "@/lib/session";

// No ambiguous chars (O/I/0/1)
const KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateKey() {
  let key = "";
  for (let i = 0; i < 6; i++) {
    key += KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)];
  }
  return key;
}

export async function POST() {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const db = await getDb();
  // ponytail: retry on key collision instead of guaranteeing uniqueness upfront; 32^6 keyspace
  for (let i = 0; i < 5; i++) {
    const key = generateKey();
    if (findGame(db.data, key)) continue;
    const now = new Date().toISOString();
    const game: Game = {
      key,
      status: "LOBBY",
      turnSeconds: 60,
      currentTurnUserId: null,
      turnEndsAt: null,
      winnerUserId: null,
      createdAt: now,
      members: [{ userId: user.id, secret: null, ready: false, joinedAt: now, lastSeenAt: now }],
      guesses: [],
    };
    (db.data.games[gameOwnerKey(user)] ??= []).push(game);
    await db.write();
    return Response.json({ key });
  }
  return Response.json({ error: "Could not create room" }, { status: 500 });
}
