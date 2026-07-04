// Pure game logic — source of truth: code-breaker-project-prompt.md §2.
// Codes are ALWAYS 4-char strings (leading zeros matter), all digits unique.

export const CODE_LENGTH = 4;
export const TURN_SECONDS_OPTIONS = [30, 60, 90, 120] as const;

export function isValidCode(s: string): boolean {
  return /^\d{4}$/.test(s) && new Set(s).size === CODE_LENGTH;
}

// digits = total match count (includes placed), so placed <= digits always.
// Unique digits on both sides make the simple includes() check safe —
// no Mastermind duplicate handling (§2.2).
export function score(secret: string, guess: string): { digits: number; placed: number } {
  let digits = 0;
  let placed = 0;
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (secret[i] === guess[i]) placed++;
    if (secret.includes(guess[i])) digits++;
  }
  return { digits, placed };
}

// Fisher–Yates style pick from a shrinking pool (§2.4).
export function randomCode(): string {
  const pool = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    code += pool.splice(idx, 1)[0];
  }
  return code;
}
