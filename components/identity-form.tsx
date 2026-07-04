"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Me = { id: string; username: string } | null;

export async function fetchMe(): Promise<Me> {
  const res = await fetch("/api/auth");
  return res.ok ? res.json() : null;
}

export async function login(username: string, email: string): Promise<Me> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email: email || undefined }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Login failed");
  return data;
}

export function IdentityFields({
  username,
  email,
  onUsername,
  onEmail,
}: {
  username: string;
  email: string;
  onUsername: (v: string) => void;
  onEmail: (v: string) => void;
}) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          placeholder="Display name"
          value={username}
          onChange={(e) => onUsername(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email (optional — leave empty to play as guest)</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
        />
      </div>
    </>
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
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await login(username, email));
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
      <IdentityFields
        username={username}
        email={email}
        onUsername={setUsername}
        onEmail={setEmail}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || !username.trim()}>
        {submitLabel}
      </Button>
    </form>
  );
}
