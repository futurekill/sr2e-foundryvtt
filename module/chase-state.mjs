/**
 * Read-only lookups over Rigger 2 chases (docs/PLAN-vehicles-phase2.md 3.0). Kept apart from chase.mjs so
 * vehicle-play.mjs and actor.mjs can read chase state without an import cycle. Writes live in chase.mjs (GM only).
 */
import { isRigger2 } from "./vehicle-mode.mjs";

/** A combat's chase record, or null. */
export const chaseOf = (combat) => combat?.getFlag?.("sr2e", "chase") ?? null;

/** Every combat holding a chase (only under Rigger 2). */
export function activeChases() {
  if (!isRigger2()) return [];
  return (game.combats?.contents ?? []).filter(c => chaseOf(c)?.entries);
}

/** The chase entry for this vehicle or pedestrian uuid: {combat, eid, entry}, or null. */
export function findEntry(uuid) {
  if (!uuid) return null;
  for (const combat of activeChases()) {
    for (const [eid, entry] of Object.entries(chaseOf(combat).entries ?? {})) if (entry?.uuid === uuid) return { combat, eid, entry };
  }
  return null;
}

/** The chase entry this character is aboard (as driver or passenger), or null. */
export function findAboard(uuid) {
  if (!uuid) return null;
  for (const combat of activeChases()) {
    for (const [eid, entry] of Object.entries(chaseOf(combat).entries ?? {})) {
      if (entry?.kind === "vehicle" && (entry.driver === uuid || (entry.aboard ?? []).includes(uuid))) return { combat, eid, entry };
    }
  }
  return null;
}

/** The entry this character DRIVES in an active chase, or null (Initiative step 5, p.44). */
export function drivenEntry(uuid) {
  const hit = findAboard(uuid);
  return hit?.entry?.driver === uuid ? hit : null;
}

/** The driver of a vehicle under Rigger 2: the chase entry's driver, else `fallback(vehicle)` (controllerOf). */
export function chaseDriverUuid(vehicle) {
  return findEntry(vehicle?.uuid)?.entry?.driver ?? null;
}

/** Every actor uuid a chase's round change refreshes (p.42): drivers, aboard characters, pedestrians. */
export function chaseUnion(chase) {
  const set = new Set();
  for (const e of Object.values(chase?.entries ?? {})) {
    if (!e) continue;
    if (e.kind === "pedestrian") set.add(e.uuid);
    if (e.driver) set.add(e.driver);
    for (const u of e.aboard ?? []) set.add(u);
  }
  return [...set];
}

const LOCKED = new Set(["advancing", "initiative", "pointing", "refreshing"]);

/** Is this combat between "advancing" and the end of "refreshing" (3.0 step 5)? */
export const poolsLockedIn = (combat) => LOCKED.has(combat?.getFlag?.("sr2e", "roundTransition")?.stage);

/** Pool spends are refused for a participant of a combat whose turn is changing (3.0 step 5). */
export function poolsLocked(actor) {
  const uuid = actor?.uuid;
  if (!uuid) return false;
  return (game.combats?.contents ?? []).some(c => poolsLockedIn(c)
    && (c.combatants.some(cb => cb.actor?.uuid === uuid) || chaseUnion(chaseOf(c)).includes(uuid)));
}

/** A chase action / slot record by id (3.0), or null. */
export const actionOf = (combatId, aid) => chaseOf(game.combats?.get(combatId))?.actions?.[aid] ?? null;
