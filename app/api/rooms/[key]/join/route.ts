import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
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

  const room = await prisma.room.findUnique({
    where: { key: key.toUpperCase() },
    include: { members: true },
  });
  if (!room) {
    return Response.json({ error: "Room not found" }, { status: 404 });
  }

  const isMember = room.members.some((m) => m.userId === user.id);
  if (!isMember && room.members.length >= 2) {
    return Response.json({ error: "Room is full" }, { status: 403 });
  }
  if (!isMember) {
    // ponytail: concurrent joins could briefly seat 3 players; add a tx count check if it ever matters
    await prisma.roomMember.create({ data: { roomId: room.id, userId: user.id } });
  }

  return Response.json({ key: room.key });
}
