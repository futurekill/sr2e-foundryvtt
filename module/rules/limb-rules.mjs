/**
 * The cyberlimb model (docs/PLAN-cybertechnology-phase2.md). Pure: no Foundry.
 * Limb identity (what a limb is, which side) and option identity (what an option adds)
 * come ONLY from here; rules never read item names. Precedence for both: an explicit
 * field, then the item's `flags.sr2e.rule`, then a table of known compendium source
 * uuids, then unclassified. The model reports problems; it never rewrites links.
 */

export const LIMB_TYPES = ["arm", "leg", "hand", "foot", "forearm", "lowerLeg", "torso", "skull"];
export const OPTION_KINDS = ["strength", "quickness", "body", "smartlink", "device", "weapon", "other"];
export const SIDED = new Set(["arm", "leg", "hand", "foot", "forearm", "lowerLeg"]);
export const COVERAGE = { arm: "full", leg: "full", forearm: "partial", lowerLeg: "partial", hand: "partial", foot: "partial", torso: "core", skull: "core" };
/** Family-namespaced slots: an arm and a leg on one side never collide. */
export const SLOTS = {
  arm: ["arm.upper", "arm.lower", "arm.hand"], forearm: ["arm.lower", "arm.hand"], hand: ["arm.hand"],
  leg: ["leg.upper", "leg.lower", "leg.foot"], lowerLeg: ["leg.lower", "leg.foot"], foot: ["leg.foot"],
  torso: ["torso"], skull: ["skull"]
};

const SYS = (id) => `Compendium.sr2e.cyberware.Item.${id}`;
const CT = (id) => `Compendium.sr2e-cybertechnology.ct-cyberlimbs.Item.${id}`;
/** Known compendium items whose book says what they are, by source uuid. */
export const SOURCE_LIMB = {
  [SYS("896ab7272e2fd9b0")]: "arm",    // Cyberarm (Full), core p.247/261
  [SYS("c2808ba4b899ecb8")]: "leg",    // Cyberleg (Full)
  [SYS("1caacfc1ca151028")]: "torso"   // Cybertorso
};
export const SOURCE_OPTION = {
  [SYS("34b1c0f27ae95d11")]: "strength",   // Increased Strength (Cyberlimb), core p.261
  [SYS("6d2e59a8c1f40b73")]: "smartlink",  // Built-In Smartlink
  [SYS("9f04a7b3e2c81d56")]: "device",     // Built-In Device
  [CT("5f2e13f2593cb635")]: "strength",    // Cybertechnology: Increased Strength (Cyberlimb)
  [CT("b7c7bb564a1c3716")]: "device",      // Built-In Device (Cyberlimb)
  [CT("8f82f4992f76d2ce")]: "smartlink",   // Built-In Smartgun Link
  [CT("d8214b741f97ea8a")]: "weapon",      // Cyberarm Taser
  ...Object.fromEntries(["c08cb2fefc8c92e4", "d5b51c7d673f7335", "5744e70a42e4efb4", "3ee290673db57bcb", "429432a6f13b23de", "9e5810fabc305e66"]
    .map(id => [CT(id), "weapon"])),       // Cyberguns
  ...Object.fromEntries(["670f9daa2701ae4f", "c95c853f0df4d549", "0c136ee98018d026", "5a2e9c5a1a71b5d8", "3f3a5f25f8f76a06", "3f225dc670d0102a", "a14f54f55d66846f"]
    .map(id => [CT(id), "other"]))         // cyberdeck, DNI, external mount, magnetic system, coverings
};

const ruleOf = (flags) => String(flags?.sr2e?.rule ?? "");

/** What a limb is, and where that came from. */
export function resolveLimbType(sys = {}, flags = {}, source = null) {
  if (LIMB_TYPES.includes(sys.limbType)) return { type: sys.limbType, via: "set" };
  const m = ruleOf(flags).match(/^limb:([a-z-]+)$/);
  if (m) { const t = m[1] === "lower-leg" ? "lowerLeg" : m[1]; if (LIMB_TYPES.includes(t)) return { type: t, via: "rule" }; }
  if (source && SOURCE_LIMB[source]) return { type: SOURCE_LIMB[source], via: "source" };
  return { type: null, via: null };
}

/** What an option adds, and where that came from. */
export function resolveOptionKind(sys = {}, flags = {}, source = null) {
  if (OPTION_KINDS.includes(sys.limbOptionKind)) return { kind: sys.limbOptionKind, via: "set" };
  const m = ruleOf(flags).match(/^limb-enhancement:(strength|quickness|body)$/);
  if (m) return { kind: m[1], via: "rule" };
  if (source && SOURCE_OPTION[source]) return { kind: SOURCE_OPTION[source], via: "source" };
  return { kind: null, via: null };
}

/** "limb" | "option" | null — the ONE membership test (model, sheets, report). */
export function limbRole(sys = {}, flags = {}, source = null) {
  if (sys.limbOption) return "option";
  if (sys.location === "cyberlimb" || resolveLimbType(sys, flags, source).type) return "limb";
  return null;
}

/** The derived identity a prepared cyberware item carries (never stored). */
export function limbIdentity(sys = {}, flags = {}, source = null) {
  const role = limbRole(sys, flags, source);
  if (role === "limb") {
    const { type, via } = resolveLimbType(sys, flags, source);
    return { role, type, coverage: type ? COVERAGE[type] : null, optionKind: null, via };
  }
  if (role === "option") {
    const { kind, via } = resolveOptionKind(sys, flags, source);
    return { role, type: null, coverage: null, optionKind: kind, via };
  }
  return null;
}

const LABEL = { arm: "Cyberarm", leg: "Cyberleg", hand: "Cyberhand", foot: "Cyberfoot", forearm: "Cyber forearm", lowerLeg: "Cyber lower leg", torso: "Cybertorso", skull: "Cyberskull" };
export const limbLabel = (l) => `${l.name}${SIDED.has(l.type) && l.side !== "unknown" ? ` (${l.side})` : ""}`;

/**
 * The model over plain items `{id, name, installed, system, flags, source}`.
 * `limbs` and their `options` are INSTALLED only (rules read these); `orphans` are
 * installed options with no valid installed parent; `unresolvedOverlap` lists limbs
 * that could overlap but whose sides aren't both known.
 */
export function limbModel(items = []) {
  const byId = new Map(items.map(i => [i.id, i]));
  const ident = new Map(items.map(i => [i.id, limbIdentity(i.system, i.flags, i.source)]));
  const limbs = [], orphans = [];
  for (const i of items) {
    const id = ident.get(i.id);
    if (id?.role !== "limb" || !i.installed) continue;
    const side = SIDED.has(id.type) ? (i.system.side === "left" || i.system.side === "right" ? i.system.side : "unknown") : "none";
    limbs.push({ id: i.id, name: i.name, type: id.type, side, coverage: id.coverage, slots: id.type ? SLOTS[id.type] : [],
      classified: !!id.type, sideKnown: side !== "unknown", conflicts: [], options: [], reasons: [] });
  }
  const limbById = new Map(limbs.map(l => [l.id, l]));
  for (const i of items) {
    const id = ident.get(i.id);
    if (id?.role !== "option" || !i.installed) continue;
    const link = i.system.linkedLimbId ?? "";
    const parent = link ? byId.get(link) : null;
    const opt = { id: i.id, name: i.name, kind: id.optionKind, rating: i.system.rating ?? 0,
      cost: i.system.cost ?? 0, essence: i.system.actualEssenceCost ?? i.system.essenceCost ?? 0 };
    let reason = null;
    if (!link) reason = "not attached to a limb";
    else if (!parent) reason = "its limb is gone";
    else if (ident.get(link)?.role !== "limb") reason = `${parent.name} isn't a cyberlimb`;
    else if (!parent.installed) reason = `${parent.name} isn't installed`;
    if (reason) { orphans.push({ ...opt, linkedLimbId: link, reason }); continue; }
    if (!opt.kind) limbById.get(link).reasons.push(`${i.name}: set what this option adds`);
    limbById.get(link).options.push(opt);
  }
  // Conflicts: two limbs on the same KNOWN side (or two torsos/skulls) sharing a slot.
  const groups = new Map();
  for (const l of limbs) {
    if (!l.classified) continue;
    if (SIDED.has(l.type) && !l.sideKnown) continue;
    for (const s of l.slots) {
      const k = `${l.side}|${s}`;
      if (!groups.has(k)) groups.set(k, { side: l.side, slot: s, ids: [] });
      groups.get(k).ids.push(l.id);
    }
  }
  const conflicts = [...groups.values()].filter(g => g.ids.length > 1);
  for (const g of conflicts) for (const id of g.ids) limbById.get(id).conflicts.push(g);
  // Possible overlaps the model can't decide: a sided limb with an unknown side
  // sharing a slot family with any other limb of that family.
  const unresolvedOverlap = [];
  const sided = limbs.filter(l => l.classified && SIDED.has(l.type));
  for (let a = 0; a < sided.length; a++) for (let b = a + 1; b < sided.length; b++) {
    const x = sided[a], y = sided[b];
    if (x.sideKnown && y.sideKnown) continue;
    if (x.slots.some(s => y.slots.includes(s))) unresolvedOverlap.push({ ids: [x.id, y.id], reason: "set both sides to tell whether these overlap" });
  }
  for (const l of limbs) {
    if (!l.classified) l.reasons.unshift("set its limb type");
    else if (!l.sideKnown && SIDED.has(l.type)) l.reasons.unshift("set its side (side rules skip it until then)");
    for (const g of l.conflicts) l.reasons.push(`overlaps ${g.ids.filter(x => x !== l.id).map(x => limbById.get(x).name).join(", ")} on the ${g.side === "none" ? "body" : g.side} (${g.slot})`);
  }
  return { limbs, orphans, conflicts, unresolvedOverlap };
}

/** Phase-3 eligibility, per rule kind (the plan's contract; rules must use these). */
export const forSideRules = (l) => l.classified && l.sideKnown && l.conflicts.length === 0;
export const forLimbRules = (l) => l.classified && l.conflicts.length === 0;

export { LABEL as LIMB_LABELS };
