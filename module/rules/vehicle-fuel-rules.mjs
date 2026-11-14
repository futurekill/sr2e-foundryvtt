/**
 * Rigger 2 variable fuel consumption (R2 p.81–83; docs/PLAN-vehicles-phase2.md 6a.1). Pure: no Foundry. Tables read
 * from the page renders (Economy Rating Table, Flight Maneuvers Table, Fuel Grade Effects Table).
 */
const num = (v) => Number(v) || 0;

/** Economy Rating Table (p.82): below the Speed Rating → base; 1–1.5 × → base ÷ 2; vehicle combat → (base ÷ 2) + .5. */
export function economyFor({ base, speed = 0, speedRating = 0, combat = false }) {
  const b = num(base);
  if (combat) return b / 2 + 0.5;
  return num(speed) >= num(speedRating) && num(speedRating) > 0 ? b / 2 : b;
}

/** Fuel used to travel `km` at an economy (km per unit). */
export const fuelUsed = (km, economy) => (num(economy) > 0 ? num(km) / num(economy) : 0);

/** Coasting distance (p.82): (.75 × starting speed²) ÷ Acceleration; + Acceleration per 2 Vehicle Test successes (R6-4). */
export function coastDistance(startSpeed, acceleration, successes = 0) {
  const a = num(acceleration);
  if (a <= 0) return 0;
  return (0.75 * num(startSpeed) ** 2) / a + a * Math.floor(num(successes) / 2);
}

/**
 * The coasting Turns (p.81–82; ruling R6-9): speed falls 2 × Acceleration per Turn from the starting speed; the printed
 * TOTAL is split across the Turns in proportion to each Turn's speed (Gray Ghost: 1,000/800/600/400/200 →
 * 2,500/2,000/1,500/1,000/500 m). Returns [{ turn, speed, metres }].
 */
export function coastSchedule(startSpeed, acceleration, successes = 0) {
  const a = num(acceleration), s0 = num(startSpeed);
  if (a <= 0 || s0 <= 0) return [];
  const speeds = [];
  for (let s = s0; s > 0; s -= 2 * a) speeds.push(s);
  const sum = speeds.reduce((t, s) => t + s, 0), total = coastDistance(s0, a, successes);
  return speeds.map((speed, i) => ({ turn: i + 1, speed, metres: Math.round((total * speed / sum) * 100) / 100 }));
}

/**
 * The Turn of an aircraft's Crash Test (p.82): when its coasting speed reaches its Stall Speed. The Gray Ghost example
 * (stall 600, from 1,000 at −200 a Turn) makes it "two turns after running out of fuel", i.e. the Turn whose speed is
 * 600 — so the example's reading (at or below the Stall Speed) is used.
 */
export function stallTurn(schedule, stallSpeed) {
  return schedule.find(t => t.speed <= num(stallSpeed))?.turn ?? null;
}

/** Flight Maneuvers Table (p.82): what fraction of the INITIAL fuel capacity remains. Not helicopters, zeppelins, LAVs. */
export const FLIGHT_MANEUVERS = {
  stolTakeoff: { label: "STOL takeoff", m: 0.8, overLoad: 0.7 },
  stolLanding: { label: "STOL landing", m: 0.9 },
  vstolTakeoff: { label: "VSTOL takeoff", m: 0.7, overLoad: 0.55 },
  vstolLanding: { label: "VSTOL landing", m: 0.85 },
  vtolTakeoff: { label: "VTOL takeoff", m: 0.6, overLoad: 0.4, overLoadTiltWing: true },
  vtolLanding: { label: "VTOL landing (tilt-wing aircraft)", m: 0.8, tiltWingOnly: true }
};
/** Fuel a maneuver consumes (6a.1, a stated reading): fuelSize × (1 − multiplier), the same quantity at any fill. */
export function maneuverFuel(fuelSize, key, { overLoad = false, tiltWing = false } = {}) {
  const f = FLIGHT_MANEUVERS[key];
  if (!f || (f.tiltWingOnly && !tiltWing)) return null;
  const m = overLoad && f.overLoad != null && (!f.overLoadTiltWing || tiltWing) ? f.overLoad : f.m;
  return Math.round(num(fuelSize) * (1 - m) * 1000) / 1000;
}

/** Fuel Grade Effects Table (p.83): cheap / regular / premium, or a custom ± Acceleration (±2 % Maintenance and ±1 %
 *  Economy per point; more than ±5 is against the rule of thumb). */
export function fuelGradeEffects(grade = "regular", custom = 0) {
  if (grade === "cheap") return { maintenance: 0.95, acceleration: -2, economy: 0.9, warning: "" };
  if (grade === "premium") return { maintenance: 1.05, acceleration: 2, economy: 1.1, warning: "" };
  if (grade === "custom") {
    const n = Math.trunc(num(custom));
    return { maintenance: Math.round((1 + 0.02 * n) * 1000) / 1000, acceleration: n, economy: Math.round((1 + 0.01 * n) * 1000) / 1000,
      warning: Math.abs(n) > 5 ? "custom fuel grades shouldn't change Acceleration by more than 5 (p.83)" : "" };
  }
  return { maintenance: 1, acceleration: 0, economy: 1, warning: "" };
}
