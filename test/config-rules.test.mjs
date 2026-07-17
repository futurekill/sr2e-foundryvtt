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

describe("Skill Web — GM-verified circle counts default correctly (SR2E p.69)", () => {
  const web = SR2E.skillWeb;
  const pen = (target, owned = []) => webDefaultingTN(web, target, owned)?.penalty;

  it("Quickness cluster totals (firearms/gunnery/projectile/throwing = 2 circles → +4)", () => {
    expect(pen("athletics")).toBe(2);   // 1 circle
    expect(pen("stealth")).toBe(4);     // 2
    expect(pen("firearms")).toBe(4);    // 2 (GM correction)
    expect(pen("gunnery")).toBe(4);     // 2
    expect(pen("projectile")).toBe(4);
    expect(pen("throwing")).toBe(4);
  });
  it("Melee sinks: Strength 2 circles (+4), Body 3 (+6); combat defaults to Strength", () => {
    expect(webDefaultingTN(web, "unarmedCombat", []))
      .toEqual({ penalty: 4, source: "strength", kind: "attribute" });
    expect(webDefaultingTN(web, "armedCombat", []))
      .toEqual({ penalty: 4, source: "strength", kind: "attribute" });
  });
  it("Social/magic totals: Leadership +4, Interrogation/Negotiation +6, Conjuring +10", () => {
    expect(pen("leadership")).toBe(4);
    expect(pen("etiquette")).toBe(4);
    expect(pen("interrogation")).toBe(6);
    expect(pen("negotiation")).toBe(6);
    expect(pen("conjuring")).toBe(10);
    expect(pen("militaryTheory")).toBe(10);
  });
  it("Intelligence academics = 3 circles (+6); tech deeper (Computer +8, Electronics/Biotech +10)", () => {
    expect(pen("physicalSciences")).toBe(6);
    expect(pen("cybertechnology")).toBe(6);
    expect(pen("biology")).toBe(6);
    expect(pen("computer")).toBe(8);
    expect(pen("electronics")).toBe(10);
    expect(pen("biotech")).toBe(10);
  });
  it("related-skill defaulting: knowing Armed Combat defaults Unarmed via the melee junction", () => {
    // Both hang off the melee sink; back over Armed's circle, out over Unarmed's
    // = 2 circles (+4), tying the Strength default — the related skill wins the tie.
    expect(webDefaultingTN(web, "unarmedCombat", ["armedCombat"]))
      .toEqual({ penalty: 4, source: "armedCombat", kind: "skill" });
    // GM's own example: knowing Biology defaults Cybertechnology at 1 circle (+2).
    expect(webDefaultingTN(web, "cybertechnology", ["biology"]))
      .toEqual({ penalty: 2, source: "biology", kind: "skill" });
  });
  it("unconnected skills return null (defaulting not allowed, not a flat penalty)", () => {
    // Launch Weapons isn't on the web at all.
    expect(webDefaultingTN(web, "launch_weapons", [])).toBeNull();
  });
});

describe("Skill Web reachability — nested Charisma ⊂ Willpower ⊂ Intelligence (p.69)", () => {
  const web = SR2E.skillWeb;
  const reach = (attr) => {
    const adj = {};
    for (const l of web.links) {
      if (l.dir !== "bToA") (adj[l.from] ??= []).push(l.to);
      if (l.dir !== "aToB") (adj[l.to] ??= []).push(l.from);
    }
    const seen = new Set([attr]); const q = [attr];
    while (q.length) for (const n of adj[q.shift()] ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
    return [...seen].filter(n => web.nodes[n]?.type === "skill");
  };
  const counts = { body: 3, strength: 3, quickness: 10, reaction: 11, charisma: 4, willpower: 10, intelligence: 21 };

  for (const [attr, n] of Object.entries(counts)) {
    it(`${attr} reaches exactly ${n} skills`, () => expect(reach(attr).length).toBe(n));
  }
  it("Body/Strength reach ONLY the melee skills (one-way sink)", () => {
    expect(reach("body").sort()).toEqual(["armedCombat", "armedCombatBR", "unarmedCombat"]);
    expect(reach("body")).not.toContain("firearms");
  });
  it("Tech/magic isolation & bridges: Intelligence reaches magic/social; Charisma cannot", () => {
    expect(reach("intelligence")).toContain("computer");   // tech is Intelligence-rooted
    expect(reach("quickness")).not.toContain("computer");  // Quickness cluster is separate
    expect(reach("intelligence")).toContain("sorcery");    // via the one-way bridge
    expect(reach("willpower")).toContain("leadership");     // Willpower → Charisma bridge
    expect(reach("charisma")).not.toContain("sorcery");    // Charisma can't ride back
  });
});

describe("Attribute Edge targets (Shadowrun Companion p.24)", () => {
  // "The bonus Attribute Point can be added to any Attribute except Essence,
  // Reaction or Magic." The excluded three are exactly the Special Attributes,
  // so the offer is SR2E.attributes plus a blank. QualityData relists these
  // choices (a data model can't read CONFIG when its schema is built) — the
  // sr2e.attribute-edges Quench batch locks that copy against this one.
  it("offers every Physical/Mental attribute, plus a blank", () => {
    const keys = Object.keys(SR2E.qualityAttributes);
    expect(keys).toContain("");
    for (const attr of Object.keys(SR2E.attributes)) expect(keys).toContain(attr);
    expect(keys.length).toBe(Object.keys(SR2E.attributes).length + 1);
  });

  it("offers none of the Special Attributes the book excludes", () => {
    for (const special of Object.keys(SR2E.specialAttributes)) {
      expect(SR2E.qualityAttributes).not.toHaveProperty(special);
    }
    // Named explicitly too, so a future rename of specialAttributes can't quietly
    // empty the loop above.
    for (const banned of ["essence", "reaction", "magic"]) {
      expect(SR2E.qualityAttributes).not.toHaveProperty(banned);
    }
  });
});
