import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KeyTiles } from "@/components/ui/key-tiles";
import { DigitInput } from "@/components/ui/digit-input";
import { IdentityForm, fetchMe, type Me } from "@/components/identity-form";
import { useRoom, type RoomGuess, type RoomState } from "@/lib/use-room";
import { isValidCode, randomCode, TURN_SECONDS_OPTIONS } from "@/lib/game";
import {
  RoomError,
  joinRoom,
  readyUp,
  setTurnSeconds,
  submitGuess,
  type RoomDoc,
} from "@/lib/rooms";
import { cn } from "@/lib/utils";

type Phase = "loading" | "need-auth" | "joined" | "full" | "not-found";

export default function RoomPage() {
  const { key } = useParams<{ key: string }>();
  const roomKey = (key ?? "").toUpperCase();

  const [phase, setPhase] = useState<Phase>("loading");
  const [me, setMe] = useState<Me>(null);
  const { state, notFound, room } = useRoom(
    roomKey,
    phase === "joined",
    me?.id ?? null
  );

  const join = useCallback(
    async (username: string) => {
      try {
        await joinRoom(roomKey, username);
        setPhase("joined");
      } catch (e) {
        if (e instanceof RoomError && e.code === "full") setPhase("full");
        else if (e instanceof RoomError && e.code === "not-found")
          setPhase("not-found");
        else setPhase("need-auth");
      }
    },
    [roomKey]
  );

  useEffect(() => {
    fetchMe().then((user) => {
      setMe(user);
      if (user) join(user.username);
      else setPhase("need-auth");
    });
  }, [join]);

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
            if (user) join(user.username);
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

  if (!state || !room || !me) {
    return <Shell title="Loading game…" description="One moment." />;
  }

  if (state.status === "LOBBY") {
    return <LobbyScreen state={state} me={me} roomKey={roomKey} />;
  }
  return <GameScreen state={state} room={room} me={me} roomKey={roomKey} />;
}

/* ---------------- LOBBY: timer + secret + ready ---------------- */

function LobbyScreen({
  state,
  me,
  roomKey,
}: {
  state: RoomState;
  me: NonNullable<Me>;
  roomKey: string;
}) {
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isHost = state.hostId === me.id;
  const iAmReady = state.players.find((p) => p.id === me.id)?.ready ?? false;
  const opponent = state.players.find((p) => p.id !== me.id);
  const bothHere = state.players.length === 2;

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const setTimer = (turnSeconds: number) => {
    setTurnSeconds(roomKey, turnSeconds).catch(() => {});
  };

  const ready = async () => {
    if (!isValidCode(secret)) {
      setError("Code must be 4 digits with no repeats");
      return;
    }
    setError(null);
    try {
      await readyUp(roomKey, secret);
    } catch (e) {
      setError(
        e instanceof RoomError ? e.message : "Could not ready up"
      );
    }
  };

  return (
    <Shell
      title={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          Room <KeyTiles value={roomKey} />
        </span>
      }
      description={
        !bothHere
          ? "Waiting for a second player — share the link or room key."
          : "Set your secret code. First to crack the other's code wins."
      }
    >
      <div className="grid gap-3">
        {[state.players[0] ?? null, state.players[1] ?? null].map((p, i) => (
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
                  {p.id === me.id && (
                    <span className="text-muted-foreground"> (you)</span>
                  )}
                </span>
                <span
                  className={cn(
                    "ml-auto rounded-full border-2 px-2 py-0.5 font-display text-xs font-extrabold",
                    p.ready
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {p.ready ? "READY" : "picking…"}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Waiting for player…</span>
            )}
          </div>
        ))}
      </div>

      {bothHere && (
        <>
          <div className="grid gap-2">
            <p className="font-display text-sm font-extrabold tracking-wide">
              Turn timer {isHost ? "(you choose)" : `(${hostName(state)} chooses)`}
            </p>
            <div className="flex gap-2">
              {TURN_SECONDS_OPTIONS.map((s) => (
                <button
                  key={s}
                  disabled={!isHost || iAmReady}
                  onClick={() => setTimer(s)}
                  className={cn(
                    "flex-1 rounded-lg border-2 py-1.5 font-mono text-sm font-bold transition-colors",
                    s === state.turnSeconds
                      ? "bg-tile shadow-[2px_2px_0_var(--border)]"
                      : "bg-card text-muted-foreground",
                    isHost && !iAmReady && "hover:bg-tile/50",
                    (!isHost || iAmReady) && "cursor-default"
                  )}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <p className="font-display text-sm font-extrabold tracking-wide">
              Your secret code
            </p>
            <DigitInput
              label="Secret code"
              value={secret}
              onChange={setSecret}
              onSubmit={ready}
              masked={!show}
              disabled={iAmReady}
            />
            <div className="flex justify-center gap-2 text-sm">
              <button
                className="text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setShow((v) => !v)}
              >
                {show ? "Hide" : "Show"}
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                className="text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => !iAmReady && setSecret(randomCode())}
              >
                Random
              </button>
            </div>
          </div>

          {error && <p className="text-center text-sm text-destructive">{error}</p>}

          <Button onClick={ready} disabled={iAmReady}>
            {iAmReady
              ? opponent?.ready
                ? "Starting…"
                : `Waiting for ${opponent?.username ?? "opponent"}…`
              : "Lock code & ready"}
          </Button>
        </>
      )}

      <Button variant="secondary" onClick={copyLink}>
        {copied ? "Link copied!" : "Copy invite link"}
      </Button>
    </Shell>
  );
}

/* ---------------- PLAYING + FINISHED: shared game board ---------------- */

function GameScreen({
  state,
  room,
  me,
  roomKey,
}: {
  state: RoomState;
  room: RoomDoc;
  me: NonNullable<Me>;
  roomKey: string;
}) {
  const [guess, setGuess] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(true);

  const opponent = state.players.find((p) => p.id !== me.id);
  const myTurn = state.currentTurnUserId === me.id;
  const finished = state.status === "FINISHED";
  const iWon = state.winnerUserId === me.id;

  const myGuesses = state.guesses.filter((g) => g.userId === me.id);
  const theirGuesses = state.guesses.filter((g) => g.userId !== me.id);
  const mySecret = state.secrets?.[me.id];

  const submit = async () => {
    if (!isValidCode(guess)) {
      setError("Guess must be 4 digits with no repeats");
      return;
    }
    setError(null);
    try {
      await submitGuess(roomKey, room, guess);
      setGuess("");
    } catch {
      setError("Guess failed — is it your turn?");
    }
  };

  return (
    <main className="flex flex-1 items-start justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
              Room <KeyTiles value={roomKey} />
            </span>
          </CardTitle>
          <CardDescription>
            Crack {opponent?.username ?? "your opponent"}&apos;s 4-digit code.
            Digits = right digit anywhere · Placed = right digit, right spot.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {!finished && mySecret && (
            <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card p-2 text-sm text-muted-foreground shadow-[2px_2px_0_var(--border)]">
              Your secret code{" "}
              <KeyTiles value={showSecret ? mySecret : "••••"} />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? "Hide your secret code" : "Show your secret code"}
                aria-pressed={showSecret}
                className="ml-1 rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <EyeIcon off={!showSecret} />
              </button>
            </div>
          )}
          {finished ? (
            <div className="grid gap-3 rounded-xl border-2 bg-card p-4 text-center shadow-[3px_3px_0_var(--border)]">
              <p className="font-display text-2xl font-extrabold">
                {iWon ? "🎉 You cracked it!" : `${winnerName(state)} cracked it!`}
              </p>
              <p className="text-sm text-muted-foreground">
                {plural(myGuesses.filter((g) => !g.isTimeout).length, "guess", "guesses")}{" "}
                by you · {theirGuesses.filter((g) => !g.isTimeout).length} by{" "}
                {opponent?.username}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
                <span className="flex items-center gap-2">
                  Your code <KeyTiles value={state.secrets?.[me.id] ?? "????"} />
                </span>
                <span className="flex items-center gap-2">
                  Theirs{" "}
                  <KeyTiles
                    value={state.secrets?.[opponent?.id ?? ""] ?? "????"}
                  />
                </span>
              </div>
              <BackHome />
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-3 rounded-xl border-2 p-4 shadow-[3px_3px_0_var(--border)]",
                myTurn ? "bg-primary/10" : "bg-card"
              )}
            >
              <div className="flex items-center justify-between">
                <p
                  className={cn(
                    "font-display text-lg font-extrabold",
                    myTurn && "animate-pulse"
                  )}
                  aria-live="polite"
                >
                  {myTurn
                    ? "Your turn — make a guess"
                    : `${opponent?.username ?? "Opponent"} is thinking…`}
                </p>
              </div>
              <Countdown
                endsAt={state.turnEndsAt}
                totalSeconds={state.turnSeconds}
              />
              <DigitInput
                label="Guess"
                value={guess}
                onChange={setGuess}
                onSubmit={submit}
                disabled={!myTurn}
              />
              {error && (
                <p className="text-center text-sm text-destructive">{error}</p>
              )}
              <Button onClick={submit} disabled={!myTurn}>
                Submit guess
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <GuessColumn title="Your guesses" guesses={myGuesses} />
            <GuessColumn
              title={`${opponent?.username ?? "Opponent"}'s guesses`}
              guesses={theirGuesses}
            />
          </div>

          <p className="text-center text-xs text-muted-foreground">
            <Pill kind="digits">Digits</Pill>&nbsp;in the code anywhere ·{" "}
            <Pill kind="placed">Placed</Pill>&nbsp;exact position. Which ones?
            That&apos;s the game.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function GuessColumn({ title, guesses }: { title: string; guesses: RoomGuess[] }) {
  return (
    <div className="grid content-start gap-2">
      <p className="font-display text-sm font-extrabold tracking-wide">
        {title} <span className="text-muted-foreground">({guesses.length})</span>
      </p>
      {guesses.length === 0 && (
        <p className="rounded-xl border-2 border-dashed p-3 text-center text-sm text-muted-foreground">
          No guesses yet
        </p>
      )}
      {[...guesses].reverse().map((g, i) =>
        g.isTimeout ? (
          <div
            key={`${g.createdAt}-${i}`}
            className="rounded-xl border-2 border-dashed p-2 text-center text-sm text-muted-foreground"
          >
            ⏱ ran out of time
          </div>
        ) : (
          <div
            key={`${g.createdAt}-${i}`}
            className="flex items-center gap-2 rounded-xl border-2 bg-card p-2 shadow-[2px_2px_0_var(--border)]"
          >
            <span className="flex gap-1" aria-label={g.value}>
              {g.value.split("").map((ch, j) => (
                <span
                  key={j}
                  aria-hidden
                  className="flex size-7 items-center justify-center rounded-md border-2 bg-tile font-mono text-sm font-bold"
                >
                  {ch}
                </span>
              ))}
            </span>
            <span className="ml-auto flex gap-1">
              {g.pending ? (
                <span className="text-xs text-muted-foreground">waiting…</span>
              ) : (
                <>
                  <Pill kind="digits">{g.digits}</Pill>
                  <Pill kind="placed">{g.placed}</Pill>
                </>
              )}
            </span>
          </div>
        )
      )}
    </div>
  );
}

// teal = Digits, gold = Placed — counts only, never per-digit hints
function Pill({ kind, children }: { kind: "digits" | "placed"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-6 items-center justify-center rounded-full border-2 px-1.5 py-0.5 font-mono text-xs font-bold",
        kind === "digits" ? "bg-[oklch(0.85_0.08_200)]" : "bg-tile"
      )}
      title={kind === "digits" ? "Correct digits (any position)" : "Correct position"}
    >
      {children}
    </span>
  );
}

function Countdown({
  endsAt,
  totalSeconds,
}: {
  endsAt: string | null;
  totalSeconds: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return null;
  const remaining = Math.max(0, new Date(endsAt).getTime() - now);
  const seconds = Math.ceil(remaining / 1000);
  const fraction = Math.min(1, remaining / (totalSeconds * 1000));
  const low = seconds <= 10;
  return (
    <div className="grid gap-1">
      <div className="h-2.5 overflow-hidden rounded-full border-2 bg-card">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200",
            low ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <p
        className={cn(
          "text-right font-mono text-xs font-bold",
          low ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {seconds}s
      </p>
    </div>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function hostName(state: RoomState) {
  return state.players.find((p) => p.id === state.hostId)?.username ?? "host";
}

function winnerName(state: RoomState) {
  return state.players.find((p) => p.id === state.winnerUserId)?.username ?? "Winner";
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
    <Button variant="secondary" render={<Link to="/" />}>
      Back to home
    </Button>
  );
}
