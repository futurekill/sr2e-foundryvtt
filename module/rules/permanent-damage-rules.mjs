/**
 * Permanent damage from Deadly wounds (SR2E core p.113–114; docs/PLAN-deadly-permanent-damage.md).
 * Pure: no Foundry.
 */
import { claimId } from "./claim-rules.mjs";

/** The flag key a permDmg state lives under (the OWNING actor; inherited state is never read). */
export const permKey = (uuid) => claimId(`permdmg:${uuid}`);
export const emptyPerm = () => ({ deadlyGen: 0, woundGen: 0, careGen: 0, crossed: [] });
export const normalizePerm = (st) => ({ ...emptyPerm(), ...(st ?? {}), crossed: [...(st?.crossed ?? [])] });

const ORGAN_ATTRS = [null, "body", "strength", "quickness", "intelligence", "willpower", "reaction"];
const PARTS = [null, "right arm", "left arm", "right leg", "left leg", "ear", "eye"];

/**
 * The outcome of the Body test and its 1D6s (p.113–114).
 * @returns {{kind:"none"}|{kind:"organ", attr:string}|{kind:"limb", part:string, side?:string}}
 */
export function permanentDamageResult(successes, d6, sideD6 = 1) {
  if (successes >= 2) return { kind: "none" };
  if (successes <= 0) return { kind: "organ", attr: ORGAN_ATTRS[d6] };
  const part = PARTS[d6];
  return part === "ear" || part === "eye" ? { kind: "limb", part, side: sideD6 <= 3 ? "right" : "left" } : { kind: "limb", part };
}

/**
 * The hook's decision: crossing into Deadly opens an episode (its wound fixed at crossing);
 * dropping below Deadly ends it; reaching 0 starts a new wound.
 * `before`/`after` are Physical boxes counting overflow; `deadly` the Physical maximum.
 */
export function deadlyTransition(stIn, before, after, deadly) {
  const st = normalizePerm(stIn);
  if (before < deadly && after >= deadly && !st.crossed.some(c => c.g === st.deadlyGen)) {
    st.crossed.push({ g: st.deadlyGen, woundGen: st.woundGen });
  }
  if (before >= deadly && after < deadly) st.deadlyGen += 1;
  if (before > 0 && after === 0) st.woundGen += 1;
  return st;
}

/** Records → outcomes in force: [{g, a, payload}] minus voided ones, for THIS actor only. */
export function liveOutcomes(records, uuid) {
  const pre = `permdmg:${uuid}:`, voidPre = `permdmg-void:${uuid}:`;
  const voided = new Set(records.filter(r => String(r.key).startsWith(voidPre)).map(r => String(r.key).slice(voidPre.length)));
  const all = records.filter(r => String(r.key).startsWith(pre)).map(r => {
    const [g, a] = String(r.key).slice(pre.length).split(":").map(Number);
    return { g, a, id: `${g}:${a}`, ...r };
  });
  return { live: all.filter(o => !voided.has(o.id)), voidedCount: (g) => all.filter(o => o.g === g && voided.has(o.id)).length };
}

/** Episodes still waiting for their roll. */
export const pendingEpisodes = (st, outcomes) => normalizePerm(st).crossed.filter(c => !outcomes.live.some(o => o.g === c.g));

/** Attribute losses (organ results), counted once each. */
export function foldPermLoss(live) {
  const loss = {};
  for (const o of live) if (o.kind === "organ" && o.attr) loss[o.attr] = (loss[o.attr] ?? 0) + 1;
  return loss;
}

/** Healing penalties for the current wound: limb → base ×1.5; organ → total ×2 and a doctor required. */
export function woundPenalties(live, woundGen) {
  const cur = live.filter(o => o.woundGen === woundGen);
  return { baseMult: cur.some(o => o.kind === "limb") ? 1.5 : 1, totalMult: cur.some(o => o.kind === "organ") ? 2 : 1,
    doctorRequired: cur.some(o => o.kind === "organ"), key: cur.map(o => o.id).sort().join(",") };
}

/** The effective natural ceiling (racial maximum + Exceptional Attribute − losses), one helper. */
export const effectiveCeiling = (racialMax, maxBonus, losses) =>
  racialMax == null ? null : (Number(racialMax) || 0) + (Number(maxBonus) || 0) - (Number(losses) || 0);
