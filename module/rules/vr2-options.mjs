// VR2.0 optional rule "Utility Options" (pp.102–104) and programming (pp.100–102): pure math, no Foundry.
// docs/PLAN-vr2-part5b.md. Book examples are pinned in test/vr2-options.test.mjs.
import { programSize, matrixProgramMultiplierVR2 } from "./sr2e-rules.mjs";

/**
 * The options (pp.103–104). `mod`: the rating modifier — a number, "rating" (+ the option's own rating), or 0 for
 * the special ones; `actual`/`design`: the percentage factors applied to the sizes; `designOnly`: squeeze's +1
 * counts for the design size only.
 */
export const UTILITY_OPTION_KINDS = {
  area:         { mod: "rating", rated: true },
  chaser:       { mod: 1 },
  dinab:        { mod: "rating", rated: true },
  limit:        { mod: -1 },
  oneShot:      { mod: 0, actual: 0.25, design: 1.5 },
  optimization: { mod: 0, actual: 0.5, design: 2 },
  penetration:  { mod: 1 },
  sensitive:    { mod: 0, actual: 0.25, design: 1.5 },
  skulk:        { mod: "rating", rated: true },
  squeeze:      { mod: 1, designOnly: true },
  targeting:    { mod: 2 }
};

const OPERATIONAL = ["dinab", "oneShot", "optimization", "squeeze"];
/** Which options each utility may carry (its entry, pp.96–100). Keys: lower-case utility names. */
export const UTILITY_OPTIONS = {
  analyze: OPERATIONAL, browse: OPERATIONAL, commlink: OPERATIONAL, crash: OPERATIONAL, defuse: OPERATIONAL,
  deception: OPERATIONAL, decrypt: OPERATIONAL, disinfect: OPERATIONAL, evaluate: OPERATIONAL, mirrors: OPERATIONAL,
  "read/write": OPERATIONAL, relocate: OPERATIONAL, scanner: OPERATIONAL, spoof: OPERATIONAL, validate: OPERATIONAL,
  attack: ["area", "chaser", "dinab", "limit", "oneShot", "optimization", "penetration", "skulk", "targeting"],
  "black hammer": ["oneShot", "optimization", "targeting"], killjoy: ["oneShot", "optimization", "targeting"],
  hog: ["dinab", "oneShot", "optimization", "targeting"],
  poison: ["area", "dinab", "oneShot", "optimization", "targeting"], restrict: ["area", "dinab", "oneShot", "optimization", "targeting"],
  reveal: ["area", "dinab", "oneShot", "optimization", "targeting"], slow: ["area", "dinab", "oneShot", "optimization", "targeting"],
  steamroller: ["dinab", "oneShot", "optimization", "targeting"],
  armor: ["optimization"], shield: ["optimization"], camo: ["oneShot", "optimization"], cloak: ["oneShot", "optimization"],
  "lock-on": ["oneShot", "optimization"], medic: ["dinab", "optimization"], restore: ["dinab", "oneShot", "optimization"],
  compressor: [], sleaze: [], track: []
};

/** The utility a program name is (the longest matching prefix), or "" (a program the table doesn't know). */
export function utilityOf(name) {
  const n = String(name ?? "").toLowerCase().trim();
  return Object.keys(UTILITY_OPTIONS).filter(k => n.startsWith(k)).sort((a, b) => b.length - a.length)[0] ?? "";
}

/**
 * The options that take effect: allowed for this utility, rated ones with a rating 1..base rating, each kind once,
 * and never chaser together with penetration (p.103–104: both inert then). `unknown` utilities allow nothing.
 * @returns {{ active: {kind, rating}[], inert: {kind, rating, why}[] }}
 */
export function activeOptions(utility, baseRating, options = []) {
  const allowed = new Set(UTILITY_OPTIONS[utility] ?? []);
  const active = [], inert = [], seen = new Set();
  for (const o of options) {
    const def = UTILITY_OPTION_KINDS[o?.kind];
    const r = Math.floor(Number(o?.rating) || 0);
    let why = !def ? "unknown option" : !allowed.has(o.kind) ? "not an option of this utility"
      : seen.has(o.kind) ? "taken twice" : def.rated && (r < 1 || r > baseRating) ? `rating must be 1–${baseRating}` : "";
    if (why) { inert.push({ ...o, why }); continue; }
    seen.add(o.kind);
    active.push({ kind: o.kind, rating: def.rated ? r : 0 });
  }
  if (seen.has("chaser") && seen.has("penetration")) {
    for (const k of ["chaser", "penetration"]) {
      const i = active.findIndex(a => a.kind === k);
      inert.push({ ...active[i], why: "chaser and penetration can't share a utility" });
      active.splice(i, 1);
    }
  }
  return { active, inert };
}

const modOf = (o) => { const d = UTILITY_OPTION_KINDS[o.kind]; return d.mod === "rating" ? o.rating : d.mod; };

/**
 * Sizes and price with options (p.103): rating modifiers first (squeeze's only on the design side), below 1 → 1,
 * size = rating² × multiplier, then the percentage changes in order; price = design size × the BASE rating's band
 * (p.107). With no active options this is exactly `programSize` / `programCostVR2`.
 */
export function programSizes({ rating, multiplier, options = [] }) {
  const base = Math.max(1, Math.floor(Number(rating) || 1));
  const mods = options.reduce((n, o) => n + (UTILITY_OPTION_KINDS[o.kind].designOnly ? 0 : modOf(o)), 0);
  const designMods = options.reduce((n, o) => n + modOf(o), 0);
  const effective = Math.max(1, base + mods), designRating = Math.max(1, base + designMods);
  let actual = programSize(effective, multiplier), design = programSize(designRating, multiplier);
  for (const o of options) {
    const d = UTILITY_OPTION_KINDS[o.kind];
    if (d.actual) actual = Math.ceil(actual * d.actual);
    if (d.design) design = Math.ceil(design * d.design);
  }
  return { effective, designRating, actual, design, price: design * matrixProgramMultiplierVR2(base) };
}

/**
 * The shield/shift term of an attack's TN against IC (p.50, p.103–104; user rulings): shield/shift +2;
 * chaser negates shift's and adds +2 against shield; penetration defeats shield and adds +2 against shift.
 */
export function defenseTN(defense, kinds = []) {
  const has = (k) => kinds.includes(k);
  if (defense === "shield") return has("penetration") ? 0 : 2 + (has("chaser") ? 2 : 0);
  if (defense === "shift") return has("chaser") ? 0 : 2 + (has("penetration") ? 2 : 0);
  return 0;
}

/** Area (p.103): each target's TN rises by the number of targets. */
export const areaTN = (tn, targets) => (Number(tn) || 0) + Math.max(1, Number(targets) || 1);
/** Skulk (p.104): the tally from crashing IC, less the Skulk rating. */
export const skulkTally = (rating, skulk) => Math.max(0, (Number(rating) || 0) - (Number(skulk) || 0));

// ── Programming (pp.100–102) ────────────────────────────────────────────────────

/** Tools (Programming Tools table, p.102): task bonus each; the shop doubles memory, the suite needs a mainframe. */
export const PROGRAMMING_TOOLS = {
  doubleMemory: { bonus: 1, label: "Double the required memory" },
  kit: { bonus: 1, label: "Programming kit (1,500¥)" },
  shop: { bonus: 2, label: "Programming shop (15,000¥)" },
  mainframe: { bonus: 4, label: "Mainframe host" },
  suite: { bonus: 1, label: "Mainframe programming suite" }
};
/**
 * A programmer's task bonus from their tools (p.101–102). PC tools and a mainframe never mix ("kits and shops can
 * be used only on personal computers"); a shop is the bigger kit (+2, not +1 +2); doubled memory +1 on top
 * ("+3 (+1 for doubled memory, +2 for shop)"). The suite adds +1 to the mainframe's +4.
 */
export function toolBonus(tools = {}) {
  if (tools.mainframe) return 4 + (tools.suite ? 1 : 0);
  return (tools.doubleMemory ? 1 : 0) + (tools.shop ? 2 : tools.kit ? 1 : 0);
}
/** Base time (p.100): design size × 2 days. */
export const baseTime = (designSize) => Math.max(1, Number(designSize) || 1) * 2;
/** The task period (p.100–101): base time ÷ the Computer Test's successes (null: no successes, no task). Rounded up. */
export const taskPeriod = (base, successes) => successes > 0 ? Math.ceil(base / successes) : null;
/** Days of work against the period (p.101–102): each day is worth 1 + the task bonus. */
export const workDone = (days, bonus = 0) => Math.max(0, Number(days) || 0) * (1 + Math.max(0, Number(bonus) || 0));
/**
 * A team (p.102): size ≤ ⌊highest Computer ÷ 2⌋; max rating = highest + 1; the test uses the average skill rounded up;
 * the team bonus = Σ bonuses − the number of programmers (never below 0).
 */
export function teamTerms(skills = [], bonuses = []) {
  const top = Math.max(0, ...skills.map(Number));
  return { maxSize: Math.floor(top / 2), maxRating: top + 1,
    skill: skills.length ? Math.ceil(skills.reduce((n, s) => n + Number(s), 0) / skills.length) : 0,
    bonus: Math.max(0, bonuses.reduce((n, b) => n + Number(b), 0) - skills.length) };
}
/** A mainframe's Security Value must be at least half the program's rating (p.101). */
export const mainframeAdequate = (sv, rating) => (Number(sv) || 0) * 2 >= (Number(rating) || 0);
