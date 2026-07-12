# Code Breaker — Vite React SPA on Firebase (Spark plan)

No server code. Everything is static hosting + client-direct Firestore guarded by
`firestore.rules`. Key invariants:

- Every Firestore write in `src/lib/rooms.ts` must exactly match a rules case
  (field sets validated via `diff().affectedKeys().hasOnly(...)`). Change one →
  change both, then run `yarn test:rules` (needs Java 21+ for the emulator).
- Anti-cheat model: secrets live in `rooms/{key}/private/{uid}` (owner-only read);
  the OPPONENT's client scores each guess (`scorePendingGuess` in use-room.ts's
  referee effect). Never expose the opponent's secret before FINISHED.
- Turn timeouts and zombie-room cleanup run client-side (`sweepTimeout`), gated by
  rules on `request.time`. Firestore TTL policy on `expireAt` reaps stale docs.

Dev: `yarn emulators` + `yarn dev` (`.env.local` has `VITE_USE_EMULATORS=1`).
Second player for manual testing: `node scripts/bot-player.mjs ROOMKEY [secret]`.
