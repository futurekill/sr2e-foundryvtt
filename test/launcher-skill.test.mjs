import { describe, it, expect } from "vitest";
import { launcherSkill } from "../module/migrations.mjs";
import { vehicleSkillMatches, isVehicleSkillName } from "../module/rules/vehicle-r2-rules.mjs";

describe("Removed 3rd-edition skills (2026-11-15)", () => {
  it("launchers move to SR2's skills: grenade launchers Firearms, rockets/missiles/mortars Gunnery (core p.75)", () => {
    expect(launcherSkill("ArmTech MGL-12")).toBe("firearms");
    expect(launcherSkill("ArmTech Mini-6 Grenade Launcher")).toBe("firearms");
    expect(launcherSkill("Great Dragon ATGM")).toBe("gunnery");
    expect(launcherSkill("M-12 Man-Portable Mortar")).toBe("gunnery");
    expect(launcherSkill("M79B1 Light Anti-Armor Weapon")).toBe("gunnery");
  });
  it("a vehicle skill matches by any of its book names, and Pilot is not a vehicle skill", () => {
    expect(vehicleSkillMatches("Winged Plane", "winged")).toBe(true);
    expect(vehicleSkillMatches("Winged Aircraft", "winged")).toBe(true);
    expect(vehicleSkillMatches("Rotor Craft", "rotor")).toBe(true);
    expect(vehicleSkillMatches("Vectored Thrust", "vectorThrust")).toBe(true);
    expect(vehicleSkillMatches("Car", "car")).toBe(true);
    expect(vehicleSkillMatches("Car", "winged")).toBe(false);
    expect(isVehicleSkillName("Pilot")).toBe(false);
    expect(isVehicleSkillName("Motorboat")).toBe(true);
  });
});
