import { cookies } from "next/headers";
import { getDb } from "@/lib/db";

const COOKIE = "session";

export async function getUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  return db.data.users.find((u) => u.sessionToken === token) ?? null;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}
