# Project Prompt: Code Breaker — 4-Digit Number Guessing Game

Use this prompt to build a complete, production-quality implementation of the game described below. Follow every rule in the Game Logic section exactly — it is the source of truth.

---

## 1. Game Overview

Code Breaker is a logic deduction game (a variant of "Bulls and Cows" / Mastermind with digits).

- A **secret code** is a 4-digit number where **all 4 digits are unique** (no repeats).
- **Leading zero is allowed** — `0123` is a valid code. The code is a *string of 4 digits*, not an integer. Never store it as a number (you will lose leading zeros).
- The player makes guesses; after each guess the game returns **only two counts** as feedback:
  1. **Digits** — how many of the guessed digits exist anywhere in the secret code.
  2. **Placed** — how many of the guessed digits are in the exact correct position.
- The game must **never reveal which specific digits are correct or which positions match** — only the two counts.
- The player wins when `Placed == 4`.

### Game Modes
1. **Manual mode** — the user sets a secret code (or generates a random one), then guesses manually until solved.
2. **Auto-solve mode** — an AI solver guesses in a loop automatically until it cracks the code. The solver must be "honest": it may only use the feedback counts, never read the secret directly.

---

## 2. Game Logic (Source of Truth)

### 2.1 Code Validity

A code/guess is valid if and only if:
- It is exactly 4 characters long.
- Every character is a digit `0–9`.
- All 4 digits are distinct.

```
isValidCode(s):
    return s matches /^\d{4}$/ AND uniqueCount(s) == 4
```

Total valid codes: **10 × 9 × 8 × 7 = 5,040** (permutations of 10 digits taken 4 at a time).

### 2.2 Scoring Function

This is the core of the game. It must be a **pure function** with no side effects.

```
score(secret, guess) -> { digits, placed }

placed = 0
digits = 0
for i in 0..3:
    if secret[i] == guess[i]:  placed += 1
    if secret contains guess[i]: digits += 1
return { digits, placed }
```

**Important properties:**
- `digits` is the TOTAL match count — it **includes** placed digits. So `placed <= digits` always.
- Both secret and guess have unique digits, so no duplicate-counting logic is needed (this is why the simple `contains` check is safe — do NOT reuse Mastermind duplicate-handling logic).
- Example: secret `4271`, guess `1234` → `digits = 3` (1, 2, 4 all exist in secret), `placed = 1` (the `2` at index 1). Feedback shown: **Digits: 3, Placed: 1**.
- Win condition: `placed == 4` (which implies `digits == 4`).

### 2.3 Scoring Examples (use these as unit test cases)

| Secret | Guess  | Digits | Placed | Notes |
|--------|--------|--------|--------|-------|
| 4271   | 4271   | 4      | 4      | Win |
| 4271   | 1234   | 3      | 1      | 1,2,4 present; only 2 placed correctly |
| 4271   | 8956   | 0      | 0      | No overlap |
| 4271   | 1724   | 4      | 0      | All digits right, all positions wrong |
| 0123   | 0123   | 4      | 4      | Leading zero must survive |
| 0123   | 3210   | 4      | 0      | Full anagram, nothing placed |
| 5678   | 5687   | 4      | 2      | 5,6 placed; 7,8 swapped |

### 2.4 Random Secret Generation

Fisher–Yates style pick from a shrinking pool (no rejection sampling loops):

```
randomCode():
    pool = [0,1,2,3,4,5,6,7,8,9]
    code = ""
    repeat 4 times:
        idx = randomInt(0, pool.length - 1)
        code += pool.removeAt(idx)
    return code
```

### 2.5 Auto-Solver Algorithm (Candidate Filtering)

The solver is a constraint-propagation solver. It must NOT access the secret — it only submits guesses through the same public API a human uses and consumes the `{digits, placed}` feedback.

```
solver:
    candidates = all 5,040 valid codes          // generate once, lazily

    loop:
        guess = pick one code from candidates    // random pick is fine (KISS)
        result = submitGuess(guess)              // same path as a human guess
        if result.placed == 4: STOP (solved)

        // Keep only codes that would have produced the same feedback
        candidates = candidates.filter(c =>
            score(c, guess).digits == result.digits AND
            score(c, guess).placed == result.placed
        )
```

**Why this works:** the real secret is always in `candidates`, because the secret by definition produces exactly the observed feedback against every guess made. Each guess eliminates all inconsistent codes. Average solve: **~6–8 guesses**; worst case with random picking is rarely above 10.

**Key implementation notes:**
- The same `score()` function is reused inside the filter — DRY. The filter asks: "if candidate `c` were the secret, would this guess have gotten this feedback?"
- If `candidates` becomes empty, the feedback history is inconsistent (impossible with an honest engine) — surface this as an error state, don't crash or loop forever.
- Run the loop with a delay between guesses (e.g., 400–500 ms) so the user can watch it work. Expose a **live "candidates remaining" counter** — watching 5,040 collapse to 1 is the best part of the feature.
- The solver must be **stoppable mid-run** (cancel the timer/coroutine/job cleanly).
- Optional enhancement (do NOT do by default; adds complexity for minor gain): minimax candidate selection (Knuth's approach) instead of random pick. Random-from-candidates is the KISS baseline and performs well.

### 2.6 Guess Log

Every guess (manual or auto) is appended to a persistent in-game log. Each entry contains:

```
GuessEntry {
    index: Int            // 1-based attempt number
    guess: String         // e.g. "1234"
    digits: Int           // 0..4
    placed: Int           // 0..4
    isAuto: Boolean       // was this made by the solver
    timestamp: Long
}
```

Log rules:
- Newest entry displayed on top.
- Show the guess as 4 separate digit cells and the two counts as distinct visual pills (different colors for Digits vs Placed).
- Never annotate WHICH digit was correct — no per-digit coloring of the guess itself. The whole game is that the player deduces this.
- The log survives within a game session; a "New game" action clears it.

### 2.7 Game State Machine

```
SETUP ──lock valid secret──▶ PLAYING ──placed==4──▶ SOLVED
  ▲                             │  ▲
  │                       start │  │ stop / solved
  │                             ▼  │
  │                         AUTO_SOLVING
  └────────── new game ─────────┴──────── (from any state)
```

State rules:
- **SETUP**: secret input visible (masked by default, with show/hide toggle), "Random" generator available. Invalid code → inline validation error, stay in SETUP.
- **PLAYING**: manual guess input active. Invalid guess → inline error, does NOT consume an attempt or write to the log.
- **AUTO_SOLVING**: manual guess input disabled; the auto button becomes "Stop". Stopping returns to PLAYING with candidates state discarded or retained (retain it — resuming auto should not restart from 5,040).
- **SOLVED**: both inputs disabled; win banner shows the secret, attempt count, and whether auto solved it. Only "New game" is actionable.
- Attempt counter increments only on valid guesses.

---

## 3. Functional Requirements

1. **Secret entry**: 4 individual digit input cells with auto-advance on type and backspace-moves-back. Masked (password-style) with a show/hide toggle. Random-generate button.
2. **Guess entry**: same 4-cell component (reuse it — one component, two configurations). Enter/submit key triggers guess.
3. **Validation** (both inputs): exactly 4 digits, all unique. Clear, non-blocking inline error messages ("Code must be 4 digits with no repeats").
4. **Feedback display**: two counts per guess, visually distinct (e.g., teal pill for Digits, gold pill for Placed). A legend explaining what each count means.
5. **Auto-solve**: start/stop toggle, ~450 ms between guesses, live candidates-remaining counter, uses the identical guess pipeline as manual play.
6. **Stats**: attempt count, candidates remaining (auto mode), and on win: total attempts + solved-by indicator.
7. **New game**: full state reset back to SETUP.

## 4. Non-Functional Requirements

- **Architecture**: modular monolith. Strictly separate:
  - `core/` — pure game logic: `score`, `isValidCode`, `randomCode`, `generateAllCodes`, solver step function. Zero UI or framework imports. 100% unit-testable.
  - `state/` — game session state machine, guess log, attempt counting.
  - `ui/` — rendering and input only; talks to state via a small interface.
- **SOLID**: the solver depends on a `submitGuess` abstraction, not on the secret or the UI (DIP). The digit-input row is a single reusable component configured by props/params (SRP, OCP).
- **DRY**: exactly one `score()` implementation, used by both the game engine and the solver's filter.
- **KISS**: no over-engineering — no server, no persistence beyond the session (unless a later phase adds it), random candidate picking over minimax.
- **Testing**: unit tests for `score()` (use the table in §2.3), `isValidCode`, `randomCode` (validity + distribution sanity), and a solver integration test: for N random secrets, the solver must always terminate with the correct code, and average attempts should be < 10.
- **Accessibility**: keyboard-only play must work; visible focus states; announce feedback counts to screen readers.

## 5. Suggested Enhancements (later phases, optional)

- Difficulty variants: 3/5/6-digit codes (generalize `score` and code length — design `core/` with length as a parameter from day one).
- ~~Two-player mode: player A sets the code on one screen/device, player B guesses.~~ **Promoted to the main game — see §7.**
- "Race the AI": human and solver alternate on the same secret; fewest attempts wins.
- Guess-log export / share result (Wordle-style emoji grid using counts only).
- Persistence of stats history (games played, average attempts, best score).

## 6. Online 2-Player Mode (Main Game)

This is the primary game mode. All scoring/validation rules from §2 apply unchanged — §2 remains the source of truth for game logic.

### 6.1 Flow

1. **Lobby** — a host creates a room (6-char key) and shares the link; a second player joins. Room holds exactly 2 players.
2. **Setup** (both players present):
   - The **host picks a per-turn timer**: 30 / 60 / 90 / 120 seconds (default 60). Changeable until the game starts; the guest sees it read-only.
   - **Each player secretly picks a 4-digit code** (valid per §2.1; random-generate available; masked input with show/hide) and presses **Ready**. Ready locks their code.
   - When **both players are ready, the game starts automatically**. First turn is a random pick of the two players.
3. **Playing** — strictly turn-based:
   - On your turn you submit one guess against the **opponent's** secret. Feedback is the §2.2 `{digits, placed}` pair — never per-digit hints.
   - Off-turn, you wait and watch. The server rejects out-of-turn guesses.
   - Every valid guess is appended to a shared log. **Both players see both guess lists on a single screen** (two columns: yours / theirs), newest first, rendered per §2.6.
   - **Turn timer**: each turn has a server-side deadline (`now + turnSeconds`). If it expires before a valid guess, the **turn is skipped** — logged as a timeout entry — and play passes to the opponent.
4. **Finished** — first player to score `placed == 4` **wins instantly** (no equalizing turn). Both secrets are revealed, attempt counts shown.

### 6.2 Rules

- Secrets are stored server-side only and never sent to clients while the game is in progress; both are revealed only after the game ends.
- The server is authoritative for turn order, deadlines, scoring, and win detection. Clients only render state and submit guesses.
- Invalid guesses (bad length / repeat digits) are rejected without consuming the turn or writing to the log.
- A disconnected player's timer still runs — timeouts keep the game moving.

### 6.3 State Machine (room)

```
LOBBY ──both players ready──▶ PLAYING ──placed==4──▶ FINISHED
  (join, host timer,            (turn loop:
   secret + ready)               guess | timeout → flip turn)
```

## 7. Edge Cases Checklist

- [ ] Leading-zero secrets (`0xyz`) work end-to-end — never coerced to int anywhere.
- [ ] Guessing the same code twice is allowed but wasteful — no dedupe required, but log both.
- [ ] Repeated digits in input → validation error before scoring.
- [ ] Non-digit characters stripped/blocked at input level.
- [ ] Stopping auto-solve mid-run leaves the game playable manually, with log intact.
- [ ] Starting auto-solve after some manual guesses is allowed — but the solver starts from the full 5,040 set unless you feed it the existing log (nice enhancement: seed the filter with prior manual guesses).
- [ ] Win via auto vs manual is distinguished in the win banner.
- [ ] Timer/coroutine cleanup on new game / screen exit (no leaked auto loops).
