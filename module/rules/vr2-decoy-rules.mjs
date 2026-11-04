/**
 * VR2.0 part 6a-0 — Decoy (p.112), Null Operation and Scan Icon (p.117): the pure decisions
 * (docs/PLAN-vr2-part6-frames.md, "6a-0 in detail"). No Foundry here.
 */
import { matrixCombatOutcome, MATRIX_MONITOR_MAX } from "./sr2e-rules.mjs";

/** "If the die roll result is less than the … successes … In the event of a tie, decoys fool IC." */
export const decoyFooled = (roll, successes) => (Number(roll) || 0) <= (Number(successes) || 0);

/**
 * The decker's live decoy, folded from records (never stored). Take the NEWEST decoy record of the live connection
 * whose card shows a success or is gone; only that one is then checked (R2 #1, R3): a missing card, another host
 * session, or a full monitor means no decoy — never a fall-back to an older one. A failed attempt is skipped.
 * @param {object} a
 * @param {object[]} a.records    the decker's records ({type: "decoy"|"decoyHit", …, ct})
 * @param {number|null} a.conn    the live connection number
 * @param {string|null} a.sessionId the decker's current host session
 * @param {(card: string) => {success: boolean, successes: number}|null} a.cardOf the card's verdict now; null = gone
 * @returns {{key: string, card: string, successes: number, damage: number}|null}
 */
export function liveDecoy({ records = [], conn = null, sessionId = null, cardOf = () => null }) {
  if (conn == null) return null;
  const mine = records.filter(e => e.type === "decoy" && e.conn === conn)
    .sort((a, b) => ((b.ct ?? 0) - (a.ct ?? 0)) || String(b.key).localeCompare(String(a.key)));
  for (const d of mine) {
    const c = cardOf(d.card);
    if (c && !c.success) continue;                       // a failed attempt never happened, as far as decoys go
    if (!c || d.sessionId !== sessionId) return null;    // gone, or left on another host session
    const damage = records.filter(e => e.type === "decoyHit" && e.decoy === d.key).reduce((n, e) => n + (e.boxes ?? 0), 0);
    return damage >= MATRIX_MONITOR_MAX ? null : { key: d.key, card: d.card, successes: c.successes, damage };
  }
  return null;
}

/** Boxes a decoyed attack does: no defenses, no resistance — the level staged by the attack's successes; 0 = a miss. */
export const decoyBoxes = (level, successes) => (successes > 0 ? matrixCombatOutcome(level, successes, 0).boxes : 0);

/** Null Operation (p.117): the inactivity modifier to the host's base Security Value. */
export function nullInactivityMod(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 10) return 0;
  if (s < 60) return 1;
  if (s < 3600) return 2;
  if (s < 12 * 3600) return 4;
  return 4 + Math.floor((s - 12 * 3600) / (12 * 3600)) + 1;
}

/** Scan Icon (p.117): Computer vs Masking, lowered by Scanner − Sleaze (raised when Sleaze is higher). */
export const scanIconTN = ({ masking = 0, scanner = 0, sleaze = 0 }) => Math.max(2, masking - (scanner - sleaze));

/** The facts a Scan Icon success can buy (p.117). */
export const SCAN_FACTS = { mpcp: "MPCP Rating", bod: "Bod", evasion: "Evasion", masking: "Masking", sensor: "Sensor", response: "Response Increase" };
