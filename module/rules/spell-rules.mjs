/**
 * Combat spells by the book (docs/PLAN-combat-spells.md). Pure: no Foundry.
 *
 * Core SR2E: casting p.129–132, combat spells p.127 and p.151, vehicles p.109, barriers p.98,
 * the Visibility Table p.89, movement p.83.
 */
import { barrierEffect } from "./sr2e-rules.mjs";

export const DAMAGE_LEVELS = ["L", "M", "S", "D"];
const BOXES = { L: 1, M: 3, S: 6, D: 10 };
export const LEVEL_NAMES = { L: "Light", M: "Moderate", S: "Serious", D: "Deadly" };

/**
 * The result of a resisted combat spell (p.131). No Power: a combat spell's damage is a
 * Damage Level, staged one level per 2 net successes, and there is no Damage Resistance Test.
 *  - caster 0 successes → miscast, no effect;
 *  - the target rolled MORE → unaffected (the spell went off, visibly);
 *  - a tie → the spell's minimum effect: its base level ("the tie goes in favor of the attacker");
 *  - otherwise base + ⌊net / 2⌋, at most Deadly.
 * @returns {{affected:boolean, why:string, net:number, level:string|null, boxes:number, stagedUp:number}}
 */
export function combatSpellOutcome({ casterSuccesses = 0, resistSuccesses = 0, baseLevel = "M" } = {}) {
  const c = Math.max(0, Math.trunc(Number(casterSuccesses) || 0));
  const r = Math.max(0, Math.trunc(Number(resistSuccesses) || 0));
  const base = DAMAGE_LEVELS.includes(baseLevel) ? baseLevel : "M";
  if (c <= 0) return { affected: false, why: "miscast", net: 0, level: null, boxes: 0, stagedUp: 0 };
  if (r > c) return { affected: false, why: "resisted", net: c - r, level: null, boxes: 0, stagedUp: 0 };
  const net = c - r;
  const stagedUp = Math.floor(net / 2);
  const idx = Math.min(DAMAGE_LEVELS.indexOf(base) + stagedUp, DAMAGE_LEVELS.length - 1);
  const level = DAMAGE_LEVELS[idx];
  return { affected: true, why: net === 0 ? "tie" : "net", net, level, boxes: BOXES[level], stagedUp: idx - DAMAGE_LEVELS.indexOf(base) };
}

/** What a target IS for a combat spell: a living being, a vehicle, or an inanimate object. */
export function targetKindOf(actorType) {
  if (["character", "npc", "spirit"].includes(actorType)) return "living";
  if (actorType === "vehicle") return "vehicle";
  return "object";
}

/**
 * Who a combat spell can affect, its Spell Success Test TN and the target's resistance.
 * @param {object} o
 * @param {"mana"|"physical"} o.spellType
 * @param {"physical"|"stun"} [o.damageType]
 * @param {{kind:string, willpower?:number, body?:number, armor?:number, cymTN?:number}} o.target
 * @returns {{eligible:boolean, why:string, kind:string, tn:number|null, resistAttr:string|null, resistDice:number|null}}
 */
export function combatSpellTarget({ spellType, damageType = "physical", target = {} } = {}) {
  const kind = target.kind ?? "object";
  const mana = spellType === "mana";
  const n = (v) => Math.max(0, Math.trunc(Number(v) || 0));
  if (kind === "living") {
    const attr = mana ? "willpower" : "body";
    return { eligible: true, why: "", kind, tn: Math.max(2, n(target[attr]) + n(target.cymTN)), resistAttr: attr, resistDice: n(target[attr]) };
  }
  if (mana) return { eligible: false, why: "mana spells don't affect non-living targets (SR2E p.127)", kind, tn: null, resistAttr: null, resistDice: null };
  if (kind === "vehicle") {
    if (damageType === "stun") return { eligible: false, why: "only physical combat spells that do Physical damage affect vehicles (SR2E p.109)", kind, tn: null, resistAttr: null, resistDice: null };
    // p.109: "a physical combat spell cast against a vehicle has a Target Number 8"; the vehicle
    // resists with Body plus one-half any vehicle armor, against the spell's Force.
    return { eligible: true, why: "", kind, tn: 8, resistAttr: "vehicle", resistDice: n(target.body) + Math.floor(n(target.armor) / 2) };
  }
  // An object: the Object Resistance Table (p.130) — resolved by the GM in this release.
  return { eligible: true, why: "", kind, tn: null, resistAttr: "object", resistDice: null };
}

/** Object Resistance Table (p.130): the caster's TN, and (p.131) the object's resistance dice. */
export const OBJECT_RESISTANCE = Object.freeze([
  { key: "natural", tn: 3, label: "Natural objects (trees, soil, unprocessed water)" },
  { key: "lowTech", tn: 5, label: "Manufactured low-tech (brick, leather, simple plastics)" },
  { key: "highTech", tn: 8, label: "Manufactured high-tech (advanced plastics, alloys, electronics)" },
  { key: "processed", tn: 10, label: "Highly processed (computers, complex toxic wastes) — 10 or more" }
]);

/** The caster's vision for the Visibility Table (p.89: slash columns are cybernetic/natural). */
export const VISION_TYPES = Object.freeze([
  ["normal", "Normal"], ["lowLightNatural", "Low-light (natural)"], ["lowLightCyber", "Low-light (cybernetic)"],
  ["thermoNatural", "Thermographic (natural)"], ["thermoCyber", "Thermographic (cybernetic)"]
]);

/** Visibility Table (SR2E p.89), rendered and checked: [normal, low-light cyber/natural, thermo cyber/natural]. */
const VIS = {
  clear:        { label: "Clear",                 normal: 0, ll: [0, 0], th: [0, 0] },
  fullDark:     { label: "Full Darkness",          normal: 8, ll: [8, 8], th: [4, 2] },
  minimal:      { label: "Minimal Light",          normal: 6, ll: [4, 2], th: [4, 2] },
  partial:      { label: "Partial Light",          normal: 2, ll: [1, 0], th: [2, 1] },
  glare:        { label: "Glare",                  normal: 2, ll: [4, 2], th: [4, 2] },
  mist:         { label: "Mist",                   normal: 2, ll: [2, 0], th: [0, 0] },
  lightSmoke:   { label: "Light Smoke/Fog/Rain",   normal: 4, ll: [4, 2], th: [0, 0] },
  heavySmoke:   { label: "Heavy Smoke/Fog/Rain",   normal: 6, ll: [6, 4], th: [1, 0] },
  // Thermal smoke: "as smoke" for normal and low-light vision, "as normal" (i.e. the way normal
  // smoke affects normal vision) for thermographic.
  thermalLight: { label: "Thermal Smoke (light)",  normal: 4, ll: [4, 2], th: [4, 4] },
  thermalHeavy: { label: "Thermal Smoke (heavy)",  normal: 6, ll: [6, 4], th: [6, 6] }
};
export const VISIBILITY_CONDITIONS = Object.freeze(Object.entries(VIS).map(([k, v]) => [k, v.label]));

/** The Visibility Table modifier for a condition and the caster's vision type. */
export function visibilityMod(condition = "clear", vision = "normal") {
  const row = VIS[condition] ?? VIS.clear;
  switch (vision) {
    case "lowLightCyber": return row.ll[0];
    case "lowLightNatural": return row.ll[1];
    case "thermoCyber": return row.th[0];
    case "thermoNatural": return row.th[1];
    default: return row.normal;
  }
}

/** The caster's own movement (p.83): walking +1 (+2 over rough terrain/obstacles), running +4. */
export const MOVEMENT = Object.freeze({ stationary: 0, walking: 1, walkingRough: 2, running: 4 });

/**
 * The per-target situation modifiers on a Spell Success Test (p.130, p.83): partial cover +4,
 * the Visibility Table, +1 per 2 points of a mana barrier / hermetic circle / medicine lodge the
 * spell crosses (not for its creator), the caster's movement, and a GM "other" modifier.
 * Injury and sustained spells are the caster's and are added by the roll itself.
 */
export function spellSituationTN({ cover = false, visibility = "clear", vision = "normal", barrierRating = 0,
                                   movement = "stationary", other = 0 } = {}) {
  const parts = {
    cover: cover ? 4 : 0,
    visibility: visibilityMod(visibility, vision),
    barrier: Math.floor(Math.max(0, Number(barrierRating) || 0) / 2),
    movement: MOVEMENT[movement] ?? 0,
    other: Math.trunc(Number(other) || 0)
  };
  return { total: Object.values(parts).reduce((s, v) => s + v, 0), parts };
}

/**
 * Ram (p.151): the casting's successes are added to Force and compared to the target's Barrier
 * Rating — doubled, because "against combat magic spells, barriers use twice their normal
 * rating" (p.98). Against a vehicle the Barrier Rating is Body (+ vehicle armor) and each
 * indicated reduction does Light damage without reducing Body. Nothing on a miscast.
 * @returns {null|{power:number, rating:number, tier:string, ratingReduction:number, holes:number, lightBoxes:number}}
 */
export function ramEffect({ force = 0, successes = 0, barrierRating = 0 } = {}) {
  const s = Math.max(0, Math.trunc(Number(successes) || 0));
  if (s < 1) return null;
  const power = Math.max(0, Math.trunc(Number(force) || 0)) + s;
  const rating = 2 * Math.max(0, Math.trunc(Number(barrierRating) || 0));
  const fx = barrierEffect(power, rating);
  return { power, rating, ...fx, lightBoxes: fx.ratingReduction };
}

/** A misfire (p.131): at least one die was rolled and every die came up 1. */
export function isMisfire(dice = []) {
  const vals = (dice ?? []).map(d => (typeof d === "number" ? d : d?.result ?? d?.total ?? d?.rolls?.[0]));
  return vals.length > 0 && vals.every(v => v === 1);
}

/** Compendium sources of combat spells by damage type, and the special ones resolved by the GM. */
const CORE = (id) => `Compendium.sr2e.spells.Item.${id}`;
const GRIM = (id) => `Compendium.sr2e-grimoire.grim-spells.Item.${id}`;
export const STUN_SPELL_SOURCES = new Set([
  CORE("4771d8048d316e8a"),                                            // Sleep
  GRIM("ffacf666721c2cf1"), GRIM("45cb90e9e2663dc4"), GRIM("7df13834d6d3584c"),   // Stun Bolt, Stun Missile, Stunball
  GRIM("6ca4474cd9f4a010"), GRIM("f3514fcf8a30b510"), GRIM("ef25c84e54f632ca")    // Stun Cloud, Stunblast, Stun Touch
]);
export const MANUAL_SPELL_SOURCES = new Set([
  GRIM("88d1fc117f9179f5"), GRIM("31f9a6c050615bbb"), GRIM("ef25c84e54f632ca"),   // Death Touch, Ram Touch, Stun Touch
  GRIM("970de2a41db97267"), GRIM("dc2d94c74cd5b241"), GRIM("b808826d1709335c"),   // Slay, Spirit Bolt, Wrecker
  GRIM("ba1f5ee0e2d1df0c"), GRIM("52c44f0c48397bad")                              // Urban Renewal, Sterilize
]);
export const RAM_SOURCES = new Set([CORE("5997ac8fe972f5cf")]);

/**
 * A combat spell's damage type, in the plan's order: an explicit field, a damage code that says
 * Stun, the compendium source, and (unidentified legacy only) the old name test.
 */
export function inferDamageType({ damageType = "", damageCode = "", source = null, name = "" } = {}) {
  if (damageType === "physical" || damageType === "stun") return damageType;
  if (/stun/i.test(String(damageCode))) return "stun";
  if (source && STUN_SPELL_SOURCES.has(source)) return "stun";
  if (source && (source.startsWith("Compendium.sr2e.spells.") || source.startsWith("Compendium.sr2e-grimoire."))) return "physical";
  return /stun|sleep/i.test(String(name)) ? "stun" : "physical";
}

/** The damage type of a spell document or its source data. */
export const spellDamageType = (doc) => inferDamageType({
  damageType: doc?.system?.damageType, damageCode: doc?.system?.damageCode, name: doc?.name,
  source: doc?._stats?.compendiumSource ?? doc?.flags?.core?.sourceId ?? null });

/** Does the resolver leave this combat spell to the GM (touch range, a special Grimoire spell, opt-in)? */
export function isManualCombatSpell({ range = "", spellRule = "", source = null } = {}) {
  return range === "touch" || spellRule === "manual" || (!!source && MANUAL_SPELL_SOURCES.has(source));
}

/** Is this the Ram spell (by source, or flagged `spellRule: "ram"`)? */
export const isRamSpell = ({ source = null, spellRule = "" } = {}) => spellRule === "ram" || (!!source && RAM_SOURCES.has(source));

/**
 * A split casting's allocation ledger (p.129), checked before anything is spent: per target
 * Force dice (≥ 1, together ≤ the effective Force), cast Magic Pool (≤ the Magic Attribute per
 * cast test, p.85), Drain Magic Pool (no cap), and pre-roll Karma dice (≤ that test's Force
 * share, p.191). In total the pool and Karma must be available.
 * @param {{shares:{force:number,pool?:number,drainPool?:number,karma?:number}[], force:number, magic:number, poolAvail:number, karmaAvail:number}} o
 * @returns {{ok:boolean, why:string}}
 */
export function validateSplit({ shares = [], force = 0, magic = 0, poolAvail = 0, karmaAvail = 0 } = {}) {
  const n = (v) => Math.max(0, Math.trunc(Number(v) || 0));
  if (shares.length < 2) return { ok: false, why: "a split needs two or more targets" };
  if (shares.some(s => n(s.force) < 1)) return { ok: false, why: "every target needs at least 1 Force die" };
  const sum = (k) => shares.reduce((t, s) => t + n(s[k]), 0);
  if (sum("force") > force) return { ok: false, why: `the shares add up to ${sum("force")} dice, more than Force ${force}` };
  if (shares.some(s => n(s.pool) > magic)) return { ok: false, why: `Magic Pool on one casting test is capped at your Magic ${magic} (p.85)` };
  if (sum("pool") + sum("drainPool") > poolAvail) return { ok: false, why: `that is ${sum("pool") + sum("drainPool")} Magic Pool dice; ${poolAvail} available` };
  if (shares.some(s => n(s.karma) > n(s.force))) return { ok: false, why: "Karma dice on a test can't exceed its Force share (p.191)" };
  if (sum("karma") > karmaAvail) return { ok: false, why: `that is ${sum("karma")} Karma dice; ${karmaAvail} in the pool` };
  return { ok: true, why: "" };
}
