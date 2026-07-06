import type { NextRequest } from "next/server";
import { getRoom, saveRoom, deleteRoom, MAX_TIMEOUTS, type Game } from "@/lib/store";
import { getUser } from "@/lib/session";

// Long-lived SSE stream; Vercel Fluid Compute keeps it open up to this limit,
// EventSource auto-reconnects after.
export const maxDuration = 300;

const ONLINE_WINDOW_MS = 25_000;
const POLL_MS = 2_000;

// Turn deadline passed → log a timeout entry and flip the turn. Returns true
// when it mutated the room so the caller knows to save.
// ponytail: two open streams can both sweep the same deadline and write twice;
// worst case is a duplicate timeout row. Atomic ops need a real store.
function sweepTimeout(room: Game): boolean {
  if (
    room.status !== "PLAYING" ||
    !room.currentTurnUserId ||
    !room.turnEndsAt ||
    Date.parse(room.turnEndsAt) > Date.now()
  ) {
    return false;
  }
  const next = room.members.find((m) => m.userId !== room.currentTurnUserId);
  if (!next) return false;
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
  return true;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const roomKey = key.toUpperCase();
  const encoder = new TextEncoder();
  const user = await getUser(); // per-connection identity — reveals only own secret

  const stream = new ReadableStream({
    start(controller) {
      let lastPayload = "";
      let closed = false;

      const tick = async () => {
        const room = await getRoom(roomKey);
        if (room && sweepTimeout(room)) await saveRoom(room);
        // Both players idling — nobody's guessing. Kill the zombie room.
        if (room && room.guesses.filter((g) => g.isTimeout).length >= MAX_TIMEOUTS) {
          await deleteRoom(roomKey);
          if (!closed) {
            controller.enqueue(encoder.encode(`data: null\n\n`));
          }
          return;
        }
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
                username: m.username,
                online: Date.now() - Date.parse(m.lastSeenAt) < ONLINE_WINDOW_MS,
                ready: m.ready,
              })),
              guesses: room.guesses,
              // Own secret always visible; opponent's only after the game ends.
              secrets:
                room.status === "FINISHED"
                  ? Object.fromEntries(
                      room.members.map((m) => [m.userId, m.secret ?? ""])
                    )
                  : user
                    ? Object.fromEntries(
                        room.members
                          .filter((m) => m.userId === user.id)
                          .map((m) => [m.userId, m.secret ?? ""])
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

      const interval = setInterval(tick, POLL_MS);
      tick();

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
