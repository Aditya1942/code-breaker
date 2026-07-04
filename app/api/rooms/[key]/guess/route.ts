import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/session";
import { isValidCode, score } from "@/lib/game";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { guess } = await req.json().catch(() => ({}));
  if (typeof guess !== "string" || !isValidCode(guess)) {
    return Response.json(
      { error: "Guess must be 4 digits with no repeats" },
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
  if (room.status !== "PLAYING") {
    return Response.json({ error: "Game is not in progress" }, { status: 409 });
  }
  if (room.currentTurnUserId !== user.id) {
    return Response.json({ error: "Not your turn" }, { status: 403 });
  }
  if (room.turnEndsAt && room.turnEndsAt.getTime() <= Date.now()) {
    // deadline passed — the SSE sweep will log the timeout and flip the turn
    return Response.json({ error: "Time is up for this turn" }, { status: 409 });
  }

  const opponent = room.members.find((m) => m.userId !== user.id);
  if (!opponent?.secret) {
    return Response.json({ error: "Opponent has no secret" }, { status: 409 });
  }

  const result = score(opponent.secret, guess);
  const won = result.placed === 4;

  try {
    await prisma.$transaction(async (tx) => {
      // guard on turn ownership so a double-submit can't score twice
      const claimed = await tx.room.updateMany({
        where: { id: room.id, status: "PLAYING", currentTurnUserId: user.id },
        data: won
          ? { status: "FINISHED", winnerUserId: user.id, currentTurnUserId: null, turnEndsAt: null }
          : {
              currentTurnUserId: opponent.userId,
              turnEndsAt: new Date(Date.now() + room.turnSeconds * 1000),
            },
      });
      if (claimed.count === 0) throw new Error("turn lost");
      await tx.guess.create({
        data: { roomId: room.id, userId: user.id, value: guess, ...result },
      });
    });
  } catch {
    return Response.json({ error: "Turn already resolved" }, { status: 409 });
  }

  return Response.json({ ...result, won });
}
