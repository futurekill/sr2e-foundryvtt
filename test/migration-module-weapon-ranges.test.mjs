// 0.104.2: content-module weapons whose range brackets matched no row of the core
// Weapon Range Table (p.88), plus the core list again for copies imported after
// 0.103.2. By name and exact old value; a hand-edited range is left alone.
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MIGRATIONS } from "../module/migrations.mjs";
import { RANGE_FIXES, MODULE_RANGE_FIXES, ALL_RANGE_FIXES } from "../module/rules/weapon-ranges.mjs";

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
  // what the module ships now, and its old value what some earlier release shipped.
  const MODULES = ["sr2e-street-samurai-catalog", "sr2e-corporate-security", "sr2e-neo-anarchists", "sr2e-rigger-2"]
    .map(m => `../${m}`).filter(existsSync);
  it.skipIf(!MODULES.length)("matches what the modules ship now and shipped before", () => {
    const key = (x) => [x.short, x.medium, x.long, x.extreme].join();
    const files = new Map();   // weapon name → [repo, path]
    for (const repo of MODULES) for (const pack of readdirSync(`${repo}/packs-src`)) for (const f of readdirSync(`${repo}/packs-src/${pack}`)) {
      if (!f.endsWith(".json")) continue;
      const d = JSON.parse(readFileSync(`${repo}/packs-src/${pack}/${f}`, "utf8"));
      if (d.type === "weapon") files.set(d.name, [repo, `packs-src/${pack}/${f}`, d]);
    }
    // Renamed since (the fix list keeps the old name: copies in worlds carry it).
    const RENAMED = { "Sakal vz 88V": "Samopal vz 88V" };
    for (const f of MODULE_RANGE_FIXES) {
      const [repo, path, doc] = files.get(RENAMED[f.name] ?? f.name) ?? [];
      expect(doc, f.name).toBeTruthy();
      expect(key(doc.system.ranges), f.name).toBe(f.to.join());
      const tags = execFileSync("git", ["-C", repo, "tag", "--list", "v*"], { encoding: "utf8" }).split("\n").filter(Boolean);
      // A renamed weapon's older releases stored it under the old name's filename.
      const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, "_");
      const paths = RENAMED[f.name] ? [path, path.replace(slug(RENAMED[f.name]), slug(f.name))] : [path];
      const shipped = tags.some(tag => paths.some(p => {
        try { return key(JSON.parse(execFileSync("git", ["-C", repo, "show", `${tag}:${p}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).system.ranges) === f.was.join(); }
        catch { return false; }
      }));
      expect(shipped, `${f.name}: no release shipped ${f.was.join("/")}`).toBe(true);
    }
  });

  // Released data: a world stamped 0.104.2 never re-runs it, so a fix added to these lists
  // later silently never applies there (the Hatamoto II did). New fixes need a new migration.
  const tagged = (() => { try { return execFileSync("git", ["show", "v0.104.2:module/rules/weapon-ranges.mjs"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } })();
  it.skipIf(!tagged)("the released 0.104.2 lists are unchanged since the tag", async () => {
    const file = join(tmpdir(), `sr2e-weapon-ranges-v0.104.2-${process.pid}.mjs`);
    (await import("node:fs")).writeFileSync(file, tagged);
    const released = await import(pathToFileURL(file).href);
    expect(RANGE_FIXES).toEqual(released.RANGE_FIXES);
    expect(MODULE_RANGE_FIXES).toEqual(released.MODULE_RANGE_FIXES);
  });
});
