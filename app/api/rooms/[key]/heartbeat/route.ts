import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
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

  await prisma.roomMember.updateMany({
    where: { userId: user.id, room: { key: key.toUpperCase() } },
    data: { lastSeenAt: new Date() },
  });

  return Response.json({ ok: true });
}
