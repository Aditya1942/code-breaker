// Firestore onSnapshot replacement for the old SSE hook. Same RoomState
// shape as before so Room.tsx barely changes. Also hosts the client-side
// jobs the server used to do: referee scoring, timeout sweep, win/reveal
// fallbacks, presence heartbeat.
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import {
  claimWin,
  heartbeat,
  privateRef,
  revealSecret,
  roomRef,
  scorePendingGuess,
  sweepTimeout,
  type GuessDoc,
  type RoomDoc,
} from "./rooms";

const ONLINE_WINDOW_MS = 75_000;
const HEARTBEAT_MS = 30_000;

export type RoomPlayer = {
  id: string;
  username: string;
  online: boolean;
  ready: boolean;
};

export type RoomGuess = {
  userId: string;
  value: string;
  digits: number;
  placed: number;
  isTimeout: boolean;
  pending: boolean;
  createdAt: string;
};

export type RoomState = {
  key: string;
  status: "LOBBY" | "PLAYING" | "FINISHED";
  hostId: string | null;
  turnSeconds: number;
  currentTurnUserId: string | null;
  turnEndsAt: string | null;
  winnerUserId: string | null;
  players: RoomPlayer[];
  guesses: RoomGuess[];
  secrets?: Record<string, string>;
};

type GuessEntry = { gid: string; data: GuessDoc };

export function useRoom(roomKey: string, enabled: boolean, myUid: string | null) {
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [guesses, setGuesses] = useState<GuessEntry[]>([]);
  const [mySecret, setMySecret] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Live snapshots: room doc, guesses ordered by seq, own private secret doc.
  useEffect(() => {
    if (!enabled || !myUid) return;
    const unsubs = [
      onSnapshot(roomRef(roomKey), (snap) => {
        if (!snap.exists()) setNotFound(true);
        else setRoom(snap.data() as RoomDoc);
      }),
      onSnapshot(
        query(collection(db, "rooms", roomKey, "guesses"), orderBy("seq")),
        (snap) =>
          setGuesses(
            snap.docs.map((d) => ({ gid: d.id, data: d.data() as GuessDoc }))
          )
      ),
      onSnapshot(privateRef(roomKey, myUid), (snap) => {
        setMySecret(snap.exists() ? (snap.data().secret as string) : null);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [roomKey, enabled, myUid]);

  // Presence: heartbeat + 10s re-render tick so `online` dots stay fresh.
  useEffect(() => {
    if (!enabled || !myUid || !room) return;
    const beat = () => heartbeat(roomKey).catch(() => {});
    beat();
    const beatInterval = setInterval(beat, HEARTBEAT_MS);
    const tickInterval = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      clearInterval(beatInterval);
      clearInterval(tickInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey, enabled, myUid, room === null]);

  // Referee: score the opponent's pending guesses against my secret, in seq
  // order (handles a backlog after reconnect). placed===4 also finishes the
  // room inside scorePendingGuess.
  const inFlight = useRef(new Set<string>());
  useEffect(() => {
    if (!myUid || !mySecret || !room || room.status !== "PLAYING") return;
    for (const { gid, data } of guesses) {
      if (data.status !== "pending" || data.uid === myUid) continue;
      if (inFlight.current.has(gid)) continue;
      inFlight.current.add(gid);
      scorePendingGuess(roomKey, gid, data, mySecret)
        .catch(() => {})
        .finally(() => inFlight.current.delete(gid));
    }
  }, [roomKey, myUid, mySecret, room, guesses]);

  // Timeout sweep: fire shortly after the deadline (jitter so two clients
  // rarely race; the transaction serializes them anyway).
  useEffect(() => {
    if (!room || room.status !== "PLAYING" || !room.turnEndsAt) return;
    const delay = room.turnEndsAt.toMillis() - Date.now() + 1000 + Math.random() * 2000;
    const t = setTimeout(() => sweepTimeout(roomKey).catch(() => {}), Math.max(0, delay));
    return () => clearTimeout(t);
  }, [roomKey, room]);

  // Fallbacks: claim a win the scorer failed to finalize; reveal own secret
  // once the game is FINISHED.
  useEffect(() => {
    if (!myUid || !mySecret || !room) return;
    if (room.status === "PLAYING") {
      const winning = guesses.find(
        ({ data }) => data.uid === myUid && data.status === "scored" && data.placed === 4
      );
      if (winning) claimWin(roomKey, winning.gid, mySecret).catch(() => {});
    } else if (room.status === "FINISHED" && !room.revealedSecrets[myUid]) {
      revealSecret(roomKey, mySecret).catch(() => {});
    }
  }, [roomKey, myUid, mySecret, room, guesses]);

  const state = useMemo<RoomState | null>(() => {
    if (!room) return null;
    const secrets: Record<string, string> =
      room.status === "FINISHED"
        ? room.revealedSecrets
        : myUid && mySecret
          ? { [myUid]: mySecret }
          : {};
    return {
      key: roomKey,
      status: room.status,
      hostId: room.hostUid,
      turnSeconds: room.turnSeconds,
      currentTurnUserId: room.currentTurnUid,
      turnEndsAt: room.turnEndsAt ? room.turnEndsAt.toDate().toISOString() : null,
      winnerUserId: room.winnerUid,
      players: room.memberUids.map((id) => ({
        id,
        username: room.members[id]?.username ?? "?",
        online:
          id === myUid ||
          now - (room.members[id]?.lastSeenAt?.toMillis() ?? 0) < ONLINE_WINDOW_MS,
        ready: room.members[id]?.ready ?? false,
      })),
      guesses: guesses.map(({ data }) => ({
        userId: data.uid,
        value: data.value,
        digits: data.digits ?? 0,
        placed: data.placed ?? 0,
        isTimeout: data.isTimeout,
        pending: data.status === "pending",
        createdAt: data.createdAt.toDate().toISOString(),
      })),
      secrets,
    };
  }, [room, guesses, mySecret, myUid, roomKey, now]);

  return { state, notFound, room };
}
