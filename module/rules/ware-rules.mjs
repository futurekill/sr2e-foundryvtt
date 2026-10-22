/**
 * Cybereyes, bioware with cyberware, and the optional social penalties
 * (docs/PLAN-cybertechnology-phase3b.md; Cybertechnology pp.45, 56–58). Pure: no Foundry.
 * Item identity comes from `flags.sr2e.rule`, then known compendium sources; never names.
 */
import { limbModel, forLimbRules, SIDED } from "./limb-rules.mjs";

const SYS = (id) => `Compendium.sr2e.cyberware.Item.${id}`;
const ST = (pack, id) => `Compendium.sr2e-shadowtech.${pack}.Item.${id}`;
const CT = (pack, id) => `Compendium.sr2e-cybertechnology.${pack}.Item.${id}`;
const of = (key, ...uuids) => uuids.map(u => [u, key]);
/** Known compendium items by source uuid. */
export const WARE_SOURCES = Object.fromEntries([
  ...of("adrenal-pump", ST("st-bioware", "acc48cba2abcfb40")),
  ...of("suprathyroid", ST("st-bioware", "fc58c133d4a51a68")),
  ...of("enhanced-articulation", ST("st-bioware", "339597bae36eceb8")),
  ...of("muscle-augmentation", ST("st-bioware", "f29c412ec9f800eb")),
  ...of("muscle-replacement", SYS("c1a2b3d4e5f60789"), SYS("c2b3c4e5f6a70890"), SYS("c3c4d5f6a7b80901"), SYS("c4d5e6a7b8c90a12"),
    CT("ct-bodyware", "eaf2a954ca2065bc"), CT("ct-bodyware", "ea48feece9ae69f5"), CT("ct-bodyware", "739128fcaa4c25b0"), CT("ct-bodyware", "3f59cc7fb97172c0")),
  ...of("cybereye-pair", SYS("wl7u7gj9e000jvwv"), CT("ct-headware", "c34224fc4f8bcecb")),
  ...of("wired-reflexes:1", SYS("id4a6kszemfkdbut")), ...of("wired-reflexes:2", SYS("b1e2d3c4f5a60718")),
  ...of("wired-reflexes:3", SYS("c2f3e4d5a6b70829")),
  ...of("boosted-reflexes", CT("ct-bodyware", "05d72dfda3f7eafd"), CT("ct-bodyware", "ff4e73ebf199c7c8"), CT("ct-bodyware", "549bc17b121c5c9c")),
  ...of("synaptic-accelerator", ST("st-bioware", "abf83fc461cdb66a")),
  ...of("dermal-plating", SYS("7tuo7vbiqlcdsia6"), SYS("d3a4b5c6e7f80931"), SYS("e4b5c6d7f8a90a42")),
  ...of("cyberear", SYS("3d89febv0ted2kon")),
  ...of("comm-headware", SYS("17d0945110b4cb33"), SYS("b2cc43aa6248a93b"), SYS("399qebdkfbz9i75m"), SYS("ebujgdogforfeqen"),
    ...["bcf6634f8d183c65", "0e2a4d29461c41a8", "68e658d6b72a62b8", "cde8e55950028420", "1b0b6f5f2aaa4286", "e3caae71f62f4900",
      "842ab9ef6cf2bcb9", "d4d209097e89fb53", "ba35beabd41162b8", "442b3110dca81095", "2b8b037fdc69b930"].map(id => CT("ct-headware", id))),
  ...of("datajack", SYS("b59ff8773d6c2f11"), CT("ct-matrixware", "41fb1314fbfcd8c0"), CT("ct-matrixware", "2298c394b579eb3f"),
    ST("st-cyberware", "b71df0e525220f05"))
]);
export const MUSCLE = new Set(["muscle-replacement", "muscle-augmentation"]);
/** Reaction/Initiative enhancers move-by-wire is "not compatible" with (Cybertechnology p.39). */
export const isReflexEnhancer = (rule) => /^(wired-reflexes|boosted-reflexes|reaction-enhancer|synaptic-accelerator|adrenal-pump|suprathyroid)(:|$)/.test(rule ?? "");

/** The item's rule key: its rule flag, the legacy adrenal-pump flag, or its known source. */
export function wareRule(flags = {}, source = null) {
  const r = flags?.sr2e?.rule;
  if (typeof r === "string" && r && !r.startsWith("limb")) return r;
  if (flags?.sr2e?.adrenalPump) return "adrenal-pump";
  return (source && WARE_SOURCES[source]) || null;
}

// --- The physical limb model (source-only) ---------------------------------------

/**
 * Installed limbs regardless of implant failure, over PLAIN sources
 * ({id, name, installed, system, flags, source}: no prepared getters, no markers),
 * so it can't recurse into cost derivation.
 */
export function physicalLimbs(sources = []) {
  return limbModel(sources.filter(s => s.type === undefined || s.type === "cyberware"));
}
/** Plain SOURCE views of a document's cyberware, for physicalLimbs (no prepared getters). */
export const sourcesOf = (items = []) => [...items].filter(i => i.type === "cyberware").map(i => ({
  id: i.id, name: i.name, installed: !!i._source?.system?.installed, system: i._source?.system ?? {},
  flags: i.flags ?? {}, source: i._stats?.compendiumSource ?? i.flags?.core?.sourceId ?? null }));
const eligible = (model) => (model?.limbs ?? []).filter(forLimbRules);
/** Eligible FULL cyberarms/legs (the muscle discount's n). */
export const fullCyberlimbs = (model) => eligible(model).filter(l => l.type === "arm" || l.type === "leg").length;

/** Muscle Essence/Body Cost and price factor: −20% per full cyberlimb (p.57). */
export const muscleFactor = (n) => Math.round((1 - 0.2 * Math.min(4, Math.max(0, n || 0))) * 100) / 100;
export const ceil2 = (n) => Math.ceil(n * 100 - 1e-9) / 100;

/**
 * Adrenal pump / suprathyroid efficiency (p.56–57): 15% per full limb, 10% per lower
 * limb, 5% per hand/foot, 20% for a torso, +50% for a Reaction Enhancer (pump only),
 * floored at 0. The suprathyroid counts only major replacements (user ruling).
 */
export function pumpEfficiency(model, { enhancer = false, major = false, mbw = false } = {}) {
  if (mbw) return 0;   // pumps "do not function in conjunction with move-by-wire" (p.56–57)
  let off = 0;
  for (const l of eligible(model)) {
    if (l.type === "arm" || l.type === "leg") off += 15;
    else if (l.type === "torso") off += 20;
    else if (major) continue;
    else if (l.type === "forearm" || l.type === "lowerLeg") off += 10;
    else if (l.type === "hand" || l.type === "foot") off += 5;
  }
  if (enhancer && !major) off += 50;
  return Math.max(0, 100 - off) / 100;
}

/**
 * Limb positions (side × arm/leg family) holding an eligible cyber part, for enhanced
 * articulation (p.56). Unknown sides aren't guessed: they're counted separately.
 */
export function cyberPositions(model) {
  const known = new Set();
  let unknown = 0;
  for (const l of eligible(model)) {
    if (!SIDED.has(l.type)) continue;
    if (l.side !== "left" && l.side !== "right") { unknown++; continue; }
    known.add(`${l.side}.${["arm", "forearm", "hand"].includes(l.type) ? "arm" : "leg"}`);
  }
  return { count: known.size, unknown };
}

/**
 * The pricing context an item needs (`itemBaseCost`'s ctx): its ware rule, and for a
 * muscle item on a character, the full cyberlimbs from the actor's SOURCE items.
 */
export function wareCtx(items, doc, isCharacter = true) {
  const r = wareRule(doc?.flags, doc?._stats?.compendiumSource ?? doc?.flags?.core?.sourceId ?? null);
  const ctx = { wareRule: r };
  if (MUSCLE.has(r) && isCharacter) ctx.fullCyberlimbs = fullCyberlimbs(physicalLimbs(sourcesOf(items)));
  return ctx;
}

// --- Cybereyes (p.45) ----------------------------------------------------------------

/**
 * A container's base Essence (before surgery). `grade` is a grading function
 * (gradeEssenceCost bound to the grade). Graded cybereyes take the grade BEFORE the
 * allowance (p.45); everything else keeps grade(base + over).
 */
export function containerEssence({ base, rows, capacity, eyes = "pair", isEye = false, graded = false }, grade) {
  const single = isEye && eyes === "single";
  const b = single ? 0.1 : base;
  const allow = single ? capacity * 0.5 : capacity;
  if (isEye && graded) {
    const gr = rows > 0 ? grade(rows) : 0;
    return grade(b) + Math.max(0, Math.round((gr - allow) * 100) / 100);
  }
  return grade(b + Math.max(0, Math.round((rows - allow) * 100) / 100));
}

/** Eye problems (reports, never blocks): the 1.2 cap, weapon slots, unclassified rows. */
export function eyeReports({ rows = [], eyes = "pair" }) {
  const out = [];
  const total = rows.reduce((t, r) => t + (r.essenceCost ?? 0), 0);
  if (eyes === "pair" && total > 1.2 + 1e-9) out.push(`accessories total ${Math.round(total * 100) / 100} Essence, over the 1.2 a pair can hold (p.45)`);
  const eyesOf = (r) => eyes === "single" ? ["one"] : r.eye === "left" || r.eye === "right" ? [r.eye] : ["left", "right"];
  for (const e of eyes === "single" ? ["one"] : ["left", "right"]) {
    const here = rows.filter(r => eyesOf(r).includes(e));
    const arms = here.filter(r => r.kind === "weapon" || r.kind === "toolLaser");
    const where = e === "one" ? "the eye" : `the ${e} eye`;
    if (arms.length > 1) out.push(`${where} holds ${arms.length} weapons or tool lasers; one per eye (p.45)`);
    if (arms.length && here.some(r => r.kind === "camera")) out.push(`${where} has a camera, so no weapon or tool laser fits (p.45)`);
  }
  if (eyes === "pair") for (const r of rows) {
    if ((r.kind === "weapon" || r.kind === "toolLaser") && r.eye !== "left" && r.eye !== "right") out.push(`${r.name || "a weapon row"}: set which eye it's in`);
  }
  const blank = rows.filter(r => !r.kind).length;
  if (blank) out.push(`${blank} row(s) unclassified: set Weapon / Tool laser / Camera so the slot rules can check them`);
  return out;
}

// --- Social (p.57–58, optional) ------------------------------------------------------

const EPS = 1e-9;
/** +1 per 2 points of Essence (or portion) lost, beyond the first .5 (user ruling). */
export const socialTN = (loss) => loss > 0.5 + EPS ? Math.ceil(loss / 2 - EPS) : 0;

/**
 * `items`: installed cyberware as {essence, visibility} where visibility is the
 * RESOLVED value (normal / hidden / ignored / flagrant). Returns both losses and TNs.
 */
export function socialModifiers(items = []) {
  let visibleLoss = 0, totalLoss = 0, flagrant = false;
  for (const i of items) {
    if (i.visibility === "ignored") continue;
    totalLoss += i.essence;
    if (i.visibility !== "hidden") visibleLoss += i.essence;
    if (i.visibility === "flagrant") flagrant = true;
  }
  const situationTN = Math.max(socialTN(visibleLoss) + (flagrant ? 1 : 0), totalLoss > 3 + EPS ? 1 : 0);
  return { visibleLoss, totalLoss, situationTN, contactTN: socialTN(totalLoss), checkContacts: totalLoss > 0.5 + EPS };
}

/** The Contact Reactions Table (p.58). */
export function contactReaction(successes) {
  const n = Math.max(0, successes | 0);
  if (n >= 4) return { key: "unaffected", text: "Contact remains unaffected.", tnPlus: 0 };
  if (n === 3) return { key: "aloof", text: "Contact is slightly aloof or cold.", tnPlus: 0 };
  if (n === 2) return { key: "avoids", text: "Contact initially attempts to avoid the runner.", tnPlus: 1 };
  if (n === 1) return { key: "avoidsAlways", text: "Contact consistently attempts to avoid the runner, without going to excessive lengths.", tnPlus: 1 };
  return { key: "shuns", text: "Contact shuns the runner and refuses to help unless coerced.", tnPlus: 0 };
}
