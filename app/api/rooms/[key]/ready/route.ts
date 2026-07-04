import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
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

  const room = await prisma.room.findUnique({
    where: { key: key.toUpperCase() },
    include: { members: true },
  });
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

  await prisma.$transaction(async (tx) => {
    await tx.roomMember.update({
      where: { id: me.id },
      data: { secret, ready: true },
    });
    const others = await tx.roomMember.findMany({
      where: { roomId: room.id, userId: { not: user.id } },
    });
    if (others.every((m) => m.ready)) {
      const all = [user.id, ...others.map((m) => m.userId)];
      const first = all[Math.floor(Math.random() * all.length)];
      // guard on status so two simultaneous ready calls can't both start the game
      await tx.room.updateMany({
        where: { id: room.id, status: "LOBBY" },
        data: {
          status: "PLAYING",
          currentTurnUserId: first,
          turnEndsAt: new Date(Date.now() + room.turnSeconds * 1000),
        },
      });
    }
  });

  return Response.json({ ready: true });
}
