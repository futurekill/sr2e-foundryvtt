/**
 * Matrix jackpoints — shifting a decker's perception to a Matrix scene
 * (docs/PLAN-matrix-jackpoints.md: Round 1 design + Round 2–4 amendments).
 *
 * The GM draws a Region over a terminal and gives it the "Matrix jackpoint"
 * behaviour, pointing at an entry Region on a Matrix scene. Each decker's persona
 * token appears there on jack-in and goes on jack-out (module/persona-tokens.mjs,
 * the active GM's client); a GM may still place and mark one by hand. A character
 * standing in the jackpoint gets "Jack in" on their token HUD: Matrix mode goes on,
 * a session record is added, and ONLY that tab switches to the Matrix scene.
 * Turning Matrix mode off in any way (Jack out, the sheet toggle, dump shock, the
 * GM) ends the session and brings that tab back. The sheet's plain Jack In never
 * shifts anything.
 *
 * Shared state is the actor's `system.matrixMode` and `flags.sr2e.matrixSessions`
 * (keyed records; each client only ever deletes its own key, the active GM deletes
 * the rest). The tab's own record lives in sessionStorage. One person drives an
 * actor (the system-wide contract): on that client every Matrix transition runs
 * in one per-actor queue.
 */
import { enqueueAttack } from "./engagement.mjs";
import { isVR2 } from "./vr2-mode.mjs";
import { winner, gmCleanup, tabDecision, bodyMarked, personaLit } from "./rules/jackpoint-rules.mjs";
import { schedulePersonas, adoptPersona } from "./persona-tokens.mjs";
import { JACKPOINT_KINDS } from "./rules/vr2-grids.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sync = (uuid) => { try { return uuid ? fromUuidSync(uuid) : null; } catch (e) { return null; } };

/** Every Matrix transition for one actor on this client (R3 #1). */
export const matrixQueue = (actor, fn) => enqueueAttack(`matrix:${actor.uuid}`, fn);

// ── The behaviour ────────────────────────────────────────────────────────────

/** "Matrix jackpoint" — read, never triggered (no events). */
export class JackpointBehaviorData extends foundry.data.regionBehaviors.RegionBehaviorType {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      destination: new f.DocumentUUIDField({ type: "Region", nullable: true, initial: null,
        label: "Entry area on the Matrix scene", hint: "A Region on the Matrix scene where this jackpoint's personas are." }),
      label: new f.StringField({ initial: "", label: "What it is", hint: "Shown on the Jack in button, e.g. \"Strice mainframe port\"." }),
      kind: new f.StringField({ initial: "illegal", blank: false, label: "Jackpoint kind (VR2.0)",
        hint: "Virtual Realities 2.0 p.28–29: sets the Trace Factor and Access modifiers, and (with grid topology on) what the decker can log on to first.",
        choices: Object.fromEntries(Object.entries(JACKPOINT_KINDS).map(([k, v]) => [k, `${v.label} (Trace ${v.trace >= 0 ? "+" : ""}${v.trace}, Access ${k === "console" ? "halved" : (v.access >= 0 ? "+" : "") + v.access})`])) }),
      host: new f.DocumentUUIDField({ type: "Actor", nullable: true, initial: null,
        label: "Wired to (optional)", hint: "The Host actor a decker here works against. With VR2.0 grid topology on: the LTG a trid jackpoint connects to, or the host a workstation, remote device or console controls." }),
      traceMod: new f.NumberField({ integer: true, initial: 0, label: "Extra trace adjustment (VR2.0)",
        hint: "Added to a decker's Trace Factor on top of the kind's (Virtual Realities 2.0 p.28, p.45)." })
    };
  }
  static events = {};
}

export function registerJackpointBehavior() {
  CONFIG.RegionBehavior.dataModels.jackpoint = JackpointBehaviorData;
  CONFIG.RegionBehavior.typeIcons.jackpoint = "fa-solid fa-ethernet";
}

/** A jackpoint's destination, or why it can't be used. */
export function resolveJackpoint(behavior) {
  if (!behavior || behavior.type !== "jackpoint") return { error: "Not a jackpoint." };
  if (behavior.disabled) return { error: "This jackpoint is switched off." };
  const dest = sync(behavior.system?.destination);
  const scene = dest?.parent;
  if (!dest || dest.documentName !== "Region" || !scene) return { error: "This jackpoint has no entry area set (GM)." };
  if (scene.id === behavior.parent?.parent?.id) return { error: "A jackpoint's entry area must be on another scene (GM)." };
  return { dest, scene, label: behavior.system.label || behavior.parent?.name || "a jackpoint" };
}

// ── Personas, eligibility ────────────────────────────────────────────────────

/**
 * The actor's persona on a scene: a linked persona-flagged token, preferring a usable one,
 * then a hand-placed one over a managed one, then sort and id (R3 #6; persona plan R1 #6).
 */
export function personaOn(actor, scene) {
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const rank = (t) => (personaUsable(t, scene) ? 0 : 2) + (t.getFlag("sr2e", "personaManaged") ? 1 : 0);
  return (scene?.tokens?.contents ?? [])
    .filter(t => t.actorLink && t.actorId === actor.id && t.getFlag("sr2e", "persona"))
    .sort((a, b) => (rank(a) - rank(b)) || ((a.sort ?? 0) - (b.sort ?? 0)) || cmp(a.id, b.id))[0] ?? null;
}
/** THE usability test, shared by jack-in and the persona writer (persona plan R1 #6). */
export const personaUsable = (p, scene) => !!p && !p.hidden && (!scene?.tokenVision || p.sight?.enabled !== false);

const deckOk = (actor) => (Number(actor?.system?.cyberdeck?.mpcp) || 0) > 0;
export const sessionsOf = (actor) => actor?.flags?.sr2e?.matrixSessions ?? {};
const inSession = (actor) => !!actor?.system?.matrixMode && !!winner(sessionsOf(actor));

/** Jackpoint behaviours the token document stands in. */
export function jackpointsAt(tokenDoc) {
  return [...(tokenDoc?.regions ?? [])].flatMap(r => r.behaviors.contents.filter(b => b.type === "jackpoint" && !b.disabled));
}

/** Can this user jack this token in here? `{ok, reason}` (Round 1 #3). */
export function canJackIn(tokenDoc, behavior, user = game.user) {
  const actor = tokenDoc?.actor;
  if (!actor || actor.type !== "character") return { ok: false, reason: "Only player characters use jackpoints (NPC deckers use the sheet's Jack In)." };
  if (!tokenDoc.actorLink) return { ok: false, reason: "Jackpoints need the character's linked token." };
  if (!actor.testUserPermission(user, "OWNER") || !tokenDoc.testUserPermission(user, "OWNER")) return { ok: false, reason: "You don't own this character." };
  if (!deckOk(actor)) return { ok: false, reason: "No working cyberdeck." };
  if (inSession(actor)) return { ok: false, reason: "Already jacked in at a jackpoint." };
  // Standing at it, checked by the action itself, not just the HUD.
  if (!jackpointsAt(tokenDoc).some(b => b.uuid === behavior?.uuid)) return { ok: false, reason: "Stand at the jackpoint to use it." };
  const tab = readTab();
  if (tab && tab.actorUuid !== actor.uuid) return { ok: false, reason: "This window is already following another jacked-in character." };
  const j = resolveJackpoint(behavior);
  if (j.error) return { ok: false, reason: j.error };
  // No persona needed: the active GM's client creates one on jack-in (persona plan).
  return { ok: true, ...j };
}

// ── The tab's record (sessionStorage, per world and user) ────────────────────

const tabKey = () => `sr2e.${game.world.id}.${game.user.id}.matrixView`;
export function readTab() { try { return JSON.parse(sessionStorage.getItem(tabKey()) ?? "null"); } catch (e) { return null; } }
function writeTab(rec) { try { sessionStorage.setItem(tabKey(), JSON.stringify(rec)); return true; } catch (e) { return false; } }
function clearTab() { try { sessionStorage.removeItem(tabKey()); } catch (e) { /* ignore */ } }

// ── Views: serialised and verified (R2 #6) ───────────────────────────────────

let viewChain = Promise.resolve();
/** Switch THIS client to a scene; resolves true once the canvas really shows it. */
export function showScene(sceneId, { pan = null, fallback = false } = {}) {
  const run = async () => {
    // Only a return may fall back to the active scene; an entry needs its exact target.
    const scene = game.scenes.get(sceneId) ?? (fallback ? game.scenes.active : null);
    if (!scene) return false;
    for (let attempt = 0; attempt < 4; attempt++) {
      for (let i = 0; i < 100 && canvas.loading; i++) await new Promise(r => setTimeout(r, 100));
      if (canvas.scene?.id !== scene.id) await scene.view();
      if (canvas.scene?.id === scene.id) {
        // Jump, don't animate: an animation never finishes in a hidden tab.
        if (pan) canvas.pan({ x: pan.x, y: pan.y });
        return true;
      }
      await new Promise(r => setTimeout(r, 250));
    }
    ui.notifications.warn(`Couldn't switch to ${scene.name} — try again.`);
    return false;
  };
  const p = viewChain.then(run, run);
  viewChain = p.catch(() => {});
  return p;
}

const centreOf = (doc) => {
  const w = (doc.width ?? 1) * (doc.parent?.grid?.size ?? 100), h = (doc.height ?? 1) * (doc.parent?.grid?.size ?? 100);
  return { x: (doc.x ?? 0) + w / 2, y: (doc.y ?? 0) + h / 2 };
};

// ── Jack in / Jack out ───────────────────────────────────────────────────────

/** Actors with a jack-in running on THIS client: reconciliation leaves them alone meanwhile. */
const ENTERING = new Set();
/** Actors this client is jacking out: ends a jack-in's wait for its persona (persona plan R2 #2). */
const LEAVING = new Set();
/** Reconciliations asked for while a jack-in was running, drained after it. */
const DEFERRED = new Set();

export function jackIn(tokenDoc, behavior) {
  const actor = tokenDoc?.actor;
  if (!actor) return;
  return matrixQueue(actor, async () => {
    ENTERING.add(actor.uuid);
    try { return await enter(tokenDoc, behavior, actor); }
    finally {
      ENTERING.delete(actor.uuid);
      if (DEFERRED.delete(actor.uuid)) scheduleReconcile(actor);   // anything that happened meanwhile
    }
  });
}

async function enter(tokenDoc, behavior, actor) {
  {
    const check = canJackIn(tokenDoc, behavior);
    if (!check.ok) return ui.notifications.warn(check.reason);
    // VR2.0: a second way in would reset the live session (its tally) without leaving it.
    if (isVR2() && actor.system.matrixMode) return ui.notifications.warn(`${actor.name} is already in the Matrix: jack out first.`);
    const id = foundry.utils.randomID();
    const destScene = check.scene.id;
    // The tab's record FIRST, as pending (R4 #5 / R3 #3), then the shared write.
    if (!writeTab({ actorUuid: actor.uuid, session: id, phase: "pending", originScene: tokenDoc.parent.id, destScene })) {
      return ui.notifications.error("This browser won't keep the jack-in's return point (storage blocked) — jack in from the sheet instead.");
    }
    // VR2.0 part 3: the connection record FIRST, carrying what entry needs (PLAN-vr2-part3 §0, R6 #2).
    if (isVR2()) {
      const { openConnection, mayJackIn } = await import("./vr2ic.mjs");
      if (!await mayJackIn(actor, sync(behavior.system?.host))) { clearTab(); return; }
      const n = await openConnection(actor, { jackpoint: { jackpoint: behavior.uuid, originToken: tokenDoc.uuid,
        originScene: tokenDoc.parent.id, destScene, destRegion: check.dest.uuid, user: game.user.id, session: id } });
      if (n == null) { clearTab(); return; }
    }
    await actor.update({ "system.matrixMode": true, [`flags.sr2e.matrixSessions.${id}`]: {
      jackpoint: behavior.uuid, originToken: tokenDoc.uuid, destScene, destRegion: check.dest.uuid, user: game.user.id, since: Date.now() } });
    // VR2.0: the connection's session (its tally, and what a crash ends), inside the queue.
    if (isVR2()) await (await import("./vr2.mjs")).startSession(actor);
    // Still ours, still the winner, still on, still valid, not being jacked out here (R2 #3; persona R2 #2–#3).
    const live = () => !LEAVING.has(actor.uuid) && actor.system.matrixMode && winner(sessionsOf(actor))?.id === id
      && sessionValid(sessionsOf(actor)[id]);
    // Wait (up to ~5 s) for the GM's client to create the persona; stop the moment the session isn't live (R1 #2).
    const usable = () => { const p = personaOn(actor, game.scenes.get(destScene)); return personaUsable(p, game.scenes.get(destScene)) ? p : null; };
    let persona = usable();
    for (let i = 0; i < 50 && !persona && live(); i++) { await new Promise(r => setTimeout(r, 100)); persona = usable(); }
    if (!live()) {
      if (sessionsOf(actor)[id]) await actor.update({ [`flags.sr2e.matrixSessions.-=${id}`]: null });
      clearTab();
      return ui.notifications.info("Jack-in cancelled.");
    }
    if (!persona) ui.notifications.info(`${actor.name}'s persona appears in the Matrix when the GM's client catches up.`);
    const ok = await showScene(destScene, { pan: persona ? centreOf(persona) : null });
    // Still live and still ours after the switch? Otherwise reconciliation takes it from here.
    const rec = readTab();
    const still = live();
    // Record the switch that happened, valid or not; if the session went bad on the
    // way, the queued reconciliation then takes the RETURN path (impl R2 #1).
    if (ok && rec?.session === id) {
      // A persona created during the switch missed the late-pan hook (record still pending): pan now (R2 #1).
      const late = !persona && still ? usable() : null;
      if (late && canvas.scene?.id === destScene) canvas.pan(centreOf(late));
      writeTab({ ...rec, phase: "entered", panned: !!(persona || late) });
    }
    if (!still) DEFERRED.add(actor.uuid);
    try {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="sr2e-damage-result">⌁ ${esc(actor.name)} jacks in at ${esc(check.label)}.</div>` });
    } catch (e) { /* the session stands */ }
  }
}

/** The Host the actor's live jackpoint session points at, for system operations (impl R1 #9). */
export function sessionHost(actor) {
  // VR2.0 part 3: the live connection's own record names its jackpoint (plan §0, R6 #2); part 7a snapshots its wiring.
  const conn = actor?.system?.vr2Conn;
  if (conn?.jackpoint?.jackpoint) {
    const h = sync(connJackpoint(actor).wired);
    return h?.type === "host" ? h : null;
  }
  const w = actor?.system?.matrixMode ? winner(sessionsOf(actor)) : null;
  const host = sync(sync(w?.jackpoint)?.system?.host);
  return host?.type === "host" ? host : null;
}

/**
 * The live connection's jackpoint as it was when the decker connected (part 7a, R1 #10): kind, wiring, extra trace.
 * An older record without the snapshot reads the behaviour live, as before; no jackpoint is illegal trid access.
 */
export function connJackpoint(actor) {
  const rec = actor?.system?.vr2Conn?.jackpoint;
  if (!rec?.jackpoint) return { jackpoint: null, kind: "illegal", wired: null, traceMod: 0 };
  if ("kind" in rec) return { jackpoint: rec.jackpoint, kind: rec.kind, wired: rec.wired ?? null, traceMod: rec.traceMod ?? 0 };
  const b = sync(rec.jackpoint);
  return { jackpoint: rec.jackpoint, kind: b?.system?.kind ?? "illegal", wired: b?.system?.host ?? null, traceMod: Number(b?.system?.traceMod) || 0 };
}

/** Jack out: any owner of the ACTOR, no body token needed (R3 #5). */
export function jackOut(actor) {
  if (!actor?.isOwner) return;
  // VR2.0: dump shock unless the decker logged off gracefully (dynamic: vr2.mjs imports this module).
  // Its exit is a sequencer request, not this queue, and may be cancelled or fail (Black IC): a
  // jack-in's wait ends only when the connection really does.
  if (isVR2()) return import("./vr2.mjs").then(m => m.vr2LeaveMatrix(actor));
  // Before queueing: a jack-in waiting for its persona in the same queue sees it and cancels (persona R2 #2).
  LEAVING.add(actor.uuid);
  return matrixQueue(actor, () => actor.update({ "system.matrixMode": false })).finally(() => LEAVING.delete(actor.uuid));
}

// ── Reconciliation ───────────────────────────────────────────────────────────

/**
 * Is a session record still usable? Its jackpoint and snapshot scene exist, and so does its
 * snapshot entry Region on that scene (persona R1 #7; records from before it have none).
 */
export const sessionValid = (rec) => {
  const b = sync(rec?.jackpoint);
  if (!b || b.type !== "jackpoint" || b.disabled || !game.scenes.get(rec?.destScene)) return false;
  return !rec.destRegion || sync(rec.destRegion)?.parent?.id === rec.destScene;
};
/** The entry Region a session's persona goes in: its snapshot, else the jackpoint's current one on the same scene. */
export function sessionRegion(rec) {
  if (rec?.destRegion) return sync(rec.destRegion);
  const dest = resolveJackpoint(sync(rec?.jackpoint)).dest;
  return dest?.parent?.id === rec?.destScene ? dest : null;
}
/** The actor's live jackpoint session — Matrix mode on, the winner, valid — or null. */
export function liveSession(actor) {
  const w = actor?.system?.matrixMode ? winner(sessionsOf(actor)) : null;
  return w && sessionValid(w) ? w : null;
}

/** This tab, for one actor (R3 #3, R4 #2–#4). */
export async function reconcileTab(actor, { resume = false } = {}) {
  if (ENTERING.has(actor?.uuid)) { DEFERRED.add(actor.uuid); return; }   // drained when the jack-in ends
  const record = readTab();
  if (!record || record.actorUuid !== actor?.uuid) return;
  const d = tabDecision({ record, sessions: sessionsOf(actor), matrixMode: actor.system.matrixMode,
    currentScene: canvas.scene?.id, isValid: sessionValid, sceneExists: (id) => !!game.scenes.get(id), resume });
  // After every await, only touch the tab if it still holds THIS record's session.
  const same = () => readTab()?.session === record.session;
  if (d.deleteKey && actor.isOwner && sessionsOf(actor)[d.deleteKey]) {
    await actor.update({ [`flags.sr2e.matrixSessions.-=${d.deleteKey}`]: null }).catch(() => {});
  }
  switch (d.action) {
    case "cancel": case "clear": if (same()) clearTab(); break;
    case "return": {
      if (same()) writeTab({ ...record, phase: "returning" });
      const ok = await showScene(d.scene ?? game.scenes.active?.id, { fallback: true });
      if (ok && same()) clearTab();                                          // kept until it works
      break;
    }
    case "enter": {
      const p = personaOn(actor, game.scenes.get(d.scene));
      const ok = await showScene(d.scene, { pan: p ? centreOf(p) : null });
      if (ok && same()) writeTab({ ...record, phase: "entered" });
      break;
    }
  }
}

/** One reconciliation at a time per actor, coalesced, through its Matrix queue (impl R1 #1). */
const SCHEDULED = new Set();
export function scheduleReconcile(actor, opts = {}) {
  // The persona token, on the active GM's client — outside the Matrix queue, which a jack-in
  // on this same client holds while it waits for that very token.
  schedulePersonas(actor);
  if (!actor || SCHEDULED.has(actor.uuid)) return;
  SCHEDULED.add(actor.uuid);
  return matrixQueue(actor, async () => {
    SCHEDULED.delete(actor.uuid);
    await reconcileTab(actor, opts);
    await reconcileGM(actor);
  });
}

/** The active GM tidies shared state (R3 #2, R2 #8). */
export async function reconcileGM(actor) {
  if (!game.users.activeGM?.isSelf || !actor) return;
  const sessions = sessionsOf(actor);
  if (!Object.keys(sessions).length) return;
  const drop = gmCleanup({ sessions, matrixMode: actor.system.matrixMode,
    isValid: (r) => sessionValid(r) && (sync(r.originToken)?.actorId ?? actor.id) === actor.id });
  if (!drop.length) return;
  await actor.update(Object.fromEntries(drop.map(id => [`flags.sr2e.matrixSessions.-=${id}`, null])));
}

export const refreshActorTokens = (actor) => {
  for (const t of canvas.tokens?.placeables ?? []) if (t.document.actorId === actor.id) t.renderFlags.set({ refresh: true });
};

// ── The token HUD and the cues ───────────────────────────────────────────────

function hudButton(icon, title, onClick, { disabled = false, active = false } = {}) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "control-icon" + (active ? " active" : "") + (disabled ? " disabled" : "");
  b.title = title;
  b.innerHTML = `<i class="${icon}"></i>`;
  b.style.opacity = disabled ? "0.45" : "";
  b.addEventListener("click", (ev) => { ev.preventDefault(); if (!disabled) onClick(); });
  return b;
}

export function registerJackpointHooks() {
  Hooks.on("renderTokenHUD", (hud, html) => {
    const token = hud.object?.document;
    const actor = token?.actor;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const col = root?.querySelector(".col.left");
    if (!token || !actor || !col) return;
    // GM: mark a linked character token as that decker's persona on this scene.
    if (game.user.isGM && actor.type === "character" && token.actorLink && token.getFlag("sr2e", "personaManaged")) {
      // A persona made on jack-in: the GM may keep it (it becomes hand-placed), never unmark or delete it here (R1 #9).
      const writer = !!game.user.isActiveGM;
      col.appendChild(hudButton("fa-solid fa-thumbtack", writer ? "Keep this persona (it stays after jack-out, as a hand-placed one)"
        : "Keep this persona — only the active GM's client can do this", async () => { await adoptPersona(token); hud.render(); },
      { disabled: !writer }));
    } else if (game.user.isGM && actor.type === "character" && token.actorLink) {
      const on = !!token.getFlag("sr2e", "persona");
      col.appendChild(hudButton("fa-solid fa-user-astronaut", on ? "Matrix persona (click to unmark)" :
        "Mark as this character's Matrix persona on this scene (otherwise one appears on jack-in)", async () => {
          // A persona needs to see: marking one switches its sight on (R3 #6).
          await token.update({ "flags.sr2e.persona": !on, ...(!on ? { "sight.enabled": true } : {}) }); hud.render();
        }, { active: on }));
    }
    if (!actor.isOwner) return;
    // Jack out: on the persona or the body, while a session is live.
    if (inSession(actor)) {
      col.appendChild(hudButton("fa-solid fa-plug-circle-xmark", "Jack out", () => jackOut(actor)));
      return;
    }
    for (const b of jackpointsAt(token)) {
      const c = canJackIn(token, b);
      const label = resolveJackpoint(b).label ?? "the jackpoint";
      col.appendChild(hudButton("fa-solid fa-ethernet", c.ok ? `Jack in: ${label}` : `Jack in: ${label} — ${c.reason}`,
        () => jackIn(token, b), { disabled: !c.ok }));
    }
  });

  // The body marker (derived) and the persona's logged-off dimming, both
  // recomputed from the documents on every refresh (R2 #4, R2 #7).
  Hooks.on("refreshToken", (t) => {
    const doc = t.document, actor = doc?.actor;
    if (!actor || actor.type !== "character") return;
    const sessions = sessionsOf(actor), mode = !!actor.system.matrixMode;
    if (doc.getFlag("sr2e", "persona")) {
      const lit = personaLit({ sceneId: doc.parent?.id, sessions, matrixMode: mode });
      if (t.mesh) t.mesh.alpha = lit ? (doc.alpha ?? 1) : Math.min(doc.alpha ?? 1, 0.4);
    }
    let ring = t.getChildByName?.("sr2eJackedIn");
    const marked = bodyMarked({ tokenUuid: doc.uuid, sessions, matrixMode: mode });
    if (marked && !ring) {
      ring = new PIXI.Graphics(); ring.name = "sr2eJackedIn";
      ring.lineStyle(4, 0x33ddff, 0.9).drawRoundedRect(2, 2, t.w - 4, t.h - 4, 8);
      t.addChild(ring);
    }
    if (ring) ring.visible = marked;
  });

  // Any change to an actor's sessions or Matrix mode: this tab, the GM, the cues.
  Hooks.on("updateActor", (actor, changes) => {
    const touched = foundry.utils.hasProperty(changes, "system.matrixMode") || !!changes?.flags?.sr2e?.matrixSessions
      || Object.keys(foundry.utils.flattenObject(changes?.flags ?? {})).some(k => k.includes("matrixSessions"));
    if (!touched) return;
    scheduleReconcile(actor);
    refreshActorTokens(actor);
  });

  // Late pan (persona R1 #1): the persona arrived after this tab entered — jump to it once.
  Hooks.on("createToken", (doc) => {
    const rec = readTab();
    if (rec?.phase !== "entered" || rec.panned || doc.parent?.id !== rec.destScene || canvas.scene?.id !== rec.destScene) return;
    const actor = doc.actor;
    if (!doc.actorLink || actor?.uuid !== rec.actorUuid || !doc.getFlag("sr2e", "persona") || !personaUsable(doc, doc.parent)) return;
    if (liveSession(actor)?.id !== rec.session) return;
    canvas.pan(centreOf(doc));
    writeTab({ ...rec, panned: true });
  });

  // A jackpoint or its destination going away invalidates live sessions (R3 #4).
  const recheckAll = () => { for (const a of game.actors) if (Object.keys(sessionsOf(a)).length) scheduleReconcile(a); };
  for (const hook of ["deleteScene", "deleteRegion", "deleteRegionBehavior", "updateRegionBehavior"]) Hooks.on(hook, recheckAll);

  Hooks.once("ready", () => {
    const rec = readTab();
    const mine = rec ? sync(rec.actorUuid) : null;
    if (rec && !mine) clearTab();
    if (mine) scheduleReconcile(mine, { resume: true });        // a reload: back where the session was
    for (const a of game.actors) if (a !== mine && Object.keys(sessionsOf(a)).length) scheduleReconcile(a);
  });

  // Configuration check when the GM saves a jackpoint (R1 #1 validation; impl R1 #9).
  const checkJackpoint = (b) => {
    if (b?.type !== "jackpoint" || !game.user.isGM) return;
    const j = resolveJackpoint(b);
    if (j.error && !b.disabled) ui.notifications.warn(`Jackpoint "${b.name}": ${j.error}`);
    const host = sync(b.system?.host);
    if (b.system?.host && host?.type !== "host") ui.notifications.warn(`Jackpoint "${b.name}": its Host must be a Host actor.`);
    if (j.scene && !game.users.some(u => !u.isGM && j.scene.testUserPermission(u, "LIMITED"))) {
      ui.notifications.warn(`Jackpoint "${b.name}": no player can view ${j.scene.name} yet — give the deckers Limited or Observer on it.`);
    }
  };
  Hooks.on("createRegionBehavior", (b, o, userId) => { if (userId === game.user.id) checkJackpoint(b); });
  Hooks.on("updateRegionBehavior", (b, c, o, userId) => { if (userId === game.user.id) checkJackpoint(b); });
}
