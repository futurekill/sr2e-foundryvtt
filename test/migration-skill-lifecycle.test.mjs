import { describe, it, expect } from "vitest";
import "./foundry-shim.mjs";
import { MIGRATIONS, migrateDocumentData } from "../module/migrations.mjs";
import { skillTiersFromAllocation } from "../module/rules/sr2e-rules.mjs";

/**
 * 0.92.0 — skills gain a lifecycle (SR2E p.70, p.191).
 *
 * The classification is the whole point: an NPC's skill and a mid-chargen
 * character's skill cannot share a schema default, and a plain skill still needs
 * a flag even though its ratings do not change.
 */
const m = MIGRATIONS.find(x => x.version === "0.92.0");
const migrate = m.migrateItem;

const finished = { type: "character", system: { chargen: { inProgress: false } } };
const inChargen = { type: "character", system: { chargen: { inProgress: true } } };
const npc = { type: "npc", system: {} };

const skill = (system) => ({ type: "skill", system });

describe("classification by owner", () => {
  it("finalizes a finished character's skills", () => {
    const u = migrate(skill({ rating: 5 }), finished);
    expect(u["system.ratingsFinalized"]).toBe(true);
    expect(u["system.allocated"]).toBe(null);
  });

  it("finalizes an NPC's skills", () => {
    expect(migrate(skill({ rating: 4 }), npc)["system.ratingsFinalized"]).toBe(true);
  });

  it("finalizes a world or compendium item, which has no owner", () => {
    // parent === null must mean authored data, never "guess from the actor".
    expect(migrate(skill({ rating: 4 }), null)["system.ratingsFinalized"]).toBe(true);
  });

  it("leaves a mid-chargen character's skills PENDING", () => {
    const u = migrate(skill({ rating: 5 }), inChargen);
    expect(u["system.ratingsFinalized"]).toBe(false);
  });

  it("flags a PLAIN skill too, so it never falls to a schema default", () => {
    const u = migrate(skill({ rating: 3 }), finished);
    expect(u).toHaveProperty("system.ratingsFinalized");
  });

  it("STILL migrates a skill carrying only the schema's defaults", () => {
    // The bug that shipped in 0.92.0: documents reach a migration as
    // doc.toObject(), which fills in schema defaults, so every legacy skill
    // arrived with ratingsFinalized `true` and allocated `null`. A guard that
    // read those as "already migrated" skipped every skill in the world, and
    // named concentrations silently lost the +2 they had been displaying.
    const u = migrate(skill({
      rating: 2, allocated: null, ratingsFinalized: true,
      concentration: { name: "Street", rating: 2 }
    }), finished);
    expect(u).not.toBeNull();
    expect(u["system.concentration.rating"]).toBe(4);
  });

  it("ignores non-skill items", () => {
    expect(migrate({ type: "weapon", system: { rating: 3 } }, finished)).toBeNull();
  });
});

describe("a finalized skill keeps exactly the ratings it had", () => {
  const cases = [
    { name: "plain", sys: { rating: 5 }, conc: undefined, spec: undefined },
    { name: "concentration", sys: { rating: 4, concentration: { name: "SMG" } }, conc: 6 },
    { name: "specialization",
      sys: { rating: 3, concentration: { name: "SMG" }, specialization: { name: "Uzi III" } },
      conc: 5, spec: 7 }
  ];
  for (const c of cases) {
    it(c.name, () => {
      const u = migrate(skill(c.sys), finished);
      expect(u["system.concentration.rating"]).toBe(c.conc);
      expect(u["system.specialization.rating"]).toBe(c.spec);
      // and the general is never touched — nobody's number moves
      expect(u).not.toHaveProperty("system.rating");
    });
  }

  it("matches what the OLD always-derive model was showing", () => {
    // The legacy model displayed general+2 / general+4. Freezing must reproduce
    // exactly that, or a character's dice change under them at migration.
    const u = migrate(skill({
      rating: 3, concentration: { name: "SMG" }, specialization: { name: "Uzi III" }
    }), finished);
    expect(u["system.concentration.rating"]).toBe(3 + 2);
    expect(u["system.specialization.rating"]).toBe(3 + 4);
  });
});

describe("a mid-chargen skill recovers the allocation instead", () => {
  it("inverts the reduction the player applied by hand", () => {
    expect(migrate(skill({ rating: 5 }), inChargen)["system.allocated"]).toBe(5);
    expect(migrate(skill({ rating: 4, concentration: { name: "SMG" } }), inChargen)
      ["system.allocated"]).toBe(5);
    expect(migrate(skill({
      rating: 3, concentration: { name: "SMG" }, specialization: { name: "Uzi III" }
    }), inChargen)["system.allocated"]).toBe(5);
  });

  it("does NOT stamp sub-ratings — finalization does that", () => {
    const u = migrate(skill({ rating: 3, concentration: { name: "SMG" } }), inChargen);
    expect(u).not.toHaveProperty("system.concentration.rating");
  });

  it("round-trips: the recovered allocation reproduces the ratings on the sheet", () => {
    const sys = { rating: 3, concentration: { name: "SMG" }, specialization: { name: "Uzi III" } };
    const a = migrate(skill(sys), inChargen)["system.allocated"];
    const t = skillTiersFromAllocation(a, true, true);
    expect(t.general).toBe(3);
    expect(t.concentration).toBe(5);
    expect(t.specialization).toBe(7);
  });
});

describe("the GM report", () => {
  it("migrateActor records a character left mid-chargen", () => {
    // Returns null (item work happens per-item) but must not throw and must
    // accept an actor with no skills.
    expect(m.migrateActor({ type: "character", name: "Bolt",
      system: { chargen: { inProgress: true } }, items: [{ type: "skill", system: {} }] }))
      .toBeNull();
    expect(m.migrateActor({ type: "character", name: "None", system: {}, items: [] }))
      .toBeNull();
  });
});

describe("the runner actually hands the owner down", () => {
  // Regression: migrateItem's classification is only as good as the parent it
  // is given. Testing migrateItem directly proves nothing about the plumbing.
  const doc = (o) => ({ toObject: () => structuredClone(o) });

  it("an embedded skill is classified by ITS OWN actor, not a default", () => {
    const actorSource = { type: "character", system: { chargen: { inProgress: true } } };
    const u = migrateDocumentData([m], doc(skill({ rating: 4 })), "Item", actorSource);
    expect(u["system.ratingsFinalized"]).toBe(false);
    expect(u["system.allocated"]).toBe(4);
  });

  it("the same skill on a FINISHED actor finalizes instead", () => {
    const u = migrateDocumentData(
      [m], doc(skill({ rating: 4 })), "Item", { type: "character", system: { chargen: { inProgress: false } } });
    expect(u["system.ratingsFinalized"]).toBe(true);
  });

  it("a world item gets null, and is treated as authored", () => {
    expect(migrateDocumentData([m], doc(skill({ rating: 4 })), "Item")["system.ratingsFinalized"])
      .toBe(true);
  });
});
