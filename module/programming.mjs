/**
 * VR2.0 programming (pp.100–102; docs/PLAN-vr2-part5b.md §4): tasks on the program item being written.
 * `flags.sr2e.programming = { current, tasks: { [taskId]: { testMessageId, design, designSize, baseTime, team, restore,
 * period?, log: {id: {days, bonus}}, complete? } }, unwritten? }` (readers: `progTask`/`progWriting`/`progUnfinished`).
 * Every write targets the task's OWN key, so a dialog left open across an abandon/restart can only touch its own,
 * stale task (Codex R3 #1, #3). The test is closed to Karma before its successes fix the period; completion is
 * refused if the design changed since the start.
 */
import { testTotalSuccesses } from "./rules/sr2e-rules.mjs";
import { baseTime, taskPeriod, workDone, toolBonus, teamTerms, programmingCap, sensitiveSkill, mainframeAdequate,
  PROGRAMMING_TOOLS, progTask, progWriting, progUnfinished } from "./rules/vr2-options.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const skillOf = (actor, re) => actor?.items.find(i => i.type === "skill" && re.test(i.name))?.system?.rating ?? 0;
const computerOf = (actor) => skillOf(actor, /^computer$/i);
/**
 * The skill a programmer rolls (p.100): Computer, or its Software concentration / Matrix Programming specialization
 * where higher. The rating caps (p.98, p.101) and team size (p.102) stay on Computer itself.
 */
function programmingSkillOf(actor) {
  const c = actor?.items.find(i => i.type === "skill" && /^computer$/i.test(i.name))?.system;
  if (!c) return 0;
  const conc = /software/i.test(c.concentration?.name ?? "") ? (c.concentration.rating ?? 0) : 0;
  const spec = /matrix programming/i.test(c.specialization?.name ?? "") ? (c.specialization.rating ?? 0) : 0;
  return Math.max(c.rating ?? 0, conc, spec);
}
/** What the program IS: identity and design. A change makes it a different program (the lock in sr2e.mjs matches). */
const designOf = (item) => ({ name: item.name, category: item.system.category, offense: item.system.offense ?? "",
  damageLevel: item.system.damageLevel ?? "", manufacturer: item.system.manufacturer ?? "",
  rating: item.system.rating, multiplier: item.system.multiplier,
  options: (item.system.options ?? []).map(o => ({ kind: o.kind, rating: o.rating, target: o.target })) });
const live = (item) => item.parent?.items.get(item.id) ?? item;
const stateOf = (item) => live(item)?.flags?.sr2e?.programming ?? null;
const P = "flags.sr2e.programming";

/** The task being written (or last written), or null. */
export const taskOf = (item) => progTask(item?.flags?.sr2e?.programming);
/** Days of work done on a task: Σ days × (1 + bonus) over its log (p.101–102). */
export const doneOf = (task) => Object.values(task?.log ?? {}).reduce((n, l) => n + workDone(l.days, l.bonus), 0);
/** Not usable yet: being written, or never written. */
export const unfinished = (item) => progUnfinished(item?.flags?.sr2e?.programming);
export const writingOf = (item) => progWriting(item?.flags?.sr2e?.programming);

/** End task `id` without a program: a copy usable before it goes back to that; one never written stays unwritten. */
async function endTask(item, id) {
  const s = stateOf(item);
  if (s?.current !== id) return;   // another task took over meanwhile: this one is history already
  await live(item).update({ [`${P}.current`]: null, [`${P}.unwritten`]: !s.tasks?.[id]?.restore });
}

export async function programmingDialog(actor, item) {
  if (!item || item.type !== "program") return;
  if (!item.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM can program.`);
  const s = stateOf(item);
  return progWriting(s) ? workDialog(actor, item, s.current) : startDialog(actor, item);
}

/**
 * A new programming project (p.100): a program item that doesn't exist until it's written. Opens its sheet to set
 * the design; the code button on its row then starts writing it.
 */
export async function newProject(actor) {
  if (!actor?.isOwner) return;
  const [item] = await actor.createEmbeddedDocuments("Item", [{ name: "New program", type: "program",
    system: { category: "other", rating: 1, multiplier: 1 }, flags: { sr2e: { programming: { current: null, tasks: {}, unwritten: true } } } }]);
  item?.sheet.render(true);
}

/** Start (p.100–101): base time from the design size; the Computer (Program Rating) Test sets the task period. */
async function startDialog(actor, item) {
  const others = game.actors.filter(a => a.type === "character" && a.id !== actor.id && computerOf(a) > 0);
  const sensitive = item.system.activeOpts?.some(o => o.kind === "sensitive");
  // The design is captured BEFORE the dialog and the roll, and re-checked before the task is written.
  const plan = designOf(item), restore = !unfinished(item);
  const design = item.system.designSize ?? item.system.size, base = baseTime(design);
  const pick = await foundry.applications.api.DialogV2.prompt({ window: { title: `Program ${item.name}` },
    content: `<div>
      <p>Design size ${design} Mp → base time ${base} days (VR2.0 p.100). Computer Test against the program's rating, ${item.system.rating}.</p>
      ${others.length ? `<div class="form-group"><label title="Team (p.102): up to half the best Computer Skill (round down) members; the test uses their average skill (round up).">Team:</label>
        <div>${others.map(a => `<label style="display:block;"><input type="checkbox" name="team" value="${esc(a.uuid)}"> ${esc(a.name)} (Computer ${computerOf(a)})</label>`).join("")}</div></div>` : ""}
      ${sensitive ? `<p class="hint">Sensitive (p.104): the test uses the average of Computer and Computer Theory / Matrix Theory.</p>` : ""}
    </div>`,
    ok: { label: "Roll", callback: (e, b) => ({ team: [...b.form.querySelectorAll("input[name=team]:checked")].map(i => i.value) }) } }).catch(() => null);
  if (!pick) return;
  const team = pick.team.map(u => fromUuidSync(u)).filter(Boolean);
  const members = [actor, ...team];
  const computers = members.map(computerOf);
  const skills = members.map(m => sensitive ? sensitiveSkill(programmingSkillOf(m), skillOf(m, /^(computer|matrix) theory/i)) : programmingSkillOf(m));
  const cap = programmingCap(item.system.utility, computers);
  const maxSize = teamTerms(computers).maxSize;   // membership: the best COMPUTER skill (p.102), not a specialization
  if (item.system.rating > cap) return ui.notifications.warn(`${members.length > 1 ? "This team" : actor.name} can write ${item.name} up to rating ${cap} (VR2.0 p.98, p.101–102).`);
  if (members.length > 1 && members.length > maxSize) return ui.notifications.warn(`A team led by Computer ${Math.max(...computers)} has at most ${maxSize} members (p.102).`);
  const dice = members.length > 1 ? teamTerms(skills).skill : skills[0];
  const res = await actor.rollSuccessTest(Math.max(0, dice), Math.max(2, item.system.rating), {
    label: `Programming ${esc(item.name)}: Computer (${item.system.rating})`, tnContext: { kind: "other" } });
  if (!res) return;
  if (!foundry.utils.objectsEqual(designOf(live(item)), plan) || progWriting(stateOf(item))) {
    return ui.notifications.warn(`${item.name} changed (or another device started writing it) during the test: start again.`);
  }
  const id = foundry.utils.randomID();
  await live(item).update({ [`${P}.current`]: id, [`${P}.tasks.${id}`]: { testMessageId: res.testMessageId, design: plan,
    designSize: design, baseTime: base, team: team.map(a => a.uuid), log: {}, restore } });
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(actor.name)} starts programming
    ${esc(item.name)}: base time ${base} days ÷ the test's successes (Karma may still change them, until the first day of work).</div>` });
}

/** Log work on task `id` (p.101–102), or complete it. */
async function workDialog(actor, item, id) {
  const task = stateOf(item).tasks[id];
  const team = (task.team ?? []).length > 0;
  const done = doneOf(task), period = task.period ?? null;
  if (period != null && done >= period) return complete(actor, item, id);
  const tools = Object.entries(PROGRAMMING_TOOLS).map(([k, t]) => `<label style="display:block;"><input type="checkbox" name="${k}"> ${esc(t.label)} (+${t.bonus})</label>`).join("");
  const pick = await foundry.applications.api.DialogV2.prompt({ window: { title: `Programming ${item.name}` },
    content: `<div>
      <p>${period == null ? `Task period: base time ${task.baseTime} ÷ the test's successes (fixed by this first log).` : `Task period ${period} days; ${done} done, ${period - done} to go.`}</p>
      <div class="form-group"><label>Days worked:</label><input type="number" name="days" value="1" min="1"></div>
      ${team ? `<div class="form-group"><label title="Each member's own task bonus from their tools, comma-separated, ${actor.name} first (p.102)">Members' bonuses:</label><input type="text" name="bonuses" placeholder="e.g. 3, 2, 3"></div>`
        : `<fieldset><legend>Tools (p.102)</legend>${tools}
           <div class="form-group"><label>Mainframe Security Value:</label><input type="number" name="sv" value="0" min="0"></div></fieldset>`}
    </div>`,
    ok: { label: "Log", callback: (e, b) => { const f = b.form.elements;
      return { days: Math.max(1, parseInt(f.days.value) || 1), bonuses: String(f.bonuses?.value ?? ""), sv: parseInt(f.sv?.value) || 0,
        tools: Object.fromEntries(Object.keys(PROGRAMMING_TOOLS).map(k => [k, !!f[k]?.checked])) }; } } }).catch(() => null);
  if (!pick) return;
  if (stateOf(item)?.current !== id || !progWriting(stateOf(item))) return ui.notifications.warn(`${item.name}'s programming task changed meanwhile: open it again.`);
  if (!team && pick.tools.mainframe && !mainframeAdequate(pick.sv, item.system.rating)) {
    return ui.notifications.warn(`A mainframe needs a Security Value of at least half the program's rating (${Math.ceil(item.system.rating / 2)}; p.101).`);
  }
  // A team pools its members' bonuses less one per programmer (p.102); solo, the tools' bonus.
  const n = (task.team ?? []).length + 1;
  const bonus = team ? teamTerms(Array(n).fill(0), pick.bonuses.split(",").slice(0, n).map(b => parseInt(b) || 0)).bonus : toolBonus(pick.tools);
  if (stateOf(item).tasks[id].period == null && !await freezePeriod(actor, item, id)) return;
  await live(item).update({ [`${P}.tasks.${id}.log.${foundry.utils.randomID()}`]: { days: pick.days, bonus } });
  const now = stateOf(item).tasks[id];
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(actor.name)} works ${pick.days} day${pick.days === 1 ? "" : "s"} on
    ${esc(item.name)} (task bonus +${bonus}): ${doneOf(now)} of ${now.period} days done.</div>` });
  if (doneOf(now) >= now.period) return complete(actor, item, id);
}

/**
 * The first day of work fixes the period (p.100–101): close the test to Karma FIRST, THEN read its final successes,
 * then write the period once (a period already there wins). False if the task fails (no successes) or moved on.
 */
async function freezePeriod(actor, item, id) {
  const task = stateOf(item).tasks[id];
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(item.name)}: the first day of work
    fixes the programming test's successes (no more Karma on it).</div>`, flags: { sr2e: { closesTests: [task.testMessageId] } } });
  const test = game.messages.get(task.testMessageId)?.flags?.sr2e?.test;
  const p = taskPeriod(task.baseTime, test ? testTotalSuccesses(test) : 0);
  if (stateOf(item)?.current !== id) return false;
  if (p == null) {
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(item.name)}: no successes on the programming test — the task fails; try again (p.100).</div>` });
    await endTask(item, id);
    return false;
  }
  if (stateOf(item).tasks[id].period == null) await live(item).update({ [`${P}.tasks.${id}.period`]: p });
  return true;
}

async function complete(actor, item, id) {
  const s = stateOf(item), task = s?.tasks?.[id];
  if (s?.current !== id || !task) return ui.notifications.warn(`${item.name}'s programming task changed meanwhile.`);
  if (!foundry.utils.objectsEqual(designOf(live(item)), task.design)) {
    return ui.notifications.warn(`${item.name}'s design changed since the task started: start a new task for the new design.`);
  }
  await live(item).update({ [`${P}.tasks.${id}.complete`]: true, [`${P}.unwritten`]: false });
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card"><strong>${esc(item.name)} is written</strong>
    (${task.period} days of work; VR2.0 p.101).</div>` });
}

/** Abandon the task being written (the design unlocks; the work is lost). */
export async function abandon(actor, item) {
  const s = stateOf(item), id = s?.current, task = progTask(s);
  if (!progWriting(s)) return;
  if (!await foundry.applications.api.DialogV2.confirm({ window: { title: item.name }, content: `<p>Abandon programming ${esc(item.name)}? The work done is lost${task.restore ? "" : ", and the program stays unwritten"}.</p>`, rejectClose: false })) return;
  await endTask(item, id);
}
