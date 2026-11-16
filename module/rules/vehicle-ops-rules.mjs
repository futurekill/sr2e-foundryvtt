/**
 * Rigger 2 special vehicle operations (R2 p.33–36; docs/PLAN-vehicles-phase2.md 5c). Pure: no Foundry.
 * Read from the page renders (2026-11-16).
 */

/**
 * Vehicle Pull Test (p.33–34; Pull Test Target Numbers/Modifiers Table and Pull Test Side Effects Table): the vehicle's
 * Body vs a TN from the object's weight against its Load Rating (summed when several vehicles pull together).
 * @param {object} o weight, load, conditions ("" | "bad" | "terrible"), stuck (0–4, the GM's), noRollers, braced
 * @returns {{allowed, ratio, tn, parts, speed, stress, extraBodyTest}}
 *   allowed: false above 2 × Load (no Pull Test covers it); speed "half" | "quarter" | null; stress "hour" | "minute" | null
 *   — the side effects apply even when the test fails (p.33); extraBodyTest: above 1.5 × Load, a Body (4) Test or
 *   +1 Stress (p.34).
 */
export function pullTest({ weight = 0, load = 0, conditions = "", stuck = 0, noRollers = false, braced = false } = {}) {
  const w = Math.max(0, Number(weight) || 0), l = Math.max(0, Number(load) || 0);
  const ratio = l > 0 ? w / l : (w > 0 ? Infinity : 0);
  if (ratio > 2) return { allowed: false, ratio };
  const base = ratio <= 1 ? 3 : ratio <= 1.5 ? 5 : 8;
  const parts = [["Object weight", base]];
  if (conditions === "bad") parts.push(["Bad conditions", 1]);
  if (conditions === "terrible") parts.push(["Terrible conditions", 3]);
  const s = Math.max(0, Math.min(4, Math.floor(Number(stuck) || 0)));
  if (s) parts.push(["Stuck in the ground", s]);
  if (noRollers) parts.push(["Pulling without rollers", 4]);
  if (braced) parts.push(["Vehicle braced in place", -2]);
  const tn = Math.max(2, parts.reduce((t, [, m]) => t + m, 0));
  const over = ratio > 1;
  return { allowed: true, ratio, tn, parts, speed: !over ? null : ratio <= 1.5 ? "half" : "quarter",
    stress: !over ? null : ratio <= 1.5 ? "hour" : "minute", extraBodyTest: ratio > 1.5 };
}

/** A mechanical arm's Skill Test or melee attack (p.34–35): +1 TN for each point of Handling above 3. */
export const armHandlingMod = (handling) => Math.max(0, (Number(handling) || 0) - 3);
/** An Arm Test's TN (p.34): the vehicle's Handling, which the GM may lower or raise for the task. */
export const armTestTn = (handling, gmMod = 0) => Math.max(2, (Number(handling) || 0) + (Number(gmMod) || 0));
/** A mechanical arm's effective Strength (p.35): the vehicle's Body × Body, + its bought-up Strength (p.145). */
export const armStrength = (body, enhancement = 0) => {
  const b = Math.max(0, Number(body) || 0);
  return b * b + Math.max(0, Number(enhancement) || 0);
};

/** Legs (p.35): the listed Speed Rating is walking; running is × 2.5. */
export const legsRunning = (walking) => Math.floor((Number(walking) || 0) * 2.5);

/**
 * Runway Distances Table (p.36): metres, B = Body; the first figure under the Load Rating, the second at or over it.
 * VTOL needs no runway (null).
 */
const RUNWAY = { normal: [[150, 225], [300, 450]], stol: [[40, 125], [75, 200]], vstol: [[20, 45], [40, 100]] };
/** The aircraft's landing/takeoff profile from its L/T Profile field ("STOL", "VSTOL", "VTOL", else normal). */
export function ltProfileOf(raw = "") {
  const s = String(raw ?? "").toUpperCase();
  return /\bVTOL\b/.test(s) && !/VSTOL/.test(s) ? "vtol" : /VSTOL/.test(s) ? "vstol" : /STOL/.test(s) ? "stol" : "normal";
}
export function runwayDistances(body, profile = "normal", { loaded = false } = {}) {
  const r = RUNWAY[profile];
  if (!r) return null;
  const b = Math.max(0, Number(body) || 0), i = loaded ? 1 : 0;
  return { takeoff: b * r[0][i], landing: b * r[1][i] };
}

/**
 * Taking off / landing on unusual surfaces (p.36): a Driving Test with base TN 3 (takeoff) or 4 (landing) in place of
 * Handling, + the Takeoff and Landing Modifiers Table (and the Driving Test Modifiers Table, added by the caller).
 * An arrestor cable needs a tailhook; a crash net serves any aircraft; either only on landing (p.36 key).
 */
export function takeoffLanding({ landing = false, winds = "", rough = false, profile = "normal", arrestor = false, tailhook = false, crashNet = false } = {}) {
  const base = landing ? 4 : 3;
  const parts = [];
  if (winds === "cross") parts.push(["Cross winds", 2]);
  if (winds === "heavy") parts.push(["Heavy cross winds", 3]);
  if (rough) parts.push(["Rough or uneven surface", 1]);
  if (profile === "stol") parts.push(["STOL profile", 1]);
  if (profile === "vstol") parts.push(["VSTOL profile", 3]);
  if (landing && (crashNet || (arrestor && tailhook))) parts.push([crashNet ? "Crash net" : "Arrestor cable", -1]);
  return { base, parts, mod: parts.reduce((t, [, m]) => t + m, 0), roughDamage: rough ? { power: 6, level: "L" } : null };
}

/** An air-cushion vehicle's crash damage never exceeds Serious (p.35). */
export const acvCrashCap = (level, isAcv) => (isAcv && level === "D" ? "S" : level);

/**
 * A vehicle on legs (p.35): a walker or anthroform chassis (Rigger 2's "special" category, zeppelins aside), or a
 * Mechanical Legs mod. Reads plain data: `system.design` and the mods' names / rule flags.
 */
export function hasLegs(vehicle) {
  const d = vehicle?.system?.design ?? {};
  if (/^(walker|anthroform)/i.test(d.chassisKey ?? "")) return true;
  if (d.category === "special" && !(d.traits ?? []).includes("zeppelin") && !/blimp|zeppelin/i.test(d.chassisKey ?? "")) return true;
  return (vehicle?.items ?? []).some(i => i.type === "vehicle_mod" && (i.flags?.sr2e?.rule === "mechanical-legs" || /^mechanical legs?$/i.test(String(i.name ?? "").trim())));
}
