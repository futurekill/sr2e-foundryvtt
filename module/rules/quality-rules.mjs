/**
 * Edges and Flaws with automated effects (Rigger 2 p.14–16; docs/PLAN-vehicles-phase2.md 2b.0, 2b.3).
 * Pure: no Foundry. Identity is the quality's `rule` field, then its known compendium source; never its name.
 */
export const QUALITY_RULES = ["vehicle-empathy", "simsense-vertigo", "sensitive-neural-structure", "spike-resistance",
  "computer-illiterate", "gremlins", "adrenaline-surge", "bio-rejection"];

const R2 = (id) => `Compendium.sr2e-rigger-2.r2-qualities.Item.${id}`;
const SC = (id) => `Compendium.sr2e-shadowrun-companion.sc-qualities.Item.${id}`;
/** Copies made before the `rule` field existed resolve through their compendium source. */
export const QUALITY_SOURCES = {
  [R2("4ddf73e8f8d0d8c2")]: "computer-illiterate",
  [R2("c4611cd92d4484df")]: "gremlins",
  [R2("9064cd10afc7fbd4")]: "sensitive-neural-structure",
  [R2("f94365525601975a")]: "simsense-vertigo",
  [R2("c6bc04745d97b6b3")]: "spike-resistance",
  [R2("baa69c515123180f")]: "vehicle-empathy",
  [SC("be38ddb6d866a9c9")]: "bio-rejection",
  [SC("e6dc6b1c2a35549a")]: "adrenaline-surge"
};

/** The quality's rule key: the explicit field, else its known source, else null. */
export const qualityRule = (rule, source = null) => rule || (source && QUALITY_SOURCES[source]) || null;

/**
 * Effective Willpower when resisting neural damage (BTLs, black IC, dump shock; p.15):
 * Sensitive Neural Structure −1 per 2 points (−2 → −1, −4 → −2), never below 1;
 * Spike Resistance +1 per 2 points. `q` = {rule: |pointValue|}.
 */
export function neuralWillpower(willpower, q = {}) {
  const w = Number(willpower) || 0;
  const sns = Math.floor((q["sensitive-neural-structure"] || 0) / 2);
  const spike = Math.floor((q["spike-resistance"] || 0) / 2);
  return Math.max(Math.min(w, 1), w - sns) + spike;
}

/**
 * Gremlins (p.15): what a 2 on 2D6 does at the Flaw's value (1–4). Returns the i18n key suffix, or null
 * when the equipment is unaffected (cyberware, bioware, magical equipment).
 */
export function gremlinsOutcome(total, value, { immune = false } = {}) {
  if (immune || total !== 2) return null;
  return `Tier${Math.min(4, Math.max(1, Math.abs(value) || 1))}`;
}
