# Final Plan — Online 2-Player Code Breaker

Turn-based multiplayer built on the existing lobby (auth, rooms, join, SSE presence). Game logic source of truth: `code-breaker-project-prompt.md` §2; multiplayer rules: §6.

## Decisions

| Question | Decision |
|---|---|
| Timer expiry | Turn skips, logged as timeout entry |
| Win rule | Instant win on `placed == 4` |
| Host | Member with earliest `joinedAt` |
| First turn | Random pick of the two players |
| Timer options | 30 / 60 / 90 / 120 s, default 60, host-only, locked once PLAYING |
| Secrets | Server-side only during play; both revealed after FINISHED |

## Architecture

- **Server-authoritative.** Clients render SSE state and POST actions; the server validates turn ownership, deadlines, scoring, and win detection.
- **Pure core** — `lib/game.ts`: `isValidCode`, `score`, `randomCode` ported verbatim from §2. Zero framework imports. Checked by `lib/game.test.ts` (§2.3 table) via `npx tsx`.
- **Transport** — existing SSE poll loop (`app/api/rooms/[key]/events/route.ts`, 2 s tick, dedupe-on-change) extended to carry game state. The same tick doubles as the **timeout sweep**.

## Schema (prisma db push)

```prisma
enum RoomStatus { LOBBY PLAYING FINISHED }

// Room additions
status RoomStatus @default(LOBBY)
turnSeconds Int @default(60)
currentTurnUserId String?
turnEndsAt DateTime?
winnerUserId String?
guesses Guess[]

// RoomMember additions
secret String?
ready  Boolean @default(false)

model Guess {
  id        String   @id @default(cuid())
  roomId    String
  userId    String
  value     String   // "" for timeout entries
  digits    Int
  placed    Int
  isTimeout Boolean  @default(false)
  createdAt DateTime @default(now())
  room      Room     @relation(fields: [roomId], references: [id])
  @@index([roomId, createdAt])
}
```

## API

All under `app/api/rooms/[key]/`, session-cookie auth via `lib/session.ts`:

- `POST settings` `{turnSeconds}` — host only, LOBBY only, value must be 30|60|90|120.
- `POST ready` `{secret}` — member, LOBBY only, `isValidCode` required. Sets secret + ready. When the second ready lands: status → PLAYING, `currentTurnUserId` = random member, `turnEndsAt` = now + turnSeconds.
- `POST guess` `{guess}` — PLAYING, caller's turn, valid code, deadline not passed. Scores against opponent's secret, inserts Guess. `placed == 4` → FINISHED + winner; else flip turn + new deadline.
- **Timeout sweep** in SSE tick: PLAYING and `now > turnEndsAt` → optimistic `updateMany` guarded on the observed `turnEndsAt` flips the turn; only the winning writer inserts the timeout Guess row (two open streams can't double-fire).

### SSE payload (`RoomState`)

```ts
{
  key, status, hostId, turnSeconds,
  currentTurnUserId, turnEndsAt,      // ISO string
  winnerUserId,
  players: [{ id, username, online, ready }],
  guesses: [{ userId, value, digits, placed, isTimeout, createdAt }],
  secrets?: Record<userId, code>      // FINISHED only
}
```

## UI (`app/room/[key]/page.tsx`)

Joined view branches on `state.status`:

- **LOBBY** — player slots (+ ready badges), host timer chips, masked 4-cell secret input with show/hide + Random, Ready button (locks input), copy-invite.
- **PLAYING** — single shared screen: turn banner ("Your turn" pulse / "{name} is thinking…"), countdown bar driven client-side from `turnEndsAt` (amber under 10 s), 4-cell guess input enabled only on your turn, and **two guess columns (yours / opponent's)** — each row is 4 amber digit tiles + teal **Digits** pill + gold **Placed** pill, newest on top, timeout rows muted. No per-digit coloring (§2.6). Legend underneath.
- **FINISHED** — win/lose banner, both secrets revealed as tiles, attempt counts, back home.

New component `components/ui/digit-input.tsx`: one 4-cell input (auto-advance, backspace-back, digit-only, optional masking) reused for secret and guess entry (§3.1–3.2).

## Verification

1. `npx tsx lib/game.test.ts` — §2.3 scoring table.
2. `npx tsc --noEmit`, lint, `yarn build`.
3. `npx prisma db push` against local `prisma dev` (127.0.0.1, dynamic port).
4. curl E2E with two cookie jars: auth ×2 → create/join → settings → ready ×2 → alternating guesses (turn enforcement, scoring, flip) → winning guess (FINISHED, winner, secrets revealed).
5. Timeout: short timer, let deadline lapse, confirm SSE inserts timeout row and flips turn.
6. Browser: two sessions, full visual flow.
