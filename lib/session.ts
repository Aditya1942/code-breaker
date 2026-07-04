import { cookies } from "next/headers";

const COOKIE = "session";

export type SessionUser = { id: string; username: string };

// Identity lives entirely in the cookie — no server-side user store.
export async function getUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const user = JSON.parse(Buffer.from(raw, "base64url").toString());
    if (typeof user.id === "string" && typeof user.username === "string") {
      return { id: user.id, username: user.username };
    }
  } catch {
    // malformed cookie — treat as signed out
  }
  return null;
}

export async function setSessionUser(user: SessionUser) {
  const value = Buffer.from(JSON.stringify(user)).toString("base64url");
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}
