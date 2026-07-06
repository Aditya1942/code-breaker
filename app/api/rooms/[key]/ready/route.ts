import type { NextRequest } from "next/server";
import { getRoom, saveRoom } from "@/lib/store";
import { getUser } from "@/lib/session";
import { isValidCode } from "@/lib/game";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { secret } = await req.json().catch(() => ({}));
  if (typeof secret !== "string" || !isValidCode(secret)) {
    return Response.json(
      { error: "Code must be 4 digits with no repeats" },
      { status: 400 }
    );
  }

  const room = await getRoom(key.toUpperCase());
  if (!room) {
    return Response.json({ error: "Room not found" }, { status: 404 });
  }
  if (room.status !== "LOBBY") {
    return Response.json({ error: "Game already started" }, { status: 409 });
  }
  const me = room.members.find((m) => m.userId === user.id);
  if (!me) {
    return Response.json({ error: "Not in this room" }, { status: 403 });
  }
  if (room.members.length < 2) {
    return Response.json({ error: "Waiting for a second player" }, { status: 409 });
  }

  me.secret = secret;
  me.ready = true;
  if (room.members.every((m) => m.ready)) {
    const first = room.members[Math.floor(Math.random() * room.members.length)];
    room.status = "PLAYING";
    room.currentTurnUserId = first.userId;
    room.turnEndsAt = new Date(Date.now() + room.turnSeconds * 1000).toISOString();
  }
  await saveRoom(room);

  return Response.json({ ready: true });
}
