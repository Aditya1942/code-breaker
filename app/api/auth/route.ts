import type { NextRequest } from "next/server";
import { getDb, type User } from "@/lib/db";
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

  const db = await getDb();
  let user = email ? db.data.users.find((u) => u.email === email) : undefined;
  if (user) {
    user.username = username;
  } else {
    user = {
      id: crypto.randomUUID(),
      email: email || null,
      username,
      isGuest: !email,
      sessionToken: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    } satisfies User;
    db.data.users.push(user);
  }
  await db.write();

  await setSessionCookie(user.sessionToken);
  return Response.json({ id: user.id, username: user.username });
}
