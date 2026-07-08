import { describe, it, expect } from "vitest";
import {
  BANTER, hashSeed, seededRng, shouldBanter, pickBanter, actorTags, testEventTag, applyName
} from "../module/banter.mjs";

describe("Shadowtalk banter", () => {
  it("is deterministic for the same seed (chat re-renders keep their line)", () => {
    const a = pickBanter(["glitch"], seededRng(hashSeed("msg-123")));
    const b = pickBanter(["glitch"], seededRng(hashSeed("msg-123")));
    expect(a).toEqual(b);
    expect(a.tags).toContain("glitch");
  });

  it("frequency throttle: off never talks, chatty talks more than rare", () => {
    const count = (freq) => {
      let n = 0;
      const rng = seededRng(42);
      for (let i = 0; i < 1000; i++) if (shouldBanter(freq, rng)) n++;
      return n;
    };
    expect(count("off")).toBe(0);
    expect(count("chatty")).toBeGreaterThan(count("rare"));
  });

  it("derives character tags from a snapshot", () => {
    expect(actorTags({ race: "troll", cyberCount: 5, essence: 1.2, nuyen: 50 }))
      .toEqual(expect.arrayContaining(["runner", "troll", "chromed", "lowEssence", "broke"]));
    expect(actorTags({ magicType: "physical_adept" })).toContain("adept");
    expect(actorTags({ mpcp: 6 })).toContain("decker");
  });

  it("maps success-test card state to an event tag", () => {
    const dice = (s) => Array.from({ length: 6 }, (_, i) => ({ success: i < s }));
    expect(testEventTag({ dice: dice(0), criticalGlitch: true })).toBe("glitch");
    expect(testEventTag({ dice: dice(0), criticalGlitch: true, glitchAvoided: true })).toBe("fail");
    expect(testEventTag({ dice: dice(5) })).toBe("crit");
    expect(testEventTag({ dice: dice(0) })).toBe("fail");
    expect(testEventTag({ dice: dice(2) })).toBe("success");
    expect(testEventTag(undefined)).toBeNull();
  });

  it("substitutes {name}, and falls back to a generic when absent", () => {
    expect(applyName("Watch your back, {name}.", "Razor")).toBe("Watch your back, Razor.");
    expect(applyName("{name} buys the drinks. {name} always does.", "Sable"))
      .toBe("Sable buys the drinks. Sable always does.");
    expect(applyName("Nice roll.", "Razor")).toBe("Nice roll."); // no token, unchanged
    expect(applyName("Hey {name}.", "")).toBe("Hey chummer."); // fallback
  });

  it("has real variety per category (≥5 each for the event tags)", () => {
    const count = (t) => BANTER.filter(l => l.tags.includes(t)).length;
    for (const t of ["glitch", "crit", "fail"]) expect(count(t)).toBeGreaterThanOrEqual(5);
    expect(BANTER.length).toBeGreaterThanOrEqual(60);
  });

  it("every line has text, a handle, and at least one known tag", () => {
    const known = ["glitch", "crit", "fail", "success", "troll", "elf", "dwarf", "ork",
      "chromed", "lowEssence", "mage", "adept", "decker", "rigger", "broke", "rich", "runner"];
    for (const l of BANTER) {
      expect(l.text.length).toBeGreaterThan(0);
      expect(l.by.length).toBeGreaterThan(0);
      expect(l.tags.some(t => known.includes(t))).toBe(true);
    }
  });
});
