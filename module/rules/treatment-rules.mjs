/**
 * Treating the wounded (core p.111–115; docs/archive/plans/PLAN-treatment.md). Pure: no Foundry.
 * First Aid is the MEDIC's Biotech test; these are its numbers, the medical gear's identity, and the facts the GM
 * writer checks before it applies a treatment.
 */
import { firstAidBodyMod } from "./sr2e-rules.mjs";

/** p.115 First Aid Table: target number by the patient's current Damage Level. */
export const FIRST_AID_TN = Object.freeze({ Light: 4, Moderate: 6, Serious: 8, Deadly: 10 });
/** p.115 First Aid Table: treatment time in minutes (divided by the successes). Deadly: stabilization only. */
export const FIRST_AID_MINUTES = Object.freeze({ Light: 10, Moderate: 20, Serious: 30 });
/** p.250: the medkit's expert system rates Biotech 3 — an untrained user rolls these dice (ruling, wiki Rulings). */
export const MEDKIT_DICE = 3;

/** Known compendium sources → rule, for items dropped before the rule flag existed. */
const GEAR_SOURCES = Object.freeze({
  "Compendium.sr2e.gear.Item.a7f6e11f694c0f68": "medkit",
  "Compendium.sr2e.gear.Item.5fe766e5c6e4df29": "medkitSupplies",
  "Compendium.sr2e.gear.Item.b3f51b664d45508d": "traumaPatch"
});
const GEAR_RULES = new Set(Object.values(GEAR_SOURCES));

/** An item's medical-gear rule ("medkit", "medkitSupplies", "traumaPatch") or null. Never reads names. */
export function medicalGearRule(item) {
  const r = item?.flags?.sr2e?.rule;
  if (GEAR_RULES.has(r)) return r;
  const src = item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? null;
  return (src && GEAR_SOURCES[src]) || null;
}

/** Units of a medkit stack whose supplies are used up (0..quantity). */
export const medkitEmpty = (item) => Math.max(0, Math.min(Number(item?.system?.quantity) || 0, Number(item?.flags?.sr2e?.medkitEmpty) || 0));
/** A medkit stack with at least one unit that still has supplies. */
export const medkitUsable = (item) => medicalGearRule(item) === "medkit" && (Number(item?.system?.quantity) || 0) - medkitEmpty(item) >= 1;
/** A trauma patch stack with one to use. */
export const patchUsable = (item) => medicalGearRule(item) === "traumaPatch" && (Number(item?.system?.quantity) || 0) >= 1;

/**
 * The First Aid target number (p.115) and its parts. `defaultingPenalty` is the medic's (0 when trained or when the
 * medkit's own dice are rolled).
 */
export function firstAidTn({ level, magician = false, waiveMagician = false, body = 1, conditionMod = 0, medkit = false,
  defaultingPenalty = 0 }) {
  let tn = FIRST_AID_TN[level] ?? 6;
  const parts = [];
  if (magician && !waiveMagician) { tn += 2; parts.push("magician +2"); }
  const bodyMod = firstAidBodyMod(body);
  if (bodyMod) { tn += bodyMod; parts.push(`Body ${bodyMod}`); }
  if (conditionMod) { tn += conditionMod; parts.push(`conditions +${conditionMod}`); }
  if (!medkit) { tn += 4; parts.push("no medkit +4"); }
  if (defaultingPenalty) { tn += defaultingPenalty; parts.push(`defaulting +${defaultingPenalty}`); }
  return { tn: Math.max(2, tn), parts };
}

/**
 * The medic's dice: trained → Biotech (+ passive dice); untrained with a usable medkit → the medkit's 3 dice, no
 * defaulting penalty (ruling); untrained without one → the Skill Web default (`webDefault` = {dice, penalty}).
 */
export function medicDice({ biotech = 0, passive = 0, webDefault = null, medkit = false }) {
  if (biotech > 0) return { dice: biotech + passive, penalty: 0, source: "biotech" };
  if (medkit) return { dice: MEDKIT_DICE, penalty: 0, source: "medkit" };
  return { dice: Math.max(1, (webDefault?.dice ?? 1) + passive), penalty: webDefault?.penalty ?? 4, source: "default" };
}

/** Minutes of uninterrupted treatment: the table time ÷ successes (p.115), at least 1. */
export const firstAidMinutes = (level, successes) =>
  Math.max(1, Math.round((FIRST_AID_MINUTES[level] ?? 10) / Math.max(1, successes)));

/** The wound a card was rolled against: boxes, overflow and the Physical generation (`flags.sr2e.physGen`). */
export const woundSnapshot = ({ boxes = 0, overflow = 0, gen = 0 }) => ({ boxes, overflow, gen });
export const sameWound = (a, b) => !!a && !!b && a.boxes === b.boxes && a.overflow === b.overflow && a.gen === b.gen;

/**
 * Stabilization state of the current Deadly episode from its attempt record (p.115). `liveGen` is the patient's
 * Physical generation now; `bleedStable` is the healing clock's live `bleed.stable` when a bleed record exists
 * (undefined otherwise). Returns { stable, lastFailed, best }: `lastFailed` and `best` (the highest Biotech) count only
 * the medics' attempts since the last "ended" — a trauma patch is the patient's own extra Body Test, never a medic's.
 */
export function stabilization(attempts = [], { liveGen, bleedStable } = {}) {
  const list = attempts.filter(Boolean);
  const last = list.at(-1) ?? null;
  const stable = bleedStable !== undefined ? !!bleedStable
    : !!last && last.kind !== "ended" && !!last.ok && last.gen === liveGen;
  const since = list.slice(list.map(a => a.kind).lastIndexOf("ended") + 1).filter(a => a.kind !== "trauma");
  const best = since.reduce((m, a) => Math.max(m, Number(a.biotech) || 0), 0);
  const lastFailed = since.length > 0 && !since.at(-1).ok;
  return { stable, lastFailed, best };
}

/** p.115 trauma patch: the patient's natural Body vs 4 + dermal armor + blood filter ratings. */
export const traumaPatchTn = ({ dermal = 0, bloodFilter = 0 }) => 4 + Math.max(0, dermal) + Math.max(0, bloodFilter);
/** A blood filtration system (its rating restricts the patch's medicine): rule flag or the core pack source. */
export const isBloodFilter = (item) => item?.flags?.sr2e?.rule === "blood-filter"
  || (item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId) === "Compendium.sr2e.cyberware.Item.wbp3fhfa9hcfgjdb";

/**
 * May this Deadly-wound card go ahead? `kind` "stabilize" | "professional" | "trauma".
 * Returns null when allowed, else the reason.
 */
export function stabilizeRefusal(kind, st, { biotech = 0, betterEquipped = false } = {}) {
  if (st.stable) return "already stable";
  if (kind === "professional") {
    if (!st.lastFailed) return "professional help is for after a failed attempt";
    if (!(biotech > st.best || betterEquipped)) return "professional help needs a better Biotech Rating or better equipment (p.115)";
    return null;
  }
  if (kind === "stabilize" && st.lastFailed) return "an attempt already failed: only professional help may try again (p.115)";
  return null;
}
