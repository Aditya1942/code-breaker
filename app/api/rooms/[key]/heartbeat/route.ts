import type { NextRequest } from "next/server";
import { getRoom, saveRoom } from "@/lib/store";
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

  const room = await getRoom(key.toUpperCase());
  const me = room?.members.find((m) => m.userId === user.id);
  if (room && me) {
    me.lastSeenAt = new Date().toISOString();
    await saveRoom(room);
  }

  return Response.json({ ok: true });
}
