/**
 * Spirit services (SR2E p.139–142) — see docs/PLAN-spirit-services.md.
 *
 * Services are a plain counter, changed only by an explicit action of the
 * spirit's owner (or the GM, as an owner). Every change runs in ONE per-spirit
 * queue (`svc:` + uuid, shared with elementalTransition) and reads fresh
 * state inside the step. Paying starts a service; continuing and cleaning up
 * are free, even at 0. Nothing is charged on a timer: the 24-hour rule is
 * shown on the sheet and charged by a button.
 */
import { enqueueAttack } from "./engagement.mjs";
import { daysPresent, chargeDaysPlan, spiritServiceStatus } from "./rules/sr2e-rules.mjs";
import { placeSummonedToken, tokensOf } from "./placement.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const isElemental = (a) => a?.type === "spirit" && a.system?.spiritType === "elemental";
const dayLength = () => {
  const d = game.time?.calendar?.days ?? {};
  return (d.secondsPerMinute ?? 60) * (d.minutesPerHour ?? 60) * (d.hoursPerDay ?? 24);
};
const audience = (a) => game.users.filter(u => u.isGM || a.testUserPermission(u, "OWNER")).map(u => u.id);
/** An informational card: its failure never interrupts a committed action. */
async function note(spirit, html, whisper = false) {
  try {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: spirit }), ...(whisper ? { whisper: audience(spirit) } : {}),
      content: `<div class="sr2e-item-card">${html}</div>` });
  } catch (e) { console.warn("SR2E | spirit service note failed", e); }
}

/** The one queue for a spirit's services (elementalTransition uses it too). */
export const serviceQueue = (spirit, fn) => enqueueAttack(`svc:${spirit.uuid}`, fn);

export function statusOf(spirit) {
  const s = spirit.system;
  return spiritServiceStatus({ departed: !!spirit.getFlag("sr2e", "departed"), conjurerUuid: s.conjurerUuid,
    fighting: !!spirit.getFlag("sr2e", "fighting"), service: s.service, pendingExpire: !!s.pendingExpireSpellUuid,
    services: s.services ?? 0 });
}

export function presentDays(spirit) {
  return daysPresent(spirit.getFlag("sr2e", "presentSince"), game.time.worldTime, dayLength());
}

/** The owed-days charge as update fields (saturating), or null when nothing is owed. */
export function chargeDaysUpdate(spirit, services = spirit.system.services ?? 0) {
  const since = spirit.getFlag("sr2e", "presentSince");
  if (!isElemental(spirit) || !Number.isFinite(since)) return null;
  const p = chargeDaysPlan({ services, presentSince: since, now: game.time.worldTime, dayLength: dayLength() });
  if (!p.days) return null;
  return { plan: p, update: { "system.services": p.services, "flags.sr2e.presentSince": p.presentSince } };
}

/** The running-out note, from whichever action spent the last service. */
export async function afterSpend(spirit, before, after) {
  if (!(before > 0) || after > 0 || !spirit.system.conjurerUuid || spirit.getFlag("sr2e", "departed")) return;
  const engaged = statusOf(spirit) === "engaged";
  await note(spirit, `<strong>${esc(spirit.name)}</strong> owes no more services — it is no longer
    bound and departs${engaged ? " once it finishes its current service" : ""} (SR2E p.141). The GM removes it.`, true);
}

const refuse = (spirit, why) => { ui.notifications.warn(`${spirit.name}: ${why}`); return { ok: false, reason: why }; };
const guard = (spirit) => {
  if (spirit?.type !== "spirit") return "not a spirit";
  if (!spirit.isOwner) return "you do not own it";
  if (spirit.getFlag("sr2e", "departed")) return "it has departed";
  return null;
};

/**
 * Spend (n > 0) or refund (n < 0) services, with optional extra fields, in
 * ONE update inside the spirit's queue. Refused when a spend can't be paid.
 */
export function spendService(spirit, n, { extra = {}, reason = "" } = {}) {
  return serviceQueue(spirit, async () => {
    const why = guard(spirit);
    if (why) return refuse(spirit, why);
    const before = spirit.system.services ?? 0;
    if (n > 0 && before < n) return refuse(spirit, `it owes no more services${reason ? ` (${reason})` : ""}.`);
    const after = Math.max(0, before - n);
    await spirit.update({ "system.services": after, ...extra });
    await afterSpend(spirit, before, after);
    return { ok: true, before, after };
  });
}

/** Fight for me (p.140): one service for the whole fight; idempotent. */
export function startFight(spirit) {
  return serviceQueue(spirit, async () => {
    const why = guard(spirit);
    if (why) return refuse(spirit, why);
    if (!spirit.system.conjurerUuid) return refuse(spirit, "an uncontrolled spirit answers to no one.");
    if (spirit.system.depleted) return refuse(spirit, "its Force is spent — it has vanished; Re-call it (1 service).");
    if (spirit.getFlag("sr2e", "fighting")) return { ok: true, already: true };
    const s = spirit.system;
    if (isElemental(spirit) && (s.service || s.pendingExpireSpellUuid)) return refuse(spirit, "it is busy with another service (one at a time, p.141).");
    const before = s.services ?? 0;
    if (before < 1) return refuse(spirit, "it owes no more services.");
    const presence = isElemental(spirit) && !Number.isFinite(spirit.getFlag("sr2e", "presentSince"))
      ? { "flags.sr2e.presentSince": game.time.worldTime } : {};
    await spirit.update({ "system.services": before - 1, "flags.sr2e.fighting": true, ...presence });
    await note(spirit, `<strong>${esc(spirit.name)}</strong> fights for its summoner — one service
      for the whole fight, however many foes (SR2E p.140).`);
    await afterSpend(spirit, before, before - 1);
    return { ok: true };
  });
}

export function standDown(spirit) {
  return serviceQueue(spirit, async () => {
    if (!spirit.isOwner) return refuse(spirit, "you do not own it");
    if (spirit.getFlag("sr2e", "fighting")) await spirit.update({ "flags.sr2e.-=fighting": null });
    return { ok: true };
  });
}

/**
 * Token work for one spirit runs on its own queue (not the services queue, so
 * a click-to-place prompt never holds up a spend): a Call's placement and a
 * Send away's removal are ordered, and each re-checks just before acting.
 */
const placementQueue = (spirit, fn) => enqueueAttack(`place:${spirit.uuid}`, fn);

/** Call an elemental to serve (free, p.141): starts its 24-hour clock and places it. */
export async function callElemental(spirit) {
  const r = await serviceQueue(spirit, async () => {
    const why = guard(spirit);
    if (why) return refuse(spirit, why);
    if (!isElemental(spirit)) return refuse(spirit, "only an elemental is called and sent away.");
    if (spirit.system.depleted) return refuse(spirit, "its Force is spent — Re-call it (1 service).");
    if (statusOf(spirit) === "bondEnded") return refuse(spirit, "it owes no more services and won't answer.");
    if (!Number.isFinite(spirit.getFlag("sr2e", "presentSince"))) {
      await spirit.update({ "flags.sr2e.presentSince": game.time.worldTime });
    }
    return { ok: true };
  });
  if (!r?.ok) return r;
  // Presence is idempotent, but a missing token can be placed again (a
  // cancelled prompt, no caster token last time). placeSummonedToken re-checks
  // presence and an existing token right before creating.
  placementQueue(spirit, async () => {
    if (!canvas?.scene || tokensOf(spirit, canvas.scene).length) return;
    await placeSummonedToken(spirit, fromUuidSync(spirit.system.conjurerUuid));
  });
  return r;
}

/** Send an elemental away (free): owed days are charged first, then its clock stops. */
export async function sendAway(spirit) {
  const r = await serviceQueue(spirit, async () => {
    const why = guard(spirit);
    if (why) return refuse(spirit, why);
    if (!isElemental(spirit)) return refuse(spirit, "only an elemental is called and sent away.");
    if (statusOf(spirit) === "engaged") return refuse(spirit, "it is performing a service — end it first.");
    const before = spirit.system.services ?? 0;
    const charge = chargeDaysUpdate(spirit, before);
    await spirit.update({ ...(charge?.update ?? {}), "flags.sr2e.-=presentSince": null });
    if (charge) await chargeCard(spirit, charge.plan);
    await afterSpend(spirit, before, spirit.system.services ?? 0);
    return { ok: true };
  });
  if (!r?.ok) return r;
  // After any placement already queued has finished: remove what we may, then
  // report what is actually left.
  // An elemental sent away is gone from EVERY scene — so the viewed scene
  // switching while this waited behind a placement prompt can't matter.
  await placementQueue(spirit, async () => {
    for (const scene of game.scenes) {
      const mine = tokensOf(spirit, scene).filter(t => t.canUserModify(game.user, "delete"));
      try { if (mine.length) await scene.deleteEmbeddedDocuments("Token", mine.map(t => t.id)); }
      catch (e) { console.warn("SR2E | removing the elemental's token failed", e); }
    }
    if (game.scenes.some(sc => tokensOf(spirit, sc).length)) {
      ui.notifications.info(`${spirit.name} is away — ask the GM to remove its token.`);
    }
  });
  return r;
}

/** Charge the days an elemental has been present (p.141) — recomputed in the queue. */
export function chargeDays(spirit) {
  return serviceQueue(spirit, async () => {
    const why = guard(spirit);
    if (why) return refuse(spirit, why);
    const before = spirit.system.services ?? 0;
    const charge = chargeDaysUpdate(spirit, before);
    if (!charge) { ui.notifications.info(`${spirit.name} owes nothing for time present.`); return { ok: true, charged: 0 }; }
    await spirit.update(charge.update);
    await chargeCard(spirit, charge.plan);
    await afterSpend(spirit, before, charge.plan.services);
    return { ok: true, charged: charge.plan.charged };
  });
}

function chargeCard(spirit, p) {
  return note(spirit, `<strong>${esc(spirit.name)}</strong> has been present ${p.days} full day${p.days === 1 ? "" : "s"}:
    ${p.charged} service${p.charged === 1 ? "" : "s"} used up (SR2E p.141).`, true);
}

/**
 * Use a spirit power (p.140): everything is validated INSIDE the queue, after
 * any dialog. `asFight`: part of the paid fight (free, needs fighting);
 * otherwise a new service (1), refused for an elemental that is busy, spent
 * or fighting (one service at a time).
 */
export function usePowerService(spirit, { asFight = false } = {}) {
  return serviceQueue(spirit, async () => {
    const why = guard(spirit);
    if (why) return refuse(spirit, why);
    const s = spirit.system;
    const elemental = isElemental(spirit);
    if (elemental && s.depleted) return refuse(spirit, "its Force is spent — it has vanished; Re-call it (1 service).");
    if (asFight) {
      if (!spirit.getFlag("sr2e", "fighting")) return refuse(spirit, "it is no longer fighting.");
      return { ok: true, free: true };
    }
    if (elemental && (s.service || s.pendingExpireSpellUuid || spirit.getFlag("sr2e", "fighting"))) {
      return refuse(spirit, "it is busy with another service (one at a time, p.141).");
    }
    const before = s.services ?? 0;
    if (before < 1) return refuse(spirit, "it owes no more services.");
    const presence = elemental && !Number.isFinite(spirit.getFlag("sr2e", "presentSince"))
      ? { "flags.sr2e.presentSince": game.time.worldTime } : {};
    await spirit.update({ "system.services": before - 1, ...presence });
    await afterSpend(spirit, before, before - 1);
    return { ok: true, after: before - 1 };
  });
}

/** Keep open spirit sheets' day counts current (read-only). */
export function registerSpiritServiceHooks() {
  Hooks.on("updateWorldTime", () => {
    for (const app of foundry.applications.instances.values()) {
      if (app.document?.type === "spirit" && app.rendered) app.render();
    }
  });
}
