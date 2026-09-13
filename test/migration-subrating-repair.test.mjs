import { describe, it, expect } from "vitest";
import "./foundry-shim.mjs";
import { MIGRATIONS, migrateDocumentData } from "../module/migrations.mjs";
import { staleSubRatingRepair } from "../module/rules/sr2e-rules.mjs";

/**
 * 0.92.1 — repair for the `x === undefined` guards that stopped 0.91.0 and
 * 0.92.0 doing anything at all. Documents reach a migration as toObject(),
 * which fills in schema defaults, so those guards could never be false.
 */
const m = MIGRATIONS.find(x => x.version === "0.92.1");
const migrate = m.migrateItem;
const skill = (system) => ({ type: "skill", system });
const finished = { type: "character", system: { chargen: { inProgress: false } } };
const inChargen = { type: "character", system: { chargen: { inProgress: true } } };

describe("staleSubRatingRepair — what the GM is offered", () => {
  it("proposes general+2 for a concentration left at the general", () => {
    // The real case from a live world: Etiquette 2 with a "Street" concentration
    // stored at 2, which the old model had been DISPLAYING as 4.
    expect(staleSubRatingRepair({ rating: 2, concentration: { name: "Street", rating: 2 } }))
      .toEqual({ concentration: 4 });
  });

  it("proposes general+4 for a specialization, and nothing for an UNNAMED concentration", () => {
    // p.70 grants a concentration alongside a specialization, but with no name
    // there is no tier to show or roll, so nothing is proposed for it.
    expect(staleSubRatingRepair({ rating: 2, specialization: { name: "Corporate", rating: 2 } }))
      .toEqual({ specialization: 6 });
  });

  it("proposes both tiers when both are named", () => {
    expect(staleSubRatingRepair({
      rating: 3, concentration: { name: "SMG", rating: 0 },
      specialization: { name: "Uzi III", rating: 0 }
    })).toEqual({ concentration: 5, specialization: 7 });
  });

  it("proposes nothing for a sub-rating that is above its general", () => {
    // p.191: "If the character has Firearms 4 and wants to concentrate with
    // Pistols at 5" — a purchase sits at general+1, BELOW the chargen freeze of
    // general+2. An earlier draft compared against the freeze and would have
    // silently promoted this 5 to a 6.
    expect(staleSubRatingRepair({ rating: 4, concentration: { name: "Pistols", rating: 5 } }))
      .toBeNull();
    expect(staleSubRatingRepair({ rating: 4, specialization: { name: "Roomsweeper", rating: 5 } }))
      .toBeNull();
    expect(staleSubRatingRepair({ rating: 3, concentration: { name: "SMG", rating: 5 } }))
      .toBeNull();
  });

  it("CANNOT tell a legitimate advanced general from damage — which is why a GM decides", () => {
    // Buy Pistols 5 on Firearms 4 (p.191), then raise Firearms to 5, then 6.
    // The concentration is untouched and legitimate, but now sits at or below
    // its general and is indistinguishable from a rating that was never frozen.
    // The repair must therefore only ever PROPOSE; it is not run by the migration.
    expect(staleSubRatingRepair({ rating: 5, concentration: { name: "Pistols", rating: 5 } }))
      .toEqual({ concentration: 7 });
    expect(staleSubRatingRepair({ rating: 6, concentration: { name: "Pistols", rating: 5 } }))
      .toEqual({ concentration: 8 });
  });

  it("proposes only the tier that is actually stale", () => {
    expect(staleSubRatingRepair({
      rating: 3, concentration: { name: "SMG", rating: 5 },
      specialization: { name: "Uzi III", rating: 0 }
    })).toEqual({ specialization: 7 });
  });

  it("ignores a plain skill, an unnamed tier and anything still pending", () => {
    expect(staleSubRatingRepair({ rating: 5 })).toBeNull();
    expect(staleSubRatingRepair({ rating: 5, concentration: { name: "", rating: 0 } })).toBeNull();
    expect(staleSubRatingRepair({
      rating: 2, ratingsFinalized: false, concentration: { name: "Street", rating: 2 }
    })).toBeNull();
  });
});

describe("the migration itself never writes a sub-rating", () => {
  it("stamps the lifecycle but leaves the stale rating for the GM", () => {
    const u = migrate(skill({ rating: 2, concentration: { name: "Street", rating: 2 } }), finished);
    expect(u).not.toHaveProperty("system.concentration.rating");
    expect(u).not.toHaveProperty("system.specialization.rating");
    expect(u["system.ratingsFinalized"]).toBe(true);
  });

  it("ignores a non-skill", () => {
    expect(migrate({ type: "weapon", system: { rating: 3 } }, finished)).toBeNull();
  });
});

describe("stamps the lifecycle 0.92.0 failed to write", () => {
  it("a finished character's skill is marked finalized", () => {
    const u = migrate(skill({ rating: 5 }), finished);
    expect(u["system.ratingsFinalized"]).toBe(true);
    expect(u["system.allocated"]).toBe(null);
  });

  it("a mid-chargen character's skill is made PENDING with its allocation", () => {
    // Without this, a world already stamped 0.92.0 leaves every mid-chargen
    // skill on the schema default of finalized, never deriving again.
    const u = migrate(skill({ rating: 4, concentration: { name: "SMG" } }), inChargen);
    expect(u["system.ratingsFinalized"]).toBe(false);
    expect(u["system.allocated"]).toBe(5);
    expect(u).not.toHaveProperty("system.concentration.rating");
  });

  it("does not overwrite an allocation that is already set", () => {
    const u = migrate(skill({ rating: 3, allocated: 5, ratingsFinalized: true }), finished);
    expect(u).not.toHaveProperty("system.allocated");
  });
});

describe("karma, which 0.91.0 also never migrated, is REPORTED not rewritten", () => {
  const report = m.migrateActor;

  it("never returns an update, whatever it finds", () => {
    // A stored 0 means "never filled in". Writing it back would hand every
    // sample runner the 0/0 Karma Pool that was reported as a bug, and the
    // derived value is the rules-correct one these tables have been using.
    expect(report({ type: "character", name: "Mel",
      system: { race: "troll", karma: { total: 30, pool: 3, burned: 0 } } })).toBeNull();
    expect(report({ type: "character", name: "Whisper",
      system: { race: "human", karma: { total: 0, pool: 0, burned: 0 } } })).toBeNull();
  });

  it("ignores a world with no legacy field and non-characters", () => {
    expect(report({ type: "character", name: "Done",
      system: { karma: { total: 30, poolAdjust: -1 } } })).toBeNull();
    expect(report({ type: "vehicle", system: {} })).toBeNull();
  });
});

describe("0.92.0 and 0.92.1 running together", () => {
  const both = MIGRATIONS.filter(x => ["0.92.0", "0.92.1"].includes(x.version));
  const doc = (o) => ({ toObject: () => structuredClone(o) });

  it("a world upgrading straight from 0.91.0 is frozen by 0.92.0 and not disturbed", () => {
    // 0.92.0 freezes unconditionally, which is safe on a world that has never
    // run it: no p.191 purchase can have happened under the new system yet.
    const u = migrateDocumentData(
      both, doc(skill({ rating: 2, concentration: { name: "Street", rating: 2 } })),
      "Item", finished);
    expect(u["system.concentration.rating"]).toBe(4);
    expect(u["system.ratingsFinalized"]).toBe(true);
  });

  it("and they agree that a mid-chargen skill stays pending with no frozen tiers", () => {
    const u = migrateDocumentData(
      both, doc(skill({ rating: 2, concentration: { name: "Street", rating: 2 } })),
      "Item", inChargen);
    expect(u["system.ratingsFinalized"]).toBe(false);
    expect(u["system.allocated"]).toBe(3);
    expect(u).not.toHaveProperty("system.concentration.rating");
  });
});

describe("migrateActor never writes, whatever it finds", () => {
  // It exists only to feed the GM report: the characters 0.92.1 puts back into
  // pending derivation, and the karma pools 0.91.0 never preserved. A world
  // already stamped 0.92.0 never runs that entry's own report again, so this one
  // has to surface them. The accumulator is module-private, so what is pinned
  // here is the contract that matters — no update object, ever, and no throwing
  // on the shapes it will actually meet.
  const cases = [
    ["mid-chargen with skills", { type: "character", name: "Whisper",
      system: { chargen: { inProgress: true } }, items: [{ type: "skill", system: {} }] }],
    ["finished with skills", { type: "character", name: "Done",
      system: { chargen: { inProgress: false } }, items: [{ type: "skill", system: {} }] }],
    ["mid-chargen with no skills", { type: "character", name: "Empty",
      system: { chargen: { inProgress: true } }, items: [] }],
    ["a legacy karma pool still in source", { type: "character", name: "Mel",
      system: { race: "troll", karma: { total: 30, pool: 3, burned: 0 } } }],
    ["no items array at all", { type: "character", name: "Bare", system: {} }],
    ["a non-character", { type: "vehicle", name: "Bike", system: {} }]
  ];
  for (const [label, source] of cases) {
    it(`returns null for ${label}`, () => {
      expect(m.migrateActor(source)).toBeNull();
    });
  }
});
