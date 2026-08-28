import { describe, it, expect } from "vitest";
import { MIGRATIONS } from "../module/migrations.mjs";

/**
 * 0.91.0 — the Karma Pool becomes derived (SR2E p.191).
 *
 * The migration runner visits EVERY actor and unlinked token, but these fields
 * live only on CharacterData. A migration that forgot to gate on type would try
 * to write system.karma.* onto vehicles, spirits, hosts and IC.
 */
const migrate = MIGRATIONS.find(m => m.version === "0.91.0").migrateActor;

describe("karma pool migration", () => {
  it("adds the three counters and deletes the stale stored pool", () => {
    const u = migrate({ type: "character", system: { karma: { current: 4, total: 37, pool: 9 } } });
    expect(u).toEqual({
      "system.karma.burned": 0,
      "system.karma.spent": 0,
      "system.karma.drawn": 0,
      "system.karma.-=pool": null
    });
  });

  it("leaves current and total alone — the pool derives from total", () => {
    const u = migrate({ type: "character", system: { karma: { current: 4, total: 37, pool: 9 } } });
    expect(u).not.toHaveProperty("system.karma.total");
    expect(u).not.toHaveProperty("system.karma.current");
  });

  it("does nothing for an already-migrated character", () => {
    const done = { type: "character",
      system: { karma: { current: 0, total: 50, burned: 1, spent: 2, drawn: 0 } } };
    expect(migrate(done)).toBeNull();
  });

  it("still deletes a stale pool on an otherwise-migrated character", () => {
    const u = migrate({ type: "character",
      system: { karma: { total: 50, burned: 0, spent: 0, drawn: 0, pool: 5 } } });
    expect(u).toEqual({ "system.karma.-=pool": null });
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
      "system.karma.drawn": 0
    });
  });
});
