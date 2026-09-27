/**
 * Matrix jackpoints — shifting a decker's perception to a Matrix scene
 * (docs/PLAN-matrix-jackpoints.md: Round 1 design + Round 2–4 amendments).
 *
 * The GM draws a Region over a terminal and gives it the "Matrix jackpoint"
 * behaviour, pointing at an entry Region on a Matrix scene, and places each
 * decker's persona there once (a linked token, marked as a persona). A character
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
import { winner, gmCleanup, tabDecision, bodyMarked, personaLit } from "./rules/jackpoint-rules.mjs";

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
      host: new f.DocumentUUIDField({ type: "Actor", nullable: true, initial: null,
        label: "Host (optional)", hint: "The Host actor a decker here is most likely working against." })
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

/** The actor's persona on a scene: the first GM-marked linked token (R3 #6). */
export function personaOn(actor, scene) {
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return (scene?.tokens?.contents ?? [])
    .filter(t => t.actorLink && t.actorId === actor.id && t.getFlag("sr2e", "persona"))
    .sort((a, b) => ((a.sort ?? 0) - (b.sort ?? 0)) || cmp(a.id, b.id))[0] ?? null;
}
const personaUsable = (p, scene) => !!p && !p.hidden && (!scene.tokenVision || p.sight?.enabled !== false);

const deckOk = (actor) => (Number(actor?.system?.cyberdeck?.mpcp) || 0) > 0;
const sessionsOf = (actor) => actor?.flags?.sr2e?.matrixSessions ?? {};
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
  const p = personaOn(actor, j.scene);
  if (!personaUsable(p, j.scene)) return { ok: false, reason: `No usable persona for ${actor.name} on ${j.scene.name} — ask the GM to place one (visible, with sight).` };
  return { ok: true, ...j, persona: p };
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
    const id = foundry.utils.randomID();
    const destScene = check.scene.id;
    // The tab's record FIRST, as pending (R4 #5 / R3 #3), then the shared write.
    if (!writeTab({ actorUuid: actor.uuid, session: id, phase: "pending", originScene: tokenDoc.parent.id, destScene })) {
      return ui.notifications.error("This browser won't keep the jack-in's return point (storage blocked) — jack in from the sheet instead.");
    }
    await actor.update({ "system.matrixMode": true, [`flags.sr2e.matrixSessions.${id}`]: {
      jackpoint: behavior.uuid, originToken: tokenDoc.uuid, destScene, user: game.user.id, since: Date.now() } });
    // Re-check after the wait (R2 #3): still ours, still the winner, still on.
    const w = winner(sessionsOf(actor));
    if (!actor.system.matrixMode || w?.id !== id) {
      if (sessionsOf(actor)[id]) await actor.update({ [`flags.sr2e.matrixSessions.-=${id}`]: null });
      clearTab();
      return ui.notifications.info("Jack-in cancelled.");
    }
    const ok = await showScene(destScene, { pan: centreOf(check.persona) });
    // Still live and still ours after the switch? Otherwise reconciliation takes it from here.
    const rec = readTab();
    const still = actor.system.matrixMode && winner(sessionsOf(actor))?.id === id && sessionValid(sessionsOf(actor)[id]);
    // Record the switch that happened, valid or not; if the session went bad on the
    // way, the queued reconciliation then takes the RETURN path (impl R2 #1).
    if (ok && rec?.session === id) writeTab({ ...rec, phase: "entered" });
    if (!still) DEFERRED.add(actor.uuid);
    try {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="sr2e-damage-result">⌁ ${esc(actor.name)} jacks in at ${esc(check.label)}.</div>` });
    } catch (e) { /* the session stands */ }
  }
}

/** The Host the actor's live jackpoint session points at, for system operations (impl R1 #9). */
export function sessionHost(actor) {
  const w = actor?.system?.matrixMode ? winner(sessionsOf(actor)) : null;
  const host = sync(sync(w?.jackpoint)?.system?.host);
  return host?.type === "host" ? host : null;
}

/** Jack out: any owner of the ACTOR, no body token needed (R3 #5). */
export function jackOut(actor) {
  if (!actor?.isOwner) return;
  return matrixQueue(actor, () => actor.update({ "system.matrixMode": false }));
}

// ── Reconciliation ───────────────────────────────────────────────────────────

/** Is a session record still usable? (its jackpoint and snapshot scene exist) */
const sessionValid = (rec) => {
  const b = sync(rec?.jackpoint);
  return !!b && b.type === "jackpoint" && !b.disabled && !!game.scenes.get(rec?.destScene);
};

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

const refreshActorTokens = (actor) => {
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
    if (game.user.isGM && actor.type === "character" && token.actorLink) {
      const on = !!token.getFlag("sr2e", "persona");
      col.appendChild(hudButton("fa-solid fa-user-astronaut", on ? "Matrix persona (click to unmark)" :
        "Mark as this character's Matrix persona on this scene (jackpoints need one)", async () => {
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
