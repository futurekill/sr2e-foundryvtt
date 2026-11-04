/**
 * VR2.0 programming (pp.100–102; docs/PLAN-vr2-part5b.md §4): a task on the program item being written.
 * `flags.sr2e.programming = { taskId, testMessageId, design, designSize, baseTime, team, period?, log: {id: {days, bonus}}, complete? }`.
 * The test's successes are frozen (and the test closed to Karma) by the first day logged; each log is its own key, so
 * two devices logging at once both land; completion is refused if the design changed since the start.
 */
import { testTotalSuccesses } from "./rules/sr2e-rules.mjs";
import { baseTime, taskPeriod, workDone, toolBonus, teamTerms, programmingCap, sensitiveSkill, mainframeAdequate, PROGRAMMING_TOOLS } from "./rules/vr2-options.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const skillOf = (actor, re) => actor?.items.find(i => i.type === "skill" && re.test(i.name))?.system?.rating ?? 0;
const computerOf = (actor) => skillOf(actor, /^computer$/i);
/**
 * The skill a programmer rolls (p.100): Computer, or its Software concentration / Matrix Programming specialization
 * where higher. The rating caps (p.98, p.101) stay on Computer itself.
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

export const taskOf = (item) => item?.flags?.sr2e?.programming ?? null;
/** Days of work done on a task: Σ days × (1 + bonus) over its log (p.101–102). */
export const doneOf = (task) => Object.values(task?.log ?? {}).reduce((n, l) => n + workDone(l.days, l.bonus), 0);
/**
 * Unusable until written: an open task, or a program whose writing failed or was abandoned (`{unwritten: true}`,
 * no taskId) — it never was written. A program that was usable before its task started gets its flag removed instead.
 */
export const unfinished = (item) => !!taskOf(item) && !taskOf(item).complete;
const writing = (task) => !!task?.taskId && !task.complete;
/** End a task without a program: a copy that was usable before goes back to that; one never written stays unwritten. */
const endTask = (item, task) => task?.restore ? item.unsetFlag("sr2e", "programming") : item.setFlag("sr2e", "programming", { unwritten: true });

export async function programmingDialog(actor, item) {
  if (!item || item.type !== "program") return;
  if (!item.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM can program.`);
  const task = taskOf(item);
  return writing(task) ? workDialog(actor, item, task) : startDialog(actor, item);
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
  const skills = members.map(m => sensitive ? sensitiveSkill(programmingSkillOf(m), skillOf(m, /^(computer|matrix) theory/i)) : programmingSkillOf(m));
  const t = teamTerms(skills);
  const cap = programmingCap(item.system.utility, members.map(computerOf));
  if (item.system.rating > cap) return ui.notifications.warn(`${members.length > 1 ? "This team" : actor.name} can write ${item.name} up to rating ${cap} (VR2.0 p.98, p.101–102).`);
  if (members.length > 1 && members.length > t.maxSize) return ui.notifications.warn(`A team led by Computer ${Math.max(...skills)} has at most ${t.maxSize} members (p.102).`);
  const dice = members.length > 1 ? t.skill : skills[0];
  const res = await actor.rollSuccessTest(Math.max(0, dice), Math.max(2, item.system.rating), {
    label: `Programming ${esc(item.name)}: Computer (${item.system.rating})`, tnContext: { kind: "other" } });
  if (!res) return;
  if (!foundry.utils.objectsEqual(designOf(live(item)), plan) || writing(taskOf(live(item)))) {
    return ui.notifications.warn(`${item.name} changed (or another device started writing it) during the test: start again.`);
  }
  await live(item).setFlag("sr2e", "programming", { taskId: foundry.utils.randomID(), testMessageId: res.testMessageId, design: plan,
    designSize: design, baseTime: base, team: team.map(a => a.uuid), log: {}, restore });
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(actor.name)} starts programming
    ${esc(item.name)}: base time ${base} days ÷ the test's successes (Karma may still change them, until the first day of work).</div>` });
}

/** Log work (p.101–102), or complete the task. */
async function workDialog(actor, item, task) {
  const team = (task.team ?? []).length > 0;
  const done = doneOf(task), period = task.period ?? null;
  if (period != null && done >= period) return complete(actor, item, task);
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
  // The task may have changed during the dialog (finished, abandoned, restarted on another device): log only into THIS one.
  const cur = taskOf(live(item));
  if (cur?.taskId !== task.taskId || !writing(cur)) return ui.notifications.warn(`${item.name}'s programming task changed meanwhile: open it again.`);
  task = cur;
  if (!team && pick.tools.mainframe && !mainframeAdequate(pick.sv, item.system.rating)) {
    return ui.notifications.warn(`A mainframe needs a Security Value of at least half the program's rating (${Math.ceil(item.system.rating / 2)}; p.101).`);
  }
  // A team pools its members' bonuses less one per programmer (p.102); solo, the tools' bonus.
  const n = (task.team ?? []).length + 1;
  const bonus = team ? teamTerms(Array(n).fill(0), pick.bonuses.split(",").slice(0, n).map(b => parseInt(b) || 0)).bonus : toolBonus(pick.tools);
  const update = { [`flags.sr2e.programming.log.${foundry.utils.randomID()}`]: { days: pick.days, bonus } };
  if (task.period == null) {
    // The first day of work fixes the period from the test as it stands: the test is closed to Karma FIRST, so a
    // period written afterwards can't disagree with a later Karma spend (the period then reads the closed test).
    const test = game.messages.get(task.testMessageId)?.flags?.sr2e?.test;
    const p = taskPeriod(task.baseTime, test ? testTotalSuccesses(test) : 0);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(item.name)}: ${p == null
      ? "no successes on the programming test — the task fails; try again (p.100)."
      : `the task period is fixed at ${p} day${p === 1 ? "" : "s"} (base ${task.baseTime} ÷ the test's successes).`}</div>`,
      flags: { sr2e: { closesTests: [task.testMessageId] } } });
    if (p == null) return endTask(live(item), task);
    update["flags.sr2e.programming.period"] = p;
  }
  await live(item).update(update);
  const now = taskOf(live(item));
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(actor.name)} works ${pick.days} day${pick.days === 1 ? "" : "s"} on
    ${esc(item.name)} (task bonus +${bonus}): ${doneOf(now)} of ${now.period} days done.</div>` });
  if (doneOf(now) >= now.period) return complete(actor, item, now);
}

async function complete(actor, item, task) {
  if (!foundry.utils.objectsEqual(designOf(item), task.design)) {
    return ui.notifications.warn(`${item.name}'s design changed since the task started: start a new task for the new design.`);
  }
  await item.setFlag("sr2e", "programming", { ...task, complete: true });
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card"><strong>${esc(item.name)} is written</strong>
    (${task.period} days of work; VR2.0 p.101).</div>` });
}

/** Abandon a task (the design unlocks; the work is lost). */
export async function abandon(actor, item) {
  const task = taskOf(item);
  if (!writing(task)) return;
  if (!await foundry.applications.api.DialogV2.confirm({ window: { title: item.name }, content: `<p>Abandon programming ${esc(item.name)}? The work done is lost${task.restore ? "" : ", and the program stays unwritten"}.</p>`, rejectClose: false })) return;
  if (taskOf(live(item))?.taskId !== task.taskId) return;   // changed meanwhile
  await endTask(live(item), task);
}
