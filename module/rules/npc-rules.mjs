/**
 * Non-player characters (core p.187; the app's NPC builder, sr2e-chargen docs/PLAN-npc-builder.md). Pure: no Foundry.
 * `npcDerived` is the ONE place an NPC's stat-block numbers are derived — NPCData and the app both call it.
 */
import { astralCombatPool, wornArmorTotals } from "./sr2e-rules.mjs";

export const NPC_ATTRS = Object.freeze(["body", "quickness", "strength", "charisma", "intelligence", "willpower"]);

/**
 * p.187: +10% for every two years of experience, up to 10 years; past 10 years, +10% for every 4 years beyond 10.
 * The book's example: 25 years = 50% + 30% = 80%.
 */
export function npcExperiencePct(years) {
  const y = Math.max(0, Math.floor(Number(years) || 0));
  return 10 * Math.min(Math.floor(y / 2), 5) + 10 * Math.floor(Math.max(0, y - 10) / 4);
}
/** A value raised by `pct` percent, to the nearest whole number, halves up (ruling: p.68 rounds to the nearest). */
export const npcExperienced = (value, pct) => Math.floor(Number(value) * (100 + pct) / 100 + 0.5);

/** p.68 Skill Success Table: difficulty → target number(s). p.187 uses it as one way to pick a Threat Rating. */
export const SKILL_SUCCESS_TABLE = Object.freeze([
  { key: "simple", tn: [2] }, { key: "routine", tn: [3] }, { key: "average", tn: [4] },
  { key: "challenging", tn: [5] }, { key: "difficult", tn: [6, 7] }, { key: "strenuous", tn: [8] },
  { key: "extreme", tn: [9] }, { key: "nearlyImpossible", tn: [10], open: true }   // "10+"
]);
/** The Threat Rating for a difficulty (p.187 method 1); `choice` picks 6 or 7 for Difficult, 10 or more for 10+. */
export function threatFromDifficulty(key, choice = null) {
  const row = SKILL_SUCCESS_TABLE.find(r => r.key === key);
  if (!row) return null;
  if (choice == null) return row.tn[0];
  const c = Number(choice);
  if (!Number.isInteger(c)) return null;
  if (row.open) return c >= row.tn[0] ? c : null;
  return row.tn.includes(c) ? c : null;
}
/** p.187 method 2: 1 point of Threat Rating per 100 points of the team's total Team Karma (p.190). */
export const threatFromTeamKarma = (karma) => Math.floor(Math.max(0, Number(karma) || 0) / 100);

/** p.187 Professionalism Ratings: name and the wound after which the NPC withdraws (null = fights to the end). */
export const PROFESSIONAL_RATINGS = Object.freeze({
  1: { key: "average", withdraw: "light" },
  2: { key: "semiTrained", withdraw: "moderate" },
  3: { key: "trained", withdraw: "serious" },
  4: { key: "professional", withdraw: null }
});

/**
 * p.187 Threat Ratings: the Threat dice an NPC adds to every test (0 = it uses standard Dice Pools). ONE predicate for
 * derivation, rolling, the sheet and the app: an NPC, the GM's switch on, a rating above 0.
 */
export function npcThreat(type, system) {
  if (type !== "npc" || !system?.threatDice) return 0;
  return Math.max(0, Math.floor(Number(system.threatRating) || 0));
}

/** The keys the derived-data pipeline keeps from Active Effects on an NPC (CLAUDE.md "Active Effects"). */
const EFFECT_KEYS = new Set([...NPC_ATTRS.map(a => `system.${a}.mod`), "system.reaction.mod", "system.initiative.mod",
  "system.armor.ballistic", "system.armor.impact"]);
const ADD = 2;   // CONST.ACTIVE_EFFECT_MODES.ADD
/**
 * An NPC's SOURCE system with its items' transfer effects applied, as Foundry applies them before deriving — for a
 * reader outside Foundry (the app). Only ADD changes on the kept keys are applied; any other change is listed in
 * `unsupported` (the reader says "set in Foundry"). Disabled effects and non-transfer effects (a spell's) don't apply.
 */
export function npcWithEffects(system, items = []) {
  const sys = structuredClone(system);
  const unsupported = [];
  for (const i of items) for (const e of i.effects ?? []) {
    if (e.disabled || e.transfer === false) continue;
    for (const c of e.changes ?? e.system?.changes ?? []) {
      const n = Number(c.value), mode = Number(c.mode ?? c.type);
      if (!EFFECT_KEYS.has(c.key) || mode !== ADD || !Number.isFinite(n)) { unsupported.push({ item: i.name, key: c.key }); continue; }
      const [, a, f] = c.key.split(".");
      sys[a] ??= {};
      sys[a][f] = (Number(sys[a][f]) || 0) + n;
    }
  }
  return { system: sys, unsupported };
}

/**
 * An NPC's derived stat-block numbers, as NPCData prepares them (core p.84, p.112, p.147, p.242):
 * attribute = base + mod (at least 1); Reaction = ⌊(Q+I)/2⌋ + mod; Initiative = Reaction + `dice`D6 (at least 1, plus
 * effect dice); Combat Pool = ⌊(Q+I+W)/2⌋ + `combatPoolBonus`; Astral Combat Pool when Awakened; walk Q, run 3×Q;
 * armor = the stat block's (after effects) + worn armor items. `sys` holds the values AFTER Active Effects.
 * Fresh numbers only: spent pools, projection and substances stay with NPCData.
 * In threat mode (`npcThreat`, p.187: "do not use standard Dice Pools") the Combat, Astral and Magic Pools are 0;
 * otherwise `magicPool` is the stat block's typed Magic Pool.
 */
export function npcDerived(sys, { awakened = false, armorItems = [], threat = 0 } = {}) {
  const v = {};
  for (const a of NPC_ATTRS) v[a] = Math.max(1, (sys[a]?.base ?? 0) + (sys[a]?.mod ?? 0));
  const reactionBase = Math.floor((v.quickness + v.intelligence) / 2);
  const reaction = reactionBase + (sys.reaction?.mod ?? 0);
  const worn = wornArmorTotals(armorItems.filter(i => i.type === "armor" && i.system?.equipped));
  return {
    attributes: v, reactionBase, reaction,
    initiativeDice: Math.max(1, (sys.initiative?.dice ?? 1) + (sys.initiative?.mod ?? 0)),
    threat,
    combatPool: threat ? 0 : Math.max(0, Math.floor((v.quickness + v.intelligence + v.willpower) / 2) + (sys.combatPoolBonus ?? 0)),
    astralPool: awakened && !threat ? astralCombatPool({ intelligence: v.intelligence, willpower: v.willpower, charisma: v.charisma }) : 0,
    magicPool: threat ? 0 : Math.max(0, Number(sys.dicePools?.magic?.max) || 0),
    walk: v.quickness, run: v.quickness * 3,
    armor: { ballistic: (sys.armor?.ballistic ?? 0) + worn.ballistic, impact: (sys.armor?.impact ?? 0) + worn.impact }
  };
}
