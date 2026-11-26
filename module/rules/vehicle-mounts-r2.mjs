/**
 * Weapons on Rigger 2 weapon mounts (R2 p.131–136; sr2e-chargen docs/PLAN-workshop-mounts.md). Pure: no Foundry.
 * Pages rendered 2026-11-26. Used by the Vehicle Workshop (Foundry) and the chargen app's Workshop.
 *
 * Every table is keyed by the FULL source key `package.pack.documentId` (`sourceKey`), never a bare document id, so a
 * document in another pack is never mistaken for one of these.
 */

const R2M = "sr2e-rigger-2.r2-vehicle-mods.", R2W = "sr2e-rigger-2.r2-vehicle-weapons.", CORE = "sr2e.weapons.";
const KEY = /^[a-z0-9][a-z0-9-]{0,63}\.[a-z0-9][a-z0-9-]{0,63}\.[A-Za-z0-9]{16}$/;

/** An item's source key `package.pack.docId`: its `flags.sr2e.catalogId` (the app's), else `_stats.compendiumSource`
 *  (`Compendium.package.pack.Item.docId`). "" when neither is a well-formed key. */
export function sourceKey(item) {
  const cid = item?.flags?.sr2e?.catalogId;
  if (typeof cid === "string" && KEY.test(cid)) return cid;
  const m = /^Compendium\.([a-z0-9][a-z0-9-]{0,63})\.([a-z0-9][a-z0-9-]{0,63})\.(?:Item|Actor)\.([A-Za-z0-9]{16})$/.exec(String(item?._stats?.compendiumSource ?? ""));
  return m ? `${m[1]}.${m[2]}.${m[3]}` : "";
}

/**
 * The designable mount mods (R2 p.131–135): `kind` fixed / pintle / ring / turret; `point` for fixed, pintle and ring;
 * `wv` = a turret's maximum Weapon Value (p.135 table; pop-up 1 lower; anti-aircraft the same); `kit` = a personal
 * firearm needs a Firearm Conversion Kit here (fixed mounts and turrets, p.131). Remote mini/small/medium turrets: the
 * book prints only the micro's value (1); they take the plain turrets' values — a HOUSE RULING (wiki Rulings).
 */
export const R2_MOUNTS = Object.freeze({
  [`${R2M}9899f9283b954643`]: { name: "Fixed Mount (External Firmpoint)", kind: "fixed", point: "firmpoint", kit: true },
  [`${R2M}95c3935a006e0160`]: { name: "Fixed Mount (External Hardpoint)", kind: "fixed", point: "hardpoint", kit: true },
  [`${R2M}a8604859df4e79c3`]: { name: "Fixed Mount (Internal Firmpoint)", kind: "fixed", point: "firmpoint", kit: true },
  [`${R2M}6181302a01b6ee29`]: { name: "Fixed Mount (Internal Hardpoint)", kind: "fixed", point: "hardpoint", kit: true },
  [`${R2M}07ce1f02240a4aca`]: { name: "Pintle Mount", kind: "pintle", point: "firmpoint", kit: false },
  [`${R2M}8f0140c135c93507`]: { name: "Ring Mount", kind: "ring", point: "hardpoint", kit: false },
  [`${R2M}e9082bd14a794425`]: { name: "Turret (Mini)", kind: "turret", wv: 2, kit: true },
  [`${R2M}dd515e90c45ebe46`]: { name: "Turret (Small)", kind: "turret", wv: 3, kit: true },
  [`${R2M}e852a3077fec2f48`]: { name: "Turret (Medium)", kind: "turret", wv: 6, kit: true },
  [`${R2M}20820baa932ff978`]: { name: "Anti-Aircraft Turret (Mini)", kind: "turret", wv: 2, kit: true },
  [`${R2M}b5ace1638cca3a67`]: { name: "Anti-Aircraft Turret (Small)", kind: "turret", wv: 3, kit: true },
  [`${R2M}5f9a88bab1052256`]: { name: "Anti-Aircraft Turret (Medium)", kind: "turret", wv: 6, kit: true },
  [`${R2M}85400082a5a98db1`]: { name: "Pop-Up Turret (Mini)", kind: "turret", wv: 1, kit: true },
  [`${R2M}227629f03df7ae75`]: { name: "Pop-Up Turret (Small)", kind: "turret", wv: 2, kit: true },
  [`${R2M}c4b06145c52a6082`]: { name: "Pop-Up Turret (Medium)", kind: "turret", wv: 5, kit: true },
  [`${R2M}c19009fb1845cf03`]: { name: "Remote Turret (Micro)", kind: "turret", wv: 1, kit: true },
  [`${R2M}94981e4337877b61`]: { name: "Remote Turret (Mini)", kind: "turret", wv: 2, kit: true, house: true },
  [`${R2M}85c9cc7094c2de6d`]: { name: "Remote Turret (Small)", kind: "turret", wv: 3, kit: true, house: true },
  [`${R2M}f4007fc4a342c5dd`]: { name: "Remote Turret (Medium)", kind: "turret", wv: 6, kit: true, house: true }
});

/** The Firearm Conversion Kits (p.131), as R2 vehicle mods, by the weapon class they convert. */
export const CONVERSION_KITS = Object.freeze({
  pistol: `${R2M}d2b37b32dbddf2a2`, smg: `${R2M}9d7edd6b1de1d3b9`, rifle: `${R2M}678b4d77eb54b3d7`, heavy: `${R2M}2da2bdef3e9f797f`
});
const KIT_KEYS = new Set(Object.values(CONVERSION_KITS));

/**
 * Weapon classes for the mount rules (p.131 hard/firmpoints and kits; p.135 Weapon Values). `wv: null` = not on the
 * Weapon Values Table, so not in a turret (pistols, shotguns: a ruling). `kit: null` = built for vehicles, no kit.
 * `mph` = a man-portable heavy weapon (a ring mount takes those and LMGs, p.134).
 */
export const WEAPON_CLASSES = Object.freeze({
  pistol: { point: "firmpoint", wv: null, kit: "pistol", mph: false },
  smg: { point: "firmpoint", wv: 1, kit: "smg", mph: false },
  rifle: { point: "firmpoint", wv: 1, kit: "rifle", mph: false },
  shotgun: { point: "firmpoint", wv: null, kit: "rifle", mph: false },
  lmg: { point: "firmpoint", wv: 1.5, kit: "rifle", mph: false },
  mmg: { point: "hardpoint", wv: 2, kit: "heavy", mph: true },
  hmg: { point: "hardpoint", wv: 2, kit: "heavy", mph: true },
  assaultCannon: { point: "hardpoint", wv: 3, kit: "heavy", mph: true },
  missileLauncher: { point: "hardpoint", wv: 2, kit: "heavy", mph: true },
  autocannon: { point: "hardpoint", wv: 3, kit: null, mph: false },
  vehicleLauncher: { point: "hardpoint", wv: 2, kit: null, mph: false },
  waterCannon: { point: "hardpoint", wv: 3, kit: null, mph: false },
  minigun: { point: "hardpoint", wv: 2.5, kit: null, mph: false }
});

/**
 * Each mountable weapon's class, by source key: every core firearm and heavy weapon (from its compendium folder; the
 * vehicle weapons by id first) and the R2 vehicle weapons a mount takes. NOT_MOUNTABLE lists the rest of the core
 * firearm/heavy weapons, so the test can require every one to be in exactly one of the two.
 */
export const WEAPON_CLASS = Object.freeze({
  // Pistols (hold-out, light, heavy) and the taser.
  ...Object.fromEntries(["ca17afcb8c61ee53", "0a8d5df14974178d", "f1e9b06afa79c233", "87f7bdd470f76b3e", "7fd3c8e5a36db979", "2e60f53bd09aa664",
    "fc78a2546b6130e3", "238ee9d5c429d332", "40bbb83f5f8bfa0b", "57171263c74c8131", "31c9b3945bca4e80", "0b40db9127cb7ae8", "6aa9186fa4c534a6",
    "f74b7e73167d6dbb"].map(id => [CORE + id, "pistol"])),
  ...Object.fromEntries(["3250f12f6d200f2b", "760798fc72bcd2e8", "b3d3b1614ea21a52", "8c0e1af0d5c3e6e3", "015cebdcf70442c3"].map(id => [CORE + id, "smg"])),
  // Assault, sport and sniper rifles ("Rifle", p.135).
  ...Object.fromEntries(["9a954abc8f8a3315", "cb1c78e3f231e934", "e773cae1c764f4a9", "3f2cd650d2055421", "6bc862b27d8ff016", "67562b7612a73104",
    "10a2227418893aae", "6b294fcefcd7b625"].map(id => [CORE + id, "rifle"])),
  ...Object.fromEntries(["2da61a9acd317c27", "b8e0ad55b587827b", "6a99fddf28c79d62"].map(id => [CORE + id, "shotgun"])),
  [`${CORE}8ee88fc80bdff8f4`]: "lmg",
  [`${CORE}3a53febec6132e84`]: "mmg",
  [`${CORE}ee9947f739c2cac6`]: "hmg",
  [`${CORE}85d3807a401d11c0`]: "assaultCannon",
  [`${CORE}23e8dcd986f176eb`]: "missileLauncher",
  [`${CORE}3384fb676d8924f5`]: "autocannon",
  [`${CORE}40cf40b8a58e4f42`]: "vehicleLauncher",
  [`${CORE}9c67c3aea5c5a4d2`]: "waterCannon",
  [`${R2W}317d79c419e181c4`]: "minigun", [`${R2W}1463f91bb4d804fe`]: "minigun",
  [`${R2W}e809214509859b95`]: "autocannon", [`${R2W}20702711c30fefd9`]: "autocannon",
  [`${R2W}31ae1ee0bbeff7ee`]: "missileLauncher"
});
/** Core heavy weapons that are never mounted: the launcher's missiles and rockets (cargo) and the under-barrel grenade
 *  launcher (an accessory). */
export const NOT_MOUNTABLE = Object.freeze(new Set(["f678090421b247b4", "d33fe747d94e22eb", "64d1f53fa35c8d71", "b0e020f45d5c884a",
  "78ae7600f07b2a2b", "52b9bec9fe94e9a7", "92a4f1ecb7c5ab6b"].map(id => CORE + id)));

/** A weapon item's class (`WEAPON_CLASSES` row with its `key`), or null when this part can't mount it. */
export function weaponClassOf(item) {
  const k = WEAPON_CLASS[sourceKey(item)];
  return k ? { key: k, ...WEAPON_CLASSES[k] } : null;
}
/** A mount item's spec (`R2_MOUNTS` row), or null. */
export const mountOf = (item) => (item?.type === "vehicle_mod" ? R2_MOUNTS[sourceKey(item)] ?? null : null);
/** The conversion kit a weapon needs on a mount (its source key), or null. */
export function kitFor(mount, cls) {
  return mount?.kit && cls?.kit ? CONVERSION_KITS[cls.kit] : null;
}

/** Why `cls` can't go on `mount` alongside `others` (the classes already there), or "" if it can (p.131–135). */
export function fitProblem(mount, cls, others = []) {
  if (!mount) return "that isn't a weapon mount";
  if (!cls) return "this weapon can't be mounted here yet";
  if (mount.kind === "turret") {
    if (cls.wv == null) return "the Weapon Values Table gives it no value, so it can't go in a turret (p.135)";
    const used = others.reduce((t, c) => t + (c?.wv ?? 0), 0);   // an unclassed neighbour counts 0 (reported on its own)
    if (used + cls.wv > mount.wv) return `the turret holds Weapon Value ${mount.wv}; this would make ${used + cls.wv} (p.135)`;
    return "";
  }
  if (others.length) return `a ${mount.kind === "fixed" ? "fixed mount" : `${mount.kind} mount`} holds one weapon`;
  if (mount.kind === "ring") return cls.mph || cls.key === "lmg" ? "" : "a ring mount takes a man-portable heavy weapon or an LMG (p.134)";
  if (mount.point === "firmpoint" && cls.point !== "firmpoint")
    return "heavy weapons and vehicle weapons go on hardpoints (p.131)";
  return "";   // a hardpoint takes a firmpoint weapon too (a ruling: the book never refuses one)
}

const finiteNonNeg = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * The ONE check of a vehicle's mounted weapons (plan 0.3), from its items (`{ _id|id, type, name, system, flags,
 * _stats }`): each weapon flagged `flags.sr2e.mountId` names a mount on the vehicle, fits it, has a known weight on a
 * fixed mount, and has exactly its kit (a design mod flagged `flags.sr2e.kitFor` = the weapon's id); no kit is
 * orphaned or of the wrong class. `[{ code, msg, page }]`.
 */
export function mountProblems(items = []) {
  const out = [], id = (i) => i._id ?? i.id;
  const p = (code, msg, page = "p.131") => out.push({ code, msg, page });
  const byId = new Map(items.map(i => [id(i), i]));
  const weapons = items.filter(i => i.type === "weapon" && i.flags?.sr2e?.mountId);
  const onMount = new Map();
  for (const w of weapons) {
    const m = byId.get(w.flags.sr2e.mountId), mount = mountOf(m);
    if (!mount) { p("mountMissing", `${w.name} is on a mount the vehicle doesn't have.`); continue; }
    const cls = weaponClassOf(w), there = onMount.get(id(m)) ?? [];
    const why = fitProblem(mount, cls, there.map(x => x.cls));
    if (why) p("mountFit", `${w.name} on ${m.name}: ${why}.`, mount.kind === "turret" ? "p.135" : "p.131");
    there.push({ w, cls }); onMount.set(id(m), there);
    if (mount.kind === "fixed" && !finiteNonNeg(w.system?.weight)) p("weaponWeight", `${w.name}'s weight isn't known, so its fixed mount's Load can't be counted.`, "p.132");
    const need = kitFor(mount, cls), kits = items.filter(k => k.type === "vehicle_mod" && k.flags?.sr2e?.kitFor === id(w));
    if (need && kits.length !== 1) p("kitMissing", `${w.name} needs one ${kitName(need)} on ${m.name} (p.131).`);
    else if (need && sourceKey(kits[0]) !== need) p("kitClass", `${w.name} needs a ${kitName(need)}, not ${kits[0].name}.`);
    else if (!need && kits.length) p("kitExtra", `${w.name} needs no conversion kit there.`);
  }
  // A kit installed in DESIGN must convert a mounted weapon (code review r1 #5); a kit bought later as a customization
  // and never linked is the owner's business. Kits and mounts may be design mods or customizations: both are installed.
  for (const k of items.filter(k => k.type === "vehicle_mod" && (k.flags?.sr2e?.kitFor || (k.flags?.sr2e?.designMod && KIT_KEYS.has(sourceKey(k)))))) {
    if (!k.flags.sr2e.kitFor) { p("kitOrphan", `${k.name} converts no mounted weapon.`); continue; }
    const w = byId.get(k.flags.sr2e.kitFor);
    if (!w || w.type !== "weapon" || !w.flags?.sr2e?.mountId) p("kitOrphan", `${k.name} converts a weapon that isn't mounted.`);
    if (!KIT_KEYS.has(sourceKey(k))) p("kitNotKit", `${k.name} isn't a Firearm Conversion Kit.`);
  }
  return out;
}
const kitName = (key) => R2_KIT_NAMES[key] ?? "conversion kit";
const R2_KIT_NAMES = { [CONVERSION_KITS.pistol]: "Firearm Conversion Kit (Pistol)", [CONVERSION_KITS.smg]: "Firearm Conversion Kit (SMG)",
  [CONVERSION_KITS.rifle]: "Firearm Conversion Kit (Rifle/Shotgun/LMG)", [CONVERSION_KITS.heavy]: "Firearm Conversion Kit (Heavy Weapon)" };

/** The weight on fixed mounts ("10 kg, plus weapon's weight", p.132): transient Load use, never stored. Unknown
 *  weights count 0 here; mountProblems reports them. */
export function mountedWeaponLoad(items = []) {
  const byId = new Map(items.map(i => [i._id ?? i.id, i]));
  return items.filter(i => i.type === "weapon" && i.flags?.sr2e?.mountId)
    .reduce((t, w) => t + (mountOf(byId.get(w.flags.sr2e.mountId))?.kind === "fixed" && finiteNonNeg(w.system?.weight) ? w.system.weight : 0), 0);
}

/** Whether a design mod item may be removed on its own: not an occupied mount, not a kit whose weapon is mounted. */
export function removalProblem(items, modId) {
  const m = items.find(i => (i._id ?? i.id) === modId);
  if (!m) return "";
  if (mountOf(m) && items.some(w => w.type === "weapon" && w.flags?.sr2e?.mountId === modId)) return `${m.name} holds weapons: unmount them first.`;
  const w = m.flags?.sr2e?.kitFor && items.find(i => (i._id ?? i.id) === m.flags.sr2e.kitFor);
  if (w && w.flags?.sr2e?.mountId) return `${m.name} converts ${w.name}: it goes when the weapon is unmounted.`;
  return "";
}
