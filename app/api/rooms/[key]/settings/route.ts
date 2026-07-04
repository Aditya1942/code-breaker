import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/session";
import { TURN_SECONDS_OPTIONS } from "@/lib/game";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { turnSeconds } = await req.json().catch(() => ({}));
  if (!TURN_SECONDS_OPTIONS.includes(turnSeconds)) {
    return Response.json({ error: "Invalid timer" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { key: key.toUpperCase() },
    include: { members: { orderBy: { joinedAt: "asc" } } },
  });
  if (!room) {
    return Response.json({ error: "Room not found" }, { status: 404 });
  }
  if (room.status !== "LOBBY") {
    return Response.json({ error: "Game already started" }, { status: 409 });
  }
  if (room.members[0]?.userId !== user.id) {
    return Response.json({ error: "Only the host can set the timer" }, { status: 403 });
  }

  await prisma.room.update({ where: { id: room.id }, data: { turnSeconds } });
  return Response.json({ turnSeconds });
}
