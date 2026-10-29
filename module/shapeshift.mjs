/**
 * Shapeshifters (docs/PLAN-shapeshifters.md; Shadowrun Companion pp.36–38, core pp.227–229).
 *
 * State: `flags.sr2e.shift.<shiftKey(uuid)>` = {b, carry, high, death, survived} — keyed by the OWNING actor,
 * so an unlinked token never reads its base actor's state. ONE preUpdateActor hook keeps the damage buckets
 * (player characters) and opens death checks in the SAME update as any Physical change, on the writer's
 * client. Regeneration ticks run on GM clients when a Combat Turn passes, each cursor advance claimed by its
 * starting point. A death check is resolved as a durable record (`recordEvent`), then applied idempotently.
 */
import { once, recordEvent, eventsOf, markersOf } from "./claims.mjs";
import { STUCK_MS } from "./rules/claim-rules.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { reconcileHealing } from "./healing-clock.mjs";
import { magicLost } from "./rules/sr2e-rules.mjs";
import { shapeshifterOf, shiftKey, normalizeShift, applyDelta, reconcileBuckets, regenStep, deathCheckFor, mergeDeath, killedOutright,
         deathRollKills, activeFormOf, TURNS_PER_MINUTE } from "./rules/shapeshift-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const gmWhisper = () => ({ whisper: game.users.filter(u => u.isGM).map(u => u.id) });

export const isShapeshifter = (a) => shapeshifterOf(a?.type, a?.system);
export const shiftPath = (a) => `flags.sr2e.shift.${shiftKey(a.uuid)}`;
export const shiftState = (a) => normalizeShift(a?.flags?.sr2e?.shift?.[shiftKey(a.uuid)]);
const physTotal = (cm) => (cm?.physical?.value ?? 0) + (cm?.overflow ?? 0);
const formOf = (a) => a.type === "character" ? a.system.shapeshifter?.form ?? "human" : a.system.activeForm ?? "";

/** Why this actor can't change form right now, or "". */
export function shiftProblem(actor) {
  const cm = actor.system.conditionMonitor;
  if (actor.system.astralState === "projecting") return "can't shift while astrally projecting";
  if ((cm?.physical?.value ?? 0) >= (cm?.physical?.max ?? 10) || (cm?.stun?.value ?? 0) >= (cm?.stun?.max ?? 10)) return "is unconscious";
  const d = shiftState(actor).death;
  if (d?.state === "pending") return "has a death check waiting";
  if (d?.state === "dead") return "is dead";
  return "";
}

const installedCyber = (actor) => actor.items.filter(i => i.type === "cyberware" && i.system.installed);

// ── The hook: guards, buckets and death admission in the same update ──────

function onPreUpdate(actor, changes, options) {
  const g = (p) => foundry.utils.getProperty(changes, p);
  // Becoming (or staying) a shapeshifter: judge by the RESULT of this update.
  const sys = foundry.utils.mergeObject(actor.system.toObject?.() ?? {}, g("system") ?? {}, { inplace: false });
  if (!shapeshifterOf(actor.type, sys) && !isShapeshifter(actor)) return;

  // 1. Form changes and projection (every writer: a macro or sheet edit can't skip the rules).
  const formKey = actor.type === "character" ? "system.shapeshifter.form" : "system.activeForm";
  const newForm = g(formKey);
  if (newForm !== undefined && newForm !== formOf(actor)) {
    const why = shiftProblem(actor);
    if (why) { ui.notifications?.warn(`${actor.name} ${why}.`); return false; }
    // Shifting rejects cyberware (Companion p.38): Shift form uninstalls it first.
    if (actor.type === "character" && newForm === "animal" && installedCyber(actor).length) {
      ui.notifications?.warn(`${actor.name} has installed cyberware — use Shift form, which rejects it (Companion p.38).`);
      return false;
    }
  }
  if (actor.type === "character" && shapeshifterOf("character", sys)) {
    const astral = g("system.astralState") ?? actor.system.astralState;
    if (astral === "projecting" && actor.system.astralState !== "projecting"
        && (sys.shapeshifter?.form === "animal" || sys.magic?.type !== "full_magician")) {
      ui.notifications?.warn(`${actor.name} can project only in human form, and only as a full magician (Companion p.37).`);
      return false;
    }
  }

  // 2. Physical damage: buckets (characters) and death admission (both).
  if (!isShapeshifter(actor)) return;
  const cm = actor.system.conditionMonitor;
  const newPhys = g("system.conditionMonitor.physical.value") ?? cm.physical.value;
  const newOver = g("system.conditionMonitor.overflow") ?? cm.overflow ?? 0;
  const before = physTotal(cm), after = newPhys + newOver;
  if (before === after) return;
  const path = shiftPath(actor);
  const st = shiftState(actor);
  const was = { survived: st.survived, death: st.death };
  const pc = actor.type === "character";
  const form = pc ? actor.system.shapeshifter.form : "";
  if (pc) st.b = applyDelta(st.b, { before, after, added: options?.sr2eDamage ?? {}, form, explicit: options?.sr2eRegen ?? null });
  if (after === 0) st.survived = false;                 // the wound episode ended
  if (st.death?.state !== "dead") {
    if (pc && killedOutright(after, actor.system.body?.value ?? 1)) {
      // Every field written: a flag update merges, so a field left out would keep the last death's value.
      st.death = { id: foundry.utils.randomID(), rev: (st.death?.rev ?? 0) + 1, state: "dead", diesOn: 6, roll: null,
                   why: `damage of Body + 10 or more (Companion p.38)` };
    } else {
      const dc = deathCheckFor({ kind: pc ? "character" : "npc", form, before, after, full: newPhys >= (cm.physical.max ?? 10),
                                 added: options?.sr2eDamage ?? {}, buckets: st.b });
      if (dc) {
        st.death = st.death?.state === "pending"
          ? { ...mergeDeath(st.death, dc), rev: st.death.rev + 1 }
          : { id: foundry.utils.randomID(), rev: (st.death?.rev ?? 0) + 1, state: "pending", roll: null, ...dc };
      }
    }
  }
  // Only the fields this hook owns, so a concurrent writer of another field (a Magic loss receipt, a cursor)
  // is never overwritten by a stale snapshot.
  if (pc) foundry.utils.setProperty(changes, `${path}.b`, st.b);
  if (st.survived !== was.survived) foundry.utils.setProperty(changes, `${path}.survived`, st.survived);
  if (st.death !== was.death) foundry.utils.setProperty(changes, `${path}.death`, st.death);
}

// ── Shifting ───────────────────────────────────────────────────────────────

/**
 * Change form (a Complex Action, Companion p.36). Character: "human" | "animal"; NPC: a form key ("" = the
 * printed block). Cyberware is rejected FIRST, so an interruption leaves a consistent character.
 */
export async function shiftForm(actor, toForm) {
  if (!actor?.isOwner) return ui.notifications.warn("Only the owner can shift this character.");
  if (toForm === formOf(actor)) return;
  const why = shiftProblem(actor);
  if (why) return ui.notifications.warn(`${actor.name} ${why}.`);
  const rejected = actor.type === "character" && toForm === "animal" ? installedCyber(actor) : [];
  if (rejected.length) await actor.updateEmbeddedDocuments("Item", rejected.map(i => ({ _id: i.id, "system.installed": false })));
  const key = actor.type === "character" ? "system.shapeshifter.form" : "system.activeForm";
  const done = await actor.update({ [key]: toForm }, { sr2eShift: true });
  if (!done || formOf(actor) !== toForm) return;
  const img = actor.type === "character"
    ? (toForm === "animal" ? actor.system.shapeshifter.animalImg : actor.system.shapeshifter.humanImg)
    : (activeFormOf(actor.system)?.img || actor.img);
  if (img) {
    try {
      for (const t of actor.getActiveTokens(false, true)) await t.update({ "texture.src": img });
      if (!actor.isToken) await actor.update({ "prototypeToken.texture.src": img });
    } catch (err) { ui.notifications.warn(`${actor.name}: the token art didn't change (${err.message}).`); }
  }
  const name = actor.type === "character" ? (toForm === "animal" ? "animal form" : "human form")
    : (activeFormOf(actor.system)?.name || "its usual form");
  const notes = [];
  if (actor.type === "character") notes.push(toForm === "animal"
    ? "Gear and clothing don't shift — they're ripped or left behind. No speech, Social skills, Centering or adept powers in this form."
    : "Regeneration stops in human form.");
  if (rejected.length) notes.push(`Its body rejected its cyberware: ${rejected.map(i => esc(i.name)).join(", ")} (Companion p.38).`);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="sr2e-roll-message"><strong>${esc(actor.name)} shifts to ${esc(name)}</strong> (Complex Action, Companion p.36).${notes.length ? `<br><em>${notes.join(" ")}</em>` : ""}</div>` });
}

// ── Regeneration ───────────────────────────────────────────────────────────

/**
 * One regeneration write of `turns` Combat Turns (inside the damage queue). PC: the Companion's rates by
 * bucket; NPC: every wound vanishes (core p.227). `extra` carries the cursor. Blocked (death pending or
 * dead) → only `extra`. Returns the boxes healed.
 */
async function regenWrite(actor, turns, cursor = null) {
  const st = shiftState(actor);
  const path = shiftPath(actor);
  // Only the fields this write owns (the hook adds the buckets): the cursor and the minute carry.
  const own = cursor ? { [`${path}.high.${cursor.id}`]: cursor.round } : {};
  const cm = actor.system.conditionMonitor;
  const before = physTotal(cm);
  const blocked = ["pending", "dead"].includes(st.death?.state);
  if (blocked || before === 0 || turns <= 0) {
    if (Object.keys(own).length) await actor.update(own, { sr2eShift: true });
    return 0;
  }
  let healed, opts = {};
  if (actor.type === "character") {
    st.b = reconcileBuckets(st.b, before);       // wounds from before it had state count as human-form damage
    const r = regenStep(st.b, { form: actor.system.shapeshifter.form, essence: actor.system.essence?.value ?? 0,
                                turns, carry: st.carry, survived: st.survived });
    own[`${path}.carry`] = r.carry;
    healed = r.healed;
    opts = { sr2eRegen: r.dec };
  } else healed = before;
  const left = before - healed;
  const over = Math.max(0, left - (cm.physical.max ?? 10));
  await actor.update({ "system.conditionMonitor.physical.value": left - over, "system.conditionMonitor.overflow": over, ...own },
    { sr2eShift: true, ...opts });
  return healed;
}

/** GM clients: when a Combat Turn passes, each shapeshifter in the combat regenerates once (claimed). */
async function onCombatRound(combat, changed) {
  if (!game.user.isGM || !("round" in changed)) return;
  const newRound = Number(changed.round) || 0;
  const oldRound = Number(combat.previous?.round ?? newRound - 1) || 0;
  if (!(newRound > oldRound && oldRound >= 1)) return;   // combat start heals nothing; a rewind never heals
  const seen = new Set();
  for (const cb of combat.combatants) {
    const actor = cb.actor;
    if (!actor || seen.has(actor.uuid) || !isShapeshifter(actor)) continue;
    seen.add(actor.uuid);
    try { await tickCombatant(actor, cb, newRound, oldRound); }
    catch (err) { console.error("SR2E | regeneration", err); }
  }
}

async function tickCombatant(actor, cb, newRound, oldRound) {
  if (!(await reconcileHealing(actor))) return;          // settle the healing clock first, outside the queue
  const healed = await enqueueAttack(`damage:${actor.uuid}`, async () => {
    const cursor = shiftState(actor).high[cb.id] ?? cb.flags?.sr2e?.joinedRound ?? oldRound;
    if (cursor >= newRound) return 0;
    const key = `regen:${cb.id}:${cursor}`;
    if (!(await once(actor, key))) {
      // Claimed elsewhere and never written (that client failed or left): the cursor still sits here after
      // STUCK_MS, so the next numbered attempt takes it over. The attempt number depends only on the cursor,
      // never on the destination round, so two clients holding different rounds race for ONE claim.
      const tries = markersOf(actor).filter(x => x.key === key || x.key.startsWith(`${key}:takeover:`));
      const latest = tries.reduce((m, x) => (Number(x.at) || 0) > (Number(m?.at) || 0) ? x : m, null);
      if (!latest || game.time.serverTime - (Number(latest.at) || 0) < STUCK_MS) return 0;
      const n = Math.max(0, ...tries.map(x => Number(x.key.split(":takeover:")[1]) || 0)) + 1;
      if (!(await once(actor, `${key}:takeover:${n}`))) return 0;
    }
    const st = shiftState(actor);
    if ((st.high[cb.id] ?? cursor) !== cursor) return 0;
    return regenWrite(actor, newRound - cursor, { id: cb.id, round: newRound });
  });
  if (healed > 0) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="sr2e-roll-message">${esc(actor.name)} regenerates ${healed} box${healed === 1 ? "" : "es"} of Physical damage.</div>`, ...gmWhisper() });
  else if (["pending"].includes(shiftState(actor).death?.state)) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="sr2e-roll-message">${esc(actor.name)}: no regeneration this turn — its death check is still waiting.</div>`, ...gmWhisper() });
}

/** Out of combat: `minutes` pass (20 Combat Turns a minute). Owner or GM. */
export async function regenerateMinutes(actor, minutes) {
  if (!actor?.isOwner || !isShapeshifter(actor)) return;
  if (game.combats?.some(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid)))
    return ui.notifications.warn(`${actor.name} is in combat — regeneration happens as each Combat Turn passes.`);
  if (!(await reconcileHealing(actor))) return ui.notifications.warn(`${actor.name}: the healing clock is settling — try again.`);
  const turns = Math.max(0, Math.floor(Number(minutes) || 0)) * TURNS_PER_MINUTE;
  const d = shiftState(actor).death;
  if (["pending", "dead"].includes(d?.state)) return ui.notifications.warn(`${actor.name}: resolve the death check first.`);
  const healed = await enqueueAttack(`damage:${actor.uuid}`, () => regenWrite(actor, turns));
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="sr2e-roll-message">${esc(actor.name)}: ${minutes} minute${minutes === 1 ? "" : "s"} pass — regenerates ${healed} box${healed === 1 ? "" : "es"} of Physical damage.</div>` });
}

// ── Death ──────────────────────────────────────────────────────────────────

const deathKey = (d) => `death:${d.id}:${d.rev}`;
const recordFor = (actor, key) => eventsOf(actor).find(e => e.key === key) ?? null;

function deathCard(actor, d) {
  const dead = d.state === "dead";
  const btn = (massive, label) => `<button type="button" class="sr2e-resist-btn sr2e-shift-death" data-actor-uuid="${esc(actor.uuid)}"
    data-id="${esc(d.id)}" data-massive="${massive ? 1 : 0}">${label}</button>`;
  return `<div class="sr2e-damage-result"><strong>${esc(actor.name)}: ${dead ? "dies" : "death check"}</strong> — ${esc(d.why)}.
    ${dead ? "" : `<br>Roll 1D6: it dies on ${d.diesOn === 1 ? "a 1" : "a 1 or 2"}; otherwise its regeneration goes on.
      No regeneration while this waits.
      <div class="sr2e-karma-actions">${btn(false, `Roll 1D6 (GM)`)}${d.diesOn === 1 ? btn(true, "Massive tissue injury — fire, explosion (1–2)") : ""}</div>`}</div>`;
}

/** Active GM: post the card when a check opens or a shapeshifter is killed outright (once per id). */
async function onUpdateActor(actor, changed) {
  if (!game.users.activeGM?.isSelf || !foundry.utils.hasProperty(changed, "flags.sr2e.shift")) return;
  const d = shiftState(actor).death;
  if (!d || !["pending", "dead"].includes(d.state) || d.roll != null) return;
  if (!(await once(actor, `deathcard:${d.id}`))) return;
  if (d.state === "dead") await markDead(actor);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: deathCard(actor, d), ...gmWhisper(),
    flags: { sr2e: { shiftDeath: { actorUuid: actor.uuid, id: d.id } } } });
}

async function markDead(actor) {
  try { await actor.toggleStatusEffect("dead", { active: true, overlay: true }); }
  catch (err) { console.error("SR2E | dead status", err); }
}

/**
 * GM: resolve the pending death check — roll once (the record), then apply. A recorded result for this
 * (id, rev) is re-applied instead of rolling again; a stale result (the check changed) applies nothing.
 */
export async function resolveDeath(actor, id, { massive = false } = {}) {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM rolls the death check.");
  const d = shiftState(actor).death;
  if (!d || d.id !== id || d.state !== "pending") return ui.notifications.info("That death check is already settled.");
  const key = deathKey(d);
  let rec = recordFor(actor, key);
  if (!rec) {
    const diesOn = massive ? Math.max(2, d.diesOn) : d.diesOn;
    const roll = await new Roll("1d6").evaluate();
    const outcome = deathRollKills(roll.total, diesOn) ? "dead" : "survived";
    await recordEvent(actor, key, { id: d.id, rev: d.rev, roll: roll.total, diesOn, outcome });
    rec = recordFor(actor, key);                          // the server accepted exactly one roll
    if (!rec) return ui.notifications.warn("The death check didn't record — try again.");
  }
  return applyDeath(actor, rec);
}

/** Apply a recorded death result, idempotently (only to the check it was rolled for). */
async function applyDeath(actor, rec) {
  // Queued with this actor's damage and regeneration writes, re-read inside, and writing only its own fields.
  const applied = await enqueueAttack(`damage:${actor.uuid}`, async () => {
    const d = shiftState(actor).death;
    if (!d || d.id !== rec.id || d.rev !== rec.rev || d.state !== "pending") return false;
    const path = shiftPath(actor);
    const upd = { [`${path}.death`]: { ...d, rev: d.rev + 1, state: rec.outcome, roll: rec.roll } };
    if (rec.outcome === "survived") upd[`${path}.survived`] = true;
    // A surviving magician owes a Magic loss check, kept by death id until it's applied (the sheet offers it).
    if (rec.outcome === "survived" && (actor.system.magic?.value ?? 0) > 0) upd[`${path}.magicOwed.${rec.id}`] = true;
    await actor.update(upd, { sr2eShift: true });
    return true;
  });
  if (!applied) return;
  if (rec.outcome === "dead") await markDead(actor);
  if (await once(actor, `deathresult:${rec.id}`)) {
    const magician = rec.outcome === "survived" && (actor.system.magic?.value ?? 0) > 0;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), ...gmWhisper(),
      flags: { sr2e: { shiftDeathResult: { actorUuid: actor.uuid, id: rec.id } } },
      content: `<div class="sr2e-damage-result"><strong>${esc(actor.name)}: death check</strong> — 1D6 ${rec.roll}
        (dies on ${rec.diesOn === 1 ? "1" : "1–2"}): <strong>${rec.outcome === "dead" ? "dies" : "survives — its regeneration goes on"}</strong>.
        ${magician ? `<div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-shift-magic"
          data-actor-uuid="${esc(actor.uuid)}" data-id="${esc(rec.id)}">Magic loss check (GM, p.115)</button></div>` : ""}</div>` });
  }
}

/** GM: the survivor's Magic loss check (Companion p.38 → core p.115): one recorded roll, applied once. */
export async function deathMagicLoss(actor, id) {
  if (!game.user.isGM) return;
  if (!shiftState(actor).magicOwed?.[id]) return ui.notifications.info("That Magic loss check is done.");
  // The WHOLE check — read the rating, roll, record, apply — runs in the actor's queue, so a second owed check
  // rolls against the rating the first one left (Magic 6, two 5s: the second is no loss). Only this receipt and
  // Magic are written — false, not deleted (a flag update merges nested objects).
  const rec = await enqueueAttack(`damage:${actor.uuid}`, async () => {
    if (!shiftState(actor).magicOwed?.[id]) return null;
    const key = `deathmagic:${id}`;
    let r = recordFor(actor, key);
    if (!r) {
      const magic = actor.system.magic?.value ?? 0;
      const roll = await new Roll("2d6").evaluate();
      await recordEvent(actor, key, { roll: roll.total, magic, lost: magic > 0 && magicLost(roll.total, magic) });
      r = recordFor(actor, key);
      if (!r) return null;
    }
    if (!shiftState(actor).magicOwed?.[id]) return null;
    const magicNow = actor.system.magic?.value ?? 0;
    await actor.update({ [`${shiftPath(actor)}.magicOwed.${id}`]: false,
      ...(r.lost ? { "system.magic.value": Math.max(0, magicNow - 1) } : {}) }, { sr2eShift: true });
    return { ...r, now: r.lost ? Math.max(0, magicNow - 1) : magicNow };
  });
  if (!rec) return;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="sr2e-roll-message">Magic loss check (survived a Deadly wound, SR2E p.115): 2D6 ${rec.roll} vs Magic ${rec.magic} — ${rec.lost
      ? `<strong>1 point of Magic is lost permanently</strong> (now ${rec.now})` : "no loss"}.</div>` });
}

/** GM: clear the death state (revived, or a mistake) and the dead status. */
export async function clearDeath(actor) {
  if (!game.user.isGM) return;
  const path = shiftPath(actor);
  await actor.update({ [`${path}.death`]: null, [`${path}.survived`]: false }, { sr2eShift: true });
  try { await actor.toggleStatusEffect("dead", { active: false }); } catch (err) { /* no status */ }
}

// ── Registration ───────────────────────────────────────────────────────────

export function registerShapeshifters() {
  Hooks.on("preUpdateActor", onPreUpdate);
  Hooks.on("updateActor", (a, ch) => { onUpdateActor(a, ch).catch(err => console.error("SR2E | death card", err)); });
  Hooks.on("updateCombat", (c, ch) => { onCombatRound(c, ch).catch(err => console.error("SR2E | regeneration", err)); });
  // The round a combatant joined: its regeneration counts from there (written in its own create).
  Hooks.on("preCreateCombatant", (cb) => {
    cb.updateSource({ "flags.sr2e.joinedRound": Math.max(1, cb.parent?.round ?? 1) });
  });
  // A recorded death result is applied by the active GM even if the roller's write failed.
  Hooks.on("createActiveEffect", (e) => {
    const key = e.flags?.sr2e?.claim?.key ?? "";
    const actor = e.parent;
    if (!game.users.activeGM?.isSelf || !key.startsWith("death:") || !(actor instanceof Actor)) return;
    const rec = recordFor(actor, key);
    if (rec) applyDeath(actor, rec).catch(err => console.error("SR2E | death apply", err));
  });
  // Nobody installs cyberware on a shapeshifter in animal form; a player can't on one in human form
  // ("can't willingly accept"; the GM may — Companion p.38).
  const cyberGuard = (item, installed) => {
    const a = item.parent;
    if (item.type !== "cyberware" || !installed || !(a instanceof Actor) || a.type !== "character" || !isShapeshifter(a)) return true;
    if (a.system.shapeshifter.form === "animal") { ui.notifications?.warn(`${a.name}'s body rejects cyberware in animal form (Companion p.38).`); return false; }
    if (!game.user.isGM) { ui.notifications?.warn(`A shapeshifter can't willingly accept cyberware (Companion p.38) — the GM may install it.`); return false; }
    return true;
  };
  Hooks.on("preCreateItem", (item, data) => cyberGuard(item, data.system?.installed ?? item.system?.installed));
  Hooks.on("preUpdateItem", (item, changes) => {
    const v = foundry.utils.getProperty(changes, "system.installed");
    return v === true && !item.system.installed ? cyberGuard(item, true) : true;
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.flags?.sr2e?.shiftDeath && !message.flags?.sr2e?.shiftDeathResult) return;
    html.querySelectorAll?.(".sr2e-shift-death, .sr2e-shift-magic").forEach(btn => btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const actor = await fromUuid(btn.dataset.actorUuid);
      if (!actor) return ui.notifications.warn("That actor no longer exists.");
      try {
        if (btn.classList.contains("sr2e-shift-magic")) await deathMagicLoss(actor, btn.dataset.id);
        else await resolveDeath(actor, btn.dataset.id, { massive: btn.dataset.massive === "1" });
      } catch (err) { console.error("SR2E | death check", err); ui.notifications.error(err.message); }
    }));
  });
}

/** What the sheets show (character and NPC). */
export function shiftView(actor) {
  if (!["character", "npc"].includes(actor?.type)) return null;
  const st = shiftState(actor);
  const d = st.death;
  const animal = actor.type === "character" && actor.system.shapeshifter?.form === "animal";
  return {
    on: isShapeshifter(actor), npc: actor.type === "npc", animal,
    nextForm: animal ? "human" : "animal",
    forms: actor.type === "npc" ? (actor._source.system.forms ?? []).map((f, i) => ({ ...f, i,
      active: f.key && f.key === actor.system.activeForm })) : [],
    formLocked: actor.type === "npc" && !!activeFormOf(actor.system),
    problem: shiftProblem(actor),
    buckets: actor.type === "character" ? st.b : null,
    death: d, pending: d?.state === "pending", dead: d?.state === "dead", massiveOffer: d?.state === "pending" && d.diesOn === 1,
    magicOwed: Object.entries(st.magicOwed ?? {}).filter(([, v]) => v).map(([k]) => k)
  };
}
