import type { NextRequest } from "next/server";
import { rooms } from "@/lib/store";
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

  const me = rooms
    .get(key.toUpperCase())
    ?.members.find((m) => m.userId === user.id);
  if (me) {
    me.lastSeenAt = new Date().toISOString();
  }

  return Response.json({ ok: true });
}
