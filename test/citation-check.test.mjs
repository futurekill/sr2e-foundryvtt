import { describe, it, expect } from "vitest";
import { BOOK_IDS } from "../tools/citations/check-citations.mjs";
import { BOOKS, NO_BOOK } from "../module/rules/books.mjs";

describe("the copied citation gate (docs/PLAN-citations.md §5)", () => {
  it("its book list is the system's book table (re-copy it into the content repos when this fails)", () => {
    expect([...BOOK_IDS].sort()).toEqual([...Object.keys(BOOKS), NO_BOOK].sort());
  });
});
