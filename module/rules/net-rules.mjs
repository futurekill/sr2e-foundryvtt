/**
 * Netguns (Street Samurai Catalog p.72; Corporate Security Handbook p.103 for the
 * astral FAB-NG). See docs/PLAN-netguns.md. Pure, so Vitest pins the book's numbers.
 *
 * The victim resists with Strength (Astral Reaction for an astral net) against TN 5
 * (normal net) or 8 (large net), or 3 when a normal net hits a large target, and must
 * get MORE than twice the attacker's successes. Escape: the same test once per turn,
 * the TN falling by 1 for every turn entangled (user ruling: a TN modifier).
 */

/** Base TN for a net (both books). */
export function netTN({ net = "standard", largeTarget = false } = {}) {
  if (net === "large") return 8;
  return largeTarget ? 3 : 5;
}

/** Escape TN after `turns` turns entangled: −1 per turn, never below 2. */
export function escapeTN(base, turns = 0) {
  return Math.max(2, (Number(base) || 0) - Math.max(0, Math.trunc(Number(turns) || 0)));
}

/** Does the net hold? The victim needs MORE than twice the attacker's successes. */
export function netHolds({ successes = 0, attackerSuccesses = 0 } = {}) {
  return (Number(successes) || 0) <= 2 * (Number(attackerSuccesses) || 0);
}

/** CSH p.103: no escape is possible when twice the attacker's successes exceeds every die the victim can roll. */
export function escapeImpossible({ attackerSuccesses = 0, dice = 0 } = {}) {
  return 2 * (Number(attackerSuccesses) || 0) > (Number(dice) || 0);
}

/**
 * Which net a weapon fires: its size comes from the LOADED net (the large gun fires
 * both sizes), else the weapon's own name; astral from `flags.sr2e.net.astral`, else a
 * FAB (fat bacteria) weapon.
 */
export function netKind({ name = "", flags = {} } = {}, loadedName = "") {
  const size = loadedName ? (/large/i.test(loadedName) ? "large" : "standard")
    : (/large/i.test(name) ? "large" : "standard");
  const astral = flags?.sr2e?.net?.astral ?? /\bFAB\b/i.test(name);
  return { size, astral: !!astral };
}

/**
 * Bring a net's entangled-turn count up to date at an escape attempt.
 * @param {{turns:number, seen:{combatId,round}|null}} rec
 * @param {{combatId,round}|null} now  the token's current combat, if any
 * @param {number|null} oldRound  the round of `seen.combatId`'s combat if it still exists
 * @returns {{turns:number, seen:{combatId,round}|null}}
 */
export function advanceTurns({ turns = 0, seen = null } = {}, now = null, oldRound = null) {
  const folded = seen && oldRound != null ? Math.max(0, oldRound - seen.round) : 0;
  if (now && seen && seen.combatId === now.combatId) {
    return { turns: turns + Math.max(0, now.round - seen.round), seen: { ...now, round: Math.max(now.round, seen.round) } };
  }
  if (now) return { turns: turns + folded, seen: { ...now } };     // switching combats adds nothing itself
  return { turns: turns + folded + 1, seen: null };                // out of combat: each attempt is a turn
}
