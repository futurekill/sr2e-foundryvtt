/**
 * VR2.0 programming (pp.100–102; docs/PLAN-vr2-part5b.md §4). The lifecycle is an append-only log of durable records
 * on the program item (`recordEvent`), folded by `foldProgramming` (rules/vr2-options.mjs). Nothing is overwritten:
 * a log is its own record, and a task has ONE period record and ONE end record whose ids the server arbitrates, so
 * two devices can't both freeze a period or both end a task, and a delayed write only adds a record to its own task
 * (Codex R3–R4). The test is closed to Karma before its successes fix the period; completion is refused if the
 * design changed since the start.
 */
import { testTotalSuccesses } from "./rules/sr2e-rules.mjs";
import { baseTime, workDone, toolBonus, teamTerms, programmingCap, sensitiveSkill, mainframeAdequate,
  PROGRAMMING_TOOLS, foldProgramming } from "./rules/vr2-options.mjs";
import { recordEvent, eventsOf } from "./claims.mjs";
import { claimId } from "./rules/claim-rules.mjs";
import { coreDinabProblem, loadingTerms, loadProblems } from "./rules/vr2-frames.mjs";
import { enqueueAttack } from "./engagement.mjs";

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
export const designOf = (item) => ({ name: item.name, category: item.system.category, offense: item.system.offense ?? "",
  damageLevel: item.system.damageLevel ?? "", manufacturer: item.system.manufacturer ?? "",
  rating: item.system.rating, multiplier: item.system.multiplier,
  options: (item.system.options ?? []).map(o => ({ kind: o.kind, rating: o.rating, target: o.target })),
  // Part 6a-1: a frame core's design (p.105: "a core's attributes may not be rearranged"). Only on cores, so an
  // ordinary program's design (and every task captured before 6a-1) is unchanged.
  ...(item.system.frameCore?.kind ? { frameCore: ["kind", "bod", "evasion", "masking", "sensor", "initPoints"]
    .reduce((o, k) => ({ ...o, [k]: item.system.frameCore[k] ?? 0 }), {}) } : {}) });
const live = (item) => item.parent?.items.get(item.id) ?? item;
const successesOf = (id) => { const t = game.messages.get(id)?.flags?.sr2e?.test; return t ? testTotalSuccesses(t) : 0; };
/** The folded programming state of a program item (also the data model's and the design lock's reader). */
export const programmingState = (item) => foldProgramming(item?.effects ? eventsOf(item) : []);
/** Part 6a-1: a frame core's loading tasks, the same lifecycle under "load:" (p.106). */
export const loadingState = (item) => foldProgramming(item?.effects ? eventsOf(item) : [], "load:");
const PROG = "prog:", LOAD = "load:";
const stateOf = (item, fam = PROG) => (fam === LOAD ? loadingState : programmingState)(live(item));
const say = (actor, html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${html}</div>` });

/** The current (latest) task, or null. */
export const taskOf = (item, fam = PROG) => stateOf(item, fam).task;
/** Days of work done on a task: Σ days × (1 + bonus) over its log (p.101–102). */
export const doneOf = (task) => Object.values(task?.log ?? {}).reduce((n, l) => n + workDone(l.days, l.bonus), 0);
/** Not usable yet: being written, or never written. */
export const unfinished = (item) => stateOf(item).unfinished;
export const writingOf = (item) => stateOf(item).writing;

export async function programmingDialog(actor, item) {
  if (!item || item.type !== "program") return;
  if (!item.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM can program.`);
  const s = stateOf(item);
  return s.writing ? workDialog(actor, item, s.current) : startDialog(actor, item);
}

/** Part 6a-1: load programs onto a written frame core (p.106), or work on the loading task under way. */
export async function loadDialog(actor, core) {
  if (!core?.system?.isCore) return;
  if (!core.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM can load a frame.`);
  if (stateOf(core).writing) return ui.notifications.warn(`${core.name} is being programmed: finish or abandon that first.`);
  const s = stateOf(core, LOAD);
  return s.writing ? workDialog(actor, core, s.current, LOAD) : startLoad(actor, core);
}

/** A copy of a program for a frame (p.106): its authored design, whole; never live (R1 #4–#5). */
const copyOf = (p) => { const o = p.toObject(); return { sourceId: p.id, name: p.name,
  source: p._stats?.compendiumSource ?? p.flags?.core?.sourceId ?? null,
  system: ["rating", "multiplier", "category", "offense", "damageLevel", "options", "manufacturer"].reduce((x, k) => ({ ...x, [k]: foundry.utils.deepClone(o.system[k]) }), {}) }; };

async function startLoad(actor, core) {
  if (!core.system.coreWritten) return ui.notifications.warn(`${core.name} isn't written as it is now: program it first (p.105).`);
  if (core.system.coreProblems?.length) return ui.notifications.warn(core.system.coreProblems[0]);
  const progs = actor.items.filter(i => i.type === "program" && i.id !== core.id && !i.system.frameCore?.kind && !unfinished(i));
  if (!progs.length) return ui.notifications.warn(`${actor.name} has no written programs to load.`);
  const cap = core.system.capacity;
  const pick = await foundry.applications.api.DialogV2.prompt({ window: { title: `Load ${core.name}` },
    content: `<div>
      <p>Object-code copies of whole programs go onto the core; their ratings (options not counted) may total ${cap}
        (Core ${core.system.rating}${core.system.frameCore.initPoints ? ` − ${core.system.frameCore.initPoints} Initiative` : ""}; VR2.0 p.105–106).</p>
      ${progs.map(p => `<label style="display:block;"><input type="checkbox" name="prog" value="${p.id}"> ${esc(p.name)} (rating ${p.system.rating})</label>`).join("")}
    </div>`,
    ok: { label: "Choose", callback: (e, b) => [...b.form.querySelectorAll("input[name=prog]:checked")].map(i => i.value) } }).catch(() => null);
  if (!pick) return;
  const chosen = pick.map(id => actor.items.get(id)).filter(Boolean);
  const ratings = chosen.map(p => p.system.rating);
  const why = loadProblems(ratings, cap);
  if (why.length) return ui.notifications.warn(why[0]);
  // The core's and every source program's design, captured before the roll and re-checked after (6a-1 §3.6).
  const plan = designOf(core), sources = chosen.map(p => [p.id, designOf(p)]);
  const copies = chosen.map(copyOf);
  const terms = loadingTerms(ratings);
  const res = await actor.rollSuccessTest(Math.max(0, programmingSkillOf(actor)), terms.tn, {
    label: `Loading ${esc(core.name)}: Computer (${terms.tn})`, tnContext: { kind: "other" } });
  if (!res) return;
  const now = stateOf(core, LOAD);
  const changed = !foundry.utils.objectsEqual(designOf(live(core)), plan) || now.writing || stateOf(core).writing
    || sources.some(([id, d]) => !actor.items.get(id) || !foundry.utils.objectsEqual(designOf(actor.items.get(id)), d));
  if (changed) return ui.notifications.warn(`${core.name} or one of its programs changed (or another device started loading it) during the test: start again.`);
  const gen = now.nextGen;
  if (!await recordEvent(live(core), `${LOAD}start:${gen}`, { type: "progStart", gen, testMessageId: res.testMessageId, design: plan,
    designSize: terms.size, baseTime: terms.baseTime, team: [], load: copies, loadingRating: terms.loadingRating, tn: terms.tn })) {
    return ui.notifications.warn(`Another device started loading ${core.name} at the same moment: open it again.`);
  }
  say(actor, `${esc(actor.name)} starts loading ${esc(core.name)} with ${copies.map(c => esc(c.name)).join(", ")}: Loading Rating
    ${terms.loadingRating}, ${terms.size} Mp, base time ${terms.baseTime} days ÷ the test's successes (VR2.0 p.106).`);
}

/**
 * A new programming project (p.100): a program item that doesn't exist until it's written. Opens its sheet to set
 * the design; the code button on its row then starts writing it.
 */
export async function newProject(actor) {
  if (!actor?.isOwner) return;
  // The never-written record rides IN the creation, so there's no moment where the project looks written (Codex R5 #3).
  const [item] = await actor.createEmbeddedDocuments("Item", [{ name: "New program", type: "program",
    system: { category: "other", rating: 1, multiplier: 1 },
    effects: [{ _id: claimId("prog:new"), name: "SR2E event record", img: "icons/svg/clockwork.svg", disabled: true, transfer: false,
      flags: { sr2e: { claim: { key: "prog:new", at: game.time.serverTime, user: game.user.id, durable: true, event: { type: "progNew" } } } } }] }], { keepEmbeddedIds: true });
  if (!item) return;
  item.sheet.render(true);
  return item;
}

/** Start (p.100–101): base time from the design size; the Computer (Program Rating) Test sets the task period. */
async function startDialog(actor, item) {
  const others = game.actors.filter(a => a.type === "character" && a.id !== actor.id && computerOf(a) > 0);
  const sensitive = item.system.activeOpts?.some(o => o.kind === "sensitive");
  // The design is captured BEFORE the dialog and the roll, and re-checked before the task is recorded.
  const plan = designOf(item);
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
  if (item.system.rating > cap) return ui.notifications.warn(`${members.length > 1 ? "This team" : actor.name} can write ${item.name} up to rating ${cap} (VR2.0 p.98, p.101–102${item.system.isCore ? ", p.105" : ""}).`);
  // Part 6a-1: a frame core's own rules (p.105–106): a legal design, DINAB within the programmer's Computer.
  if (item.system.isCore) {
    const why = item.system.coreProblems?.[0] ?? coreDinabProblem(item.system.activeOpts, Math.max(0, ...computers));
    if (why) return ui.notifications.warn(why);
  }
  if (members.length > 1 && members.length > maxSize) return ui.notifications.warn(`A team led by Computer ${Math.max(...computers)} has at most ${maxSize} members (p.102).`);
  const dice = members.length > 1 ? teamTerms(skills).skill : skills[0];
  const res = await actor.rollSuccessTest(Math.max(0, dice), Math.max(2, item.system.rating), {
    label: `Programming ${esc(item.name)}: Computer (${item.system.rating})`, tnContext: { kind: "other" } });
  if (!res) return;
  const now = stateOf(item);
  if (!foundry.utils.objectsEqual(designOf(live(item)), plan) || now.writing) {
    return ui.notifications.warn(`${item.name} changed (or another device started writing it) during the test: start again.`);
  }
  // The next generation number: two devices starting at once claim the same id, and the server keeps one.
  const gen = now.nextGen;
  if (!await recordEvent(live(item), `prog:start:${gen}`, { type: "progStart", gen, testMessageId: res.testMessageId, design: plan,
    designSize: design, baseTime: base, team: team.map(a => a.uuid) })) {
    return ui.notifications.warn(`Another device started writing ${item.name} at the same moment: open it again.`);
  }
  say(actor, `${esc(actor.name)} starts programming ${esc(item.name)}: base time ${base} days ÷ the test's successes
    (Karma may still change them, until the first day of work).`);
}

/** Log work on task `id` (p.101–102), or complete it. `fam`: "prog:" (writing) or "load:" (a frame's loading, p.106). */
async function workDialog(actor, item, id, fam = PROG) {
  const task = stateOf(item, fam).tasks[id];
  const team = (task.team ?? []).length > 0;
  const done = doneOf(task), period = task.period ?? null;
  if (period != null && done >= period) return complete(actor, item, id, fam);
  const tools = Object.entries(PROGRAMMING_TOOLS).map(([k, t]) => `<label style="display:block;"><input type="checkbox" name="${k}"> ${esc(t.label)} (+${t.bonus})</label>`).join("");
  const pick = await foundry.applications.api.DialogV2.prompt({ window: { title: `${fam === LOAD ? "Loading" : "Programming"} ${item.name}` },
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
  if (stateOf(item, fam).current !== id || !stateOf(item, fam).writing) return ui.notifications.warn(`${item.name}'s task changed meanwhile: open it again.`);
  const rating = fam === LOAD ? task.loadingRating : item.system.rating;
  if (!team && pick.tools.mainframe && !mainframeAdequate(pick.sv, rating)) {
    return ui.notifications.warn(`A mainframe needs a Security Value of at least half the rating (${Math.ceil(rating / 2)}; p.101).`);
  }
  // A team pools its members' bonuses less one per programmer (p.102); solo, the tools' bonus.
  const n = (task.team ?? []).length + 1;
  const bonus = team ? teamTerms(Array(n).fill(0), pick.bonuses.split(",").slice(0, n).map(b => parseInt(b) || 0)).bonus : toolBonus(pick.tools);
  if (!stateOf(item, fam).tasks[id].frozen && !await freezePeriod(actor, item, id, fam)) return;
  // Its own record, tagged with its task: a log racing an abandon lands in the ended task, never a new one.
  await recordEvent(live(item), `${fam}log:${id}:${foundry.utils.randomID()}`, { type: "progLog", task: id, days: pick.days, bonus });
  const now = stateOf(item, fam).tasks[id];
  say(actor, `${esc(actor.name)} works ${pick.days} day${pick.days === 1 ? "" : "s"} ${fam === LOAD ? "loading" : "on"} ${esc(item.name)} (task bonus +${bonus}):
    ${doneOf(now)} of ${now.period} days done.`);
  if (doneOf(now) >= now.period) return complete(actor, item, id, fam);
}

/**
 * The first day of work fixes the period (p.100–101): close the test to Karma, let this device's Karma spends on it
 * settle (they share one queue, and a spend that finds the test closed after paying is refunded), then record the
 * FINAL successes once. The period derives from that record only, never the card.
 * shortcut: a spend made on ANOTHER device in the same instant, already past its own post-payment closure check,
 * can still land on the card after the record; it's then not counted (that Karma is spent). Closing it fully needs
 * one Karma authority across devices; revisit if a table ever hits it.
 * False if the task failed (no successes).
 */
async function freezePeriod(actor, item, id, fam = PROG) {
  const task = stateOf(item, fam).tasks[id];
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-item-card">${esc(item.name)}: the first day of work
    fixes the programming test's successes (no more Karma on it).</div>`, flags: { sr2e: { closesTests: [task.testMessageId] } } });
  await enqueueAttack(`karma:${task.testMessageId}`, () => true);   // this device's spends on the test have landed
  const won = await recordEvent(live(item), `${fam}frozen:${id}`, { type: "progFrozen", task: id, successes: successesOf(task.testMessageId) });
  const t = stateOf(item, fam).tasks[id];
  if (t.end === "fail") {
    if (won) say(actor, `${esc(item.name)}: no successes on the ${fam === LOAD ? "loading" : "programming"} test — the task fails; try again (p.100).`);
    return false;
  }
  return stateOf(item, fam).current === id && !t.end;
}

async function complete(actor, item, id, fam = PROG) {
  const s = stateOf(item, fam), task = s.tasks[id];
  if (!task || task.end) return ui.notifications.warn(`${item.name}'s task already ended.`);
  if (!foundry.utils.objectsEqual(designOf(live(item)), task.design)) {
    return ui.notifications.warn(`${item.name}'s design changed since the task started: start a new task for the new design.`);
  }
  // A loading task's winning end record carries the whole load (6a-1 R1 #4): the active load is read from it.
  const payload = fam === LOAD ? { copies: task.load, coreDesign: task.design, loadingRating: task.loadingRating } : undefined;
  if (!await recordEvent(live(item), `${fam}end:${id}`, { type: "progEnd", task: id, outcome: "complete", ...(payload ? { payload } : {}) })) {
    return ui.notifications.warn(`${item.name}'s task ended on another device (${stateOf(item, fam).tasks[id]?.end ?? "?"}).`);
  }
  say(actor, fam === LOAD ? `<strong>${esc(item.name)} is loaded</strong> with ${(task.load ?? []).map(c => esc(c.name)).join(", ")} (${task.period} days; VR2.0 p.106).`
    : `<strong>${esc(item.name)} is written</strong> (${task.period} days of work; VR2.0 p.101).`);
}

/** Abandon the task being written (the design unlocks; the work is lost). */
export async function abandon(actor, item, fam = null) {
  // Part 6a-1 (R1 #6): the family under way — a frame core may be loading rather than being written.
  fam ??= stateOf(item, LOAD).writing ? LOAD : PROG;
  const s = stateOf(item, fam), id = s.current;
  if (!s.writing) return;
  const usableBefore = fam === LOAD || !foldProgramming(eventsOf(live(item)).filter(r => (r.task ?? r.gen) !== id)).unfinished;
  if (!await foundry.applications.api.DialogV2.confirm({ window: { title: item.name }, content: `<p>Abandon ${fam === LOAD ? "loading" : "programming"} ${esc(item.name)}? The work done is lost${usableBefore ? (fam === LOAD ? "; its previous load stays" : "") : ", and the program stays unwritten"}.</p>`, rejectClose: false })) return;
  // ONE end per task (server-arbitrated): an abandon racing a completion leaves exactly one of them.
  if (!await recordEvent(live(item), `${fam}end:${id}`, { type: "progEnd", task: id, outcome: "abandon" })) {
    ui.notifications.warn(`${item.name}'s task already ended (${stateOf(item, fam).tasks[id]?.end ?? "?"}).`);
  }
}
