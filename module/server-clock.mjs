/**
 * The server's WALL clock, as this client can know it (docs/archive/plans/PLAN-claim-clock.md 2). On Foundry 13
 * `game.time.serverTime` is the server's uptime — it resets on every restart — so claim ages use the server's
 * wall-clock document stamps (`_stats.createdTime`/`modifiedTime`) instead.
 *
 * A sample = a live document change's `modifiedTime` with this client's monotonic `performance.now()` at arrival.
 * serverNow() = max over samples of wall + (monotonic elapsed): latency only makes a sample older, so the estimate is
 * never ahead of the server (an age is never overstated). Only live samples, at most 10 minutes old, none across a
 * reconnect or a sleep; none → null (unknown).
 */
import { pickServerNow } from "./rules/claim-rules.mjs";

const WINDOW_MS = 10 * 60 * 1000;
const SAMPLES = [];
/** Test seam (Quench only): in testMode a marker's or message's `testCt` stands in for its server stamp. */
export const serverClock = { testMode: false };

/**
 * Record a live server stamp. `created` = a create hook (createdTime is then current); an update must carry a
 * modifiedTime (code review r1 #6). A sample clearly BEHIND the kept estimate means the server clock was corrected
 * backward: the older samples are ahead of it and are dropped (r1 #1).
 */
function sample(doc, created = false) {
  const wall = Number(created ? (doc?._stats?.createdTime ?? doc?._stats?.modifiedTime) : doc?._stats?.modifiedTime);
  if (!Number.isFinite(wall) || wall <= 0) return false;
  const est = pickServerNow(SAMPLES, { mono: performance.now(), date: Date.now(), windowMs: WINDOW_MS });
  if (est != null && wall < est - 5000) SAMPLES.length = 0;
  SAMPLES.push({ wall, mono: performance.now(), date: Date.now() });
  if (SAMPLES.length > 20) SAMPLES.splice(0, SAMPLES.length - 20);
  return true;
}

/** The server's wall clock now (ms), or null when this client has no live sample. */
export function serverNow() {
  const v = pickServerNow(SAMPLES, { mono: performance.now(), date: Date.now(), windowMs: WINDOW_MS });
  // Drop what the rule rejected (expired or across a sleep), so the list stays small.
  for (let i = SAMPLES.length - 1; i >= 0; i--) if (SAMPLES[i].dead) SAMPLES.splice(i, 1);
  return v;
}

/**
 * A FRESH server sample (a new nonce on this user's own User document), then serverNow(). Every actionable "is it
 * stuck?" decision uses this (code review r1 #1, #4): it catches a backward clock correction and an idle world.
 */
export async function freshServerNow() {
  try {
    const u = await game.user.update({ "flags.sr2e.clockPing": foundry.utils.randomID() });
    if (u) sample(u);
  } catch (err) { console.warn("SR2E | clock sample failed", err); }
  return serverNow();
}

export function registerServerClock() {
  for (const type of ["ActiveEffect", "ChatMessage", "Actor", "Item", "Combat", "User"]) {
    Hooks.on(`create${type}`, (doc) => sample(doc, true));
    Hooks.on(`update${type}`, (doc) => sample(doc));
  }
  // A reconnect (a server restart, a clock change): nothing measured before it counts.
  Hooks.once("ready", () => game.socket?.on?.("connect", () => { SAMPLES.length = 0; }));
}
