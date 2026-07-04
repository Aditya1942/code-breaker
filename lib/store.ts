// In-memory room store — session-based game, nothing persisted.
// Server restart wipes all rooms; identity lives in the session cookie.

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

const globalForRooms = globalThis as unknown as { rooms?: Map<string, Game> };

export const rooms = (globalForRooms.rooms ??= new Map<string, Game>());
