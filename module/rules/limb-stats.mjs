/**
 * The cyberlimb RULES (docs/PLAN-cybertechnology-phase3.md; Cybertechnology pp.30–31,
 * 49–52). Pure: no Foundry. Everything reads the Phase 2 model (`limbModel`) and its
 * eligibility predicates, never item names.
 */
import { forSideRules, forLimbRules } from "./limb-rules.mjs";

export const PARTIAL = new Set(["hand", "foot", "forearm", "lowerLeg"]);
const ENHANCE = ["strength", "quickness", "body"];
const POSITIONS = [["arm", "left"], ["arm", "right"], ["leg", "left"], ["leg", "right"]];
const r2 = (n) => Math.round(n * 100) / 100;
const ceil2 = (n) => Math.ceil(n * 100 - 1e-9) / 100;
const floor2 = (n) => Math.floor(n * 100 + 1e-9) / 100;

/**
 * The ONE counted option per (limb, Strength/Quickness) and per pair (Body), and every
 * rejected duplicate (p.31 items are fixed variants carrying their own tiers). Shared by
 * stats, Essence, pricing and the report.
 */
export function selectOptions(model) {
  const counted = new Set(), rejected = [], perLimb = new Map(), perPair = new Map();
  const better = (a, b) => (b.rating ?? 0) > (a.rating ?? 0) ? b : a;
  for (const l of model.limbs) {
    if (!forLimbRules(l)) continue;
    const pick = {};
    for (const o of l.options) {
      if (o.kind !== "strength" && o.kind !== "quickness") continue;
      pick[o.kind] = pick[o.kind] ? better(pick[o.kind], o) : o;
    }
    perLimb.set(l.id, pick);
    for (const o of l.options) {
      if (o.kind !== "strength" && o.kind !== "quickness") continue;
      if (pick[o.kind] === o) counted.add(o.id);
      else rejected.push({ id: o.id, limbId: l.id, reason: `only one ${o.kind} enhancement per limb counts; it still costs its Essence` });
    }
  }
  for (const p of pairs(model)) {
    const bodies = [p.left, p.right].flatMap(l => l.options.filter(o => o.kind === "body"));
    const pick = bodies.reduce((a, b) => (a ? better(a, b) : b), null);
    if (pick) { perPair.set(p.family, pick); counted.add(pick.id); }
    for (const o of bodies) if (o !== pick) rejected.push({ id: o.id, reason: "only one Body enhancement per pair counts; it still costs its Essence" });
  }
  // A Body enhancement outside a complete pair gives nothing (p.51: pairs only).
  const inPair = new Set(pairs(model).flatMap(p => [p.left.id, p.right.id]));
  for (const l of model.limbs) for (const o of l.options) {
    if (o.kind === "body" && !inPair.has(l.id)) rejected.push({ id: o.id, limbId: l.id, reason: "Body enhancements work only on a complete pair of full cyberarms or cyberlegs" });
  }
  return { counted, rejected, perLimb, perPair };
}

/** Complete pairs of FULL cyberarms / cyberlegs: one left, one right, both side-eligible. */
export function pairs(model) {
  const out = [];
  for (const family of ["arm", "leg"]) {
    const full = model.limbs.filter(l => l.type === family && forSideRules(l));
    const left = full.find(l => l.side === "left"), right = full.find(l => l.side === "right");
    if (left && right) out.push({ family, left, right });
  }
  return out;
}

/**
 * The limb rules over the model. `ctx`:
 *   naturalStrength / naturalQuickness — the actor's computed values (a natural limb);
 *   reactionExemptQuickness — Muscle Replacement's Quickness, excluded from Reaction;
 *   naturalBody — unaugmented Body (the Strength cap);
 *   quicknessCapBase — natural Quickness incl. bioware (the Quickness cap);
 *   troll — a troll's cyberlimb has base Strength 8 (p.51).
 * Returns neutral values when nothing applies (the reset contract).
 */
export function limbStats(model, ctx = {}) {
  const sel = selectOptions(model);
  const nS = ctx.naturalStrength ?? 0, nQ = ctx.naturalQuickness ?? 0;
  const nQr = nQ - (ctx.reactionExemptQuickness ?? 0);
  const base = ctx.troll ? 8 : 3;
  const positions = POSITIONS.map(([family, side]) => {
    const l = model.limbs.find(x => x.type === family && x.side === side && forSideRules(x));
    if (!l) return { key: `${family}.${side}`, family, side, cyber: false, strength: nS, quickness: nQ, quicknessR: nQr };
    const pick = sel.perLimb.get(l.id) ?? {};
    const q = pick.quickness?.rating ?? 0;
    return { key: `${family}.${side}`, family, side, cyber: true, limbId: l.id, name: l.name,
      strength: base + (pick.strength?.rating ?? 0), quickness: nQ + q, quicknessR: nQr + q };
  });
  const anyCyber = positions.some(p => p.cyber);
  const avg = (k) => Math.floor(positions.reduce((t, p) => t + p[k], 0) / 4);
  const caps = [];
  let avgStrength = null, avgQuickness = null, avgQuicknessReaction = null, leadWith = [];
  if (anyCyber) {
    const nb = ctx.naturalBody ?? 0, qb = ctx.quicknessCapBase ?? nQ;
    const sCap = Math.min(2 * nb, nb + 4), qCap = Math.min(2 * qb, qb + 4);
    avgStrength = avg("strength");
    if (avgStrength > sCap) { caps.push({ attr: "strength", was: avgStrength, cap: sCap }); avgStrength = sCap; }
    avgQuickness = avg("quickness");
    if (avgQuickness > qCap) { caps.push({ attr: "quickness", was: avgQuickness, cap: qCap }); avgQuickness = qCap; }
    avgQuicknessReaction = Math.min(avg("quicknessR"), qCap);
    leadWith = positions.filter(p => p.strength > avgStrength)
      .map(p => ({ key: p.key, name: p.name ?? null, cyber: p.cyber, strength: p.strength, tn: p.strength - avgStrength }));
  }
  const qOf = (k) => positions.find(p => p.key === k).quickness;
  const coordinationTN = Math.abs(qOf("arm.left") - qOf("arm.right")) + Math.abs(qOf("leg.left") - qOf("leg.right"));
  const pairList = pairs(model).map(p => {
    const b = sel.perPair.get(p.family);
    return { family: p.family, body: 1 + Math.min(3, b?.rating ?? 0), enhancement: b?.id ?? null };
  });
  const eligible = model.limbs.filter(forLimbRules);
  const hands = eligible.filter(l => l.slots.includes("arm.hand") || l.slots.includes("leg.foot")).length;
  return {
    positions, anyCyber, avgStrength, avgQuickness, avgQuicknessReaction, caps, leadWith,
    coordinationTN, pairs: pairList, pairBody: pairList.reduce((t, p) => t + p.body, 0),
    handPower: hands >= 2 ? 2 : hands,
    laceReplacements: eligible.filter(l => ["arm", "leg", "torso", "skull"].includes(l.type)).length,
    torso: eligible.some(l => l.type === "torso"),
    selection: sel
  };
}

/** Bone lacing armor after cyber replacements (p.50): 2 keep it, 3 lose 1, more lose all. */
export const lacingArmor = (armor, replacements) =>
  replacements > 3 ? 0 : replacements === 3 ? Math.max(0, armor - 1) : armor;

/** The neutral `system.limbs` (the reset contract). */
export const NEUTRAL_LIMBS = () => ({ positions: [], anyCyber: false, avgStrength: null, avgQuickness: null,
  caps: [], coordinationTN: 0, pairBody: 0, pairs: [], handPower: 0, laceReplacements: 0, leadWith: [], rejected: [] });

// --- Essence (p.49 Compatibility table, p.52 cyberguns, p.31/50–51 tiers) -------

const SYS = (id) => `Compendium.sr2e.cyberware.Item.${id}`;
const CT = (pack, id) => `Compendium.sr2e-cybertechnology.${pack}.Item.${id}`;
/** Adjusted Essence when wired into a cyberlimb, by source uuid (p.49). */
export const IN_LIMB_ESSENCE = {
  [SYS("twtjauuy4pfodbmc")]: 0, [CT("ct-bodyware", "f58c8a5f2dacdbfe")]: 0,          // Fingertip Compartment
  [SYS("jxi335p0vqjmy9ff")]: 0, [CT("ct-bodyware", "4cc21ea0ea44ddbb")]: 0,          // Hand Razors
  [SYS("uf67dvjthm1k1wg5")]: 0, [CT("ct-bodyware", "db3b9ab22ad4c388")]: 0,          // Retractable Razors
  [SYS("9u59mch2668dn9ds")]: 0, [CT("ct-bodyware", "24d75a0fd6ae7448")]: 0,          // Spur
  [SYS("xnrpxpuofaluu4r9")]: 0, [CT("ct-bodyware", "b5714691a31f502d")]: 0,          // Retractable Spur
  [SYS("59da9jhz3wuyikau")]: 0.25, [CT("ct-bodyware", "bbb2e332b96fcf71")]: 0.25,    // Smartlink
  [CT("ct-bodyware", "7a73969b94433711")]: 0.25,                                     // Smartlink (Level II)
  [CT("ct-headware", "157a34efc8738650")]: 0.25                                      // Orientation System
};
/** Essence of a cybergun NOT in a cyberlimb (p.52); in one it's 0. */
export const OUTSIDE_LIMB_ESSENCE = {
  [CT("ct-cyberlimbs", "d5b51c7d673f7335")]: 0.15, [CT("ct-cyberlimbs", "5744e70a42e4efb4")]: 0.35,
  [CT("ct-cyberlimbs", "3ee290673db57bcb")]: 0.4,  [CT("ct-cyberlimbs", "9e5810fabc305e66")]: 0.6,
  [CT("ct-cyberlimbs", "c08cb2fefc8c92e4")]: 1,    [CT("ct-cyberlimbs", "429432a6f13b23de")]: 1.1
};

/**
 * An item's limb-adjusted base Essence (before grade and surgery), or null to keep its
 * own. `it`: {sys (essenceCost, essenceInLimb, essenceOutsideLimb, isTacticalComputer,
 * rating), source, kind (resolved option kind)}. `place`: {inLimb, limbType, counted,
 * troll, torso}. Precedence: explicit field, then the enhancement tiers, then the
 * tactical computer, then known sources.
 */
export function limbEssence(it, place = {}) {
  const sys = it.sys ?? {};
  if (place.inLimb && Number.isFinite(sys.essenceInLimb)) return sys.essenceInLimb;
  if (!place.inLimb && Number.isFinite(sys.essenceOutsideLimb)) return sys.essenceOutsideLimb;
  if (place.inLimb && place.counted && (it.kind === "strength" || it.kind === "quickness")) {
    const r = Math.max(0, sys.rating ?? 0);
    if (PARTIAL.has(place.limbType)) return 0;   // hand/foot/lower limb: "no additional Essence" (p.51)
    const per = it.kind === "strength" ? 0.4 : 0.3;
    const over = it.kind === "strength" && place.troll ? r : Math.max(0, r - 3);
    const e = r2(per * over);
    return place.torso ? ceil2(e / 2) : e;   // a cybertorso halves the extra (p.37)
  }
  if (place.inLimb && sys.isTacticalComputer) return floor2((sys.essenceCost ?? 0) * 0.75);
  if (place.inLimb && it.source in IN_LIMB_ESSENCE) return IN_LIMB_ESSENCE[it.source];
  if (it.source in OUTSIDE_LIMB_ESSENCE) return place.inLimb ? 0 : OUTSIDE_LIMB_ESSENCE[it.source];
  return null;
}

// --- Price (p.31, p.51) ------------------------------------------------------------

/**
 * Derived nuyen price of a cyberlimb option (SR2E p.261). The book prices two of
 * the three as formulas, which must stay formulas (CLAUDE.md):
 *   Increased Strength   Rating x 150,000¥   → costPerRating
 *   Built-In Device      4 x Normal Cost     → costMultiplierOfBase x cost
 *   Built-In Smartlink   flat +2,500¥        → cost
 * Precedence is per-rating, then multiplier, then the flat price. Pure and
 * idempotent: it reads only authored fields and never folds its own result back.
 *
 * @param {object} sys - cyberware system data (authored, not prepared).
 * @returns {number} price in nuyen.
 */
export function limbOptionCost(sys) {
  const rating = Math.max(0, sys?.rating ?? 0);
  const base   = Math.max(0, sys?.cost ?? 0);
  if (sys?.costPerRating > 0)        return sys.costPerRating * rating;
  if (sys?.costMultiplierOfBase > 0) return base * sys.costMultiplierOfBase;
  return base;
}


/**
 * A limb option's price for its RECORDED placement. `sys`: rating, cost (authored),
 * costPerRating, costMultiplierOfBase, limbSurcharge, limbAdjacent. `kind`: the
 * resolved option kind. `limbType`: the linked limb's type (null when unattached).
 */
export function limbOptionPrice(sys = {}, kind = null, limbType = null) {
  let cost;
  if (kind === "strength" && PARTIAL.has(limbType)) {
    const per = limbType === "hand" || limbType === "foot" ? 65000 : sys.limbAdjacent ? 60000 : 120000;
    cost = per * Math.min(3, Math.max(0, sys.rating ?? 0));
  } else cost = limbOptionCost(sys);
  if (sys.limbSurcharge && ENHANCE.includes(kind)) cost *= 1.1;
  return Math.round(cost);
}

/**
 * The placement facts recorded when an option is attached (R1 #8, R2 #3–#4): surcharge
 * if the new limb already carries a DIFFERENT enhancement type; adjacency if a lower
 * arm/leg's same-side hand/foot holds a Strength option. `siblings`: the actor's other
 * items as {id, kind, linkedLimbId, limbType, side}.
 */
export function placementFacts(kind, limbId, siblings = []) {
  if (!limbId) return { limbSurcharge: false, limbAdjacent: false };
  const limb = siblings.find(s => s.id === limbId);
  const onLimb = siblings.filter(s => s.linkedLimbId === limbId && s.kind);
  const limbSurcharge = ENHANCE.includes(kind) && onLimb.some(s => ENHANCE.includes(s.kind) && s.kind !== kind);
  let limbAdjacent = false;
  if (kind === "strength" && (limb?.limbType === "forearm" || limb?.limbType === "lowerLeg")
      && (limb.side === "left" || limb.side === "right")) {
    const end = limb.limbType === "forearm" ? "hand" : "foot";
    const ends = siblings.filter(s => s.limbType === end && s.side === limb.side).map(s => s.id);
    limbAdjacent = siblings.some(s => s.kind === "strength" && ends.includes(s.linkedLimbId));
  }
  return { limbSurcharge, limbAdjacent };
}

