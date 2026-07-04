import type { NextRequest } from "next/server";
import { getDb, findGame } from "@/lib/db";
import { getUser } from "@/lib/session";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const db = await getDb();
  const room = findGame(db.data, key.toUpperCase());
  if (!room) {
    return Response.json({ error: "Room not found" }, { status: 404 });
  }

  const isMember = room.members.some((m) => m.userId === user.id);
  if (!isMember && room.members.length >= 2) {
    return Response.json({ error: "Room is full" }, { status: 403 });
  }
  if (!isMember) {
    const now = new Date().toISOString();
    room.members.push({ userId: user.id, secret: null, ready: false, joinedAt: now, lastSeenAt: now });
    await db.write();
  }

  return Response.json({ key: room.key });
}
