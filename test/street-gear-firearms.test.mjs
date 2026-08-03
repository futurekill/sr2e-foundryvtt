// Regression guard for compendium entries that disagreed with the printed
// Street Gear table (book p.254-255) and the weapon descriptions (p.238).
//
// These were invisible to `npm run audit-costs` for a long time because the
// audit matches on NAME: two of the three weapons shipped under names the book
// never uses ("HK HK227", "Light Machine Gun (Generic)"), so the audit reported
// them as "in the table but not shipped" rather than as price drift. Every
// value below was read off a 300-dpi page render, never the PDF text layer.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const readAll = (dir) => readdirSync(`packs-src/${dir}`)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(`packs-src/${dir}/${f}`, "utf8")));

const load = (dir) => readAll(dir).filter((d) => d.system);

const weapons = load("weapons");
const weaponFolders = readAll("weapons").filter((d) => !d.system);
const gear = load("gear");
const byName = (list, name) => list.find((d) => d.name === name);

describe("Firearms table names match the printed table (p.255)", () => {
  it.each(["Heckler & Koch HK227", "HK227-S", "Ingram Valiant"])(
    "ships %s under the book's own name", (name) => {
      expect(byName(weapons, name), `${name} is missing`).toBeTruthy();
    });

  it("no longer ships the invented names those entries used to carry", () => {
    for (const stale of ["HK HK227", "Light Machine Gun (Generic)"]) {
      expect(byName(weapons, stale), `${stale} should have been renamed`).toBeFalsy();
    }
  });
});

describe("Heckler & Koch HK227 (p.255, description p.238)", () => {
  const w = byName(weapons, "Heckler & Koch HK227").system;

  it("matches the printed row", () => {
    expect(w.damageCode).toBe("7M");
    expect(w.concealability).toBe(4);
    expect(w.ammo.max).toBe(28);
    expect(w.ammo.type).toBe("smg");
    expect(w.weight).toBe(4);
    expect(w.cost).toBe(1500);
    expect(w.streetIndex).toBe(0.75);
    expect(w.availability).toBe("4/24 hrs");   // shipped as "5/72hrs"
  });

  it("has the integral gas-vent recoil compensation, Rating 2", () => {
    // p.238: "a gas-vent recoil compensation system (barrel mount, Rating 2)".
    // Shipped as 1, which understated every burst it fires.
    expect(w.recoilComp).toBe(2);
  });
});

describe("HK227-S (p.255, description p.238)", () => {
  const w = byName(weapons, "HK227-S").system;

  it("matches the printed row", () => {
    expect(w.damageCode).toBe("7M");
    expect(w.concealability).toBe(5);
    expect(w.ammo.max).toBe(28);
    expect(w.ammo.type).toBe("smg");           // shipped as "pistol"
    expect(w.weight).toBe(3);
    expect(w.cost).toBe(1200);
    expect(w.availability).toBe("10/7 days");
  });

  it("costs 2x on the street, not 0.75x", () => {
    // The S is a restricted special-forces variant; shipped at .75 it was
    // cheaper on the street than the base model.
    expect(w.streetIndex).toBe(2);
  });

  it("has NO recoil compensation — the silencer replaces it", () => {
    // p.238: the S variant "substitutes an integral silencer for the recoil
    // system". That trade-off was lost; it shipped with recoilComp 1.
    expect(w.recoilComp).toBe(0);
  });

  it("is single-shot/semi/burst only — no full auto", () => {
    expect(w.firingModes.fa).toBe(false);
    expect(w.firingModes.bf).toBe(true);
    expect(w.firingModes.sa).toBe(true);
  });
});

describe("Ingram Valiant — the book's only LMG (p.255, description p.238)", () => {
  const w = byName(weapons, "Ingram Valiant").system;

  it("matches the printed row (every field had been invented)", () => {
    expect(w.damageCode).toBe("7S");     // was 8S
    expect(w.ammo.max).toBe(50);         // "Belt 50 (c)" — was 100
    expect(w.ammo.type).toBe("belt");
    expect(w.cost).toBe(1500);           // was 3000
    expect(w.availability).toBe("6/5 days"); // was 12/7 days
    expect(w.weight).toBe(9);            // was 0
    expect(w.streetIndex).toBe(2);       // was unset
  });

  it("uses the LMG row of the Weapon Range Table (p.88): 20/40/80/150", () => {
    expect(w.ranges).toEqual({ short: 20, medium: 40, long: 80, extreme: 150 });
  });

  it("has the hip-brace recoil pad, Rating 1", () => {
    expect(w.recoilComp).toBe(1);        // was 4
  });

  it("is a FIREARMS weapon, not Gunnery", () => {
    // p.70 (NOT p.46, which an earlier comment cited): Light Machine Guns is a
    // Firearms concentration. Gunnery governs heavy weapons "on tripods,
    // vehicle mounts, pintles, or in fixed emplacements" and concentrates in
    // Machine Guns / Missile & Rocket Launchers / Assault Cannon /
    // Vehicle-Mounted Cannon. The Weapon Range Table (p.88) agrees: LMG sits
    // under Firearms, MMG under Heavy Weapons. A mount, not the weapon, is
    // what makes a Valiant a Gunnery weapon.
    expect(w.skill).toBe("firearms");
    expect(w.weaponType).toBe("firearm");
  });

  it("carries a full belt, not the 100 rounds the invented entry held", () => {
    // ammo.current survived the 100-round belt of the pre-rename entry, so the
    // shipped weapon had current(100) > max(50).
    expect(w.ammo.current).toBe(50);
    expect(w.ammo.current).toBeLessThanOrEqual(w.ammo.max);
  });
});

describe("The book has no generic LMG — the Valiant is the whole section", () => {
  // Book p.255 (read off a 300-dpi render) prints, verbatim:
  //   Light Machine Guns:  Ingram Valiant  —  Belt 50 (c)  BF/FA  7S  9  6/5 days  1,500¥  2
  //   Heavy Weapons:       Assault Cannon 18D / Generic MMG 9S / Generic HMG 10S
  // "Generic MMG" and "Generic HMG" are the book's OWN names, which is why they
  // ship as generics. Light Machine Guns has exactly one row and it is named,
  // so there is no generic LMG to be missing — mounting a Valiant on a vehicle
  // is a Gunnery question (p.70), not a missing-item one.
  it("ships no generic LMG entry", () => {
    for (const invented of [
      "Light Machine Gun (Generic)", "Generic LMG", "Light Machine Gun",
    ]) {
      expect(byName(weapons, invented), `${invented} is not in the book`).toBeFalsy();
    }
  });

  it("ships the generics the book does name, at their printed damage", () => {
    expect(byName(weapons, "Generic MMG").system.damageCode).toBe("9S");
    expect(byName(weapons, "Generic HMG").system.damageCode).toBe("10S");
  });

  it("files the Valiant under Firearms, where the book's table puts it", () => {
    // It had been filed under Heavy Weapons > Machine Guns next to the MMG and
    // HMG, so the Firearms tree had no LMG section at all and the weapon read
    // as missing. Gunnery weapons stay in Heavy Weapons.
    const folders = Object.fromEntries(weaponFolders.map((f) => [f._id, f]));
    const chain = (doc) => {
      const parent = folders[doc.folder];
      return parent ? [...chain(parent), parent.name] : [];
    };
    expect(chain(byName(weapons, "Ingram Valiant")))
      .toEqual(["Firearms", "Light Machine Guns"]);
    expect(chain(byName(weapons, "Generic MMG")))
      .toEqual(["Heavy Weapons", "Machine Guns"]);
  });
});

describe("packs-src filenames track the document name they hold", () => {
  // The Valiant sat in Light_Machine_Gun_Generic_*.json for a release after it
  // was renamed, which is what made it look like a generic LMG had been
  // overwritten. Only the entries this file covers are pinned — the pack at
  // large uses hand-authored filenames that do not follow one convention.
  it.each([
    ["Ingram_Valiant_8ee88fc80bdff8f4.json", "Ingram Valiant"],
    ["Generic_MMG_3a53febec6132e84.json", "Generic MMG"],
    ["Generic_HMG_ee9947f739c2cac6.json", "Generic HMG"],
  ])("%s holds %s", (file, name) => {
    expect(JSON.parse(readFileSync(`packs-src/weapons/${file}`, "utf8")).name)
      .toBe(name);
  });
});

describe("Vision Enhancers (p.257) — the table was never transcribed", () => {
  it("ships the base Binoculars and Goggles the table lists", () => {
    expect(byName(gear, "Binoculars")?.system.cost).toBe(100);
    expect(byName(gear, "Goggles")?.system.cost).toBe(1500);
  });

  it("prices the options as base + addition, per the printed +cost column", () => {
    // Binoculars 100¥; +200¥ low-light, +250¥ thermographic.
    expect(byName(gear, "Binoculars (Low-Light)").system.cost).toBe(300);
    expect(byName(gear, "Binoculars (Thermographic)").system.cost).toBe(350);
    // Goggles 1,500¥; +500¥ low-light, +700¥ thermographic. These shipped at
    // 300¥ and 400¥ — figures that appear nowhere in the book.
    expect(byName(gear, "Goggles (Low-Light)").system.cost).toBe(2000);
    expect(byName(gear, "Goggles (Thermographic)").system.cost).toBe(2200);
  });

  it("carries the printed Street Index and Concealability", () => {
    expect(byName(gear, "Binoculars").system.streetIndex).toBe(0.8);
    expect(byName(gear, "Binoculars").system.concealability).toBe(5);
    expect(byName(gear, "Goggles").system.streetIndex).toBe(1.5);
    expect(byName(gear, "Goggles").system.concealability).toBe(6);
    for (const n of ["Goggles (Low-Light)", "Goggles (Thermographic)"]) {
      expect(byName(gear, n).system.streetIndex).toBe(2);
      expect(byName(gear, n).system.concealability).toBe(6);
    }
  });
});
