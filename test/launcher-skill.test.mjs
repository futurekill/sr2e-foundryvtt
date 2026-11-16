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

import { webNodeForLabel } from "../module/rules/sr2e-rules.mjs";
import { MIGRATIONS } from "../module/migrations.mjs";
describe("c-post r1 fixes", () => {
  it("a vehicle skill's book name finds its Skill Web node (#2)", () => {
    const web = { nodes: { winged: { label: "Winged Aircraft", type: "skill" }, rotor: { label: "Rotor Aircraft", type: "skill" },
      vectorThrust: { label: "Vector Thrust Aircraft", type: "skill" }, car: { label: "Car", type: "skill" } } };
    expect(webNodeForLabel(web, "Winged Plane")).toBe("winged");
    expect(webNodeForLabel(web, "Rotor Craft")).toBe("rotor");
    expect(webNodeForLabel(web, "Vectored Thrust")).toBe("vectorThrust");
    expect(webNodeForLabel(web, "Car")).toBe("car");
    expect(webNodeForLabel(web, "Pilot")).toBe(null);
  });
  it("0.158.0 clears a vehicle's 'pilot' skill and moves Launch Weapons launchers (#1)", () => {
    const m = MIGRATIONS.find(e => e.version === "0.158.0");
    expect(m.migrateActor({ type: "vehicle", system: { skill: "pilot" } })).toEqual({ "system.skill": "" });
    expect(m.migrateActor({ type: "vehicle", system: { skill: "winged" } })).toBe(null);
    expect(m.migrateItem({ type: "weapon", name: "ArmTech MGL-12", system: { skill: "launch_weapons" } })).toEqual({ "system.skill": "firearms" });
    expect(m.migrateItem({ type: "weapon", name: "Colt", system: { skill: "firearms" } })).toBe(null);
  });
});
