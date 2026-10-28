/**
 * Bioware damage and repair (Shadowtech p.6; docs/PLAN-bioware-damage.md). Pure: no Foundry.
 * User ruling: only Serious or worse switches the bioware off.
 */
import { naturalHealingHours } from "./sr2e-rules.mjs";

const BOXES = { L: 1, M: 3, S: 6, D: 10 };
const FLOOR = { D: 6, S: 3, M: 1, L: 0 };

/**
 * 1D6 (−1 cultured, +1 secondhand, p.12): 0 none, 1–2 Light, 3–4 Moderate, 5 Serious, 6 Deadly;
 * a secondhand implant's 7 destroys it ("X").
 * @param {number} d6 @param {"standard"|"cultured"|"secondhand"|boolean} grade (true = cultured, legacy)
 */
export function bioDamageLevel(d6, grade = "standard") {
  const g = grade === true ? "cultured" : grade;
  const r = d6 + (g === "cultured" ? -1 : g === "secondhand" ? 1 : 0);
  return r <= 0 ? null : r <= 2 ? "L" : r <= 4 ? "M" : r === 5 ? "S" : r === 6 ? "D" : "X";
}

/** 1D6 − 3 potential hits; each pick is 1..n; a repeat is "no implant hit" (indexes into the snapshot). */
export function pickTargets(picks, n) {
  const seen = new Set(), out = [];
  for (const p of picks) {
    const i = p - 1;
    if (i < 0 || i >= n || seen.has(i)) { out.push(null); continue; }
    seen.add(i); out.push(i);
  }
  return out;
}

/** Add a hit to an item's 10-box track; the UNCLAMPED sum decides destruction (sticky). */
export function addBioDamage(boxes, level, destroyed = false) {
  if (level === "X") return { damage: 10, destroyed: true };      // secondhand 7 (p.12)
  const sum = (boxes || 0) + (level ? BOXES[level] : 0);
  return { damage: Math.min(10, sum), destroyed: destroyed || sum > 10 };
}

/** Does this bioware still work? Not destroyed and below Serious (6 boxes). */
export const bioFunctions = (sys) => !sys?.destroyed && (Number(sys?.damage) || 0) < 6;

/** The item's damage level from its boxes. */
export const bioLevel = (boxes) => boxes >= 10 ? "D" : boxes >= 6 ? "S" : boxes >= 3 ? "M" : boxes >= 1 ? "L" : null;

/** One stage of healing drops the item to the next level's lowest point (p.113, on its own track). */
export const bioHealFloor = (level) => FLOOR[level] ?? 0;

/** "Bioware heals individually and in half the time normally required for general healing." */
export const bioHealHours = (level, successes) => naturalHealingHours(level, successes) / 2;
