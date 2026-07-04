import path from "node:path";
import { JSONFilePreset } from "lowdb/node";
import type { Low } from "lowdb";

export type User = {
  id: string;
  email: string | null;
  username: string;
  isGuest: boolean;
  sessionToken: string;
  createdAt: string;
};

export type Member = {
  userId: string;
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

// games keyed by creator's email (user id for guests)
export type Data = { users: User[]; games: Record<string, Game[]> };

const globalForDb = globalThis as unknown as { db?: Promise<Low<Data>> };

export function getDb() {
  globalForDb.db ??= JSONFilePreset<Data>(
    path.join(process.cwd(), "db.json"),
    { users: [], games: {} }
  );
  return globalForDb.db;
}

export const gameOwnerKey = (user: User) => user.email ?? user.id;

export function findGame(data: Data, key: string) {
  for (const games of Object.values(data.games)) {
    const game = games.find((g) => g.key === key);
    if (game) return game;
  }
  return null;
}
