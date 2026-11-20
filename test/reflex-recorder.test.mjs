import { describe, it, expect } from "vitest";
import { reflexRecorderDice as dice } from "../module/rules/sr2e-rules.mjs";

describe("reflexRecorderDice (Shadowtech p.27)", () => {
  const gen = [{ skill: "Firearms", size: "general" }];
  it("a General recorder: +1 on its skill, every tier; nothing on another skill", () => {
    expect(dice({ recorders: gen, skillName: "Firearms" })).toBe(1);
    expect(dice({ recorders: gen, skillName: "firearms", tier: "specialization", concentration: "Pistols" })).toBe(1);
    expect(dice({ recorders: gen, skillName: "Armed Combat" })).toBe(0);
  });
  it("not cumulative; nothing on B/R, Knowledge or a chipped skill", () => {
    expect(dice({ recorders: [...gen, ...gen, { skill: "Firearms", size: "concentration", concentration: "Pistols" }], skillName: "Firearms", tier: "concentration", concentration: "Pistols" })).toBe(1);
    expect(dice({ recorders: [{ skill: "Car" }], skillName: "Car (B/R)", category: "build_repair" })).toBe(0);
    expect(dice({ recorders: gen, skillName: "Firearms", category: "knowledge" })).toBe(0);
    expect(dice({ recorders: gen, skillName: "Firearms", chipped: true })).toBe(0);
  });
  it("a Concentration recorder: only that concentration's rolls (and its specialization), never the general skill", () => {
    const c = [{ skill: "Firearms", size: "concentration", concentration: "Pistols" }];
    expect(dice({ recorders: c, skillName: "Firearms" })).toBe(0);
    expect(dice({ recorders: c, skillName: "Firearms", tier: "concentration", concentration: "Pistols" })).toBe(1);
    expect(dice({ recorders: c, skillName: "Firearms", tier: "specialization", concentration: "Pistols" })).toBe(1);
    expect(dice({ recorders: c, skillName: "Firearms", tier: "concentration", concentration: "Rifles" })).toBe(0);
    expect(dice({ recorders: c, skillName: "Armed Combat", tier: "concentration", concentration: "Pistols" })).toBe(0);
  });
});
