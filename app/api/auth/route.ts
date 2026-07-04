import type { NextRequest } from "next/server";
import { getUser, setSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getUser();
  return Response.json(user);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username.trim() : "";

  if (!username) {
    return Response.json({ error: "Username is required" }, { status: 400 });
  }

  // keep the existing id on rename so in-flight games still recognize the player
  const existing = await getUser();
  const user = { id: existing?.id ?? crypto.randomUUID(), username };
  await setSessionUser(user);
  return Response.json(user);
}
