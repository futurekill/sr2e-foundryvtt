/**
 * Nature spirits vanish at sunrise and sunset (SR2E p.139): "no matter what …
 * All services end at that time." See docs/PLAN-nature-spirit-expiry.md.
 *
 * One executor, the ACTIVE GM, one local queue. There is no job journal: the
 * rule's state is the world itself, so an interrupted run is finished by the
 * next one. The GM never writes a conjurer's `boundSpirits` — dead entries are
 * filtered by `liveBoundSpirits` and pruned by the conjurer's own next write.
 */
import { sunBoundaryCrossed, nextSunBoundary } from "./rules/sr2e-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const isActiveGM = () => !!game.users?.activeGM?.isSelf;
const setting = (key, fallback) => { try { return game.settings.get("sr2e", key); } catch (e) { return fallback; } };
const isNature = (a) => a?.type === "spirit" && a.system?.spiritType === "nature";
const departed = (a) => !!a?.getFlag?.("sr2e", "departed");
const allTokens = () => game.scenes.contents.flatMap(s => s.tokens.contents);

export function registerNatureSpiritSettings() {
  game.settings.register("sr2e", "natureSpiritExpiry", {
    name: "Nature spirits depart at sunrise and sunset",
    hint: "When world time passes sunrise or sunset, every nature spirit vanishes and its services end (SR2E p.139). Off: use the GM button in the token controls.",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register("sr2e", "natureSpiritDepartDelete", {
    name: "Delete departed nature spirits",
    hint: "Delete a departed nature spirit's actor. Off: keep it in the sidebar, marked departed with no services.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register("sr2e", "sunriseHour", {
    name: "Sunrise hour", scope: "world", config: true, type: Number, default: 6,
    range: { min: 0, max: 23, step: 1 }
  });
  game.settings.register("sr2e", "sunsetHour", {
    name: "Sunset hour", scope: "world", config: true, type: Number, default: 18,
    range: { min: 0, max: 23, step: 1 }
  });
}

/** Day/hour lengths from the core calendar, and the configured hours. */
function clock() {
  const d = game.time?.calendar?.days ?? {};
  const hourLength = (d.secondsPerMinute ?? 60) * (d.minutesPerHour ?? 60);
  return { hourLength, dayLength: hourLength * (d.hoursPerDay ?? 24),
           sunrise: setting("sunriseHour", 6), sunset: setting("sunsetHour", 18) };
}

/** The summon card's note: when this nature spirit will go. */
export function natureDepartNote() {
  if (!setting("natureSpiritExpiry", false)) return " Nature spirits vanish at the next sunrise or sunset (the GM ends it).";
  const c = clock();
  const wait = nextSunBoundary({ now: game.time.worldTime, ...c });
  const hours = Math.round((wait / c.hourLength) * 10) / 10;
  return ` Nature spirits vanish at the next sunrise or sunset — in ${hours} hour${hours === 1 ? "" : "s"} (p.139).`;
}

/**
 * Snapshot the candidates SYNCHRONOUSLY (before any await): a spirit summoned
 * after the event is not one of them.
 */
function snapshot(scope = () => true) {
  const deleteOn = setting("natureSpiritDepartDelete", true);
  const tokens = allTokens();
  const actors = [];
  for (const a of game.actors) {
    if (!isNature(a) || !scope(a)) continue;
    // A departure is complete when no token of it is left, and the actor is
    // kept on purpose (with deletion on, a surviving actor is retried).
    const linkedLeft = tokens.some(t => t.actorLink && t.actorId === a.id);
    if (departed(a) && !linkedLeft && !deleteOn) continue;
    actors.push(a.id);
  }
  const unlinked = [], detach = [];
  for (const t of tokens) {
    if (t.actorLink || !t.actor) continue;
    if (isNature(t.actor)) { if (scope(t.actor)) unlinked.push(t.uuid); }
    // An unlinked instance its delta made into something else survives on its
    // own actor when its nature-spirit base expires.
    else if (actors.includes(t.actorId)) detach.push(t.uuid);
  }
  return { actors, unlinked, detach, deleteOn, scope };
}

let queue = Promise.resolve();

/** Quench only: a default scope for every run (the time trigger, the button). */
export const departTesting = { scope: null };

/**
 * Every nature spirit departs now (active GM only). Also the scene-control
 * button and `game.sr2e.natureSpiritsDepart()`. `scope(actor)` narrows the
 * candidates — tests use it so they never send a world's real spirits away.
 */
export function natureSpiritsDepart({ reason = "Sunrise / sunset", quiet = false, scope } = {}) {
  if (!isActiveGM()) {
    ui.notifications?.warn("Only the active GM can send the nature spirits away.");
    return Promise.resolve(null);
  }
  const snap = snapshot(scope ?? departTesting.scope ?? undefined);
  const run = queue.then(() => depart(snap, reason, quiet));
  queue = run.catch(() => {});
  return run;
}

/** Delete summoned tokens whose spirit is gone or departed (active GM). */
export async function reconcileSummonedTokens(tokens = allTokens()) {
  const stale = tokens.filter(t => {
    const src = t.flags?.sr2e?.summonedSpirit;
    if (!src) return false;
    let a = null;
    try { a = fromUuidSync(src); } catch (e) { /* gone */ }
    return !a || departed(a);
  });
  for (const s of new Set(stale.map(t => t.parent))) {
    if (!isActiveGM()) return;
    const ids = stale.filter(t => t.parent === s && s.tokens.has(t.id)).map(t => t.id);
    if (ids.length) await s.deleteEmbeddedDocuments("Token", ids);
  }
  return stale.length;
}

async function depart(snap, reason, quiet) {
  const gone = [];
  await reconcileSummonedTokens(allTokens().filter(t => {
    const src = t.flags?.sr2e?.summonedSpirit;
    let a = null;
    try { a = src ? fromUuidSync(src) : null; } catch (e) { /* gone */ }
    return !a || snap.scope(a);
  }));

  // Detach surviving non-nature instances first (idempotent: a retry reuses the
  // actor already made for that token).
  for (const uuid of snap.detach) {
    if (!isActiveGM()) return null;
    const tok = fromUuidSync(uuid);
    if (!tok?.actor || tok.actorLink || isNature(tok.actor)) continue;
    let own = game.actors.find(a => a.getFlag("sr2e", "detachedFrom") === uuid);
    if (!own) {
      const data = tok.actor.toObject();
      delete data._id;
      foundry.utils.setProperty(data, "flags.sr2e.detachedFrom", uuid);
      own = await Actor.create(data);
    }
    const flagged = tok.flags?.sr2e?.summonedSpirit;
    await tok.update({ actorId: own.id, delta: { _id: tok.id },
      ...(flagged ? { "flags.sr2e.summonedSpirit": own.uuid } : {}) }, { diff: false, recursive: false });
  }

  // 1. Mark first, so placement and conjuring see it at once.
  for (const id of snap.actors) {
    if (!isActiveGM()) return null;
    const a = game.actors.get(id);
    if (!a) continue;
    if (!departed(a) || a.system.services) await a.update({ "system.services": 0, "flags.sr2e.departed": true });
    gone.push(a.name);
  }
  for (const uuid of snap.unlinked) {
    if (!isActiveGM()) return null;
    const tok = fromUuidSync(uuid);
    if (!tok?.actor) continue;
    if (!departed(tok.actor)) await tok.actor.update({ "system.services": 0, "flags.sr2e.departed": true });
  }

  // 2. Tokens: linked tokens of the departing actors (found now, so one placed
  //    mid-run goes too), then the unlinked candidates.
  const ids = new Set(snap.actors);
  const doomed = allTokens().filter(t => (t.actorLink && ids.has(t.actorId)) || snap.unlinked.includes(t.uuid));
  for (const s of new Set(doomed.map(t => t.parent))) {
    if (!isActiveGM()) return null;
    const mine = doomed.filter(t => t.parent === s && s.tokens.has(t.id));
    for (const t of mine) if (!t.actorLink) gone.push(t.name);
    if (mine.length) await s.deleteEmbeddedDocuments("Token", mine.map(t => t.id));
  }

  // 3. The actors themselves.
  if (snap.deleteOn) {
    const del = snap.actors.filter(id => game.actors.has(id));
    if (del.length && isActiveGM()) await Actor.deleteDocuments(del);
  }

  if (gone.length) {
    await ChatMessage.create({ content: `<div class="sr2e-damage-result">🌅 <strong>${esc(reason)}</strong>: the nature
      spirits vanish, and their services end (SR2E p.139).<br>${[...new Set(gone)].map(esc).join(", ")}</div>` });
  } else if (!quiet) {
    ui.notifications?.info("No nature spirits to send away.");
  }
  return gone;
}

export function registerNatureSpiritHooks() {
  Hooks.on("updateWorldTime", (worldTime, dt) => {
    if (!isActiveGM() || !setting("natureSpiritExpiry", false)) return;
    if (!sunBoundaryCrossed({ now: worldTime, dt, ...clock() })) return;
    natureSpiritsDepart({ reason: "Sunrise / sunset", quiet: true });
  });
  // A summoned token placed for a spirit that departed meanwhile.
  Hooks.on("createToken", (tok) => { if (isActiveGM() && tok.flags?.sr2e?.summonedSpirit) reconcileSummonedTokens([tok]); });
  Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user?.isGM) return;
    const tokens = controls.tokens ?? controls.token;
    if (!tokens?.tools) return;
    tokens.tools.sr2eNatureDepart = {
      name: "sr2eNatureDepart", order: 99, button: true, icon: "fa-solid fa-sun",
      title: "Sunrise / Sunset — nature spirits depart (SR2E p.139)",
      onChange: () => natureSpiritsDepart({ reason: "Sunrise / sunset" })
    };
  });
}
