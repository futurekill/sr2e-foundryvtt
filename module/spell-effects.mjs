/**
 * Lasting spell effects (SR2E p.157–158): Ignite, Poltergeist, Ice Sheet.
 *
 * All state changes run on the ACTIVE GM, one queue per actor/effect, driven by
 * the combat's committed `flags.sr2e.boundarySeq` (a new Combat Turn), never by
 * the editable round number. Players act through request messages
 * (`flags.sr2e.effectRequest`) that the active GM consumes; everyone resolves
 * their own damage from flag-backed cards (the `resolves` marker pattern).
 */
import { enqueueAttack } from "./engagement.mjs";
import { canonicalSpellName, igniteDelay, segmentHitsCircle, segmentHitsRect } from "./rules/sr2e-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const isActiveGM = () => !!game.users?.activeGM?.isSelf;

/** "ignite" | "poltergeist" | "iceSheet" | null — by the spell's canonical name. */
export function spellEffectKind(spell) {
  return { ignite: "ignite", poltergeist: "poltergeist", "ice sheet": "iceSheet" }[canonicalSpellName(spell?.name ?? "")] ?? null;
}

/** Run on the active GM, else post a request it will run. */
async function asGM(kind, payload) {
  if (isActiveGM()) return handleRequest({ kind, ...payload });
  await ChatMessage.create({ content: `<div class="sr2e-hint">Spell effect request sent to the GM.</div>`,
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    flags: { sr2e: { effectRequest: { id: foundry.utils.randomID(), kind, ...payload } } } });
}

const HANDLED = new Set();
async function handleRequest(req) {
  if (req.id && HANDLED.has(req.id)) return;
  if (req.id) HANDLED.add(req.id);
  const actor = req.actorUuid ? await fromUuid(req.actorUuid).catch(() => null) : null;
  const a = actor?.documentName === "Token" ? actor.actor : actor;
  switch (req.kind) {
    case "igniteCreate": if (a) return createBurn(a, req); break;
    case "extinguish":   if (a) return extinguish(a); break;
    case "advanceBurn":  if (a) return tickBurn(a, { manual: true }); break;
    case "templateCleanup": return deleteEffectTemplates(req.instances ?? []);
  }
}

// ── Ignite ─────────────────────────────────────────────────────────────────

function combatOf(actor) {
  return game.combats?.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid)) ?? null;
}

/** Create the burn state on the target (active GM). */
export async function createBurn(actor, { casterUuid = "", force = 1, successes = 1 }) {
  return enqueueAttack(`fx:${actor.uuid}`, async () => {
    const combat = combatOf(actor);
    const burnoutTurns = (await new Roll("1d6").evaluate()).total;
    const state = { instance: foundry.utils.randomID(), casterUuid, force, burnoutTurns, turnsBurned: 0,
      igniteIn: igniteDelay(successes), status: "pending", version: 1, tickId: 0,
      clock: combat ? { kind: "combat", combatId: combat.id, lastSeq: Number(combat.getFlag("sr2e", "boundarySeq")) || 0 }
                    : { kind: "manual", ticks: 0 },
      pendingTick: null };
    await actor.setFlag("sr2e", "burning", state);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: renderBurnControl(actor, state),
      flags: { sr2e: { burnControl: { actorUuid: actor.uuid, instance: state.instance } } } });
  });
}

function renderBurnControl(actor, st) {
  return `<div class="sr2e-damage-result"><strong>🔥 ${esc(actor.name)} is ${st.status === "pending" ? "catching fire" : st.status === "out" ? "no longer burning" : "burning"}</strong>
    <em>(Ignite, SR2E p.158)</em><br><em>${st.status === "pending" ? `Ignites in ${st.igniteIn} Combat Turn${st.igniteIn === 1 ? "" : "s"}. ` : ""}
    Burns (F)M, Power +1 each turn, ½ Impact armour; out after ${st.burnoutTurns} turns unless extinguished.
    ${st.clock.kind === "manual" ? "No combat: the GM advances it." : ""}</em>
    ${st.status === "out" ? "" : `<div class="sr2e-karma-actions">
      ${st.clock.kind === "manual" ? `<button type="button" class="sr2e-resist-btn sr2e-burn-advance-btn" data-actor-uuid="${actor.uuid}">⏭ Advance burn (GM)</button>` : ""}
      <button type="button" class="sr2e-resist-btn sr2e-burn-extinguish-btn" data-actor-uuid="${actor.uuid}">🧯 Extinguish</button></div>`}
  </div>`;
}

export function renderBurnCard(state) {
  return `<div class="sr2e-damage-result"><strong>🔥 ${esc(state.actorName)} burns — ${state.power}M</strong>
    <em>(Ignite, turn ${state.turn}; resist with Body, ½ Impact armour — SR2E p.158)</em>
    ${state.resolved ? "<br><strong>Resolved.</strong>" : `<div class="sr2e-karma-actions">
      <button type="button" class="sr2e-resist-btn sr2e-burn-resist-btn">Resist the fire</button></div>`}
  </div>`;
}

/**
 * One burn tick (active GM, the actor's queue). A persisted transition:
 * pendingTick first, then the card (skipped if its key already exists), then the
 * final state — only if nothing (Extinguish) changed the version meanwhile.
 */
export async function tickBurn(actor, { manual = false, seq = null, combatId = null } = {}) {
  return enqueueAttack(`fx:${actor.uuid}`, async () => {
    let st = foundry.utils.deepClone(actor.getFlag("sr2e", "burning"));
    if (!st || st.status === "out") return;
    // A pending tick overtaken by another change (a rebind) is void; its id stays used.
    if (st.pendingTick && st.pendingTick.basedOnVersion !== st.version) {
      st = { ...st, tickId: Math.max(st.tickId, st.pendingTick.tickId), pendingTick: null };
      await actor.setFlag("sr2e", "burning", st);
    }
    if (!st.pendingTick) {
      // The clock must be the one ticking.
      if (manual && st.clock.kind !== "manual") return;
      if (!manual && (st.clock.kind !== "combat" || st.clock.combatId !== combatId || seq <= st.clock.lastSeq)) return;
      const next = foundry.utils.deepClone(st);
      let card = null;
      if (next.status === "pending") {
        next.igniteIn -= 1;
        if (next.igniteIn <= 0) next.status = "burning";
      }
      if (next.status === "burning" && (st.status === "burning" || next.igniteIn <= 0)) {
        card = { actorUuid: actor.uuid, actorName: actor.name, power: next.force + next.turnsBurned,
                 turn: next.turnsBurned + 1, instance: st.instance, tickId: st.tickId + 1, resolved: false };
        next.turnsBurned += 1;
        if (next.turnsBurned >= next.burnoutTurns) next.status = "out";
      }
      next.tickId = st.tickId + 1;
      next.version = st.version + 1;
      next.clock = manual ? { kind: "manual", ticks: (st.clock.ticks ?? 0) + 1 } : { ...st.clock, lastSeq: seq };
      next.pendingTick = null;
      st.pendingTick = { tickId: next.tickId, basedOnVersion: st.version, card, next };
      await actor.setFlag("sr2e", "burning", st);
    }
    const pt = st.pendingTick;
    const key = `${st.instance}:${pt.tickId}`;
    if (pt.card && !game.messages.some(m => m.flags?.sr2e?.burnTick === key)) {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: renderBurnCard(pt.card),
        flags: { sr2e: { burnTick: key, burn: pt.card } } });
    }
    const live = actor.getFlag("sr2e", "burning");
    if (live?.version !== pt.basedOnVersion) return;          // extinguished meanwhile
    await actor.setFlag("sr2e", "burning", pt.next);
    if (pt.next.status === "out") {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="sr2e-damage-result">🔥 ${esc(actor.name)}'s flames burn out.</div>` });
    }
  });
}

/** Put the fire out (active GM, the actor's queue): bumps the version so a tick in flight is void. */
export async function extinguish(actor) {
  return enqueueAttack(`fx:${actor.uuid}`, async () => {
    const st = actor.getFlag("sr2e", "burning");
    if (!st || st.status === "out") return;
    await actor.setFlag("sr2e", "burning", { ...st, status: "out", version: st.version + 1, pendingTick: null });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="sr2e-damage-result">🧯 ${esc(actor.name)}'s flames are put out.</div>` });
  });
}

/** Burning actors a combat's boundary should tick (full actor uuids, deduplicated). */
function burningIn(combat) {
  const seen = new Map();
  for (const cb of combat.combatants) {
    const a = cb.actor;
    if (a && a.getFlag("sr2e", "burning")?.status !== "out" && a.getFlag("sr2e", "burning")) seen.set(a.uuid, a);
  }
  return [...seen.values()];
}

/** Bind manual burns of this combat's actors to it (combat start / new combatant / GM resume). */
async function bindBurns(combat) {
  const seq = Number(combat.getFlag("sr2e", "boundarySeq")) || 0;
  for (const a of burningIn(combat)) {
    await enqueueAttack(`fx:${a.uuid}`, async () => {
      const st = a.getFlag("sr2e", "burning");
      if (!st || st.clock.kind !== "manual") return;
      await a.setFlag("sr2e", "burning", { ...st, clock: { kind: "combat", combatId: combat.id, lastSeq: seq },
        version: st.version + 1 });
    });
  }
}

async function unbindBurns(combatId) {
  const actors = [...game.actors, ...game.scenes.contents.flatMap(s => s.tokens.filter(t => !t.actorLink && t.actor).map(t => t.actor))];
  for (const a of actors) {
    const st = a.getFlag("sr2e", "burning");
    if (st?.status === "out" || st?.clock?.kind !== "combat" || st.clock.combatId !== combatId) continue;
    await enqueueAttack(`fx:${a.uuid}`, async () => {
      const cur = a.getFlag("sr2e", "burning");
      await a.setFlag("sr2e", "burning", { ...cur, clock: { kind: "manual", ticks: 0 }, version: cur.version + 1 });
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: a }), content: renderBurnControl(a, a.getFlag("sr2e", "burning")),
        flags: { sr2e: { burnControl: { actorUuid: a.uuid, instance: cur.instance } } } });
    });
  }
}

/** Tick every burning actor of a combat up to its committed boundarySeq (catch-up included). */
export async function effectBoundary(combat, { recovering = false } = {}) {
  if (!isActiveGM()) return;
  const seq = Number(combat.getFlag("sr2e", "boundarySeq")) || 0;
  for (const a of burningIn(combat)) {
    const st = a.getFlag("sr2e", "burning");
    if (st?.clock?.kind !== "combat" || st.clock.combatId !== combat.id) continue;
    for (let s = (st.clock.lastSeq ?? 0) + 1; s <= seq; s++) {
      await tickBurn(a, { seq: s, combatId: combat.id });
    }
    // A pending tick left by an interrupted run is finished too.
    if (a.getFlag("sr2e", "burning")?.pendingTick) await tickBurn(a, { seq, combatId: combat.id });
  }
  if (!recovering) await poltergeistBoundary(combat, seq);
}

// ── Hooks ──────────────────────────────────────────────────────────────────

export function registerSpellEffectHooks() {
  Hooks.on("updateCombat", (combat, changed) => {
    if (!isActiveGM()) return;
    if (foundry.utils.hasProperty(changed, "flags.sr2e.boundarySeq")) effectBoundary(combat);
    if ("started" in changed || "round" in changed) { bindBurns(combat); bindPoltergeists(combat); }
  });
  Hooks.on("createCombatant", (cb) => {
    if (isActiveGM() && cb.combat?.started) { bindBurns(cb.combat); bindPoltergeists(cb.combat); }
  });
  // Combat over: a burn it was timing goes back to the GM's manual clock.
  Hooks.on("deleteCombat", (combat) => { if (isActiveGM()) unbindBurns(combat.id); });
  Hooks.on("moveToken", (doc, movement) => { if (isActiveGM()) iceCrossing(doc, movement); });
  Hooks.on("createChatMessage", (msg) => {
    const req = msg.flags?.sr2e?.effectRequest;
    if (req && isActiveGM()) handleRequest(req).finally(() => msg.delete().catch(() => {}));
  });
  Hooks.once("ready", async () => {
    if (!isActiveGM()) return;
    for (const c of game.combats ?? []) {
      if (c.started) { await bindBurns(c); await bindPoltergeists(c); await effectBoundary(c, { recovering: true }); }
    }
  });
}

/** Chat-card buttons (wired from renderChatMessageHTML). */
export function wireSpellEffectButtons(message, html) {
  html.querySelectorAll?.(".sr2e-burn-extinguish-btn").forEach(btn => btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    const a = await fromUuid(btn.dataset.actorUuid).catch(() => null);
    if (!a) return;
    if (!a.isOwner) return ui.notifications.warn(`Only ${a.name}'s owner or the GM can put the fire out.`);
    return asGM("extinguish", { actorUuid: a.uuid });
  }));
  html.querySelectorAll?.(".sr2e-burn-advance-btn").forEach(btn => btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    if (!game.user.isGM) return ui.notifications.warn("Only the GM advances a burn outside combat.");
    return asGM("advanceBurn", { actorUuid: btn.dataset.actorUuid });
  }));
  html.querySelectorAll?.(".sr2e-burn-resist-btn").forEach(btn => btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    return resistEffectCard(message, "burn", { attr: "body", armorFraction: 0.5, source: "Ignite", damageType: "physical" });
  }));
  html.querySelectorAll?.(".sr2e-polt-resist-btn").forEach(btn => btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    return resistEffectCard(message, "poltergeist", { attr: "quickness", armorFraction: 1, source: "Poltergeist", damageType: "stun" });
  }));
  html.querySelectorAll?.(".sr2e-ice-test-btn").forEach(btn => btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    return iceTest(message);
  }));
}

const RESIST_IN_FLIGHT = new Set();
async function resistEffectCard(message, key, env) {
  const st = message.getFlag("sr2e", key);
  if (!st || st.resolved || game.messages.some(m => m.flags?.sr2e?.resolves === message.id)) {
    return ui.notifications.warn("Already resolved.");
  }
  if (RESIST_IN_FLIGHT.has(message.id)) return;
  RESIST_IN_FLIGHT.add(message.id);
  try {
    const a = await fromUuid(st.actorUuid).catch(() => null);
    const actor = a?.documentName === "Token" ? a.actor : a;
    if (!actor) return ui.notifications.warn("That character no longer exists.");
    if (!actor.isOwner) return ui.notifications.warn(`Only ${actor.name}'s owner or the GM can resist for them.`);
    const r = await actor.rollDamageResistance(st.power, st.level ?? "M", "impact", env.damageType, {
      environmental: env, resolvesMessageId: message.id,
      beforeRoll: async () => !game.messages.some(m => m.flags?.sr2e?.resolves === message.id)
    });
    if (r && (message.isAuthor || game.user.isGM)) {
      const next = { ...st, resolved: true };
      await message.update({ content: key === "burn" ? renderBurnCard(next) : renderPoltergeistCard(next),
                             [`flags.sr2e.${key}`]: next });
    }
    return r;
  } finally { RESIST_IN_FLIGHT.delete(message.id); }
}

/** Called by the Ignite cast (p.158): more successes than Body ignites a living target. */
export async function igniteFromCast({ caster, force, successes, target }) {
  if (!target) {
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: caster }),
      content: `<div class="sr2e-damage-result">🔥 Ignite with no target: the GM compares ${successes} successes with the object's base Barrier Rating (p.158).</div>` });
  }
  const body = target.system?.body?.value ?? target.system?.body ?? 0;
  if (!["character", "npc", "spirit"].includes(target.type)) {
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: caster }),
      content: `<div class="sr2e-damage-result">🔥 Ignite on ${esc(target.name)}: the GM compares ${successes} successes with its base Barrier Rating (p.158).</div>` });
  }
  if (successes <= body) {
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: caster }),
      content: `<div class="sr2e-damage-result">🔥 ${esc(target.name)} does not catch fire — Ignite needs more successes than Body ${body} (p.158).</div>` });
  }
  return asGM("igniteCreate", { actorUuid: target.uuid, casterUuid: caster.uuid, force, successes });
}

// ── Spell templates (Poltergeist, Ice Sheet) ───────────────────────────────

const effectOf = (t) => t.flags?.sr2e?.spellEffect ?? null;
const allEffectTemplates = (kind) => game.scenes.contents.flatMap(s =>
  s.templates.filter(t => effectOf(t)?.kind === kind));
const pxPerMetre = (scene) => scene.grid.size / scene.grid.distance;
const tokenCentre = (doc, pos = doc) => {
  const size = doc.parent.grid.size;
  return { x: pos.x + (pos.width ?? doc.width) * size / 2, y: pos.y + (pos.height ?? doc.height) * size / 2 };
};

/** Delete these effect instances' templates on every scene (active GM, or the owner). */
async function deleteEffectTemplates(instances) {
  const set = new Set(instances);
  for (const s of game.scenes) {
    const ids = s.templates.filter(t => set.has(effectOf(t)?.instance)).map(t => t.id);
    if (ids.length) await s.deleteEmbeddedDocuments("MeasuredTemplate", ids);
  }
}

/** End a sustained spell's area (dropped, or recast): its templates go on every scene. */
export async function endSpellEffect(spell) {
  const mine = game.scenes.contents.flatMap(s => s.templates.filter(t => effectOf(t)?.spellUuid === spell.uuid));
  if (!mine.length) return;
  const own = mine.filter(t => t.isOwner);
  for (const s of new Set(own.map(t => t.parent))) {
    await s.deleteEmbeddedDocuments("MeasuredTemplate", own.filter(t => t.parent === s).map(t => t.id));
  }
  const rest = mine.filter(t => !t.isOwner).map(t => effectOf(t).instance);
  if (rest.length) await asGM("templateCleanup", { instances: rest });
}

// ── Poltergeist (p.157) ────────────────────────────────────────────────────

export function renderPoltergeistCard(state) {
  return `<div class="sr2e-damage-result"><strong>🌪 Poltergeist debris hits ${esc(state.actorName)} — ${state.power}L Stun</strong>
    <em>(resist with Quickness, Impact armour — SR2E p.157)</em>
    ${state.resolved ? "<br><strong>Resolved.</strong>" : `<div class="sr2e-karma-actions">
      <button type="button" class="sr2e-resist-btn sr2e-polt-resist-btn">Resist the debris</button></div>`}
  </div>`;
}

/** Everyone standing in the template now, one per actor (hidden tokens included). */
function occupants(t) {
  const scene = t.parent, r = t.distance * pxPerMetre(scene);
  const seen = new Map();
  for (const tok of scene.tokens) {
    if (!tok.actor) continue;
    const c = tokenCentre(tok);
    if (Math.hypot(c.x - t.x, c.y - t.y) <= r + 1e-6 && !seen.has(tok.actor.uuid)) seen.set(tok.actor.uuid, tok);
  }
  return [...seen.values()];
}

async function poltergeistCards(t, why) {
  const fx = effectOf(t);
  const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
  const notes = [];
  for (const tok of occupants(t)) {
    const a = tok.actor;
    if (!["character", "npc", "spirit"].includes(a.type)) { notes.push(esc(tok.name)); continue; }
    const owners = game.users.filter(u => !u.isGM && a.testUserPermission(u, "OWNER")).map(u => u.id);
    const state = { actorUuid: a.uuid, actorName: tok.name, power: fx.force, level: "L",
                    instance: fx.instance, resolved: false };
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ token: tok }), whisper: [...gmIds, ...owners],
      content: renderPoltergeistCard(state), flags: { sr2e: { poltergeist: state } } });
  }
  if (notes.length) {
    await ChatMessage.create({ whisper: gmIds, content: `<div class="sr2e-damage-result">🌪 ${why}: Poltergeist debris
      also batters ${notes.join(", ")} — the GM resolves it for vehicles and objects (p.157).</div>` });
  }
}

/** The started combat whose Combat Turns time a Poltergeist on this scene. */
function timingCombat(sceneId, casterUuid = "") {
  const started = (game.combats ?? []).filter(c => c.started);
  return started.find(c => casterUuid && c.combatants.some(cb => cb.actor?.uuid === casterUuid))
      ?? started.find(c => c.scene?.id === sceneId) ?? null;
}

/**
 * A successful, sustained Poltergeist (called after setSustaining): the old
 * instance ends, the area goes down with +2 visibility, and everyone inside
 * takes the debris now. Recurring each Combat Turn while sustained is a
 * reading of "whacking targets with flying debris" — the GM may drop it.
 */
export async function startPoltergeist(spell, { area, force }) {
  const caster = spell.parent;
  await endSpellEffect(spell);
  const scene = game.scenes.get(area.sceneId);
  if (!scene) return;
  const combat = timingCombat(scene.id, caster.uuid);
  const fx = { kind: "poltergeist", spellUuid: spell.uuid, instance: foundry.utils.randomID(), visibility: 2,
    force: Number(force), timing: combat ? { combatId: combat.id, lastSeq: Number(combat.getFlag("sr2e", "boundarySeq")) || 0 } : null };
  let t;
  try {
    [t] = await scene.createEmbeddedDocuments("MeasuredTemplate", [{ t: "circle", x: area.center.x, y: area.center.y,
      distance: area.radius, fillColor: "#8a7a5a", borderColor: "#5a4a2a", flags: { sr2e: { spellEffect: fx } } }]);
  } catch (e) { t = null; }
  if (!t) return ui.notifications.warn("Poltergeist: the area could not be placed — the GM places it.");
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: caster }), content: `<div class="sr2e-damage-result">
    🌪 <strong>Poltergeist</strong> (${area.radius} m): +2 visibility for anyone in or seeing through it; debris does
    ${fx.force}L Stun (Quickness, Impact armour) now and each Combat Turn while sustained
    <em>(SR2E p.157)</em>.</div>` });
  await poltergeistCards(t, "Poltergeist cast");
}

/** Bind unbound (or orphaned) Poltergeists on this combat's scene, with no back-damage. */
async function bindPoltergeists(combat) {
  const seq = Number(combat.getFlag("sr2e", "boundarySeq")) || 0;
  for (const t of allEffectTemplates("poltergeist")) {
    const tm = effectOf(t).timing;
    const live = tm && game.combats.get(tm.combatId)?.started;
    if (live || t.parent.id !== combat.scene?.id) continue;
    await t.update({ "flags.sr2e.spellEffect.timing": { combatId: combat.id, lastSeq: seq } });
  }
}

async function poltergeistBoundary(combat, seq) {
  const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
  for (const t of allEffectTemplates("poltergeist")) {
    const fx = effectOf(t);
    const spell = fromUuidSync(fx.spellUuid);
    if (!spell?.system?.sustaining) { await t.delete(); continue; }   // dropped: the area goes
    const tm = fx.timing;
    if (!tm || !game.combats.get(tm.combatId)?.started) {
      if (t.parent.id === combat.scene?.id) {
        await t.update({ "flags.sr2e.spellEffect.timing": { combatId: combat.id, lastSeq: seq } });
      }
      continue;
    }
    if (tm.combatId !== combat.id || seq <= tm.lastSeq) continue;
    await t.update({ "flags.sr2e.spellEffect.timing.lastSeq": seq });
    const skipped = seq - tm.lastSeq - 1;
    if (skipped > 0) {
      await ChatMessage.create({ whisper: gmIds, content: `<div class="sr2e-hint">🌪 Poltergeist: ${skipped} Combat
        Turn${skipped === 1 ? "" : "s"} passed with no GM connected — not replayed; resolve them by hand if needed.</div>` });
    }
    await poltergeistCards(t, "New Combat Turn");
  }
}

/** Visibility templates (smoke, Poltergeist) touching the attacker, the target, or the line between. */
export function visibilityAlong(from, to, templates) {
  let v = 0;
  for (const t of templates) {
    const val = Number(t.document.flags?.sr2e?.visibility ?? effectOf(t.document)?.visibility) || 0;
    if (!val || t.document.t !== "circle") continue;
    const r = (t.document.distance ?? 0) * (canvas.grid.size / canvas.grid.distance);
    if (segmentHitsCircle(from, to, { x: t.document.x, y: t.document.y }, r)) v = Math.max(v, val);
  }
  return v;
}

// ── Ice Sheet (p.158) ──────────────────────────────────────────────────────

/** A successful Ice Sheet: Magic × successes m², a square centred on the point. */
export async function placeIceSheet(spell, { side, center, scene }) {
  const caster = spell.parent;
  const px = side * pxPerMetre(scene);
  const fx = { kind: "iceSheet", instance: foundry.utils.randomID(), side };
  try {
    await scene.createEmbeddedDocuments("MeasuredTemplate", [{ t: "rect", x: center.x - px / 2, y: center.y - px / 2,
      distance: side * Math.SQRT2, direction: 45, fillColor: "#bfe8ff", borderColor: "#5aa8d8",
      flags: { sr2e: { spellEffect: fx } } }]);
  } catch (e) {
    return ui.notifications.warn("Ice Sheet: the ice could not be placed — the GM places it.");
  }
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: caster }), content: `<div class="sr2e-damage-result">
    ❄ <strong>Ice Sheet</strong>: ${Math.round(side * side * 10) / 10} m² of ice (${Math.round(side * 10) / 10} m square).
    Crossing it: Quickness Test (TN 3) or fall prone; vehicles make a Handling Test, or a Crash Test on failure.
    It melts 1 m² per minute — the GM removes it (p.158).</div>` });
}

const ICE_SEEN = new Set();
/** Active GM: a finished move (every waypoint) that crossed an ice sheet gets one card per sheet. */
export async function iceCrossing(doc, movement) {
  const scene = doc.parent;
  const ices = scene?.templates.filter(t => effectOf(t)?.kind === "iceSheet") ?? [];
  if (!ices.length || !doc.actor || !movement?.origin) return;
  const pts = [movement.origin, ...(movement.passed?.waypoints ?? [])].map(p => tokenCentre(doc, p));
  if (pts.length < 2) return;
  for (const t of ices) {
    const key = `${movement.id}:${t.id}`;
    if (ICE_SEEN.has(key)) continue;
    const side = effectOf(t).side * pxPerMetre(scene);
    const rect = { x: t.x, y: t.y, w: side, h: side };
    if (!pts.slice(1).some((p, i) => segmentHitsRect(pts[i], p, rect))) continue;
    ICE_SEEN.add(key);
    const vehicle = doc.actor.type === "vehicle";
    const state = { actorUuid: doc.actor.uuid, tokenName: doc.name, vehicle, resolved: false };
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ token: doc }), content: renderIceCard(state),
      flags: { sr2e: { iceTest: state } } });
  }
}

function renderIceCard(st) {
  return `<div class="sr2e-damage-result">❄ <strong>${esc(st.tokenName)} crosses the ice</strong>
    <em>(Ice Sheet, SR2E p.158)</em><br>${st.vehicle
      ? "Driver: Handling Test; on a failure, a Crash Test (GM)."
      : st.resolved ? `<strong>${esc(st.outcome)}</strong>`
      : `Quickness Test (TN 3) or fall prone.<div class="sr2e-karma-actions">
        <button type="button" class="sr2e-resist-btn sr2e-ice-test-btn">Keep your feet</button></div>`}</div>`;
}

async function iceTest(message) {
  const st = message.getFlag("sr2e", "iceTest");
  if (!st || st.resolved || game.messages.some(m => m.flags?.sr2e?.resolves === message.id)) {
    return ui.notifications.warn("Already resolved.");
  }
  const a = await fromUuid(st.actorUuid).catch(() => null);
  const actor = a?.documentName === "Token" ? a.actor : a;
  if (!actor?.isOwner) return ui.notifications.warn("Only the character's owner or the GM rolls this.");
  const r = await actor.rollSuccessTest(actor.system.quickness?.value ?? 1, 3, { label: "Ice Sheet — keep your feet (Quickness, TN 3)" });
  if (!r) return;
  const prone = (r.successes ?? 0) < 1;
  if (prone) {
    try { await actor.toggleStatusEffect?.("prone", { active: true }); } catch (e) { /* no token */ }
  }
  const outcome = prone ? "Slips and falls prone." : "Keeps their feet.";
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { sr2e: { resolves: message.id } },
    content: `<div class="sr2e-damage-result">❄ ${esc(actor.name)}: ${outcome}</div>` });
  if (message.isAuthor || game.user.isGM) {
    const next = { ...st, resolved: true, outcome };
    await message.update({ content: renderIceCard(next), "flags.sr2e.iceTest": next });
  }
}
