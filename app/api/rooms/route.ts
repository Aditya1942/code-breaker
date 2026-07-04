import { rooms, type Game } from "@/lib/store";
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

  // ponytail: retry on key collision instead of guaranteeing uniqueness upfront; 32^6 keyspace
  for (let i = 0; i < 5; i++) {
    const key = generateKey();
    if (rooms.has(key)) continue;
    const now = new Date().toISOString();
    const game: Game = {
      key,
      status: "LOBBY",
      turnSeconds: 60,
      currentTurnUserId: null,
      turnEndsAt: null,
      winnerUserId: null,
      createdAt: now,
      members: [
        {
          userId: user.id,
          username: user.username,
          secret: null,
          ready: false,
          joinedAt: now,
          lastSeenAt: now,
        },
      ],
      guesses: [],
    };
    rooms.set(key, game);
    return Response.json({ key });
  }
  return Response.json({ error: "Could not create room" }, { status: 500 });
}
