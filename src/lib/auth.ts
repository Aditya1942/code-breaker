import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth } from "./firebase";

// Anonymous Firebase Auth replaces the old session cookie. The uid is the
// player id; the username lives in localStorage (prefill) and in the room's
// member entry (authoritative per game).
export function ensureSignedIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        unsub();
        if (user) resolve(user.uid);
        else signInAnonymously(auth).then((c) => resolve(c.user.uid), reject);
      },
      reject
    );
  });
}

export function savedUsername(): string {
  return localStorage.getItem("username") ?? "";
}

export function saveUsername(username: string) {
  localStorage.setItem("username", username);
}
