/**
 * Per-Combat-Phase engagement state for ranged fire (SR2E p.92–93): recoil,
 * the targets engaged this phase (multiple-target modifier) and the last
 * full-auto endpoint (walking fire).
 *
 * State is never zeroed at a phase boundary. It carries the key of the phase
 * it was committed under (`flags.sr2e.engaged.key`) and simply reads as empty
 * once that key is no longer current — which makes late or racing commits
 * harmless instead of something to lock against.
 *
 * Phase key: "<combatId>:<phaseSeq>:<resetSeq>". `phaseSeq` is a monotonic
 * counter on the combat, bumped in the same write as every turn/round change
 * (SR2ECombat methods, plus a preUpdateCombat hook for manual tracker edits);
 * `resetSeq` is per actor and bumped by the manual Reset Recoil button.
 */
import { effectiveRecoil } from "./rules/sr2e-rules.mjs";

/** The started combat this actor fights in, or null. */
function combatFor(actor) {
  if (!actor) return null;
  const combats = [game.combat, ...(game.combats?.contents ?? [])].filter(Boolean);
  return combats.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid)) ?? null;
}

/**
 * The current phase key for a gunner. A gunner who is not in the tracker but
 * fires a weapon mounted on a vehicle that is takes the vehicle's phase.
 * @param {Actor} actor  - the gunner
 * @param {Item} [weapon]
 */
export function phaseKey(actor, weapon) {
  const vehicle = weapon?.parent && weapon.parent !== actor ? weapon.parent : null;
  const combat = combatFor(actor) ?? combatFor(vehicle);
  const reset = Number(actor?.getFlag?.("sr2e", "resetSeq")) || 0;
  return combat ? `${combat.id}:${Number(combat.getFlag("sr2e", "phaseSeq")) || 0}:${reset}` : `free:${reset}`;
}

/** The gunner's stored engagement record (possibly stale), or null. */
export function engagedRecord(actor) {
  const r = actor?.getFlag?.("sr2e", "engaged");
  return r && typeof r === "object" ? r : null;
}

/** Recoil still in force for this gunner in the phase `key`. */
export function currentRecoil(actor, key) {
  return effectiveRecoil(engagedRecord(actor)?.key, key, actor?.system?.combatRecoil);
}

/** The update a manual Reset Recoil applies: zero, and a new phase identity. */
export function recoilResetUpdate(actor) {
  return { "system.combatRecoil": 0,
           "flags.sr2e.resetSeq": (Number(actor.getFlag("sr2e", "resetSeq")) || 0) + 1 };
}

// One ranged attack at a time per gunner on this client, so two quick shots
// at A then B see each other (+0, then +2) instead of racing on one record.
const QUEUE = new Map();

/** Run `fn` after every earlier queued attack by this gunner has settled. */
export function enqueueAttack(actorUuid, fn) {
  const prev = QUEUE.get(actorUuid) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  QUEUE.set(actorUuid, tail);
  tail.then(() => { if (QUEUE.get(actorUuid) === tail) QUEUE.delete(actorUuid); });
  return run;
}

/** Bump the combat's phase counter inside a pending update (preUpdateCombat). */
export function injectPhaseSeq(combat, changed) {
  const moves = ("round" in changed) || ("turn" in changed);
  const has = foundry.utils.hasProperty(changed, "flags.sr2e.phaseSeq");
  if (moves && !has) {
    foundry.utils.setProperty(changed, "flags.sr2e.phaseSeq",
      (Number(combat.getFlag("sr2e", "phaseSeq")) || 0) + 1);
  }
}

/** The phaseSeq value for an explicit bump (same-index turn changes). */
export function nextPhaseSeq(combat) {
  return (Number(combat.getFlag("sr2e", "phaseSeq")) || 0) + 1;
}
