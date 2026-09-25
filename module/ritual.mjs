/**
 * Ritual sorcery (SR2E p.133–137) — a GM worksheet. See docs/PLAN-ritual-sorcery.md.
 *
 * The GM runs the ritual on their own client. Its state is ONE record: a
 * GM-whispered chat message (`flags.sr2e.ritual`) whose card shows the progress
 * and the next buttons, so it is always resumable from chat. Every change runs
 * in one queue per ritual and re-reads the record inside the step.
 *
 * Crash safety comes from the order of writes, not a journal:
 *  - every ritual test is tagged at creation (`flags.sr2e.ritualTest`), and
 *    the record ADOPTS tagged tests it has not recorded yet, so a roll is
 *    never repeated and its dice are charged once;
 *  - the materials charge and each member's Drain damage go in ONE actor
 *    update with their marker;
 *  - every published card carries a `ritualCard` key and is created once.
 * The GM adjudicates what the book leaves to them: the link table row, time,
 * sustaining expiry, foci and spirit aid used for Drain, astral interception.
 */
import { enqueueAttack } from "./engagement.mjs";
import { parseDrainCode } from "./data/item-data.mjs";
import { renderHealingCard, renderManipDamageCard } from "./documents/item.mjs";
import { preCastBlock, fetishCheck, personallySustaining } from "./restricted-spells.mjs";
import { spellEffectKind, igniteFromCast } from "./spell-effects.mjs";
import { promptForCanvasPoint } from "./placement.mjs";
import {
  ritualMaterialsCost, ritualLinkTN, ritualSendingTN, ritualStageHours, ritualTeamMax, ritualResistTN,
  ritualSustainHours, MATERIAL_LINK_TN, SENDING_TN, spellForces, canonicalSpellName, drainTargetNumber,
  healingDrainLevel, healingSpellTN, biowareHealingTnMod, areaSpellGeometry, areaTargetEligible,
  manipulationDamage, testTotalSuccesses
} from "./rules/sr2e-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const isActiveGM = () => !!game.users?.activeGM?.isSelf;
const gmIds = () => game.users.filter(u => u.isGM).map(u => u.id);
const sync = (uuid) => { try { return uuid ? fromUuidSync(uuid) : null; } catch (e) { return null; } };
const asActor = (d) => d?.documentName === "Token" ? d.actor : d;
const STAGES = ["L", "M", "S", "D"];
const BOXES = [1, 3, 6, 10];
/** Drain entries are keyed by uuid with its dots replaced: Foundry expands dotted keys on update. */
const dk = (uuid) => String(uuid).replaceAll(".", "_");

// ── Who can take part ──────────────────────────────────────────────────────

const sorcerySkill = (a) => a.items.find(i => i.type === "skill" && i.name.toLowerCase() === "sorcery");
/** Ritual Sorcery concentration if the Sorcery skill has it, else Sorcery (p.133). */
export function ritualSkill(a) {
  const s = sorcerySkill(a);
  if (!s) return 0;
  return /ritual/i.test(s.system.concentration?.name ?? "") ? (s.system.concentration.rating || s.system.rating) : s.system.rating;
}
const knowsSpell = (a, spell) => a.items.some(i => i.type === "spell" && canonicalSpellName(i.name) === canonicalSpellName(spell.name));
const magicPool = (a) => a.system.dicePools?.magic?.value ?? 0;
const totemDice = (a, category) => {
  const m = a.system.magic;
  if (m?.tradition !== "shamanic" || !m?.totem) return 0;
  const t = CONFIG.SR2E.totems?.[m.totem];
  return (t?.spellBonus?.[category] ?? 0) - (t?.spellPenalty?.[category] ?? 0);
};

/**
 * Why a ritual can't start, or null (p.133, p.135). Pure over the documents
 * it is handed, so the Start dialog and the tests agree.
 */
export function ritualStartProblem({ leader, spell, force, members, lodgeConfirmed }) {
  if (!leader || !spell) return "choose a leader and one of their spells.";
  if (spell.system.category === "combat") return "combat spells cannot be cast by ritual sorcery (p.133).";
  if (ritualMaterialsCost(spell.system.category, force) == null) return `a ${spell.system.category} spell has no ritual materials (p.133).`;
  const fx = spellEffectKind(spell);
  if (fx === "poltergeist" || fx === "iceSheet") return `${spell.name} is placed where its caster stands — cast it normally (not supported by ritual).`;
  if (!lodgeConfirmed) return `confirm the ${leader.system.magic?.tradition === "shamanic" ? "medicine lodge" : "hermetic circle"} is rated at least Force ${force} (p.133).`;
  const all = [leader, ...members.map(m => m.actor)];
  if (new Set(all.map(a => a.uuid)).size !== all.length) return "each magician can join the team once.";
  if (members.some(m => m.actor.uuid === leader.uuid)) return "the leader is already on the team.";
  const max = ritualTeamMax(all.map(a => sorcerySkill(a)?.system.rating ?? 0));
  if (all.length > max) return `the team is ${all.length}, but its lowest Sorcery allows ${max} (p.135).`;
  const trad = leader.system.magic?.tradition;
  for (const a of all) {
    if (!sorcerySkill(a)) return `${a.name} has no Sorcery skill.`;
    if (!knowsSpell(a, spell)) return `${a.name} does not know ${spell.name} — every member must (p.135).`;
    if (a.system.magic?.tradition !== trad) return `${a.name} is not of the leader's tradition (p.135).`;
    const held = a.items.filter(i => i.type === "spell" && personallySustaining(i));
    if (held.length) return `${a.name} is sustaining ${held.map(i => i.name).join(", ")} — drop it first (p.135).`;
  }
  for (const m of [{ actor: leader, contribution: members.leaderContribution ?? 0 }, ...members]) {
    const c = m.contribution;
    if (m.guide) { if (c) return `${m.actor.name} is the astral guide and contributes no dice (p.135).`; continue; }
    if (!Number.isInteger(c) || c < 0 || c > magicPool(m.actor)) {
      return `${m.actor.name} can put 0–${magicPool(m.actor)} Magic Pool dice in (they have ${magicPool(m.actor)}).`;
    }
  }
  if (members.filter(m => m.guide).length > 1) return "one astral guide at most.";
  return null;
}

// ── The record ─────────────────────────────────────────────────────────────

const recordMsg = (id) => game.messages.find(m => m.flags?.sr2e?.ritual?.id === id);

/** Run a change to a ritual on its queue: re-read, adopt tagged tests, validate, save. */
function mutate(id, fn) {
  return enqueueAttack(`ritual:${id}`, async () => {
    if (!isActiveGM()) return ui.notifications.warn("Only the active GM runs a ritual.");
    const msg = recordMsg(id);
    if (!msg) return ui.notifications.warn("That ritual's record is gone.");
    const r = foundry.utils.deepClone(msg.flags.sr2e.ritual);
    const before = JSON.stringify(r);
    adopt(r);
    const out = await fn(r, msg);
    // A refused step still saves what adopt() recovered.
    if (out === false && JSON.stringify(r) === before) return;
    await msg.update({ content: renderRecord(r), flags: { sr2e: { ritual: r, closesTests: r.closes } } });
    return out;
  });
}

/** Record tagged tests the record doesn't know yet (a crash between roll and save). */
function adopt(r) {
  for (const m of game.messages) {
    const t = m.flags?.sr2e?.ritualTest;
    if (t?.ritualId !== r.id) continue;
    if (t.stage === "drain") {
      const d = r.drain[dk(t.memberUuid)];
      if (d && !d.testId) { d.testId = m.id; d.assigned = t.dice; r.pool = Math.max(0, r.pool - t.dice); }
    } else if (!r.stages[t.stage]?.testId) {
      r.stages[t.stage] = { ...(r.stages[t.stage] ?? {}), testId: m.id, dice: t.dice, tn: t.tn, totemUsed: t.totemUsed ?? 0 };
      r.pool = Math.max(0, r.pool - t.dice - (t.withheld ?? 0));
      if (t.stage === "effect") freezeDrain(r);
    }
  }
  if (!r.paid && sync(r.leaderUuid)?.getFlag("sr2e", "ritualPaid")?.[r.id]) r.paid = true;
}

const spellOf = (r) => asActor(sync(r.leaderUuid))?.items.get(r.spellId) ?? null;

/** The Drain level, frozen once — at the effect, or at an abort (p.137). */
function freezeDrain(r) {
  if (r.drainLevel) return;
  const drain = parseDrainCode(spellOf(r)?.system.drainCode ?? "");
  if (drain.levelFromWound) {
    const subj = asActor(sync(r.subject.uuid));
    r.drainLevel = healingDrainLevel(subj?.system?.conditionMonitor?.physical?.value ?? 0);
  } else r.drainLevel = drain.level;
}

function abort(r, why) {
  r.aborted = why;
  freezeDrain(r);
  r.stage = "drain";
}

// ── Card ───────────────────────────────────────────────────────────────────

const btn = (r, action, label, extra = "") =>
  `<button type="button" class="sr2e-resist-btn sr2e-ritual-btn" data-ritual-id="${r.id}" data-action="${action}" ${extra}>${label}</button>`;
const hrs = (h) => `${Math.round(h * 100) / 100} h`;

export function renderRecord(r) {
  const st = r.stages;
  const line = (k, label) => {
    const s = st[k];
    if (!s) return "";
    if (s.skipped) return `<li>${label}: skipped (${esc(s.skipped)})</li>`;
    return `<li>${label}: ${s.dice ?? "?"} dice vs TN ${s.tn ?? "?"}${s.successes != null
      ? ` → ${s.successes} success${s.successes === 1 ? "" : "es"}${s.hours != null ? `, ${hrs(s.hours)}` : ""}` : " — awaiting Finalise"}</li>`;
  };
  const members = [`${esc(r.leader.name)} (leader) ${r.leaderContribution ?? 0}`,
    ...r.members.map(m => `${esc(m.name)}${m.guide ? " (astral guide)" : ` ${m.contribution}`}${m.withdrawn ? " — withdrew" : ""}`)].join(", ");
  const acts = [];
  const pending = (k) => st[k]?.testId && st[k].successes == null;
  if (!r.paid) acts.push(btn(r, "pay", `💴 Charge materials ${r.materials.toLocaleString()}¥`), btn(r, "supplied", "Materials supplied"));
  else if (r.stage === "link") acts.push(pending("link") ? btn(r, "finalise", "✔ Finalise link", 'data-stage="link"') : btn(r, "link", "🔗 Material link"));
  else if (r.stage === "sending") acts.push(pending("sending") ? btn(r, "finalise", "✔ Finalise sending", 'data-stage="sending"') : btn(r, "sending", "➶ Sending"));
  else if (r.stage === "effect") acts.push(pending("effect") ? btn(r, "finalise", "✔ Finalise effect", 'data-stage="effect"') : btn(r, "effect", "✨ Determine the effect"));
  else if (r.stage === "publish") acts.push(btn(r, "publish", "📣 Publish the effect"));
  else if (r.stage === "sustain") acts.push(btn(r, "sustain", "⏳ Sustaining"));
  if (r.paid && ["link", "sending", "effect"].includes(r.stage)) {
    acts.push(btn(r, "withdraw", "Withdraw a member"), btn(r, "guideLost", "Guide driven off"), btn(r, "terminate", "✖ Terminate"));
  }
  let drainRows = "";
  if (r.stage === "drain" || r.stage === "done") {
    drainRows = `<ul>${[r.leader, ...r.members].map(m => {
      const d = r.drain[dk(m.uuid)];
      const act = d.done ? `— ${esc(d.result)}` : d.testId ? btn(r, "finaliseDrain", "✔ Finalise", `data-member="${m.uuid}"`)
        : btn(r, "drain", "Resist Drain", `data-member="${m.uuid}"`);
      return `<li>${esc(m.name)} ${act}</li>`;
    }).join("")}</ul>`;
  }
  const hours = (st.link?.hours ?? 0) + (st.sending?.hours ?? 0);
  return `<div class="sr2e-damage-result sr2e-ritual-card"><strong>🜂 Ritual: ${esc(r.spellName)}</strong>
    (Force ${r.force}${r.effForce !== r.force ? ` as ${r.effForce}` : ""}) — led by ${esc(r.leader.name)}
    <br>Team: ${members || "—"} · <strong>Ritual Magic Pool ${r.pool}</strong>
    <br>Subject: ${esc(r.subject.name)}${r.subject.kind === "area" ? " (area)" : ""}
    <ul>${line("link", "Material link")}${line("sending", "Sending")}${line("effect", "Effect")}</ul>
    ${r.sustain ? `<em>Sustaining: ${esc(r.sustain.note)}</em><br>` : ""}
    ${r.aborted ? `<strong>Aborted: ${esc(r.aborted)}.</strong> Everyone resists Drain (p.135).<br>` : ""}
    ${r.drainLevel ? `Drain: ${r.drainLevel} at TN ${r.drainTN}${r.sustain?.mode === "locked" ? " +2 (locked in)" : ""}.<br>` : ""}
    <em>Time so far: ${hrs(hours)} — the GM advances world time (p.136).</em>
    ${r.stage === "done" ? "<br><strong>Complete.</strong>" : ""}
    ${drainRows}<div class="sr2e-karma-actions">${acts.join("")}</div></div>`;
}

// ── Start ──────────────────────────────────────────────────────────────────

/** Open the Start worksheet for a leader's spell (GM). */
export async function startRitual(spell) {
  if (!game.user.isGM) return ui.notifications.warn("The GM runs ritual sorcery (players ask the GM).");
  const leader = spell?.parent;
  if (!leader) return;
  const { actual: learned } = spellForces({ learnedForce: spell.system.force, actualForce: spell.system.force, restriction: spell.system.restriction ?? "" });
  const candidates = game.actors.filter(a => a.type === "character" && a.id !== leader.id && knowsSpell(a, spell));
  const target = game.user.targets?.first?.();
  const rows = candidates.map(a => `<tr><td><label><input type="checkbox" name="m_${a.id}"> ${esc(a.name)}</label></td>
    <td><input type="number" name="c_${a.id}" value="${magicPool(a)}" min="0" max="${magicPool(a)}" style="width:4em"></td>
    <td><input type="radio" name="guide" value="${a.id}"></td></tr>`).join("");
  const content = `<div class="sr2e-ritual-start">
    <p><strong>${esc(spell.name)}</strong> led by ${esc(leader.name)} (Ritual Sorcery ${ritualSkill(leader)}).</p>
    <label>Force <input type="number" name="force" value="${learned}" min="1" style="width:4em"></label>
    <label>Leader's Magic Pool dice <input type="number" name="leaderC" value="${magicPool(leader)}" min="0" max="${magicPool(leader)}" style="width:4em"></label>
    <table><tr><th>Member (knows the spell)</th><th>Pool dice</th><th>Astral guide</th></tr>${rows || "<tr><td colspan=3><em>No other character knows it.</em></td></tr>"}
      <tr><td></td><td></td><td><label><input type="radio" name="guide" value="" checked> none</label></td></tr></table>
    <label>Subject <select name="subjectKind">
      ${target?.actor ? `<option value="actor">${esc(target.name)} (targeted)</option>` : ""}
      <option value="place">A specific place</option><option value="object">A specific object</option>
      ${spell.system.isAreaEffect ? `<option value="area">An area (click the map)</option>` : ""}
    </select></label> <input type="text" name="subjectName" placeholder="name / description">
    <br><label><input type="checkbox" name="inSight"> Target in sight or astrally observed (no link, p.136)</label>
    <br><label><input type="checkbox" name="lodge"> ${leader.system.magic?.tradition === "shamanic" ? "Medicine lodge" : "Hermetic circle"} rated at least the Force is ready (p.133)</label>
    <p><em>Materials: ${esc(spell.system.category)} costs ${(ritualMaterialsCost(spell.system.category, 1) ?? 0).toLocaleString()}¥ × Force, used up whatever happens.</em></p>
  </div>`;
  const data = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Ritual Sorcery (SR2E p.133)" }, content, rejectClose: false,
    ok: { label: "Start", callback: (ev, button) => new foundry.applications.ux.FormDataExtended(button.form).object }
  });
  if (!data) return;
  const members = candidates.filter(a => data[`m_${a.id}`]).map(a => ({
    actor: a, guide: data.guide === a.id, contribution: data.guide === a.id ? 0 : Math.trunc(Number(data[`c_${a.id}`]) || 0) }));
  members.leaderContribution = Math.trunc(Number(data.leaderC) || 0);
  let subject;
  if (data.subjectKind === "actor" && target?.actor) {
    subject = { kind: "actor", uuid: target.actor.uuid, name: target.name,
                type: target.actor.type === "spirit" ? "spirit" : ["character", "npc"].includes(target.actor.type) ? "metahuman" : "object" };
  } else if (data.subjectKind === "area") {
    const pt = await promptForCanvasPoint("the ritual's area");
    if (!pt) return;
    subject = { kind: "area", name: data.subjectName || "an area", type: "place", sceneId: canvas.scene.id, center: pt };
  } else {
    subject = { kind: data.subjectKind, name: data.subjectName || (data.subjectKind === "place" ? "a place" : "an object"), type: data.subjectKind };
  }
  return createRitual({ leader, spell, force: Math.max(1, Math.trunc(Number(data.force) || 1)), members, subject,
                        inSight: !!data.inSight, lodgeConfirmed: !!data.lodge });
}

/** Validate and create the record (also the test entry point). */
export async function createRitual({ leader, spell, force, members, subject, inSight = false, lodgeConfirmed }) {
  const why = ritualStartProblem({ leader, spell, force, members, lodgeConfirmed });
  if (why) { ui.notifications.warn(`Ritual: ${why}`); return null; }
  if (subject.kind !== "actor" && spell.system.healsDamage) {
    ui.notifications.warn("Ritual: a healing spell needs a patient — target them first."); return null;
  }
  const { actual, effective } = spellForces({ learnedForce: spell.system.force, actualForce: force, restriction: spell.system.restriction ?? "" });
  if (spell.system.restriction && actual > spell.system.force) { ui.notifications.warn(`Ritual: ${spell.name} is known at Force ${spell.system.force}.`); return null; }
  const guide = members.find(m => m.guide);
  const drain = parseDrainCode(spell.system.drainCode ?? "");
  const all = [{ actor: leader, contribution: members.leaderContribution ?? 0 }, ...members];
  const r = {
    id: foundry.utils.randomID(), leaderUuid: leader.uuid, spellId: spell.id, spellName: spell.name,
    force: actual, effForce: effective, category: spell.system.category,
    leader: { uuid: leader.uuid, name: leader.name },
    members: members.map(m => ({ uuid: m.actor.uuid, name: m.actor.name, contribution: m.contribution, guide: !!m.guide, withdrawn: false })),
    leaderContribution: members.leaderContribution ?? 0,
    pool: all.reduce((n, m) => n + (m.guide ? 0 : m.contribution), 0),
    subject, materials: ritualMaterialsCost(spell.system.category, actual), paid: false,
    stage: "link", stages: {}, aborted: null, drainLevel: null, drainTN: drainTargetNumber(actual, drain.modifier),
    sustain: null, closes: [], fetishConsumed: false,
    drain: Object.fromEntries(all.map(m => [dk(m.actor.uuid), { testId: null, assigned: 0, done: false, result: "" }]))
  };
  if (inSight || guide) {
    r.stages.link = { skipped: guide ? `${guide.actor.name} guides it astrally` : "the target is in sight", hours: 0 };
    r.stage = "sending";
  }
  await ChatMessage.create({ whisper: gmIds(), speaker: ChatMessage.getSpeaker({ actor: leader }),
    content: renderRecord(r), flags: { sr2e: { ritual: r } } });
  return r.id;
}

// ── Actions ────────────────────────────────────────────────────────────────

async function form(title, content, label = "Roll") {
  return foundry.applications.api.DialogV2.prompt({ window: { title }, content, rejectClose: false,
    ok: { label, callback: (ev, b) => new foundry.applications.ux.FormDataExtended(b.form).object } });
}

/** Materials: the charge and its marker in ONE update, so a retry can't charge twice. */
async function pay(id, supplied) {
  return mutate(id, async (r) => {
    if (r.paid) return false;
    const leader = asActor(sync(r.leaderUuid));
    if (!supplied) {
      const n = leader.system.nuyen ?? 0;
      if (n < r.materials) { ui.notifications.warn(`${leader.name} has ${n.toLocaleString()}¥; the materials cost ${r.materials.toLocaleString()}¥.`); return false; }
      await leader.update({ "system.nuyen": n - r.materials, [`flags.sr2e.ritualPaid.${r.id}`]: true });
    }
    r.paid = true;
  });
}

/** Roll a stage test on the leader, tagged at creation; `adopt` records it. */
async function rollStage(r, stage, dice, tn, label, extra = {}) {
  const leader = asActor(sync(r.leaderUuid));
  await leader.rollSuccessTest(dice, tn, {
    label, karmaDiceCap: 0, tnPolicy: stage === "effect" ? "injury" : "table", extraTN: extra.extraTN, extraTNLabel: extra.extraTNLabel,
    flags: { sr2e: { ritualTest: { ritualId: r.id, stage, dice: extra.poolDice ?? dice, tn, totemUsed: extra.totemUsed ?? 0, withheld: extra.withheld ?? 0 } } }
  });
}

async function stageLink(id) {
  const r0 = recordMsg(id)?.flags.sr2e.ritual;
  const subj = r0.subject;
  const data = await form("Material link (SR2E p.136)", `
    <label>Dice from the pool (${r0.pool}) <input type="number" name="dice" value="${Math.min(r0.pool, r0.force)}" min="1" max="${r0.pool}"></label>
    <label>Target location <select name="location">${Object.entries(MATERIAL_LINK_TN).map(([k, v]) => `<option value="${k}">${k} (${v})</option>`).join("")}</select></label>
    <label><input type="checkbox" name="spirit" ${subj.type === "spirit" ? "checked" : ""}> Target is a spirit (+2)</label>
    <label>Mana barrier rating <input type="number" name="barrier" value="0" min="0"></label>
    <label>Target's hermetic circle / medicine lodge rating <input type="number" name="lodge" value="0" min="0"></label>
    <label><input type="checkbox" name="stale"> Tissue is not fresh (+4)</label>`);
  if (!data) return;
  return mutate(id, async (r) => {
    if (r.stage !== "link" || r.stages.link?.testId) return false;
    const dice = Math.trunc(Number(data.dice) || 0);
    if (dice < 1 || dice > r.pool) { ui.notifications.warn(`Use 1–${r.pool} dice.`); return false; }
    const tn = ritualLinkTN({ location: data.location, spirit: !!data.spirit, barrier: data.barrier, lodge: data.lodge, staleTissue: !!data.stale });
    await rollStage(r, "link", dice, tn, `Ritual — material link for ${r.spellName} (TN ${tn}, p.136)`);
    adopt(r);
  });
}

async function stageSending(id) {
  const r0 = recordMsg(id)?.flags.sr2e.ritual;
  const data = await form("The sending (SR2E p.136)", `
    <label>Dice from the pool (${r0.pool}) <input type="number" name="dice" value="${Math.min(r0.pool, r0.force)}" min="1" max="${r0.pool}"></label>
    <label>Target <select name="type">${Object.entries(SENDING_TN).map(([k, v]) => `<option value="${k}" ${k === r0.subject.type ? "selected" : ""}>${k} (${v})</option>`).join("")}</select></label>
    <label><input type="checkbox" name="fast"> Moving faster than running (+2)</label>`);
  if (!data) return;
  return mutate(id, async (r) => {
    if (r.stage !== "sending" || r.stages.sending?.testId) return false;
    const dice = Math.trunc(Number(data.dice) || 0);
    if (dice < 1 || dice > r.pool) { ui.notifications.warn(`Use 1–${r.pool} dice.`); return false; }
    const tn = ritualSendingTN({ targetType: data.type, fastMoving: !!data.fast, area: r.subject.kind === "area" });
    await rollStage(r, "sending", dice, tn, `Ritual — sending ${r.spellName} (TN ${tn}, p.136)`);
    adopt(r);
  });
}

/** Finalise a stage: the live total after Karma, the test closed, hours recorded. */
async function finalise(id, stage) {
  return mutate(id, async (r) => {
    const s = r.stages[stage];
    if (!s?.testId || s.successes != null) return false;
    const test = game.messages.get(s.testId)?.flags?.sr2e?.test;
    s.successes = test ? testTotalSuccesses(test) : 0;
    r.closes = [...new Set([...(r.closes ?? []), s.testId])];
    if (stage === "effect") {
      r.stage = s.successes > 0 ? "publish" : "drain";
      if (!s.successes) r.aborted = "the spell failed";
      return;
    }
    s.hours = ritualStageHours(r.force, s.successes, { minimum: stage === "sending" ? 1 : 0 });
    if (!s.successes) return abort(r, `no successes on the ${stage === "link" ? "material link" : "sending"}`);
    r.stage = stage === "link" ? "sending" : "effect";
  });
}

async function stageEffect(id) {
  const r0 = recordMsg(id)?.flags.sr2e.ritual;
  const spell = spellOf(r0);
  const leader = asActor(sync(r0.leaderUuid));
  const subj = asActor(sync(r0.subject.uuid));
  let tn = 4, tnNote = "Base TN 4 (the spell's own TN; cover and visibility don't apply, p.137).";
  if (spell.system.healsDamage && spell.system.healingTnBase && subj) {
    tn = healingSpellTN(spell.system.healingTnBase, subj.system?.essence?.value ?? 6);
    tnNote = `${esc(subj.name)}: ${spell.system.healingTnBase} − Essence → TN ${tn} (p.155).`;
  }
  const totem = totemDice(leader, r0.category);
  const data = await form("Determine the effect (SR2E p.137)", `
    <p>${tnNote} Only the leader's Injury Modifier applies${totem ? `; totem ${totem > 0 ? "+" : ""}${totem} dice` : ""}.</p>
    <label>Dice from the pool (${r0.pool}) <input type="number" name="dice" value="${r0.pool}" min="1" max="${r0.pool}"></label>
    <label>Target number <input type="number" name="tn" value="${tn}" min="2"></label>
    ${r0.subject.kind === "area" ? `<label>Radius change in metres (dice withheld from the pool, p.130) <input type="number" name="radiusDelta" value="0"></label>` : ""}
    ${spell.system.restriction?.startsWith("fetish") ? `<label><input type="checkbox" name="fetish" checked> The leader holds the fetish</label>` : ""}`);
  if (!data) return;
  return mutate(id, async (r) => {
    if (r.stage !== "effect" || r.stages.effect?.testId) return false;
    // Preflight — retryable: nothing is spent if it fails.
    const excl = preCastBlock(leader, spell);
    if (excl) { ui.notifications.warn(`Ritual: ${excl}`); return false; }
    if (!r.fetishConsumed) {
      const f = fetishCheck(leader, spell, !!data.fetish);
      if (!f.ok) { ui.notifications.warn(`Ritual: ${f.reason}`); return false; }
      if (f.consume) await f.consume.update({ "system.quantity": Math.max(0, (f.consume.system.quantity ?? 1) - 1) });
      r.fetishConsumed = true;
    }
    let withheld = 0;
    if (r.subject.kind === "area") {
      const geo = areaSpellGeometry({ magic: leader.system.magic?.value ?? 0, force: r.effForce, radiusDelta: Number(data.radiusDelta) || 0 });
      if (!geo.valid) { ui.notifications.warn("Ritual: that is not a valid area radius (p.130)."); return false; }
      withheld = geo.withheld;
      r.subject.radius = geo.radius;
    }
    const dice = Math.trunc(Number(data.dice) || 0);
    if (dice < 1 || dice + withheld > r.pool) { ui.notifications.warn(`Use 1–${r.pool - withheld} dice (${withheld} withheld for the radius).`); return false; }
    const bio = spell.system.healsDamage && subj ? biowareHealingTnMod(subj.system?.bodyIndex?.value ?? 0) : 0;
    await rollStage(r, "effect", Math.max(0, dice + totem), Math.max(2, Math.trunc(Number(data.tn) || 4)),
      `Ritual — ${r.spellName} effect (Force ${r.effForce}${totem ? `, totem ${totem > 0 ? "+" : ""}${totem}` : ""}, p.137)`,
      { poolDice: dice, totemUsed: Math.max(0, totem), withheld, extraTN: bio, extraTNLabel: bio ? "bioware interference" : undefined });
    adopt(r);    // freezes the Drain level before anything is published
  });
}

/** Post the effect from the finalised test — each artifact once (keyed). */
async function publish(id) {
  return mutate(id, async (r) => {
    if (r.stage !== "publish") return false;
    const s = r.stages.effect;
    const spell = spellOf(r);
    const leader = asActor(sync(r.leaderUuid));
    const speaker = ChatMessage.getSpeaker({ actor: leader });
    const key = (kind, k = "") => `${r.id}:${kind}:${k}`;
    const exists = (k) => game.messages.some(m => m.flags?.sr2e?.ritualCard === k);
    const post = async (k, data) => { if (!exists(k)) await ChatMessage.create(foundry.utils.mergeObject(data, { flags: { sr2e: { ritualCard: k } } })); };
    const manip = spell.system.category === "manipulation" ? manipulationDamage(spell.system.damageCode, r.effForce) : null;
    const resistTN = ritualResistTN(r.effForce, ritualSkill(leader));
    const cardFor = async (target, name) => {
      const owners = game.users.filter(u => target.testUserPermission(u, "OWNER")).map(u => u.id);
      const whisper = [...new Set([...gmIds(), ...owners])];
      if (manip && ["character", "npc", "spirit"].includes(target.type)) {
        const st = { testMessageId: s.testId, casterName: leader.name, spellName: r.spellName, targetUuid: target.uuid, targetName: name,
          basePower: manip.power, baseLevel: manip.level, successes: s.successes, resolved: false, area: r.subject.kind === "area", staging: "net" };
        return post(key("manip", target.uuid), { speaker, whisper, content: renderManipDamageCard(st), flags: { sr2e: { manipDamage: st } } });
      }
      if (spell.system.healsDamage) {
        const st = { spellName: r.spellName, casterName: leader.name, subjectUuid: target.uuid, subjectName: name, successes: s.successes,
          hurt: (target.system?.conditionMonitor?.physical?.value ?? 0) > 0, testMessageId: s.testId, resolved: false };
        return post(key("heal", target.uuid), { speaker, whisper, content: renderHealingCard(st), flags: { sr2e: { healing: st } } });
      }
      if (spellEffectKind(spell) === "ignite") {
        return post(key("ignite", target.uuid), { speaker, whisper: gmIds(), content: `<div class="sr2e-damage-result">🔥 Ritual Ignite on
          ${esc(name)}: ${s.successes} successes (Force ${r.effForce}). <div class="sr2e-karma-actions">${btn(r, "ignite", "🔥 Apply", `data-target="${target.uuid}"`)}</div></div>` });
      }
    };
    const note = `${s.successes} success${s.successes === 1 ? "" : "es"} at Force ${r.effForce}. If the spell is resisted,
      the Spell Resistance TN is <strong>${resistTN}</strong> (the higher of Force and the leader's Ritual Sorcery, p.137); allies
      aware of the sending may use Spell Defense (p.132).`;
    if (r.subject.kind === "area") {
      const scene = game.scenes.get(r.subject.sceneId);
      if (scene && !scene.templates.some(t => t.flags?.sr2e?.ritualCard === key("template"))) {
        await scene.createEmbeddedDocuments("MeasuredTemplate", [{ t: "circle", x: r.subject.center.x, y: r.subject.center.y,
          distance: r.subject.radius, fillColor: "#9b6dff", borderColor: "#6a2dd0", flags: { sr2e: { areaSpell: r.spellName, ritualCard: key("template") } } }]);
      }
      await post(key("summary-public"), { speaker, content: `<div class="sr2e-damage-result"><strong>✨ ${esc(r.spellName)}</strong>
        — a ritual area spell, ${r.subject.radius} m radius.</div>` });
      const caught = [];
      const px = scene ? scene.grid.size / scene.grid.distance : 1;
      for (const tok of scene?.tokens ?? []) {
        const a = tok.actor;
        if (!a || !areaTargetEligible(a.type, spell.system.type)) continue;
        const c = { x: tok.x + tok.width * scene.grid.size / 2, y: tok.y + tok.height * scene.grid.size / 2 };
        if (Math.hypot(c.x - r.subject.center.x, c.y - r.subject.center.y) / px > r.subject.radius + 1e-6) continue;
        if (caught.some(x => x.a.uuid === a.uuid)) continue;
        caught.push({ a, name: tok.name });
      }
      for (const { a, name } of caught) await cardFor(a, name);
      await post(key("summary-gm"), { speaker, whisper: gmIds(), content: `<div class="sr2e-damage-result">✨ ${esc(r.spellName)} (ritual):
        ${caught.length ? `in the area — ${caught.map(c => esc(c.name)).join(", ")}` : "no one in the area"}. ${note}</div>` });
    } else {
      const target = asActor(sync(r.subject.uuid));
      if (target) await cardFor(target, r.subject.name);
      await post(key("summary-gm"), { speaker, whisper: gmIds(), content: `<div class="sr2e-damage-result">✨ ${esc(r.spellName)} (ritual) on
        ${esc(r.subject.name)}: ${note}</div>` });
    }
    r.stage = spell.system.duration === "sustained" ? "sustain" : "drain";
  });
}

async function sustain(id) {
  const r0 = recordMsg(id)?.flags.sr2e.ritual;
  const leader = asActor(sync(r0.leaderUuid));
  const data = await form("Sustaining the ritual spell (SR2E p.137)", `
    <label><input type="radio" name="mode" value="none" checked> Not sustained</label><br>
    <label><input type="radio" name="mode" value="dice"> Leftover pool dice (${r0.pool}): <input type="number" name="dice" value="${r0.pool}" min="1" max="${r0.pool}" style="width:4em">
      × Magic ${leader.system.magic?.value ?? 0} hours</label><br>
    <label><input type="radio" name="mode" value="elemental"> An elemental (Force ${r0.force} days)</label><br>
    <label><input type="radio" name="mode" value="locked"> The team stays locked in (+2 to every member's Drain test)</label>`, "Choose");
  if (!data) return;
  return mutate(id, async (r) => {
    if (r.stage !== "sustain") return false;
    const magic = leader.system.magic?.value ?? 0;
    if (data.mode === "dice") {
      const n = Math.trunc(Number(data.dice) || 0);
      if (n < 1 || n > r.pool) { ui.notifications.warn(`Use 1–${r.pool} dice.`); return false; }
      r.pool -= n;                          // gone before the Drain split (R5 #4)
      r.sustain = { mode: "dice", dice: n, note: `${n} pool dice — ${ritualSustainHours(magic, n)} hours from the ritual's end; the GM ends it` };
    } else if (data.mode === "elemental") {
      r.sustain = { mode: "elemental", note: `by an elemental for ${r.force} days (p.137); the GM tracks it` };
    } else if (data.mode === "locked") {
      r.sustain = { mode: "locked", note: "the team stays locked in: each member is sustaining a spell (+2 TN to other tests, no other spells, mundane tasks only — GM-enforced)" };
    } else r.sustain = { mode: "none", note: "not sustained" };
    r.stage = "drain";
  });
}

/** One member's Drain Resistance Test (p.137): Willpower + assigned + totem + attested. */
async function drain(id, memberUuid) {
  const r0 = recordMsg(id)?.flags.sr2e.ritual;
  const m = asActor(sync(memberUuid));
  if (!m) return ui.notifications.warn("That member no longer exists.");
  const assignedElsewhere = Object.entries(r0.drain).filter(([u, d]) => u !== dk(memberUuid) && d.testId).reduce((n, [, d]) => n + d.assigned, 0);
  const free = Math.max(0, r0.pool);
  const isLeader = memberUuid === r0.leaderUuid;
  const totem = Math.max(0, totemDice(m, r0.category) - (isLeader ? (r0.stages.effect?.totemUsed ?? 0) : 0));
  const data = await form(`Drain — ${m.name} (SR2E p.137)`, `
    <p>Drain ${r0.drainLevel} at TN ${r0.drainTN}${r0.sustain?.mode === "locked" ? " +2 (locked in)" : ""}. Willpower ${m.system.willpower?.value ?? 1}${totem ? `, unused totem dice ${totem}` : ""}.</p>
    <label>Leftover pool dice the leader assigns (${free} left${assignedElsewhere ? `, ${assignedElsewhere} already given` : ""})
      <input type="number" name="assigned" value="0" min="0" max="${free}"></label>
    <label>Unused foci / spirit-aid dice (GM-attested) <input type="number" name="other" value="0" min="0"></label>
    <input type="text" name="otherLabel" placeholder="which focus / spirit">`);
  if (!data) return;
  return mutate(id, async (r) => {
    const d = r.drain[dk(memberUuid)];
    if (r.stage !== "drain" || !d || d.testId || d.done) return false;
    const assigned = Math.trunc(Number(data.assigned) || 0);
    if (assigned < 0 || assigned > r.pool) { ui.notifications.warn(`Assign 0–${r.pool} dice.`); return false; }
    const other = Math.max(0, Math.trunc(Number(data.other) || 0));
    await m.rollSuccessTest((m.system.willpower?.value ?? 1) + assigned + totem + other, r.drainTN, {
      isResistance: true,
      extraTN: r.sustain?.mode === "locked" ? 2 : 0, extraTNLabel: "locked in (sustaining)",
      label: `Ritual Drain — ${r.spellName}, ${r.drainLevel} (TN ${r.drainTN})${assigned ? ` +${assigned} pool` : ""}${totem ? ` +${totem} totem` : ""}${other ? ` +${other} ${data.otherLabel || "attested"}` : ""}`,
      flags: { sr2e: { ritualTest: { ritualId: r.id, stage: "drain", memberUuid, dice: assigned } } }
    });
    adopt(r);
  });
}

/** Finalise a member's Drain: damage and its marker in ONE actor update. */
async function finaliseDrain(id, memberUuid) {
  return mutate(id, async (r) => {
    const d = r.drain[dk(memberUuid)];
    if (!d?.testId || d.done) return false;
    const m = asActor(sync(memberUuid));
    const marker = `flags.sr2e.ritualDrain.${r.id}`;
    const test = game.messages.get(d.testId)?.flags?.sr2e?.test;
    const succ = test ? testTotalSuccesses(test) : 0;
    r.closes = [...new Set([...(r.closes ?? []), d.testId])];
    const idx = STAGES.indexOf(r.drainLevel) - Math.floor(succ / 2);
    const type = r.force > (m?.system.magic?.value ?? 0) || m?.system.astralState === "projecting" ? "physical" : "stun";
    if (m && !m.getFlag("sr2e", "ritualDrain")?.[r.id]) {
      await m.update(idx >= 0 ? { ...m.damageUpdate(type, BOXES[idx]), [marker]: true } : { [marker]: true });
    }
    d.done = true;
    d.result = idx >= 0 ? `${STAGES[idx]} ${type} (${BOXES[idx]} box${BOXES[idx] === 1 ? "" : "es"})` : "fully resisted";
    const everyone = [r.leader, ...r.members];
    if (everyone.every(x => r.drain[dk(x.uuid)]?.done)) r.stage = "done";
  });
}

async function withdraw(id) {
  const r0 = recordMsg(id)?.flags.sr2e.ritual;
  const opts = r0.members.filter(m => !m.withdrawn).map(m => `<option value="${m.uuid}">${esc(m.name)}${m.guide ? " (guide)" : ""}</option>`).join("");
  if (!opts) return ui.notifications.warn("No member can withdraw — the leader terminates instead.");
  const data = await form("Withdraw from the ritual (SR2E p.135)", `<select name="who">${opts}</select>
    <p><em>The leader can't withdraw — terminate instead.</em></p>`, "Withdraw");
  if (data) return withdrawMember(id, data.who);
}

/** A member leaves (p.135): their dice leave the pool; the guide leaving aborts. */
function withdrawMember(id, uuid) {
  return mutate(id, async (r) => {
    const m = r.members.find(x => x.uuid === uuid && !x.withdrawn);
    if (!m || !["link", "sending", "effect"].includes(r.stage)) return false;
    m.withdrawn = true;
    if (m.guide) return abort(r, `the astral guide ${m.name} withdrew`);
    r.pool = Math.max(0, r.pool - m.contribution);
    if (r.pool <= 0) abort(r, `${m.name} withdrew and the pool is exhausted`);
  });
}

// ── Wiring ─────────────────────────────────────────────────────────────────

export function wireRitualButtons(message, html) {
  html.querySelectorAll?.(".sr2e-ritual-btn").forEach(b => b.addEventListener("click", async (ev) => {
    ev.preventDefault();
    if (!game.user.isGM) return ui.notifications.warn("The GM runs the ritual.");
    const id = b.dataset.ritualId, member = b.dataset.member;
    switch (b.dataset.action) {
      case "pay": return pay(id, false);
      case "supplied": return pay(id, true);
      case "link": return stageLink(id);
      case "sending": return stageSending(id);
      case "effect": return stageEffect(id);
      case "finalise": return finalise(id, b.dataset.stage);
      case "publish": return publish(id);
      case "sustain": return sustain(id);
      case "drain": return drain(id, member);
      case "finaliseDrain": return finaliseDrain(id, member);
      case "withdraw": return withdraw(id);
      case "guideLost": return mutate(id, (r) => {
        if (!r.members.some(m => m.guide && !m.withdrawn)) { ui.notifications.warn("This ritual has no astral guide."); return false; }
        return abort(r, "the astral guide was driven off");
      });
      case "terminate": return mutate(id, (r) => ["link", "sending", "effect"].includes(r.stage) ? abort(r, "terminated by the GM") : false);
      case "ignite": {
        const r = recordMsg(id)?.flags.sr2e.ritual;
        const target = asActor(sync(b.dataset.target));
        if (!r || !target || message.getFlag("sr2e", "igniteApplied")) return;
        await message.setFlag("sr2e", "igniteApplied", true);
        return igniteFromCast({ caster: asActor(sync(r.leaderUuid)), force: r.effForce, successes: r.stages.effect.successes, target });
      }
    }
  }));
}

/** Quench: drive the queue directly. */
export const ritualTesting = { dk, mutate, finalise, publish, finaliseDrain, rollStage, adopt, recordMsg, withdrawMember };
