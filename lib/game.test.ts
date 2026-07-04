// Run: npx tsx lib/game.test.ts — asserts the §2.3 scoring table.
import assert from "node:assert";
import { isValidCode, randomCode, score } from "./game";

const table: [string, string, number, number][] = [
  ["4271", "4271", 4, 4],
  ["4271", "1234", 3, 1],
  ["4271", "8956", 0, 0],
  ["4271", "1724", 4, 0],
  ["0123", "0123", 4, 4],
  ["0123", "3210", 4, 0],
  ["5678", "5687", 4, 2],
];
for (const [secret, guess, digits, placed] of table) {
  assert.deepStrictEqual(score(secret, guess), { digits, placed }, `${secret} vs ${guess}`);
}

assert.ok(isValidCode("0123"));
assert.ok(!isValidCode("1123"));
assert.ok(!isValidCode("123"));
assert.ok(!isValidCode("12a4"));

for (let i = 0; i < 1000; i++) assert.ok(isValidCode(randomCode()));

console.log("game.ts: all checks pass");
