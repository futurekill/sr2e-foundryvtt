import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

// The system's citation gate (docs/PLAN-citations.md §5), on since 2026-11-15 when its last unresolved rows
// (Subsonic, Launch Weapons, Pilot) were settled: every catalog entry in packs-src cites a page.
describe("citation gate (system packs)", () => {
  it("every catalog entry cites its page, and no override row is unresolved", () => {
    let out = "", ok = true;
    try { out = execFileSync("node", ["tools/citations/check-citations.mjs"], { encoding: "utf8" }); }
    catch (e) { ok = false; out = `${e.stdout ?? ""}${e.stderr ?? ""}`; }
    expect(ok, out).toBe(true);
  });
});
