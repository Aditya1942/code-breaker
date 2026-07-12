import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
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
import { createRoom, joinRoom, RoomError } from "@/lib/rooms";

export default function Home() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [joinKey, setJoinKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMe().then((me) => {
      if (me) setUsername((u) => u || me.username);
    });
  }, []);

  const withAuth = async (action: (name: string) => Promise<void>) => {
    const name = username.trim();
    if (!name) {
      setError("Enter a username first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(name);
      await action(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  const createGame = () =>
    withAuth(async (name) => {
      const key = await createRoom(name);
      navigate(`/room/${key}`);
    });

  const joinGame = () =>
    withAuth(async (name) => {
      const key = joinKey.trim().toUpperCase();
      if (!key) throw new Error("Enter a room key");
      try {
        await joinRoom(key, name);
      } catch (e) {
        if (e instanceof RoomError && e.code === "not-found")
          throw new Error("No room with that key");
        if (e instanceof RoomError && e.code === "full")
          throw new Error("That room is already full");
        throw e;
      }
      navigate(`/room/${key}`);
    });

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-3xl tracking-tight">Code Breaker</CardTitle>
          <CardDescription>
            Enter a name to play — no account needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <IdentityFields username={username} onUsername={setUsername} />

          <Button onClick={createGame} disabled={busy}>
            Create new game
          </Button>

          <div className="flex gap-2">
            <Input
              placeholder="Room key (e.g. ABC234)"
              value={joinKey}
              onChange={(e) => setJoinKey(e.target.value.toUpperCase())}
              maxLength={6}
              className="font-mono uppercase tracking-widest"
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
