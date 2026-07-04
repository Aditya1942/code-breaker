import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

// Long-lived SSE stream; Vercel Fluid Compute keeps it open up to this limit,
// EventSource auto-reconnects after.
export const maxDuration = 300;

const ONLINE_WINDOW_MS = 25_000;
const POLL_MS = 2_000;

// Turn deadline passed → log a timeout entry and flip the turn. Optimistic
// updateMany guard: with two open streams only one writer wins, so the
// timeout Guess row is inserted exactly once.
async function sweepTimeout(room: {
  id: string;
  status: string;
  currentTurnUserId: string | null;
  turnEndsAt: Date | null;
  turnSeconds: number;
  members: { userId: string }[];
}) {
  if (
    room.status !== "PLAYING" ||
    !room.currentTurnUserId ||
    !room.turnEndsAt ||
    room.turnEndsAt.getTime() > Date.now()
  ) {
    return;
  }
  const next = room.members.find((m) => m.userId !== room.currentTurnUserId);
  if (!next) return;
  const claimed = await prisma.room.updateMany({
    where: { id: room.id, status: "PLAYING", turnEndsAt: room.turnEndsAt },
    data: {
      currentTurnUserId: next.userId,
      turnEndsAt: new Date(Date.now() + room.turnSeconds * 1000),
    },
  });
  if (claimed.count > 0) {
    await prisma.guess.create({
      data: {
        roomId: room.id,
        userId: room.currentTurnUserId,
        value: "",
        digits: 0,
        placed: 0,
        isTimeout: true,
      },
    });
  }
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
        const room = await prisma.room.findUnique({
          where: { key: roomKey },
          include: {
            members: {
              include: { user: true },
              orderBy: { joinedAt: "asc" },
            },
            guesses: { orderBy: { createdAt: "asc" } },
          },
        });
        if (room) await sweepTimeout(room);
        const state = room
          ? {
              key: room.key,
              status: room.status,
              hostId: room.members[0]?.userId ?? null,
              turnSeconds: room.turnSeconds,
              currentTurnUserId: room.currentTurnUserId,
              turnEndsAt: room.turnEndsAt?.toISOString() ?? null,
              winnerUserId: room.winnerUserId,
              players: room.members.map((m) => ({
                id: m.userId,
                username: m.user.username,
                online: Date.now() - m.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
                ready: m.ready,
              })),
              guesses: room.guesses.map((g) => ({
                userId: g.userId,
                value: g.value,
                digits: g.digits,
                placed: g.placed,
                isTimeout: g.isTimeout,
                createdAt: g.createdAt.toISOString(),
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
