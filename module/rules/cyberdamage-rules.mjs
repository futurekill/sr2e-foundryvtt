/**
 * Cyberware damage, repair and scarring (docs/PLAN-cybertechnology-phase5.md; Cybertechnology
 * pp.44–49, 56). Pure: no Foundry.
 */
import { CYBERWARE_GRADES } from "./sr2e-rules.mjs";

/** A wound from the boxes LANDED in one commit (p.44): 6–9 Serious, 10+ Deadly. */
export const woundLevel = (boxes) => boxes >= 10 ? "D" : boxes >= 6 ? "S" : null;
export const woundThreshold = (level) => level === "D" ? 10 : 6;

/** Grade damage resistance (p.44): 5 dice vs the TN for a Serious / Deadly wound; null = none. */
export function gradeResistTN(grade, level) {
  const r = CYBERWARE_GRADES[grade]?.damageResist;
  return Array.isArray(r) ? r[level === "D" ? 1 : 0] : null;
}

/** The secondary-damage tables (2D6): [maxRoll, effect], first match wins. */
export const TABLES = {
  comm: { label: "Communications headware (p.45)", rows: [[4, "No effect, lucky you."], [7, "Static; garbles messages."],
    [9, "Intermittent signal; about half of a message gets through."],
    [11, "Works intermittently; must be struck or jostled to work again after a failure (Quickness (3) Test)."],
    [12, "Total unit failure; nothing but continual annoying static."]] },
  eye: { label: "Cybereye (p.45)", rows: [[4, "No effect, lucky you."], [6, "Black-and-white image."],
    [7, "Blurred vision: +2 to TNs for perception at a distance."],
    [9, "Image intermittent; must be struck or jostled to work again after a failure (Quickness (3) Test)."],
    [11, "One eye fails: +4 to TNs for tests involving depth perception."],
    [12, "Total unit failure; nothing but continual annoying static."]] },
  ear: { label: "Cyberear (p.47)", rows: [[4, "No effect, lucky you."], [6, "The lower end of the sound spectrum cuts out."],
    [7, "Static: +2 to TNs for tests to discern sounds."],
    [9, "Sound intermittent; must be struck or jostled to work again after a failure (Quickness (3) Test)."],
    [11, "One ear fails: +4 to TNs for tests involving spatial sound perception."],
    [12, "Total unit failure; nothing but continual annoying static."]] },
  limb: { label: "Cyberlimb (p.49)", rows: [[4, "No effect, lucky you."], [7, "The limb twitches at random: +1 to TNs for all tests using that limb."],
    [9, "On a 2D6 roll of 10 or more the limb doesn't perform properly (the GM decides how)."],
    [11, "On a 2D6 roll of 8 or more the limb fails to perform properly."],
    [12, "The limb shuts down completely, except for an occasional twitch."]] }
};

/** A secondary-table row and the quick-and-dirty repair TN, ⌊roll / 2⌋ (pp.45, 46, 47). */
export function secondaryEffect(table, roll) {
  const t = TABLES[table];
  if (!t) return { effect: "Damaged (GM).", repairTN: 0 };
  const row = t.rows.find(([max]) => roll <= max) ?? t.rows.at(-1);
  return { effect: row[1], repairTN: Math.floor(roll / 2) };
}

/** Dermal plating/sheathing degradation (p.47–48): a 2D6 less than the missed treatments costs a point. */
export const degrades = (roll, missed) => roll < missed;
/** A skin implant's Body after its lost points (floor 0); other items are never clamped. */
export const skinBody = (body, loss) => Math.max(0, (Number(body) || 0) - Math.max(0, Number(loss) || 0));
/** A street doc's price for the NEXT point (p.48): plating 2,000¥ × the points lost now; sheathing 6,500¥. */
export const skinRepairPrice = (kind, lost) => kind === "dermal-sheath" ? 6500 : 2000 * Math.max(1, lost);

/** Scarring Modifiers Table (p.56). */
export const SCAR_TREATMENT = { icu: -4, none: 0, bad: 2, terrible: 4 };
export const SCAR_MAGIC = { none: 0, some: -2, half: -4 };
export const SCAR_PLATING = 3, SCAR_SKIN = 2, SCAR_SALVE = -2;
/** Scarring Table (p.56): 0 Terrible, 1–2 Major, 3–4 Noticeable, 5+ Minor. */
export const scarSeverity = (successes) => successes <= 0 ? "Terrible" : successes <= 2 ? "Major" : successes <= 4 ? "Noticeable" : "Minor";
/** What surgery can do to a scar's CURRENT severity (p.56): invasive turns Terrible into Minor; cosmetic removes the rest. */
export const scarProcedures = (current) => current === "Terrible" ? [["Minor", "minor invasive: Terrible → Minor"]]
  : current && current !== "removed" ? [["removed", "minor cosmetic: removed"]] : [];
