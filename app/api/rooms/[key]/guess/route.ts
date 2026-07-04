import type { NextRequest } from "next/server";
import { getDb, findGame } from "@/lib/db";
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

  const db = await getDb();
  const room = findGame(db.data, key.toUpperCase());
  if (!room) {
    return Response.json({ error: "Room not found" }, { status: 404 });
  }
  if (room.status !== "PLAYING") {
    return Response.json({ error: "Game is not in progress" }, { status: 409 });
  }
  if (room.currentTurnUserId !== user.id) {
    return Response.json({ error: "Not your turn" }, { status: 403 });
  }
  if (room.turnEndsAt && Date.parse(room.turnEndsAt) <= Date.now()) {
    // deadline passed — the SSE sweep will log the timeout and flip the turn
    return Response.json({ error: "Time is up for this turn" }, { status: 409 });
  }

  const opponent = room.members.find((m) => m.userId !== user.id);
  if (!opponent?.secret) {
    return Response.json({ error: "Opponent has no secret" }, { status: 409 });
  }

  const result = score(opponent.secret, guess);
  const won = result.placed === 4;

  // turn ownership checked above; mutations are synchronous so a double-submit
  // sees the flipped turn and 403s before reaching here
  if (won) {
    room.status = "FINISHED";
    room.winnerUserId = user.id;
    room.currentTurnUserId = null;
    room.turnEndsAt = null;
  } else {
    room.currentTurnUserId = opponent.userId;
    room.turnEndsAt = new Date(Date.now() + room.turnSeconds * 1000).toISOString();
  }
  room.guesses.push({
    userId: user.id,
    value: guess,
    ...result,
    isTimeout: false,
    createdAt: new Date().toISOString(),
  });
  await db.write();

  return Response.json({ ...result, won });
}
