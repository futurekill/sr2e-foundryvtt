/**
 * Combat sounds (docs/PLAN-combat-sounds.md) — which sound an action makes. Pure:
 * no Foundry. One sound per class and cadence, never per weapon; the class comes
 * from the weapon's range brackets (SR2E p.88), the cadence from rounds actually fired.
 */
import { RANGE_TABLE } from "./weapon-ranges.mjs";

/** p.88 class → the sound class it uses. */
const SOUND_CLASS = {
  holdout: "pistol", lightPistol: "pistol", heavyPistol: "heavypistol", smg: "smg",
  taser: "taser", shotgun: "shotgun", sportingRifle: "rifle", assaultRifle: "rifle",
  sniperRifle: "sniper", lmg: "mg", mmg: "mg", hmg: "mg",
  assaultCannon: "cannon", grenadeLauncher: "launcher", missileLauncher: "launcher"
};
/** Sound class → its family (the next fallback). */
const FAMILY = { pistol: "pistol", heavypistol: "pistol", smg: "smg", taser: "taser", shotgun: "shotgun",
  rifle: "rifle", sniper: "rifle", mg: "mg", cannon: "cannon", launcher: "launcher" };

const ROW_BY_BRACKETS = new Map(Object.entries(RANGE_TABLE).map(([cls, r]) => [r.join(), cls]));

/** The p.88 class a firearm/heavy weapon's brackets match, or null. */
export function rangeClass(ranges = {}) {
  return ROW_BY_BRACKETS.get([ranges.short, ranges.medium, ranges.long, ranges.extreme].join()) ?? null;
}

/** single (1 round, incl. a burst cut short by the clip) | burst (2–3) | auto (4+). */
export function cadence(rounds = 1) {
  return rounds >= 4 ? "auto" : rounds >= 2 ? "burst" : "single";
}

/** The first key of `chain` that ships (`available` is a Set of keys), else null. */
const first = (chain, available) => chain.find(k => available.has(k)) ?? null;

/**
 * The sound of an attack. `skillKey` is the attack's normalised skill (the roll's own
 * tnContext.key), so "Unarmed Combat" and unarmed_combat agree.
 * @param {{weaponType: string, ranges?: object, skillKey?: string, name?: string, rounds?: number}} w
 * @param {Set<string>} available - the shipped keys
 */
export function attackSound({ weaponType, ranges, skillKey = "", name = "", rounds = 1 }, available) {
  if (weaponType === "melee") return first([skillKey === "unarmed_combat" ? "unarmed" : "melee", "melee"], available);
  if (weaponType === "projectile") return first([/crossbow/i.test(name) ? "crossbow" : "bow", "bow"], available);
  if (weaponType === "throwing" || weaponType === "grenade") return first(["thrown"], available);
  if (weaponType !== "firearm" && weaponType !== "heavy") return null;
  const cad = cadence(rounds);
  const cls = SOUND_CLASS[rangeClass(ranges)] ?? null;
  const fam = cls ? FAMILY[cls] : null;
  return first([cls && `${cls}-${cad}`, fam && `${fam}-${cad}`, `${weaponType}-${cad}`, `${weaponType}-single`].filter(Boolean), available);
}

/** The sound of casting a spell of this category. */
export const spellSound = (category, available) => first([`spell-${category}`], available);

/** The sound of a resolved blast: smoke hisses, everything else explodes. */
export const blastSound = (blastType, available) => first([blastType === "smoke" ? "smoke" : "blast"], available);
