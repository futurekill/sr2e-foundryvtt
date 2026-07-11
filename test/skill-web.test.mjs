import { describe, it, expect } from "vitest";
import { SR2E } from "../module/config.mjs";
import { findBestPath, webNodeForLabel, webDefaultingTN } from "../module/rules/sr2e-rules.mjs";

// Acceptance tests for the printed Skill Web (SR2E p.68–69), traced from the
// physical route map (docs/SKILL-WEB-VERIFY.md + book scans). These lock the
// topology: circle counts, one-way arrows, and disconnected clusters. If an
// edit to CONFIG.SR2E.skillWeb.links breaks any of these, the web is wrong.
const web = SR2E.skillWeb;
const circles = (a, b) => findBestPath(web, a, b)?.circles ?? null;

describe("Skill Web — findBestPath acceptance cases (printed route map)", () => {
  it.each([
    ["quickness", "athletics", 1],
    ["quickness", "stealth", 2],
    ["athletics", "stealth", 3],            // shared Quickness junction, both branches paid
    ["firearms", "firearmsBR", 1],
    ["throwing", "throwingBR", 1],
    ["quickness", "throwingBR", 3],
    ["body", "armedCombatBR", 4],
    ["reaction", "vectorThrust", 3],
    ["willpower", "militaryTheory", 5],
    ["biology", "computer", 5],             // stays inside the Intelligence cluster
    ["biology", "cybertechnology", 1],      // GM's adjacency example
  ])("%s → %s = %i circles", (from, to, want) => {
    expect(circles(from, to)).toBe(want);
  });

  it.each([
    ["body", "vectorThrust"],               // melee sink can't reach vehicles
    ["quickness", "computer"],              // separate clusters
    ["strength", "computer"],
    ["body", "computer"],
    ["reaction", "computer"],
    ["throwing", "electronicsBR"],
    ["armedCombat", "quickness"],           // one-way arrow blocks the way back
  ])("%s → %s = no legal route (null)", (from, to) => {
    expect(findBestPath(web, from, to)).toBeNull();
  });

  it("targetNumberModifier is 2× circles crossed", () => {
    const p = findBestPath(web, "willpower", "militaryTheory");
    expect(p.targetNumberModifier).toBe(10);
    expect(p.path[0]).toBe("willpower");
    expect(p.path.at(-1)).toBe("militaryTheory");
  });

  it("maps a (B/R) label to its own node, not the parent", () => {
    // The bug: stripping "(B/R)" collapsed the B/R skill onto its parent, so a
    // B/R check with the parent skill owned defaulted to the attribute instead.
    expect(webNodeForLabel(web, "Throwing Weapons (B/R)")).toBe("throwingBR");
    expect(webNodeForLabel(web, "Throwing Weapons")).toBe("throwing");
    expect(webNodeForLabel(web, "Firearms (B/R)")).toBe("firearmsBR");
  });

  it("a B/R check defaults to the owned parent skill at +2, not the attribute", () => {
    // Character has Throwing Weapons but not Throwing Weapons (B/R).
    const target = webNodeForLabel(web, "Throwing Weapons (B/R)");
    const owned = [webNodeForLabel(web, "Throwing Weapons")];
    const best = webDefaultingTN(web, target, owned);
    expect(best).toEqual({ penalty: 2, source: "throwing", kind: "skill" });
  });
});

describe("Skill Web — most-advantageous defaulting (SR2E p.68–69 + rating tie-break)", () => {
  // electronics and computerTheory both sit 1 circle from computer — a clean
  // equal-distance pair for the rating tie-break and dedup cases.
  it("on an equal-circle tie between two skills, picks the higher-rated one", () => {
    const best = webDefaultingTN(web, "computer",
      [{ node: "electronics", rating: 3 }, { node: "computerTheory", rating: 5 }]);
    expect(best).toEqual({ penalty: 2, source: "computerTheory", kind: "skill" });
  });

  // Two items on the SAME node must keep the MAX rating regardless of insertion
  // order — a lower rating can't clobber a higher one before the tie-break. The
  // competitor (computerTheory 3) sits at the same distance with an intermediate
  // rating, so the assertion only holds if electronics kept its max (5 > 3).
  it.each([
    ["high-then-low", [{ node: "electronics", rating: 5 }, { node: "electronics", rating: 2 }]],
    ["low-then-high", [{ node: "electronics", rating: 2 }, { node: "electronics", rating: 5 }]],
  ])("dedups a repeated node by MAX rating (%s order)", (_label, dup) => {
    const best = webDefaultingTN(web, "computer",
      [...dup, { node: "computerTheory", rating: 3 }]);
    expect(best).toEqual({ penalty: 2, source: "electronics", kind: "skill" });
  });

  it("a strictly-cheaper source beats a higher-rated but farther one (RAW cheapest-circles)", () => {
    // throwing is 1 circle from throwingBR; projectile is 3. Cheaper wins despite
    // the far skill's much higher rating.
    const best = webDefaultingTN(web, "throwingBR",
      [{ node: "throwing", rating: 1 }, { node: "projectile", rating: 6 }]);
    expect(best).toEqual({ penalty: 2, source: "throwing", kind: "skill" });
  });

  it("on a full tie (equal circles AND rating), first-owned wins (documented order)", () => {
    const best = webDefaultingTN(web, "computer",
      [{ node: "electronics", rating: 4 }, { node: "computerTheory", rating: 4 }]);
    expect(best).toEqual({ penalty: 2, source: "electronics", kind: "skill" });
  });

  it("accepts a bare node-key array (rating 0) for back-compat", () => {
    expect(webDefaultingTN(web, "throwingBR", ["throwing"]))
      .toEqual({ penalty: 2, source: "throwing", kind: "skill" });
  });
});
