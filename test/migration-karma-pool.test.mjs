import { describe, it, expect } from "vitest";
import { MIGRATIONS } from "../module/migrations.mjs";
import { karmaPoolCapacity, karmaPoolAvailable } from "../module/rules/sr2e-rules.mjs";

/**
 * 0.91.0 — the Karma Pool becomes derived (SR2E p.191).
 *
 * The migration runner visits EVERY actor and unlinked token, but these fields
 * live only on CharacterData. A migration that forgot to gate on type would try
 * to write system.karma.* onto vehicles, spirits, hosts and IC.
 */
const migrate = MIGRATIONS.find(m => m.version === "0.91.0").migrateActor;

describe("karma pool migration", () => {
  it("PRESERVES the pool a character already had", () => {
    // total 37 derives to ceil(3.7) = 4, but this character's sheet said 9.
    // The offset makes the derived capacity reproduce 9 exactly.
    const u = migrate({ type: "character", system: { karma: { current: 4, total: 37, pool: 9 } } });
    expect(u).toEqual({
      "system.karma.burned": 0,
      "system.karma.spent": 0,
      "system.karma.drawn": 0,
      "system.karma.poolAdjust": 4,      // 9 - 1 grant - 4 earned
      "system.karma.-=pool": null
    });
  });

  it("preserves a hand-kept pool on a character with NO recorded Karma", () => {
    // The case that made a signed offset necessary: derive alone and this
    // character silently loses the pool the table has been using.
    const u = migrate({ type: "character", system: { karma: { total: 0, pool: 3 } } });
    expect(u["system.karma.poolAdjust"]).toBe(2);   // 3 - 1 grant
  });

  it("uses a NEGATIVE offset when the sheet held less than the rule would give", () => {
    const u = migrate({ type: "character", system: { karma: { total: 50, pool: 2 } } });
    expect(u["system.karma.poolAdjust"]).toBe(-4);   // 2 - 1 grant - 5 earned
  });

  it("needs no offset when the sheet already matched the rule", () => {
    // 1 grant + 5 earned = 6, so a sheet reading 6 needs nothing.
    const u = migrate({ type: "character", system: { karma: { total: 50, pool: 6 } } });
    expect(u["system.karma.poolAdjust"]).toBe(0);
  });

  it("uses the same grant the derivation will, so the setting cannot desync it", () => {
    // With the More Metahumans rule OFF (the default, and what the shim
    // resolves to here) an ork's grant is 2, so a legacy pool of 2 needs no
    // offset. If the migration hardcoded the grant while the derivation read
    // the setting, a world running that rule would preserve every metahuman's
    // pool a point short.
    const u = migrate({ type: "character",
      system: { race: "ork", karma: { total: 0, pool: 2 } } });
    expect(u["system.karma.poolAdjust"]).toBe(0);   // 2 - 2 grant - 0 earned
  });

  it("preserves a metahuman's pool with the More Metahumans rule ON", () => {
    // The case that would desync if the migration hardcoded the grant: with the
    // rule on, the derivation gives an ork 1, so the migration must subtract 1,
    // not 2, or the preserved pool comes out a point short.
    const real = globalThis.game?.settings?.get;
    globalThis.game = globalThis.game ?? {};
    globalThis.game.settings = globalThis.game.settings ?? {};
    globalThis.game.settings.get = (ns, key) =>
      (ns === "sr2e" && key === "moreMetahumans") ? true : real?.call(globalThis.game.settings, ns, key);
    try {
      const before = { total: 0, pool: 2, burned: 0, spent: 0, drawn: 0 };
      const u = migrate({ type: "character", system: { race: "ork", karma: before } });
      expect(u["system.karma.poolAdjust"]).toBe(1);   // 2 - 1 grant - 0 earned
      const cap = karmaPoolCapacity(0, 0, u["system.karma.poolAdjust"], "ork", true);
      expect(karmaPoolAvailable(cap, 0, 0)).toBe(2);  // and it round-trips
    } finally {
      // Restore, or remove the stub entirely if there was nothing to restore —
      // otherwise this test leaks a fake settings.get into later files.
      if (real) globalThis.game.settings.get = real;
      else delete globalThis.game.settings.get;
    }
  });

  it("gives a metahuman the larger starting grant (p.47)", () => {
    // A troll's pool of 7 is 2 grant + 5 earned; no offset needed.
    const u = migrate({ type: "character",
      system: { race: "troll", karma: { total: 50, pool: 7 } } });
    expect(u["system.karma.poolAdjust"]).toBe(0);
  });

  it("leaves current and total alone — the pool derives from total", () => {
    const u = migrate({ type: "character", system: { karma: { current: 4, total: 37, pool: 9 } } });
    expect(u).not.toHaveProperty("system.karma.total");
    expect(u).not.toHaveProperty("system.karma.current");
  });

  it("does nothing for an already-migrated character", () => {
    const done = { type: "character",
      system: { karma: { current: 0, total: 50, burned: 1, spent: 2, drawn: 0, poolAdjust: 0 } } };
    expect(migrate(done)).toBeNull();
  });

  it("still deletes a stale pool on an otherwise-migrated character", () => {
    const u = migrate({ type: "character",
      system: { karma: { total: 50, burned: 0, spent: 0, drawn: 0, pool: 6 } } });
    expect(u).toEqual({ "system.karma.poolAdjust": 0, "system.karma.-=pool": null });
  });

  it("does not overwrite an offset a GM has already set", () => {
    const u = migrate({ type: "character",
      system: { karma: { total: 50, burned: 0, spent: 0, drawn: 0, poolAdjust: 2, pool: 9 } } });
    expect(u).toEqual({ "system.karma.-=pool": null });
  });

  it("accounts for counters that already exist, not just clean legacy data", () => {
    // A world part-way through an earlier draft can carry a non-zero `burned`.
    // Ignoring it would silently cost the character a point.
    const u = migrate({ type: "character",
      system: { karma: { total: 50, pool: 5, burned: 1, spent: 0, drawn: 0 } } });
    expect(u["system.karma.poolAdjust"]).toBe(0);   // 5 - 1 grant - 5 earned + 1 burned
    // and that reproduces the old pool: 1 + 5 + 0 - 1 = 5
  });

  // Asserting the update object is not the same as asserting the outcome.
  // Apply the migration and check the derived pool really is unchanged.
  describe("the pool a character ends up with equals the pool they started with", () => {
    const cases = [
      { name: "no recorded Karma, hand-kept pool", total: 0,  pool: 3 },
      { name: "pool matching the rule",            total: 50, pool: 6 },
      { name: "pool above the rule",               total: 37, pool: 9 },
      { name: "pool below the rule",               total: 50, pool: 2 },
      { name: "rounding up at the boundary",       total: 51, pool: 7 },
      { name: "already-burned counter present",    total: 50, pool: 5, burned: 1 },
      { name: "metahuman, larger starting grant",  total: 50, pool: 7, race: "troll" },
      { name: "metahuman with no earned Karma",    total: 0,  pool: 2, race: "elf" }
    ];
    for (const c of cases) {
      it(c.name, () => {
        const before = { total: c.total, pool: c.pool, burned: c.burned ?? 0, spent: 0, drawn: 0 };
        const u = migrate({ type: "character",
          system: { race: c.race ?? "human", karma: before } });
        const after = {
          total: before.total,
          burned: u["system.karma.burned"] ?? before.burned,
          spent: u["system.karma.spent"] ?? before.spent,
          drawn: u["system.karma.drawn"] ?? before.drawn,
          poolAdjust: u["system.karma.poolAdjust"] ?? 0
        };
        const cap = karmaPoolCapacity(after.total, after.burned, after.poolAdjust, c.race ?? "human");
        expect(karmaPoolAvailable(cap, after.spent, after.drawn)).toBe(c.pool);
      });
    }
  });

  it("SKIPS every non-character actor type", () => {
    // The whole point of the gate. karma does not exist on these models.
    for (const type of ["npc", "vehicle", "spirit", "host", "ic"]) {
      expect(migrate({ type, system: { karma: { pool: 3 } } }), type).toBeNull();
    }
  });

  it("survives a character with no karma block at all", () => {
    expect(migrate({ type: "character", system: {} })).toEqual({
      "system.karma.burned": 0,
      "system.karma.spent": 0,
      "system.karma.drawn": 0,
      "system.karma.poolAdjust": 0
    });
  });
});
