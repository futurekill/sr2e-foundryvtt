/**
 * Rigger 2 remote-control networks, drones and robots (R2 p.62–67; docs/PLAN-vehicles-phase2.md Part 5a). Pure: no
 * Foundry. The records and ops that use these live in module/rc-net.mjs.
 */

/** Core p.68 Skill Success Table — the GM rates a drone command with it (R2 p.66). "Difficult" is 6–7; 10 = "10+". */
export const SKILL_SUCCESS_TABLE = Object.freeze([
  { key: "simple", label: "Simple", tn: 2 }, { key: "routine", label: "Routine", tn: 3 },
  { key: "average", label: "Average", tn: 4 }, { key: "challenging", label: "Challenging", tn: 5 },
  { key: "difficult", label: "Difficult", tn: 6, max: 7 }, { key: "strenuous", label: "Strenuous", tn: 8 },
  { key: "extreme", label: "Extreme", tn: 9 }, { key: "nearlyImpossible", label: "Nearly Impossible", tn: 10, open: true }
]);

/** A deck's limits (p.62, p.64): subscribers ≤ 2 × rating; affiliated ≤ rating (hardwired vehicles included). */
export const deckLimits = (rating) => {
  const r = Math.max(0, Math.floor(Number(rating) || 0));
  return { subscribers: 2 * r, affiliated: r };
};

/** Network-capable (p.65): rigger-adapted (drones are pre-adapted) AND an effective Pilot above 0. */
export const networkCapable = ({ adapted = false, pilot = 0 } = {}) => !!adapted && (Number(pilot) || 0) > 0;

/**
 * A drone's operative mode for its operator (p.65–66; 5a.2), derived across every network the operator runs:
 * "primary" (the operator's one jumped drone), "secondary" (any other drone while a primary is set anywhere),
 * "captain" (no primary anywhere).
 */
export function droneMode({ droneKey, primaryKey = null } = {}) {
  if (primaryKey && primaryKey === droneKey) return "primary";
  return primaryKey ? "secondary" : "captain";
}

/**
 * The Comprehension Test (p.66–67; 5a.3): dice = Pilot + Non-Matrix Programming specialization dice (≤ Pilot) + IVIS
 * successes assigned to it; TN = the GM's Skill Success Table rating, +2 when the rigger is jumped into a primary and
 * commands a secondary (p.65), + command-channel degradation (5b.3).
 */
export function comprehensionTest({ pilot = 0, specDice = 0, ivis = 0, tableTn = 4, jumpedCommandingSecondary = false, degradation = 0 } = {}) {
  const p = Math.max(0, Number(pilot) || 0);
  return { dice: p + Math.min(Math.max(0, Number(specDice) || 0), p) + Math.max(0, Number(ivis) || 0),
    tn: Math.max(2, (Number(tableTn) || 4) + (jumpedCommandingSecondary ? 2 : 0) + Math.max(0, Number(degradation) || 0)) };
}
/** A group command (R5-8): ONE test at the LOWEST Pilot among the group's drones. */
export const groupPilot = (pilots = []) => (pilots.length ? Math.min(...pilots.map(p => Number(p) || 0)) : 0);

/** Robots (p.67; 5a.4): Reaction = 2 × Pilot; Initiative dice = Learning Pool + 1, at most 4. */
export const robotReaction = (pilot) => 2 * (Number(pilot) || 0);
export const robotInitiativeDice = (learningPool) => Math.min(4, Math.max(0, Number(learningPool) || 0) + 1);

/** A pool budget under a refresh key: dice − Σ spends recorded under that key (Learning Pool, IVIS Pool; 5a.4–5a.5). */
export function poolBalance(dice, spends = {}, key = "") {
  const used = Object.values(spends ?? {}).filter(s => s?.key === key).reduce((t, s) => t + (Number(s.n) || 0), 0);
  return Math.max(0, (Number(dice) || 0) - used);
}

/** The IVIS Test's successes (p.66–67): those given to the Comprehension Test; the rest become the IVIS Pool. */
export function ivisSplit(successes, toTest) {
  const s = Math.max(0, Number(successes) || 0), t = Math.max(0, Math.min(s, Number(toTest) || 0));
  return { test: t, pool: s - t };
}

/**
 * Rigger dump shock (p.64; 5a.6): resist (deck rating + 4)S Stun; disorientation +2 TN on all Success Tests for
 * ⌈⌈30 ÷ Willpower (4) successes⌉ ÷ 3⌉ Combat Turns (no successes: 10).
 */
export const dumpDamage = (deckRating) => ({ power: (Number(deckRating) || 0) + 4, level: "S", type: "stun" });
export const DUMP_TN = 2;
export function dumpDuration(successes) {
  const s = Math.max(0, Math.floor(Number(successes) || 0));
  return s === 0 ? 10 : Math.ceil(Math.ceil(30 / s) / 3);
}

/* ── Equipment identity (5a.5 "equipment recognition"): a rule key, else the compendium source; never names ───── */
const R2 = (pack, id) => `Compendium.sr2e-rigger-2.${pack}.Item.${id}`;
/** Owned copies made before the R2 module carried rule keys: compendium source UUID → rule key. */
export const RC_ITEM_SOURCES = Object.freeze({
  [R2("r2-cyberware", "ae8708480e4d5c81")]: "rc-deck", [R2("r2-sensors", "8b1caacf6d618abf")]: "rc-deck",
  [R2("r2-cyberware", "a900a354a8ad9f08")]: "ivis-master", [R2("r2-sensors", "6350e2356aeaffd9")]: "ivis-master",
  [R2("r2-cyberware", "5dae0af1c39908b3")]: "protocol-emulation", [R2("r2-sensors", "50be507a307a868d")]: "protocol-emulation",
  [R2("r2-cyberware", "8c3d540fb5063dc7")]: "decryption", [R2("r2-sensors", "8cfbe8773299073c")]: "decryption",
  [R2("r2-cyberware", "dcf4e3de552be1dc")]: "rc-encryption", [R2("r2-sensors", "4c60b0e537ad3b3d")]: "rc-encryption",
  [R2("r2-cyberware", "4b5b045f8e6a960d")]: "rc-eccm", [R2("r2-sensors", "374ee094513653e6")]: "rc-eccm",
  [R2("r2-sensors", "1248dd786a64f11d")]: "storage-memory", [R2("r2-sensors", "f1ea71293c020c76")]: "signal-amplifier",
  [R2("r2-sensors", "b66660e8b69306df")]: "hitcher-jacks"
});
/** The remote-control rule key of an item: its `flags.sr2e.rule`, else its compendium source (RC_ITEM_SOURCES), else "". */
export function rcRuleOf(item) {
  const r = item?.flags?.sr2e?.rule;
  if (r) return r;
  return RC_ITEM_SOURCES[item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId ?? ""] ?? "";
}

/* ── The security rigger (Rigger 2 p.77–80; docs/PLAN-vehicles-phase2.md 5d) ─────────────────────────────────────── */

/** Vigilance Code Criteria Table (p.79): the successes an access step needs. */
export const VIGILANCE = { blue: 1, green: 2, amber: 3, red: 4 };
export const vigilanceCount = (code) => VIGILANCE[code] ?? 2;
/**
 * A component the rigger may jump into (p.78): a room under 100 m², a corridor section under 25 m; a device group always.
 * Returns null when allowed, else the reason.
 */
export function ccssComponentRefusal(c) {
  const size = Number(c?.size) || 0;
  if (c?.kind === "room" && !(size > 0 && size < 100)) return "a room must be under 100 square meters (Rigger 2 p.78)";
  if (c?.kind === "corridor" && !(size > 0 && size < 25)) return "a corridor section must be under 25 meters long (Rigger 2 p.78)";
  return null;
}
/** The security rigger's control mode (p.78): jumped into a drone, into one component, else assuming the body. */
export const ccssMode = (net) => (net?.primary ? "drone" : net?.ccssComponent ? "component" : "body");
/**
 * Rigger Perception Tests Table (p.78): the TN to notice an event in the system; null = no test (a triggered alarm).
 * `tamperSuccesses` for "tamper-success" (3 × the intruder's successes); an alert lowers every TN by 2.
 */
export const PERCEPTION_EVENTS = { door: 5, "tamper-no-alarm": 3, "tamper-success": null, destroyed: 4, deactivated: 6, alarm: null };
export function ccssPerceptionTn(event, { tamperSuccesses = 0, onAlert = false } = {}) {
  if (event === "alarm" || !(event in PERCEPTION_EVENTS)) return null;
  const base = event === "tamper-success" ? 3 * Math.max(0, Number(tamperSuccesses) || 0) : PERCEPTION_EVENTS[event];
  return Math.max(2, base - (onAlert ? 2 : 0));
}
