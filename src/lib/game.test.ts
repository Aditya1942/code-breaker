// Asserts the §2.3 scoring table (code-breaker-project-prompt.md).
import { describe, expect, it } from "vitest";
import { isValidCode, randomCode, score } from "./game";

describe("score", () => {
  const table: [string, string, number, number][] = [
    ["4271", "4271", 4, 4],
    ["4271", "1234", 3, 1],
    ["4271", "8956", 0, 0],
    ["4271", "1724", 4, 0],
    ["0123", "0123", 4, 4],
    ["0123", "3210", 4, 0],
    ["5678", "5687", 4, 2],
  ];
  it.each(table)("%s vs %s → digits %i placed %i", (secret, guess, digits, placed) => {
    expect(score(secret, guess)).toEqual({ digits, placed });
  });
});

describe("isValidCode", () => {
  it("accepts 4 unique digits incl. leading zero", () => {
    expect(isValidCode("0123")).toBe(true);
  });
  it("rejects repeats, short, non-digit", () => {
    expect(isValidCode("1123")).toBe(false);
    expect(isValidCode("123")).toBe(false);
    expect(isValidCode("12a4")).toBe(false);
  });
});

describe("randomCode", () => {
  it("always yields valid codes", () => {
    for (let i = 0; i < 1000; i++) expect(isValidCode(randomCode())).toBe(true);
  });
});
