// VR2.0 optional rule "Utility Options" (pp.102–104) and programming (pp.100–102): pure math, no Foundry.
// docs/PLAN-vr2-part5b.md. Book examples are pinned in test/vr2-options.test.mjs.
import { matrixProgramMultiplierVR2, attackMultiplier } from "./sr2e-rules.mjs";

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
/**
 * Which options each utility may carry (its entry, pp.96–100), keyed by the utility's id — the same ids as
 * vr2.mjs `utilityKindOf` (blackHammer…) and `offenseOf` (poison…), so every caller asks one identity.
 */
export const UTILITY_OPTIONS = {
  analyze: OPERATIONAL, browse: OPERATIONAL, commlink: OPERATIONAL, crash: OPERATIONAL, defuse: OPERATIONAL,
  deception: OPERATIONAL, decrypt: OPERATIONAL, disinfect: OPERATIONAL, evaluate: OPERATIONAL, mirrors: OPERATIONAL,
  readWrite: OPERATIONAL, relocate: OPERATIONAL, scanner: OPERATIONAL, spoof: OPERATIONAL, validate: OPERATIONAL,
  attack: ["area", "chaser", "dinab", "limit", "oneShot", "optimization", "penetration", "skulk", "targeting"],
  blackHammer: ["oneShot", "optimization", "targeting"], killjoy: ["oneShot", "optimization", "targeting"],
  hog: ["dinab", "oneShot", "optimization", "targeting"],
  poison: ["area", "dinab", "oneShot", "optimization", "targeting"], restrict: ["area", "dinab", "oneShot", "optimization", "targeting"],
  reveal: ["area", "dinab", "oneShot", "optimization", "targeting"], slow: ["area", "dinab", "oneShot", "optimization", "targeting"],
  steamroller: ["dinab", "oneShot", "optimization", "targeting"],
  armor: ["optimization"], shield: ["optimization"], camo: ["oneShot", "optimization"], cloak: ["oneShot", "optimization"],
  lockOn: ["oneShot", "optimization"], medic: ["dinab", "optimization"], restore: ["dinab", "oneShot", "optimization"],
  compressor: [], sleaze: [], track: [],
  // Part 6a-1 (p.105): "Frame cores may be equipped with … DINAB, optimization, and squeeze" — a closed list.
  frameCore: ["dinab", "optimization", "squeeze"]
};
const NAME_IDS = { "black hammer": "blackHammer", "read/write": "readWrite", "lock-on": "lockOn" };

/** The utility id a program name starts with (the longest match), or "" (a program the table doesn't know). */
export function utilityOf(name) {
  const n = String(name ?? "").toLowerCase().trim();
  const ids = Object.keys(UTILITY_OPTIONS).map(id => [Object.keys(NAME_IDS).find(k => NAME_IDS[k] === id) ?? id.toLowerCase(), id]);
  return ids.filter(([prefix]) => n.startsWith(prefix)).sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? "";
}

/** Limit's target types (p.104). */
export const LIMIT_TARGETS = { decker: "Deckers", ic: "IC programs", frame: "Frames", sk: "SKs" };
/** May a program with these active options act against `targetType` (decker | ic)? */
export const limitAllows = (active = [], targetType) => active.every(o => o.kind !== "limit" || o.target === targetType);

/**
 * The options that take effect: allowed for this utility, rated ones with a rating 1..base rating, each kind once,
 * and never chaser together with penetration (p.103–104: both inert then). `unknown` utilities allow nothing.
 * @returns {{ active: {kind, rating, i}[], inert: {kind, rating, i, why}[] }} (`i`: the row's index)
 */
export function activeOptions(utility, baseRating, options = []) {
  // Sensitive is allowed on every utility: no entry lists it and its text speaks of "programs" (plan 5b Risks).
  // A frame core's list is closed (p.105), and its DINAB is capped by the programmer's Computer, not the Core
  // Rating (p.106; part 6a-1 R1 #1): checked when the core is written.
  const core = utility === "frameCore";
  const allowed = new Set(UTILITY_OPTIONS[utility] ? [...UTILITY_OPTIONS[utility], ...(core ? [] : ["sensitive"])] : []);
  const active = [], inert = [], seen = new Set();
  for (const [i, o] of options.entries()) {
    const def = UTILITY_OPTION_KINDS[o?.kind];
    const r = Math.floor(Number(o?.rating) || 0);
    let why = !def ? "unknown option" : !allowed.has(o.kind) ? "not an option of this utility"
      : seen.has(o.kind) ? "taken twice" : def.rated && (r < 1 || (r > baseRating && !(core && o.kind === "dinab"))) ? `rating must be 1–${baseRating}`
      : o.kind === "limit" && !LIMIT_TARGETS[o.target] ? "pick the one target type" : "";
    if (why) { inert.push({ ...o, i, why }); continue; }
    seen.add(o.kind);
    active.push({ kind: o.kind, rating: def.rated ? r : 0, i, ...(o.kind === "limit" ? { target: o.target } : {}) });
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
 * size = rating² × multiplier, then the percentage changes (multiplied together, rounded up ONCE so the order of
 * the options never matters); price = design size × the BASE rating's band
 * (p.107). With no active options this is exactly `programSize` / `programCostVR2`.
 */
export function programSizes({ rating, multiplier, options = [] }) {
  const base = Math.max(1, Math.floor(Number(rating) || 1));
  const mods = options.reduce((n, o) => n + (UTILITY_OPTION_KINDS[o.kind].designOnly ? 0 : modOf(o)), 0);
  const designMods = options.reduce((n, o) => n + modOf(o), 0);
  const effective = Math.max(1, base + mods), designRating = Math.max(1, base + designMods);
  const factor = (k) => options.reduce((f, o) => f * (UTILITY_OPTION_KINDS[o.kind][k] ?? 1), 1);
  // Rating² × multiplier × every factor, rounded up ONCE (a fractional multiplier mustn't round twice; code R3 #1).
  // No factors → Math.ceil(r² × m) = `programSize`.
  const sized = (r, k) => Math.ceil(r * r * (Number(multiplier) || 0) * factor(k));
  const actual = sized(effective, "actual"), design = sized(designRating, "design");
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

/**
 * The highest base rating a programmer (or team) may write (p.101–102): their Computer skill; a team's highest + 1;
 * Black Hammer and Killjoy ⌈skill ÷ 2⌉ (p.98) — for a team ⌈highest ÷ 2⌉, the team's +1 doesn't lift it.
 */
export function programmingCap(utility, skills = []) {
  const top = Math.max(0, ...skills.map(Number));
  if (utility === "blackHammer" || utility === "killjoy") return Math.ceil(top / 2);
  // A frame core (p.105): "Core Ratings may not exceed the programmer's Computer Skill × 1.5 (round fractions down)";
  // a team's +1 doesn't lift it.
  if (utility === "frameCore") return Math.floor(top * 1.5);
  return skills.length > 1 ? top + 1 : top;
}
/** Sensitive (p.104): the programming test uses the average of Computer and Computer/Matrix Theory, rounded up. */
export const sensitiveSkill = (computer, theory) => Math.ceil(((Number(computer) || 0) + (Number(theory) || 0)) / 2);

/**
 * Programming lifecycle (plan 5b §4, Codex R3–R5): an append-only log of durable records on the program item, folded.
 * Nothing is overwritten, and every id that must be unique is one the server arbitrates:
 *   prog:new                 {type: "progNew"}             a project never written (created WITH the item)
 *   prog:start:<n>           {type: "progStart", gen: n, testMessageId, design, designSize, baseTime, team}
 *                            n = the previous start's + 1: two devices starting at once collide, one is refused;
 *                            order is causal (n), never a clock
 *   prog:log:<n>:<id>        {type: "progLog", task: n, days, bonus}
 *   prog:frozen:<n>          {type: "progFrozen", task: n, successes}   the test's FINAL successes, recorded once
 *   prog:end:<n>             {type: "progEnd", task: n, outcome}        ONE per task: complete | abandon
 * Once frozen, the period is `baseTime ÷` the recorded successes, never the chat card (which may change or be deleted),
 * so a failed task stays failed and a period never moves. No successes = a failed task. Usable: a new project starts unusable; a completed task makes it usable; an abandoned
 * or failed one leaves it as it was. The latest start is the current task.
 */
export function foldProgramming(records = [], prefix = "prog:") {
  // Part 6a-1: frame loading is the same lifecycle under "load:" (its end record carries the load's payload).
  const recs = records.filter(r => String(r.key ?? "").startsWith(prefix));
  const starts = recs.filter(r => r.type === "progStart" && Number.isInteger(r.gen)).sort((a, b) => a.gen - b.gen);
  const tasks = {};
  for (const r of starts) tasks[r.gen] = { ...r, task: r.gen, log: {}, frozen: false, successes: null, period: null, end: null };
  for (const r of recs) {
    const t = tasks[r.task];
    if (!t) continue;
    if (r.type === "progLog") t.log[r.key] = { days: r.days, bonus: r.bonus };
    else if (r.type === "progFrozen") { t.frozen = true; t.successes = r.successes ?? 0; }
    else if (r.type === "progEnd") { t.end = r.outcome; if (r.payload) t.payload = r.payload; }
  }
  let usable = !recs.some(r => r.type === "progNew");
  for (const r of starts) {
    const t = tasks[r.gen];
    if (t.frozen) {
      t.period = taskPeriod(t.baseTime, t.successes);
      if (t.period == null && !t.end) t.end = "fail";
    }
    t.complete = t.end === "complete";
    if (t.complete) usable = true;
  }
  const task = starts.length ? tasks[starts.at(-1).gen] : null;
  const writing = !!task && !task.end;
  // Upgrading (VR2.0 p.107): the current version keeps working while its upgrade is written. A completed WRITING task
  // (not an upgrade) means the decker has the source code.
  const sourced = starts.some(r => tasks[r.gen].complete && !r.upgrade);
  return { tasks, current: task?.task ?? null, task, nextGen: (task?.task ?? 0) + 1, writing,
    unfinished: (writing && !task.upgrade) || !usable, sourced };
}

/**
 * Everything a program's data derives from its authored fields (part 6a-1 R1 #5): the size multiplier (an attack's
 * Damage Level, p.98; a frame core's dumb 2 / smart 3, p.105), its utility id, its options and sizes. ONE function for
 * a program item and for a loaded copy's snapshot, so the two can never disagree.
 * @param {string} name
 * @param {object} system the authored system data (rating, multiplier, damageLevel, offense, options, frameCore)
 * @param {{vr2: boolean, optionsOn: boolean}} mode
 */
export function deriveProgram(name, system = {}, { vr2 = false, optionsOn = false } = {}) {
  const kind = vr2 ? system.frameCore?.kind || "" : "";
  const core = !!kind;
  const multiplier = core ? (kind === "smart" ? 3 : 2) : (vr2 ? attackMultiplier(system.damageLevel ?? "") : null) ?? system.multiplier ?? 1;
  const utility = core ? "frameCore" : (system.offense || utilityOf(name));
  // A core's options are frame rules, under VR2.0 whatever the optional Utility Options setting (R1 #2).
  const opts = optionsOn || core ? activeOptions(utility, system.rating ?? 1, system.options ?? []) : { active: [], inert: [] };
  const sized = programSizes({ rating: system.rating ?? 1, multiplier, options: opts.active });
  return { multiplier, utility, activeOpts: opts.active, inertOpts: opts.inert, size: sized.actual, designSize: sized.design };
}
