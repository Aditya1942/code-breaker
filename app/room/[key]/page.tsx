"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KeyTiles } from "@/components/ui/key-tiles";
import { IdentityForm, fetchMe, type Me } from "@/components/identity-form";
import { useRoom } from "@/lib/use-room";

type Phase = "loading" | "need-auth" | "joined" | "full" | "not-found";

export default function RoomPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  const roomKey = key.toUpperCase();

  const [phase, setPhase] = useState<Phase>("loading");
  const [me, setMe] = useState<Me>(null);
  const [copied, setCopied] = useState(false);
  const { state, notFound } = useRoom(roomKey, phase === "joined");

  const join = useCallback(async () => {
    const res = await fetch(`/api/rooms/${roomKey}/join`, { method: "POST" });
    if (res.ok) setPhase("joined");
    else if (res.status === 403) setPhase("full");
    else if (res.status === 404) setPhase("not-found");
    else setPhase("need-auth");
  }, [roomKey]);

  useEffect(() => {
    fetchMe().then((user) => {
      setMe(user);
      if (user) join();
      else setPhase("need-auth");
    });
  }, [join]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (phase === "loading") {
    return <Shell title="Joining room…" description="One moment." />;
  }

  if (phase === "need-auth") {
    return (
      <Shell
        title={`Join room ${roomKey}`}
        description="Pick a name to join this game."
      >
        <IdentityForm
          submitLabel="Join room"
          onDone={(user) => {
            setMe(user);
            join();
          }}
        />
      </Shell>
    );
  }

  if (phase === "full") {
    return (
      <Shell title="Room is full" description="This room already has 2 players.">
        <BackHome />
      </Shell>
    );
  }

  if (phase === "not-found" || notFound) {
    return (
      <Shell title="Room not found" description={`No room with key ${roomKey}.`}>
        <BackHome />
      </Shell>
    );
  }

  const players = state?.players ?? [];
  const slots = [players[0] ?? null, players[1] ?? null];

  return (
    <Shell
      title={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          Room <KeyTiles value={roomKey} />
        </span>
      }
      description={
        players.length < 2
          ? "Waiting for a second player — share the link or room key."
          : "Both players are here."
      }
    >
      <div className="grid gap-3">
        {slots.map((p, i) => (
          <div
            key={p?.id ?? `empty-${i}`}
            className="flex items-center gap-3 rounded-xl border-2 bg-card p-3 shadow-[3px_3px_0_var(--border)]"
          >
            {p ? (
              <>
                <span
                  className={`size-2.5 rounded-full ${
                    p.online ? "bg-primary animate-pulse" : "bg-muted-foreground/40"
                  }`}
                  title={p.online ? "Online" : "Offline"}
                />
                <span className="font-medium">
                  {p.username}
                  {p.id === me?.id && (
                    <span className="text-muted-foreground"> (you)</span>
                  )}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {p.online ? "online" : "offline"}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Waiting for player…
              </span>
            )}
          </div>
        ))}
      </div>

      <Button variant="secondary" onClick={copyLink}>
        {copied ? "Link copied!" : "Copy invite link"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Game coming soon.
      </p>
    </Shell>
  );
}

function Shell({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children && <CardContent className="grid gap-4">{children}</CardContent>}
      </Card>
    </main>
  );
}

function BackHome() {
  return (
    <Button variant="secondary" render={<Link href="/" />}>
      Back to home
    </Button>
  );
}
