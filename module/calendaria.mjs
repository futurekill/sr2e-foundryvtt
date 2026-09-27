/**
 * Optional Calendaria integration (docs/PLAN-addiction.md, "Optional Calendaria
 * integration"). A soft dependency: nothing here runs, and nothing imports
 * Calendaria, unless the module is active. Probed against Calendaria 1.0.17:
 * `CALENDARIA.api` — createNote / updateNote / deleteNote / getNote,
 * timestampToDate / formatDate; its timestamps ARE Foundry world time.
 */
import { substancesOf, substanceNow, ledgerActors } from "./drugs.mjs";
import { enqueueAttack } from "./engagement.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** The Calendaria API, or null when the module isn't active. */
export function calendaria() {
  if (!game.modules?.get("calendaria")?.active) return null;
  const api = globalThis.CALENDARIA?.api;
  return typeof api?.timestampToDate === "function" && typeof api?.formatDate === "function" ? api : null;
}

/** A world time as a calendar date ("4 Jan, 05:30"), or null without Calendaria. */
export function calendarDate(t) {
  const api = calendaria();
  if (!api || !Number.isFinite(t)) return null;
  try { return api.formatDate(api.timestampToDate(t), "datetimeShort24") || null; } catch (e) { return null; }
}

const setting = (key, fallback) => { try { return game.settings.get("sr2e", key); } catch (e) { return fallback; } };

export function registerCalendariaSettings() {
  game.settings.register("sr2e", "substanceCalendarNotes", {
    name: "Substance deadlines on the calendar (Calendaria)",
    hint: "With the Calendaria module active, keep one calendar note per character and drug for its next milestone: dose due, withdrawal, recovery, rest, clean period (Shadowtech p.87–88).",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => resyncAllNotes()          // off: every note goes; on: they come back
  });
  game.settings.register("sr2e", "substanceNotesVisible", {
    name: "Players see substance notes",
    hint: "Off: the calendar notes are GM-only (hidden). On: everyone can see them.",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => resyncAllNotes()
  });
}

const MILESTONE = { missed: "dose due", withdrawalDrop: "Addiction −1 (withdrawal)", week: "weekly loss",
  recoveryDrop: "Addiction −1 (recovery)", restore: "a box back (rest)", cured: "rest ends", clean: "clean-period drop" };

/** Still a live document? (A deleted actor must never get a note.) */
const alive = (actor) => { try { return !!actor && !!fromUuidSync(actor.uuid); } catch (e) { return false; } };
/** One sync or cleanup at a time per actor (Codex 3–6 #11). */
const run = (actor, fn) => enqueueAttack(`cal:${actor.uuid}`, fn);
/** Is this note ours — made by this system for THIS actor and drug? (Codex 3–6 #10) */
function ownNote(api, id, actor, drug) {
  if (!id) return null;
  const doc = api.getNoteDocument?.(id);
  const mark = doc?.getFlag?.("sr2e", "substanceNote");
  return mark && mark.actorUuid === actor.uuid && mark.drug === drug ? doc : null;
}

/**
 * Keep ONE note per actor and drug at its next milestone (the active primary
 * GM only, best-effort). Notes carry an ownership marker; a stored id pointing
 * at anything else is ignored (never updated or deleted) and a new note made.
 */
export function syncSubstanceNotes(actor) {
  const api = calendaria();
  if (!api || !game.users.activeGM?.isSelf || !alive(actor)) return;
  return run(actor, async () => {
    if (!alive(actor)) return;
    if (!setting("substanceCalendarNotes", true)) return clearNotes(api, actor);
    const fold = substancesOf(actor);
    const now = substanceNow(actor);
    const stored = actor.flags?.sr2e?.substanceNotes ?? {};              // re-read inside the queue
    const visibility = setting("substanceNotesVisible", false) ? "visible" : "hidden";
    const upd = {}, made = [];
    for (const drug of new Set([...Object.keys(stored), ...Object.keys(fold.drugs)])) {
      const r = fold.drugs[drug];
      const next = r?.base && r.next && r.next.t >= now ? r.next : null;
      const have = stored[drug];
      const note = ownNote(api, have?.id, actor, drug);
      try {
        if (!next) {
          if (note) await api.deleteNote(have.id);
          if (have) upd[`flags.sr2e.substanceNotes.-=${drug}`] = null;
          continue;
        }
        const name = `${actor.name}: ${r.name} — ${MILESTONE[next.kind] ?? next.kind}`;
        const startDate = api.timestampToDate(next.t);
        if (note && have.t === next.t && have.name === name && have.visibility === visibility) continue;
        if (note) {
          await api.updateNote(have.id, { name, startDate });
          if (have.visibility !== visibility) await api.setNoteVisibility?.(have.id, visibility);
          upd[`flags.sr2e.substanceNotes.${drug}`] = { id: have.id, t: next.t, name, visibility };
        } else {
          const page = await api.createNote({ name, startDate, allDay: false, visibility, openSheet: false,
            icon: "fas fa-syringe", color: "#ff3b5c",
            content: `<p>@UUID[${actor.uuid}]{${esc(actor.name)}} — ${esc(r.name)}: ${esc(MILESTONE[next.kind] ?? next.kind)} (Shadowtech p.87–88). Kept up to date by the SR2E system.</p>` });
          if (!page?.id) continue;
          made.push(page.id);
          try { await api.getNoteDocument?.(page.id)?.setFlag("sr2e", "substanceNote", { actorUuid: actor.uuid, drug }); }
          catch (err) { await api.deleteNote(page.id); made.pop(); throw err; }
          upd[`flags.sr2e.substanceNotes.${drug}`] = { id: page.id, t: next.t, name, visibility };
        }
      } catch (err) { console.warn(`SR2E | Calendaria note for ${actor.name} / ${drug} failed`, err); }
    }
    if (!Object.keys(upd).length) return;
    // Deleted meanwhile, or the record can't be saved: take the new notes back out.
    try {
      if (!alive(actor)) throw new Error("actor deleted");
      await actor.update(upd);
    } catch (err) {
      for (const id of made) { try { await api.deleteNote(id); } catch (e) { /* already gone */ } }
      if (alive(actor)) console.warn(`SR2E | recording ${actor.name}'s calendar notes failed`, err);
    }
  });
}

/** Delete an actor's own substance notes and forget them. */
async function clearNotes(api, actor) {
  const stored = actor?.flags?.sr2e?.substanceNotes ?? {};
  const upd = {};
  for (const [drug, n] of Object.entries(stored)) {
    // Forget a note only once it's really gone (or isn't ours): a failed delete
    // keeps its reference for the next try (Codex 3–6 R2 #6).
    try {
      if (ownNote(api, n?.id, actor, drug)) await api.deleteNote(n.id);
      if (!ownNote(api, n?.id, actor, drug)) upd[`flags.sr2e.substanceNotes.-=${drug}`] = null;
    } catch (e) { console.warn(`SR2E | removing ${actor.name}'s ${drug} note failed; kept for a retry`, e); }
  }
  if (Object.keys(upd).length && alive(actor)) await actor.update(upd);
}

/** Delete an actor's notes (the actor is being deleted: nothing to record). */
export async function clearSubstanceNotes(actor) {
  const api = calendaria();
  if (!api || !game.users.activeGM?.isSelf) return;
  for (const [drug, n] of Object.entries(actor?.flags?.sr2e?.substanceNotes ?? {})) {
    try { if (ownNote(api, n?.id, actor, drug)) await api.deleteNote(n.id); } catch (e) { /* already gone */ }
  }
}

/** A setting changed: every tracked actor's notes are cleared or brought up to date. */
export async function resyncAllNotes() {
  if (!calendaria() || !game.users.activeGM?.isSelf) return;
  for (const a of ledgerActors()) await syncSubstanceNotes(a);
}

export function registerCalendariaHooks() {
  // A ledger event or a clock advance can move the next milestone.
  const pending = new Map();
  Hooks.on("updateActor", (actor, changes) => {
    const f = changes?.flags?.sr2e;
    if (!f || !("substanceLog" in f || "substanceClock" in f)) return;
    if (!calendaria() || !game.users.activeGM?.isSelf) return;
    clearTimeout(pending.get(actor.uuid));
    pending.set(actor.uuid, setTimeout(() => { pending.delete(actor.uuid); syncSubstanceNotes(actor); }, 250));
  });
  Hooks.on("deleteActor", (actor) => {
    clearTimeout(pending.get(actor.uuid)); pending.delete(actor.uuid);       // no late sync for a deleted actor
    clearSubstanceNotes(actor);
  });
}
