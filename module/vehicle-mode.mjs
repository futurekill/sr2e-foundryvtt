/**
 * Is the world on the Rigger 2 vehicle ruleset (docs/PLAN-vehicles-phase2.md Part 2)? Its own tiny module, like
 * vr2-mode.mjs: data models read it. try/catch: data prep can run before settings are registered.
 */
export function isRigger2() {
  try { return game.settings.get("sr2e", "vehicleRuleset") === "rigger2"; } catch (e) { return false; }
}
