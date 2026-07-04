"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IdentityFields, fetchMe, login } from "@/components/identity-form";

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [joinKey, setJoinKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMe().then((me) => {
      if (me) setUsername((u) => u || me.username);
    });
  }, []);

  const withAuth = async (action: () => Promise<void>) => {
    if (!username.trim()) {
      setError("Enter a username first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(username, email);
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  const createGame = () =>
    withAuth(async () => {
      const res = await fetch("/api/rooms", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create room");
      router.push(`/room/${data.key}`);
    });

  const joinGame = () =>
    withAuth(async () => {
      const key = joinKey.trim().toUpperCase();
      if (!key) throw new Error("Enter a room key");
      const res = await fetch(`/api/rooms/${key}/join`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not join room");
      router.push(`/room/${data.key}`);
    });

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Code Breaker</CardTitle>
          <CardDescription>
            Enter a name to play. Add your email to keep your identity across
            devices, or leave it empty to play as a guest.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <IdentityFields
            username={username}
            email={email}
            onUsername={setUsername}
            onEmail={setEmail}
          />

          <Button onClick={createGame} disabled={busy}>
            Create new game
          </Button>

          <div className="flex gap-2">
            <Input
              placeholder="Room key (e.g. ABC234)"
              value={joinKey}
              onChange={(e) => setJoinKey(e.target.value.toUpperCase())}
              maxLength={6}
              className="font-mono uppercase"
            />
            <Button variant="secondary" onClick={joinGame} disabled={busy}>
              Join game
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
