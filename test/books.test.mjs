import { describe, it, expect } from "vitest";
import { BOOKS, bookOf, isValidPage, normalizePage, citationLabel, citationTitle } from "../module/rules/books.mjs";

describe("book table (chargen M1b)", () => {
  it("aliases resolve the forms the notes use", () => {
    expect(bookOf("SR2E")).toBe("sr2");
    expect(bookOf("the core book Sourcebook Updates table")).toBe("sr2");
    expect(bookOf("Street Samurai Catalog 2nd ed.")).toBe("ssc");
    expect(bookOf("SR Companion (Enemies)")).toBe("sc");
    expect(bookOf("Grimoire II")).toBe("grim");
    expect(bookOf("Design specifications")).toBe(null);
  });
  it("pages: N or N–M only, normalized", () => {
    expect(normalizePage("pp. 81-83")).toBe("81–83");
    expect(isValidPage("81–83")).toBe(true);
    expect(isValidPage("p.81")).toBe(false);
  });
  it("labels and titles", () => {
    expect(citationLabel({ book: "ssc", page: "59" })).toBe("SSC p.59");
    expect(citationLabel({ book: "r2", page: "81–83" })).toBe("R2 pp.81–83");
    expect(citationLabel({ book: "", page: "" })).toBe("");
    expect(citationTitle({ book: "ssc", page: "59" })).toBe(`${BOOKS.ssc.title} (FASA 7104), page 59`);
  });
});
