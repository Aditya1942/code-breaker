import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUser, setSessionCookie } from "@/lib/session";

export async function GET() {
  const user = await getUser();
  return Response.json(
    user
      ? { id: user.id, username: user.username, email: user.email, isGuest: user.isGuest }
      : null
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!username) {
    return Response.json({ error: "Username is required" }, { status: 400 });
  }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return Response.json({ error: "Invalid email" }, { status: 400 });
  }

  const user = email
    ? await prisma.user.upsert({
        where: { email },
        update: { username },
        create: { email, username },
      })
    : await prisma.user.create({ data: { username, isGuest: true } });

  await setSessionCookie(user.sessionToken);
  return Response.json({ id: user.id, username: user.username });
}
