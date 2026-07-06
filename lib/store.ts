// Room store on Vercel Runtime Cache — ephemeral shared KV, no database.
// Shared across function instances in a region; falls back to in-memory
// locally. Rooms expire via TTL; identity lives in the session cookie.

import { getCache } from "@vercel/functions";

export type Member = {
  userId: string;
  username: string;
  secret: string | null; // 4-digit code as string — never an int (leading zeros)
  ready: boolean;
  joinedAt: string;
  lastSeenAt: string;
};

export type Guess = {
  userId: string;
  value: string; // "" for timeout entries
  digits: number;
  placed: number;
  isTimeout: boolean;
  createdAt: string;
};

export type Game = {
  key: string; // 6 chars, A-Z + 2-9, no O/I/0/1
  status: "LOBBY" | "PLAYING" | "FINISHED";
  turnSeconds: number;
  currentTurnUserId: string | null;
  turnEndsAt: string | null;
  winnerUserId: string | null;
  createdAt: string;
  members: Member[]; // insertion order = join order; members[0] is host
  guesses: Guess[];
};

const ROOM_TTL_SECONDS = 60 * 60 * 12; // half a day covers any real game

const cache = getCache({ namespace: "rooms" });

export async function getRoom(key: string): Promise<Game | undefined> {
  return (await cache.get(key)) as Game | undefined;
}

// ponytail: read-modify-write with no lock — two simultaneous writes to the
// same room can drop one. Fine for a 2-player turn-based game; move to a
// store with atomic ops if it ever bites.
export async function saveRoom(game: Game): Promise<void> {
  await cache.set(game.key, game, { ttl: ROOM_TTL_SECONDS });
}

export async function deleteRoom(key: string): Promise<void> {
  await cache.delete(key);
}

// Both players idling: too many timeout guesses means nobody's playing —
// destroy the room instead of leaving a zombie until TTL.
export const MAX_TIMEOUTS = 20;
