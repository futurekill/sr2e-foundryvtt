import { describe, it, expect } from "vitest";
import { proposeCitation } from "../tools/citations/backfill.mjs";

describe("citation backfill: the parsing rule (docs/PLAN-citations.md §3)", () => {
  it("a source parenthetical wins; its description page over the table page", () => {
    const r = proposeCitation("Body +(level+1); Impact Armor ½ level rounded up. (Cybertechnology, table p.99, p.28.)", "ct");
    expect(r.pick).toEqual({ book: "ct", page: "28" });
  });
  it("cross-references don't win, and several candidate pages are reported (multi)", () => {
    const r = proposeCitation("Compatible except move-by-wire (p.39) and the adrenal pump (Shadowtech p.19). (Cybertechnology, table p.99, p.38.)", "ct");
    expect(r.pick).toEqual({ book: "ct", page: "38" });
    expect(r.multi).toBe(true);
  });
  it("the book named in the clause attributes the page (round 1 #1)", () => {
    const r = proposeCitation("Halves visibility modifiers; see the core book Sourcebook Updates table, p.280.", "ssc");
    expect(r.pick?.book).toBe("sr2");
  });
  it("a plain own-book reference", () => {
    expect(proposeCitation("Assault rifle (SR2E p.94). SA/BF/FA.", "sr2").pick).toEqual({ book: "sr2", page: "94" });
    expect(proposeCitation("Design specifications p.110: a drone frame.", "r2").pick).toEqual({ book: "r2", page: "110" });
  });
  it("an explicit own-book reference beats another book's parenthetical cross-reference", () => {
    expect(proposeCitation("Like physical barrier (SR2 p.158), but protects against bladed weapons. Grimoire (2nd ed.) p.131.", "grim").pick)
      .toEqual({ book: "grim", page: "131" });
    expect(proposeCitation("The reverse of increase reflexes (SR2 p.155): loses 2 dice. Grimoire (2nd ed.) p.129.", "grim").pick)
      .toEqual({ book: "grim", page: "129" });
  });
  it("a closing own-book source line wins over earlier own-book parentheticals", () => {
    expect(proposeCitation("Range is printed Extended (Grimoire p.123). Grimoire (2nd ed.) p.128.", "grim").pick).toEqual({ book: "grim", page: "128" });
    expect(proposeCitation("Like background count (p.89), it raises the TN. Grimoire (2nd ed.) p.131.", "grim").pick).toEqual({ book: "grim", page: "131" });
  });
  it("no page → no pick", () => {
    expect(proposeCitation("A heavy fighting knife. SSC.", "ssc").pick).toBe(null);
  });
});
