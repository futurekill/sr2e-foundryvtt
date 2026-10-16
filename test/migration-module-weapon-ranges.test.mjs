// 0.104.2: content-module weapons whose range brackets matched no row of the core
// Weapon Range Table (p.88), plus the core list again for copies imported after
// 0.103.2. By name and exact old value; a hand-edited range is left alone.
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { MIGRATIONS } from "../module/migrations.mjs";
import { MODULE_RANGE_FIXES, ALL_RANGE_FIXES } from "../module/rules/weapon-ranges.mjs";

const migrate = MIGRATIONS.find(m => m.version === "0.104.2").migrateItem;
const weapon = (name, r) => ({ type: "weapon", name, system: { weaponType: "heavy",
  ranges: { short: r[0], medium: r[1], long: r[2], extreme: r[3] } } });
const out = (r) => ({ "system.ranges.short": r[0], "system.ranges.medium": r[1], "system.ranges.long": r[2], "system.ranges.extreme": r[3] });

describe("0.104.2 — module weapon range brackets", () => {
  it("corrects a module copy, including a name that shipped wrong in two ways", () => {
    expect(migrate(weapon("Stoner-Ares M107", [50, 150, 350, 550]))).toEqual(out([40, 150, 400, 800]));
    expect(migrate(weapon("Panther Assault Cannon", [50, 150, 350, 550]))).toEqual(out([50, 150, 450, 1300]));   // SSC's copy
    expect(migrate(weapon("Panther Assault Cannon", [20, 100, 300, 600]))).toEqual(out([50, 150, 450, 1300]));   // core's copy
    expect(migrate(weapon("Surface-to-Air Missile (SAM)", [0, 0, 0, 0]))).toEqual(out([70, 150, 450, 5000]));
  });
  it("catches core copies imported after 0.103.2 ran", () => {
    expect(migrate(weapon("AK-97", [25, 100, 250, 500]))).toEqual(out([15, 40, 100, 250]));
  });
  it("leaves hand-edited and already-correct ranges alone", () => {
    expect(migrate(weapon("Stoner-Ares M107", [60, 160, 420, 900]))).toBe(null);
    expect(migrate(weapon("Stoner-Ares M107", [40, 150, 400, 800]))).toBe(null);
    expect(migrate(weapon("Some Homebrew Gun", [50, 150, 350, 550]))).toBe(null);
    expect(migrate({ type: "gear", name: "Ruger 100", system: {} })).toBe(null);
  });
  it("no correction undoes another", () => {
    for (const f of ALL_RANGE_FIXES) expect(ALL_RANGE_FIXES.some(g => g.name === f.name && g.was.join() === f.to.join())).toBe(false);
  });

  // Where the sibling module repos are checked out (not in CI), each fix's target must be
  // what the module ships now, and its old value what the module's last release shipped.
  const MODULES = ["sr2e-street-samurai-catalog", "sr2e-corporate-security", "sr2e-neo-anarchists", "sr2e-rigger-2"]
    .map(m => `../${m}`).filter(existsSync);
  it.skipIf(!MODULES.length)("matches what the modules ship now and shipped before", () => {
    const current = new Map(), released = new Map();
    for (const repo of MODULES) {
      const tag = execFileSync("git", ["-C", repo, "describe", "--tags", "--abbrev=0"], { encoding: "utf8" }).trim();
      for (const pack of readdirSync(`${repo}/packs-src`)) for (const f of readdirSync(`${repo}/packs-src/${pack}`)) {
        if (!f.endsWith(".json")) continue;
        const d = JSON.parse(readFileSync(`${repo}/packs-src/${pack}/${f}`, "utf8"));
        const key = (x) => [x.short, x.medium, x.long, x.extreme].join();
        if (d.type === "weapon" && d.system?.ranges) current.set(d.name, key(d.system.ranges));
        let old; try { old = JSON.parse(execFileSync("git", ["-C", repo, "show", `${tag}:packs-src/${pack}/${f}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); } catch { continue; }
        if (old.type === "weapon" && old.system?.ranges) released.set(old.name, key(old.system.ranges));
      }
    }
    for (const f of MODULE_RANGE_FIXES) {
      expect(current.get(f.name), f.name).toBe(f.to.join());
      expect(released.get(f.name), f.name).toBe(f.was.join());
    }
  });
});
