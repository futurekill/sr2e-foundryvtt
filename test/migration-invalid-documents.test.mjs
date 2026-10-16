// Documents that fail to load are out of game.actors/items, so migrations never reach
// them. They're reported by name every load; nothing repairs them automatically.
import { describe, it, expect, afterEach } from "vitest";
import "./foundry-shim.mjs";
import { invalidDocumentsReport, collectInvalidDocuments, migrateAndReport } from "../module/migrations.mjs";

const savedGame = globalThis.game;
afterEach(() => { globalThis.game = savedGame; });

describe("invalidDocumentsReport", () => {
  it("is silent when nothing failed", () => {
    expect(invalidDocumentsReport([])).toBe(null);
  });
  it("names one actor, singular, without guessing the cause", () => {
    const r = invalidDocumentsReport([{ kind: "Actor", id: "a1", name: "Tiger (Physical Adept)",
      error: "system.magic.type: adept is not a valid choice" }]);
    expect(r.notice).toMatch(/1 document failed to load and is hidden from the world: Tiger \(Physical Adept\)\./);
    expect(r.notice).toMatch(/Support → Document Issues/);
    expect(r.notice).toMatch(/makes a new copy; the original stays/);
    expect(r.notice).not.toMatch(/older version/i);
    expect(r.lines).toEqual(['Actor a1 "Tiger (Physical Adept)": system.magic.type: adept is not a valid choice']);
  });
  it("names an embedded item's parent and falls back to the console when no error was recorded", () => {
    const r = invalidDocumentsReport([{ kind: "Item", id: "i1", name: "Old Katana", parent: "Razor" }]);
    expect(r.notice).toMatch(/Old Katana \(on Razor\)/);
    expect(r.notice).not.toMatch(/Support/);
    expect(r.lines[0]).toBe('Item i1 on "Razor" "Old Katana": no validation error recorded — see the startup console');
  });
  it("truncates the notice but keeps every document in the console", () => {
    const recs = Array.from({ length: 7 }, (_, i) => ({ kind: "Item", id: `i${i}`, name: `Thing ${i}` }));
    const r = invalidDocumentsReport(recs);
    expect(r.notice).toMatch(/7 documents failed to load and are hidden/);
    expect(r.notice).toMatch(/Thing 4 and 2 more\./);
    expect(r.lines).toHaveLength(7);
  });
});

describe("collectInvalidDocuments", () => {
  const actor = (name, items = {}) => ({ name,
    items: { invalidDocumentIds: new Set(Object.keys(items)) },
    _source: { items: Object.entries(items).map(([_id, n]) => ({ _id, name: n })) } });

  it("reads world failures, falls back to game.data, and finds embedded ones", () => {
    const actors = [actor("Razor", { k1: "Old Katana" }), actor("Glitch")];
    actors.invalidDocumentIds = new Set(["a1"]);
    globalThis.game = {
      actors, items: { invalidDocumentIds: new Set(["w1"]) },
      data: { actors: [{ _id: "a1", name: "Tiger" }], items: [{ _id: "w1", name: "Broken Gizmo" }] },
      issues: { validationFailures: { Actor: { a1: { name: "Tiger", error: new Error("system.magic.type:\n  adept is not a valid choice") } } } }
    };
    expect(collectInvalidDocuments()).toEqual([
      { kind: "Actor", id: "a1", name: "Tiger", error: "system.magic.type: adept is not a valid choice" },
      { kind: "Item", id: "w1", name: "Broken Gizmo", error: undefined },
      { kind: "Item", id: "k1", parent: "Razor", name: "Old Katana" }
    ]);
  });

  it("one actor that can't be inspected doesn't hide the rest", () => {
    const bad = { name: "Cursed", get items() { throw new Error("boom"); } };
    const actors = [bad, actor("Razor", { k1: "Old Katana" })];
    actors.invalidDocumentIds = new Set();
    globalThis.game = { actors, items: { invalidDocumentIds: new Set() }, data: {}, issues: {} };
    const err = console.error; console.error = () => {};
    try { expect(collectInvalidDocuments().map(r => r.name)).toEqual(["Old Katana"]); }
    finally { console.error = err; }
  });
});

describe("migrateAndReport", () => {
  it("still reports when the migration throws", async () => {
    let reported = false;
    const err = console.error; console.error = () => {};
    try { await migrateAndReport(async () => { throw new Error("migration broke"); }, () => { reported = true; }); }
    finally { console.error = err; }
    expect(reported).toBe(true);
  });
});
