// Adept powers, Phase B (docs/PLAN-adept-powers-phase-b.md): Grimoire p.34, p.44; core p.71, p.157.
import { describe, it, expect } from "vitest";
import { skillGroup, adeptCenteringCovers, attributeBoostDrainLevel, attributeBoostDrainTN, suspendedFactor } from "../module/rules/adept-phase-b-rules.mjs";

describe("adept powers, Phase B rules", () => {
  it("skill groups: Physical = Athletics and Stealth (core p.71); the item's category wins for non-Active skills", () => {
    expect(skillGroup({ key: "athletics" })).toBe("physical");
    expect(skillGroup({ key: "firearms" })).toBe("combat");
    expect(skillGroup({ key: "etiquette" })).toBe("social");
    expect(skillGroup({ key: "anything", category: "knowledge" })).toBe("knowledge");
    expect(skillGroup({ key: "homebrew_skill" })).toBeNull();
  });
  it("Centering covers Physical Skills, and other groups only through Enhanced Centering (Grimoire p.44)", () => {
    expect(adeptCenteringCovers({ group: "physical", skillName: "Stealth" }, [])).toBe(true);
    expect(adeptCenteringCovers({ group: "combat", skillName: "Firearms" }, [])).toBe(false);
    expect(adeptCenteringCovers({ group: "combat", skillName: "Firearms" }, [{ category: "combat" }])).toBe(true);
    expect(adeptCenteringCovers({ group: "special", skillName: "Dance" }, [{ category: "special", skill: "Meditation" }])).toBe(false);
    expect(adeptCenteringCovers({ group: "special", skillName: "Dance" }, [{ category: "special", skill: "dance" }])).toBe(true);
    expect(adeptCenteringCovers({ group: null, skillName: "x" }, [{ category: "combat" }])).toBe(false);
  });
  it("Attribute Boost Drain (Grimoire p.34): level by the boosted rating against the racial maximum; TN half, rounded down", () => {
    expect(attributeBoostDrainLevel(3, 6)).toBe("L");
    expect(attributeBoostDrainLevel(6, 6)).toBe("M");
    expect(attributeBoostDrainLevel(9, 6)).toBe("S");
    expect(attributeBoostDrainLevel(10, 6)).toBe("D");
    expect(attributeBoostDrainTN(9)).toBe(4);
    expect(attributeBoostDrainTN(3)).toBe(2);
  });
  it("Suspended State: Hibernate's factor is twice the successes (core p.157)", () => {
    expect(suspendedFactor(4)).toBe(8);
    expect(suspendedFactor(0)).toBe(0);
  });
});
