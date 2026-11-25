/**
 * Adept powers, Phase B — pure rules (docs/archive/plans/PLAN-adept-powers-phase-b.md; Grimoire p.34, p.44; core p.68–75, p.157).
 * No Foundry.
 */

/** Active Skill groups (core p.68–75), by skill key. Build/Repair, Knowledge, Language and Special come from the item's
 *  category. A key not listed (a custom Active Skill) belongs to no group: the GM decides. */
export const SKILL_GROUPS = Object.freeze({
  armed_combat: "combat", firearms: "combat", gunnery: "combat", projectile_weapons: "combat", throwing_weapons: "combat",
  unarmed_combat: "combat",
  athletics: "physical", stealth: "physical",
  biotech: "technical", computer: "technical", demolitions: "technical", electronics: "technical",
  bike: "vehicle", car: "vehicle", hovercraft: "vehicle", motorboat: "vehicle", ship: "vehicle", fixed_wing_aircraft: "vehicle",
  rotor_aircraft: "vehicle", vector_thrust_aircraft: "vehicle", lta_aircraft: "vehicle", sailboat: "vehicle", submarine: "vehicle",
  conjuring: "magical", sorcery: "magical",
  etiquette: "social", interrogation: "social", leadership: "social", negotiation: "social"
});
const NON_ACTIVE = new Set(["build_repair", "knowledge", "language", "special"]);

/** A skill's group: its category when that isn't "active", else its key's group, else null. */
export function skillGroup({ key = "", category = "active" } = {}) {
  if (NON_ACTIVE.has(category)) return category;
  return SKILL_GROUPS[key] ?? null;
}

const norm = (s) => String(s ?? "").trim().toLowerCase();

/**
 * Whether an adept's Centering may work against a test's penalties (Grimoire p.44): Physical Skills always; any other
 * group only through an Enhanced Centering power for it (a Special Skill one names the skill).
 * @param {{group:string|null, skillName:string}} test
 * @param {{category:string, skill?:string}[]} enhanced - the adept's Enhanced Centering choices
 */
export function adeptCenteringCovers({ group, skillName }, enhanced = []) {
  if (group === "physical") return true;
  if (!group) return false;
  return enhanced.some(e => e.category === group && (group !== "special" || norm(e.skill) === norm(skillName)));
}

/**
 * Attribute Boost's Drain Level (Grimoire p.34 table): the boosted rating against the racial maximum.
 * ≤ ½ max L, ≤ max M, ≤ 1.5 × max S, beyond D.
 */
export function attributeBoostDrainLevel(boosted, racialMax) {
  const b = Number(boosted) || 0, m = Math.max(1, Number(racialMax) || 1);
  return b <= m / 2 ? "L" : b <= m ? "M" : b <= 1.5 * m ? "S" : "D";
}

/** Attribute Boost's Drain target number: half the boosted value, rounded down (at least 2, the SR2 floor). */
export const attributeBoostDrainTN = (boosted) => Math.max(2, Math.floor((Number(boosted) || 0) / 2));

/** Suspended State (Hibernate, core p.157): the factor bodily processes slow by — twice the successes; 0 = no effect. */
export const suspendedFactor = (successes) => Math.max(0, Math.floor(Number(successes) || 0)) * 2;
