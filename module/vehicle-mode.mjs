import { qualityEffects } from "./rules/vehicle-design.mjs";
/**
 * Is the world on the Rigger 2 vehicle ruleset (docs/PLAN-vehicles-phase2.md Part 2)? Its own tiny module, like
 * vr2-mode.mjs: data models read it. try/catch: data prep can run before settings are registered.
 */
export function isRigger2() {
  try { return game.settings.get("sr2e", "vehicleRuleset") === "rigger2"; } catch (e) { return false; }
}

/**
 * Rigger 2's optional advanced rules (p.81–90; docs/PLAN-vehicles-phase2.md Part 6): each has its own world setting,
 * read here and false unless the world is on Rigger 2. Every mutation handler re-checks its own gate.
 */
export const R2_OPTIONS = {
  r2QualityFactors: { name: "Rigger 2: Quality Factors", hint: "Optional rule (Rigger 2 p.84–85): vehicle Quality Factors in design, with their Maintenance, Stress, Build/Repair and collision effects and a prototype's hidden Stress." }
};
/** The vehicle's Quality Factor effects (6a.3) while the option is on; neutral otherwise (saved designs stay valid). */
export function vehicleQuality(vehicle) {
  return qualityEffects(r2Option("r2QualityFactors") ? vehicle?.system?.design?.choices?.quality ?? {} : {});
}

export function r2Option(key) {
  if (!isRigger2()) return false;
  try { return !!game.settings.get("sr2e", key); } catch (e) { return false; }
}
export function registerR2Options() {
  for (const [key, o] of Object.entries(R2_OPTIONS))
    game.settings.register("sr2e", key, { name: o.name, hint: o.hint, scope: "world", config: true, type: Boolean, default: false, requiresReload: true });
}
