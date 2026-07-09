import { describe, it, expect } from "vitest";
import { SR2E } from "../module/config.mjs";
import { findBestPath } from "../module/rules/sr2e-rules.mjs";

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
});
