/**
 * SR2E Weapon Range Table (core p.88, read from a 200 dpi render): the upper bound
 * in metres of each bracket, short / medium / long / extreme, per weapon class.
 * Strength-based weapons (bows, crossbows, thrown) aren't here.
 */
export const RANGE_TABLE = {
  holdout:         [5, 15, 30, 50],
  lightPistol:     [5, 15, 30, 50],
  heavyPistol:     [5, 20, 40, 60],
  smg:             [10, 40, 80, 150],
  taser:           [5, 10, 12, 15],
  shotgun:         [10, 20, 50, 100],
  sportingRifle:   [30, 60, 150, 300],
  sniperRifle:     [40, 80, 200, 400],
  assaultRifle:    [15, 40, 100, 250],
  lmg:             [20, 40, 80, 150],
  mmg:             [40, 150, 300, 500],
  hmg:             [40, 150, 400, 800],
  assaultCannon:   [50, 150, 450, 1300],
  grenadeLauncher: [50, 100, 150, 300],
  missileLauncher: [70, 150, 450, 1500]
};

/** `{short, medium, long, extreme}` for a class. */
export const rangesFor = (cls) => {
  const [short, medium, long, extreme] = RANGE_TABLE[cls];
  return { short, medium, long, extreme };
};

/**
 * Core-pack weapons that shipped with brackets from no row of the table, by name,
 * with the wrong brackets they shipped with and their class in the book (Street Gear
 * p.255; Sourcebook Updates p.279; hold-outs "HO" in the weapon table). 0.103.2.
 */
export const RANGE_FIXES = {
  "AK-97":                                 { was: [25, 100, 250, 500], cls: "assaultRifle" },
  "AK-98":                                 { was: [25, 100, 250, 500], cls: "assaultRifle" },
  "FN HAR":                                { was: [25, 100, 250, 500], cls: "assaultRifle" },
  "Colt M22A2":                            { was: [25, 100, 250, 500], cls: "assaultRifle" },
  "HK G12A3Z":                             { was: [25, 100, 250, 500], cls: "assaultRifle" },
  "Defiance T-250":                        { was: [10, 20, 40, 60],    cls: "shotgun" },
  "Enfield AS-7":                          { was: [10, 20, 40, 60],    cls: "shotgun" },
  "Mossberg CMDT":                         { was: [10, 20, 40, 60],    cls: "shotgun" },
  "Remington 750":                         { was: [50, 250, 500, 1000], cls: "sportingRifle" },
  "Remington 950":                         { was: [50, 250, 500, 1000], cls: "sportingRifle" },
  "Ranger Arms SM-3":                      { was: [75, 350, 700, 1400], cls: "sniperRifle" },
  "Streetline Special":                    { was: [5, 10, 20, 35],     cls: "holdout" },
  "Walther Palm Pistol":                   { was: [5, 10, 20, 35],     cls: "holdout" },
  "Generic Under-Barrel Grenade Launcher": { was: [5, 50, 100, 200],   cls: "grenadeLauncher" },
  "Panther Assault Cannon":                { was: [20, 100, 300, 600], cls: "assaultCannon" }
};

/**
 * Content-module weapons that shipped with brackets from no row of the table
 * (Street Samurai Catalog, Corporate Security Handbook, Neo-Anarchists' Guide,
 * Rigger 2), fixed in those modules and, for copies already in worlds, by migration
 * 0.104.2. `was` is the exact wrong value each shipped with; `to` the right one. Each
 * module's CHANGELOG cites the book for the class.
 */
const R = (cls) => RANGE_TABLE[cls];
// Released (0.104.2): never edit. A new fix goes in a new migration (test pins this).
export const MODULE_RANGE_FIXES = [
  // Street Samurai Catalog (SSC Type / core Sourcebook Updates p.279)
  { name: "Ares MP-LMG",                  was: [50, 150, 350, 550],   to: R("lmg") },
  { name: "GE Vindicator Minigun",        was: [50, 150, 350, 550],   to: R("lmg") },
  { name: "Steyr AUG-CSL LMG",            was: [50, 150, 350, 550],   to: R("lmg") },
  { name: "FN MAG-5 MMG",                 was: [50, 150, 350, 550],   to: R("mmg") },
  { name: "Stoner-Ares M107",             was: [50, 150, 350, 550],   to: R("hmg") },
  { name: "Ares MP Laser",                was: [50, 150, 350, 550],   to: R("sniperRifle") },
  { name: "Panther Assault Cannon",       was: [50, 150, 350, 550],   to: R("assaultCannon") },
  { name: "Ruger 100",                    was: [50, 150, 350, 550],   to: R("sportingRifle") },
  { name: "Steyr AUG-CSL Carbine",        was: [50, 150, 350, 550],   to: R("sportingRifle") },
  { name: "Walther MA-2100",              was: [50, 350, 800, 1500],  to: R("sniperRifle") },
  { name: "H&K G12A3",                    was: [25, 100, 250, 500],   to: R("assaultRifle") },
  { name: "Sakal vz 88V",                 was: [25, 100, 250, 500],   to: R("assaultRifle") },   // since renamed Samopal vz 88V; copies keep the old name
  { name: "Steyr AUG-CSL Assault Rifle",  was: [25, 100, 250, 500],   to: R("assaultRifle") },
  { name: "Steyr AUG-CSL SMG",            was: [25, 100, 250, 500],   to: R("smg") },
  { name: "Narcoject Rifle",              was: [25, 100, 250, 500],   to: R("shotgun") },
  { name: "Mossberg SM-CMDT",             was: [10, 20, 40, 60],      to: R("shotgun") },
  { name: "Surface-to-Air Missile (SAM)", was: [0, 0, 0, 0],          to: [70, 150, 450, 5000] },   // SSC p.59
  // Corporate Security Handbook
  { name: "Ares ELD-AR Assault Rifle",    was: [25, 100, 250, 500],   to: R("assaultRifle") },
  // Neo-Anarchists' Guide (typed Taser, p.33)
  { name: "Yamaha Pulsar",                was: [5, 10, 15, 20],       to: R("taser") },
  // Rigger 2 (no minigun row in its own table, p.107)
  { name: "Ares Vengeance Minigun",       was: [50, 150, 350, 550],   to: R("mmg") },
  { name: "Ares Vanquisher Minigun",      was: [50, 150, 350, 550],   to: R("hmg") }
];

/** Every correction, core and module, as {name, was, to}: what migration 0.104.2 applies. */
export const ALL_RANGE_FIXES = [
  ...Object.entries(RANGE_FIXES).map(([name, f]) => ({ name, was: f.was, to: RANGE_TABLE[f.cls] })),
  ...MODULE_RANGE_FIXES
];
