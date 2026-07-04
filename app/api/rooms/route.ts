import { prisma } from "@/lib/db";
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
    try {
      const room = await prisma.room.create({
        data: { key: generateKey(), members: { create: { userId: user.id } } },
      });
      return Response.json({ key: room.key });
    } catch {
      // unique constraint hit, retry with new key
    }
  }
  return Response.json({ error: "Could not create room" }, { status: 500 });
}
