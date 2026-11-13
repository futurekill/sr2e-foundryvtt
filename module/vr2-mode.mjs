/**
 * Is the world on the Virtual Realities 2.0 Matrix ruleset (docs/archive/plans/PLAN-vr2-core.md)?
 * Its own tiny module because the data models need it and the rules module stays
 * Foundry-free. try/catch: data prep can run before settings are registered.
 */
export function isVR2() {
  try { return game.settings.get("sr2e", "matrixRuleset") === "vr2"; } catch (e) { return false; }
}

/** VR2.0's optional Utility Options (pp.102–104; docs/archive/plans/PLAN-vr2-part5b.md): their own world setting, off by default. */
export function utilityOptionsOn() {
  try { return isVR2() && game.settings.get("sr2e", "vr2UtilityOptions") === true; } catch (e) { return false; }
}

/** VR2.0 grid topology (part 7a; docs/archive/plans/PLAN-vr2-part7-grids.md): its own world setting, off by default. */
export function topologyOn() {
  try { return isVR2() && game.settings.get("sr2e", "vr2Topology") === true; } catch (e) { return false; }
}
export function variableLTGOn() {
  try { return topologyOn() && game.settings.get("sr2e", "vr2VariableLTG") === true; } catch (e) { return false; }
}
