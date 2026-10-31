/**
 * Is the world on the Virtual Realities 2.0 Matrix ruleset (docs/PLAN-vr2-core.md)?
 * Its own tiny module because the data models need it and the rules module stays
 * Foundry-free. try/catch: data prep can run before settings are registered.
 */
export function isVR2() {
  try { return game.settings.get("sr2e", "matrixRuleset") === "vr2"; } catch (e) { return false; }
}

/** VR2.0's optional Utility Options (pp.102–104; docs/PLAN-vr2-part5b.md): their own world setting, off by default. */
export function utilityOptionsOn() {
  try { return isVR2() && game.settings.get("sr2e", "vr2UtilityOptions") === true; } catch (e) { return false; }
}
