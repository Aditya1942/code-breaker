import type { NextRequest } from "next/server";
import { getDb, findGame, type Game } from "@/lib/db";

// Long-lived SSE stream; Vercel Fluid Compute keeps it open up to this limit,
// EventSource auto-reconnects after.
export const maxDuration = 300;

const ONLINE_WINDOW_MS = 25_000;
const POLL_MS = 2_000;

// Turn deadline passed → log a timeout entry and flip the turn. Mutation is
// synchronous in-memory, so with two open streams only the first ticker past
// the check writes; the second sees the new turnEndsAt and skips.
async function sweepTimeout(db: Awaited<ReturnType<typeof getDb>>, room: Game) {
  if (
    room.status !== "PLAYING" ||
    !room.currentTurnUserId ||
    !room.turnEndsAt ||
    Date.parse(room.turnEndsAt) > Date.now()
  ) {
    return;
  }
  const next = room.members.find((m) => m.userId !== room.currentTurnUserId);
  if (!next) return;
  const timedOutUserId = room.currentTurnUserId;
  room.currentTurnUserId = next.userId;
  room.turnEndsAt = new Date(Date.now() + room.turnSeconds * 1000).toISOString();
  room.guesses.push({
    userId: timedOutUserId,
    value: "",
    digits: 0,
    placed: 0,
    isTimeout: true,
    createdAt: new Date().toISOString(),
  });
  await db.write();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const roomKey = key.toUpperCase();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastPayload = "";
      let closed = false;

      const tick = async () => {
        const db = await getDb();
        const room = findGame(db.data, roomKey);
        if (room) await sweepTimeout(db, room);
        const usernameOf = (userId: string) =>
          db.data.users.find((u) => u.id === userId)?.username ?? "?";
        const state = room
          ? {
              key: room.key,
              status: room.status,
              hostId: room.members[0]?.userId ?? null,
              turnSeconds: room.turnSeconds,
              currentTurnUserId: room.currentTurnUserId,
              turnEndsAt: room.turnEndsAt,
              winnerUserId: room.winnerUserId,
              players: room.members.map((m) => ({
                id: m.userId,
                username: usernameOf(m.userId),
                online: Date.now() - Date.parse(m.lastSeenAt) < ONLINE_WINDOW_MS,
                ready: m.ready,
              })),
              guesses: room.guesses.map((g) => ({
                userId: g.userId,
                value: g.value,
                digits: g.digits,
                placed: g.placed,
                isTimeout: g.isTimeout,
                createdAt: g.createdAt,
              })),
              // secrets stay server-side until the game ends
              secrets:
                room.status === "FINISHED"
                  ? Object.fromEntries(
                      room.members.map((m) => [m.userId, m.secret ?? ""])
                    )
                  : undefined,
            }
          : null;
        const payload = JSON.stringify(state);
        if (!closed && payload !== lastPayload) {
          lastPayload = payload;
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        }
      };

      const interval = setInterval(() => tick().catch(() => {}), POLL_MS);
      tick().catch(() => {});

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
