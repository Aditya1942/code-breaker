import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

// Long-lived SSE stream; Vercel Fluid Compute keeps it open up to this limit,
// EventSource auto-reconnects after.
export const maxDuration = 300;

const ONLINE_WINDOW_MS = 25_000;
const POLL_MS = 2_000;

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
          },
        });
        const state = room
          ? {
              key: room.key,
              players: room.members.map((m) => ({
                id: m.userId,
                username: m.user.username,
                online: Date.now() - m.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
              })),
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
