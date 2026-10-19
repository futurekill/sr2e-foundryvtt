/**
 * Is the world on the Virtual Realities 2.0 Matrix ruleset (docs/PLAN-vr2-core.md)?
 * Its own tiny module because the data models need it and the rules module stays
 * Foundry-free. try/catch: data prep can run before settings are registered.
 */
export function isVR2() {
  try { return game.settings.get("sr2e", "matrixRuleset") === "vr2"; } catch (e) { return false; }
}
