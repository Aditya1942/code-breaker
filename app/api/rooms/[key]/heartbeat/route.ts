import type { NextRequest } from "next/server";
import { getDb, findGame } from "@/lib/db";
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

  const db = await getDb();
  const room = findGame(db.data, key.toUpperCase());
  const me = room?.members.find((m) => m.userId === user.id);
  if (me) {
    me.lastSeenAt = new Date().toISOString();
    await db.write();
  }

  return Response.json({ ok: true });
}
