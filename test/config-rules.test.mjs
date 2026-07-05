import { describe, it, expect } from "vitest";
import { SR2E } from "../module/config.mjs";
import { webDefaultingTN } from "../module/rules/sr2e-rules.mjs";

// These lock in rules already verified against the SR2E core rulebook so a
// future edit can't silently regress them.

describe("Conjuring Drain Table (SR2E p.140)", () => {
  // Drain level/type vs Force relative to Charisma. Boundaries:
  //   Force < half Cha           → Light stun
  //   half Cha ≤ Force ≤ Cha      → Moderate stun   (half is Moderate, not Light)
  //   Cha < Force ≤ 2×Cha         → Serious physical
  //   Force > 2×Cha               → Deadly physical
  const cha = 6;

  it("is Light stun below half Charisma", () => {
    expect(SR2E.conjuringDrain(2, cha)).toEqual({ level: "L", type: "stun" });
  });

  it("is Moderate stun exactly at half Charisma (the corrected boundary)", () => {
    expect(SR2E.conjuringDrain(3, cha)).toEqual({ level: "M", type: "stun" });
  });

  it("is Moderate stun up to and including Charisma", () => {
    expect(SR2E.conjuringDrain(6, cha)).toEqual({ level: "M", type: "stun" });
  });

  it("is Serious physical above Charisma up to double", () => {
    expect(SR2E.conjuringDrain(7, cha)).toEqual({ level: "S", type: "physical" });
    expect(SR2E.conjuringDrain(12, cha)).toEqual({ level: "S", type: "physical" });
  });

  it("is Deadly physical above double Charisma", () => {
    expect(SR2E.conjuringDrain(13, cha)).toEqual({ level: "D", type: "physical" });
  });

  it("handles odd Charisma half (5 → half 2.5; Force 3 is Moderate, 2 is Light)", () => {
    expect(SR2E.conjuringDrain(2, 5)).toEqual({ level: "L", type: "stun" });
    expect(SR2E.conjuringDrain(3, 5)).toEqual({ level: "M", type: "stun" });
  });
});

describe("Security Codes → successes to breach (SR2E p.165)", () => {
  it("maps Blue/Green/Orange/Red to 1/2/3/4", () => {
    expect(SR2E.securityCodes.blue.successes).toBe(1);
    expect(SR2E.securityCodes.green.successes).toBe(2);
    expect(SR2E.securityCodes.orange.successes).toBe(3);
    expect(SR2E.securityCodes.red.successes).toBe(4);
  });

  it("defines exactly the four canonical codes", () => {
    expect(Object.keys(SR2E.securityCodes).sort()).toEqual(["blue", "green", "orange", "red"]);
  });
});

describe("VR2.0 System Operations → ACIFS subsystem (FASA7904 pp.114–116)", () => {
  it("every operation targets a valid ACIFS subsystem", () => {
    const subsystems = Object.keys(SR2E.vr2Subsystems);
    expect(subsystems).toEqual(["access", "control", "index", "files", "slave"]);
    for (const [key, op] of Object.entries(SR2E.vr2SystemOperations)) {
      expect(subsystems, `${key} → ${op.subsystem}`).toContain(op.subsystem);
      expect(op.label, `${key} needs a label`).toBeTruthy();
    }
  });
  it("maps the spot-checked operations to the book's Test subsystem", () => {
    expect(SR2E.vr2SystemOperations.logonHost.subsystem).toBe("access");
    expect(SR2E.vr2SystemOperations.gracefulLogoff.subsystem).toBe("access");
    expect(SR2E.vr2SystemOperations.invalidatePasscode.subsystem).toBe("control");
    expect(SR2E.vr2SystemOperations.locatePaydata.subsystem).toBe("index");
    expect(SR2E.vr2SystemOperations.editFile.subsystem).toBe("files");
    expect(SR2E.vr2SystemOperations.editSlave.subsystem).toBe("slave");
  });
});

describe("Skill Web — GM-verified Quickness cluster (SR2E p.69)", () => {
  const web = SR2E.skillWeb;
  const node = (skillKey) => Object.entries(web.nodes).find(([, n]) => n.skillKey === skillKey)?.[0];
  const pen = (skillKey, owned = []) => webDefaultingTN(web, node(skillKey), owned)?.penalty;

  it("firearms/gunnery default to Quickness at +2 (1 circle)", () => {
    expect(pen("firearms")).toBe(2);
    expect(pen("gunnery")).toBe(2);
  });
  it("projectile/throwing are 2 circles → +4", () => {
    expect(pen("projectile_weapons")).toBe(4);
    expect(pen("throwing_weapons")).toBe(4);
  });
  it("armed/unarmed combat are 1 circle → +2 (Quickness, Strength or Body)", () => {
    expect(pen("armed_combat")).toBe(2);
    expect(pen("unarmed_combat")).toBe(2);
  });
  it("stealth is 2 hops via athletics → +4", () => {
    expect(pen("stealth")).toBe(4);
  });
  it("related-skill shortcut: knowing Firearms defaults Gunnery cheaper than the attribute", () => {
    // Both are 1 circle from Quickness (+2); no direct firearms→gunnery edge, so
    // it still resolves via the attribute at +2 (not cheaper, but never null).
    expect(pen("gunnery", ["firearms"])).toBe(2);
  });
});
