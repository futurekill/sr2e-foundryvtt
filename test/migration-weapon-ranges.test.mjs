// 0.103.2: 15 core weapons shipped with range brackets from no row of the Weapon
// Range Table (core p.88). Copies on characters are corrected by value, by our exact
// names, and only while they still hold the brackets they shipped with.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { MIGRATIONS } from "../module/migrations.mjs";
import { RANGE_TABLE, RANGE_FIXES } from "../module/rules/weapon-ranges.mjs";

const migrate = MIGRATIONS.find(m => m.version === "0.103.2").migrateItem;
const weapon = (name, [short, medium, long, extreme]) => ({ type: "weapon", name,
  system: { weaponType: "firearm", ranges: { short, medium, long, extreme }, damageCode: "8M" } });

describe("0.103.2 — weapon range brackets follow the p.88 table", () => {
  it("corrects a shipped copy to its class's brackets", () => {
    expect(migrate(weapon("AK-97", [25, 100, 250, 500]))).toEqual({
      "system.ranges.short": 15, "system.ranges.medium": 40, "system.ranges.long": 100, "system.ranges.extreme": 250 });
    expect(migrate(weapon("Defiance T-250", [10, 20, 40, 60]))).toEqual({
      "system.ranges.short": 10, "system.ranges.medium": 20, "system.ranges.long": 50, "system.ranges.extreme": 100 });
  });
  it("leaves a hand-edited range alone, and re-running is harmless", () => {
    expect(migrate(weapon("AK-97", [20, 80, 200, 400]))).toBe(null);
    expect(migrate(weapon("AK-97", [15, 40, 100, 250]))).toBe(null);
  });
  it("never touches other names or item types", () => {
    expect(migrate(weapon("AK-97 (custom)", [25, 100, 250, 500]))).toBe(null);
    expect(migrate({ type: "gear", name: "AK-97", system: {} })).toBe(null);
  });
  it("every core firearm and heavy weapon now matches a row of the table", () => {
    const rows = new Set(Object.values(RANGE_TABLE).map(r => r.join()));
    const dir = "packs-src/weapons";
    // Three entries the book doesn't print (FN FAL, Remington 990, Ares Antioch-2) were
    // removed in 0.104.1; none may come back.
    const notInBook = new Set(["FN FAL", "Remington 990", "Ares Antioch-2"]);
    const off = [];
    for (const f of readdirSync(dir).filter(f => f.endsWith(".json"))) {
      const d = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
      if (!d.system || !["firearm", "heavy"].includes(d.system.weaponType) || notInBook.has(d.name)) continue;
      const r = d.system.ranges ?? {};
      if (!rows.has([r.short, r.medium, r.long, r.extreme].join())) off.push(d.name);
    }
    expect(off).toEqual([]);
    const names = readdirSync(dir).map(f => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).name);
    expect(names.filter(n => notInBook.has(n))).toEqual([]);
    for (const name of Object.keys(RANGE_FIXES)) expect(notInBook.has(name)).toBe(false);
  });
  it("copies carried by compendium actors use the corrected brackets too", () => {
    // The world migration never touches compendium actors, and an actor imported
    // after it ran is never migrated, so the shipped copies must be right at source.
    const stale = [];
    for (const pack of readdirSync("packs-src")) {
      for (const f of readdirSync(`packs-src/${pack}`).filter(f => f.endsWith(".json"))) {
        const d = JSON.parse(readFileSync(`packs-src/${pack}/${f}`, "utf8"));
        for (const it of d.items ?? []) {
          const fix = it.type === "weapon" && RANGE_FIXES[it.name];
          if (!fix) continue;
          const r = it.system?.ranges ?? {};
          if ([r.short, r.medium, r.long, r.extreme].join() !== RANGE_TABLE[fix.cls].join()) stale.push(`${d.name}: ${it.name}`);
        }
      }
    }
    expect(stale).toEqual([]);
  });
  it("copies of core weapons carried by compendium actors match the core entry", () => {
    // The sample runners were hand-built and had drifted (a katana at (Str+3)S, an HK227
    // without full auto). A carried copy of a core weapon must fight like it.
    const core = new Map();
    for (const f of readdirSync("packs-src/weapons").filter(f => f.endsWith(".json"))) {
      const d = JSON.parse(readFileSync(`packs-src/weapons/${f}`, "utf8"));
      if (d.system) core.set(d.name, d.system);
    }
    const modes = (s) => ["ss", "sa", "bf", "fa"].filter(m => s.firingModes?.[m]).join("/");
    const off = [];
    for (const pack of readdirSync("packs-src")) {
      if (pack === "weapons") continue;
      for (const f of readdirSync(`packs-src/${pack}`).filter(f => f.endsWith(".json"))) {
        const d = JSON.parse(readFileSync(`packs-src/${pack}/${f}`, "utf8"));
        for (const it of d.items ?? []) {
          const c = it.type === "weapon" && core.get(it.name);
          if (!c) continue;
          const s = it.system ?? {};
          if (s.damageCode !== c.damageCode || s.concealability !== c.concealability || modes(s) !== modes(c)
              || (c.ammo?.max ?? 0) !== (s.ammo?.max ?? 0)) off.push(`${d.name}: ${it.name}`);
        }
      }
    }
    expect(off).toEqual([]);
  });
});
