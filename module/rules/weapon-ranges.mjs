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
