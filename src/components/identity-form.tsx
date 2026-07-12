import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ensureSignedIn, savedUsername, saveUsername } from "@/lib/auth";

export type Me = { id: string; username: string } | null;

// Anonymous Firebase Auth + localStorage username replace the old /api/auth
// cookie session. fetchMe stays null until a username was chosen, so we
// don't create anonymous users for drive-by visitors.
export async function fetchMe(): Promise<Me> {
  const username = savedUsername();
  if (!username) return null;
  const id = await ensureSignedIn();
  return { id, username };
}

export async function login(username: string): Promise<Me> {
  const name = username.trim();
  if (!name) throw new Error("Enter a username");
  saveUsername(name);
  const id = await ensureSignedIn();
  return { id, username: name };
}

export function IdentityFields({
  username,
  onUsername,
}: {
  username: string;
  onUsername: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="username">Username</Label>
      <Input
        id="username"
        placeholder="Display name"
        value={username}
        onChange={(e) => onUsername(e.target.value)}
      />
    </div>
  );
}

export function IdentityForm({
  submitLabel,
  onDone,
}: {
  submitLabel: string;
  onDone: (me: Me) => void;
}) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await login(username));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <IdentityFields username={username} onUsername={setUsername} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || !username.trim()}>
        {submitLabel}
      </Button>
    </form>
  );
}
