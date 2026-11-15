/**
 * Electronic warfare against remote-control networks (Rigger 2 p.68–72; docs/PLAN-vehicles-phase2.md Part 5b). Pure:
 * no Foundry. The records live on the target deck (`flags.sr2e.rcNet`: monitors, carriers, freqGen, alert, bogus,
 * channelAuthority) and the intruder's deck (`flags.sr2e.ewIntercepts`); module/ew.mjs runs the ops.
 */

export const CHANNELS = Object.freeze(["command", "simsense", "system"]);
export const SIGNAL_BOXES = 10;

/** Which channels each MIJI operation may hit (p.70–72). */
export const OP_CHANNELS = Object.freeze({
  meaconing: ["command", "system"], intrusion: ["command", "simsense", "system"],
  jamming: ["command", "simsense", "system"], interference: ["system"]
});

/** A channel's filled boxes: Σ its entries' APPLIED boxes (each entry is capped when committed, so Σ ≤ 10). */
export const channelBoxes = (monitor) => Object.values(monitor?.entries ?? {}).reduce((n, e) => n + (Number(e?.boxes) || 0), 0);

/**
 * The Signal Monitor band (p.70, read at 300 dpi): Light from box 1 (+1 TN), Moderate from 3 (+2), Serious from 6 (+3),
 * 10 = the channel is disengaged.
 */
export function signalBand(boxes) {
  const b = Math.max(0, Math.floor(Number(boxes) || 0));
  if (b >= SIGNAL_BOXES) return { level: "D", tn: 3, full: true };
  if (b >= 6) return { level: "S", tn: 3, full: false };
  if (b >= 3) return { level: "M", tn: 2, full: false };
  if (b >= 1) return { level: "L", tn: 1, full: false };
  return { level: null, tn: 0, full: false };
}

/** The boxes an entry may apply: its net successes, capped at the channel's remaining capacity (round 2 #7). */
export const appliedBoxes = (monitor, net) => Math.max(0, Math.min(Math.floor(Number(net) || 0), SIGNAL_BOXES - channelBoxes(monitor)));

/** Signal interception (p.68–69): dice = the intruder's device rating; TN = target deck rating + 3, +2 per alert. */
export const interceptTn = ({ deckRating = 0, alert = 0 } = {}) => (Number(deckRating) || 0) + 3 + 2 * Math.max(0, Number(alert) || 0);

/**
 * Which channels an Interception Test's successes take (p.69): one channel per success, the NAMED ones first; with
 * none named the GM chooses (returns `gmChooses` and the count).
 */
export function interceptedChannels(successes, named = []) {
  const n = Math.max(0, Math.min(Math.floor(Number(successes) || 0), CHANNELS.length));
  const want = [...new Set(named.filter(c => CHANNELS.includes(c)))];
  if (!want.length) return { channels: [], gmChooses: n };
  const taken = want.slice(0, n);
  return { channels: taken, gmChooses: Math.max(0, n - taken.length) };
}

/** Breaking encryption (p.69; ruling R5-2): Electronic Warfare vs encryption rating + 4; success needs MORE than ⌈deck rating ÷ 2⌉. */
export const decryptTn = (encryptionRating) => (Number(encryptionRating) || 0) + 4;
export const decryptOk = (successes, deckRating) => (Number(successes) || 0) > Math.ceil((Number(deckRating) || 0) / 2);

/**
 * A MIJI exchange's target numbers (p.69–72; plan 5b.2): the intruder rolls their device's Flux vs the target deck's
 * rating + 2 per alert; the target rigger rolls their deck's Flux vs the intruder's protocol emulation rating
 * (meaconing, intrusion, interference) or ECM rating (jamming).
 */
export function mijiTns({ op, targetDeckRating = 0, alert = 0, protocolEmulation = 0, ecm = 0 } = {}) {
  return { intruder: (Number(targetDeckRating) || 0) + 2 * Math.max(0, Number(alert) || 0),
    defender: op === "jamming" ? (Number(ecm) || 0) : (Number(protocolEmulation) || 0) };
}

/** An opposed MIJI result: the intruder's NET successes (0 when the defender ties or wins). */
export const mijiNet = (intruder, defender) => Math.max(0, (Number(intruder) || 0) - (Number(defender) || 0));

/** Regeneration (p.72; R5-5): ECCM rating dice vs the intruder's deck or ECM rating (the higher) + 3; 2 successes clear 1 box. */
export const regenTn = ({ deckRating = 0, ecm = 0 } = {}) => Math.max(Number(deckRating) || 0, Number(ecm) || 0) + 3;
export const regenBoxes = (successes) => Math.floor(Math.max(0, Number(successes) || 0) / 2);

/**
 * Clear `n` boxes of ONE intruder's entries on a channel (R5-5), oldest entry first. Returns the entry updates:
 * { [eventId]: newBoxes } (0 = remove).
 */
export function regenerate(monitor, attackerKey, n) {
  let left = Math.max(0, Math.floor(Number(n) || 0));
  const out = {};
  const mine = Object.entries(monitor?.entries ?? {}).filter(([, e]) => e?.attackerKey === attackerKey)
    .sort(([, a], [, b]) => (Number(a.at) || 0) - (Number(b.at) || 0));
  for (const [id, e] of mine) {
    if (!left) break;
    const take = Math.min(left, Number(e.boxes) || 0);
    out[id] = (Number(e.boxes) || 0) - take;
    left -= take;
  }
  return out;
}

/**
 * Re-connecting a lost carrier (p.72; R5-3, plan 5b.6): needs at least one clear box; Control Systems vs TN 4 + the
 * channel's degradation modifier + the rigger's damage modifiers; success when successes exceed the filled boxes.
 */
export const reconnectTn = ({ boxes = 0, damageMod = 0 } = {}) => 4 + signalBand(boxes).tn + Math.max(0, Number(damageMod) || 0);
export const reconnectAllowed = (boxes) => (Number(boxes) || 0) < SIGNAL_BOXES;
export const reconnectOk = (successes, boxes) => (Number(successes) || 0) > (Number(boxes) || 0);

/**
 * Which tests a channel's degradation reaches (plan 5b.3): a channel counts for a test only if one of its PRESENT
 * entries is of an operation that affects that kind of test. Kinds: "drone" (Driving/Gunnery/physical tests on a
 * drone's Pilot), "ivis", "comprehension", "perception" / "manualGunnery" (through the drone, simsense),
 * "riggerAll" (a remotely rigged drone's simsense: every Success Test of the rigger, like damage), "indirect"
 * (indirect-fire Gunnery and FDDM through the network).
 */
const AFFECTS = {
  meaconing: { command: ["drone", "ivis"], system: ["drone", "ivis"] },
  jamming: { command: ["comprehension", "ivis"], simsense: ["perception", "manualGunnery", "riggerAll"], system: ["indirect"] },
  intrusion: {}, interference: {}
};
export const affects = (op, channel, kind) => !!AFFECTS[op]?.[channel]?.includes(kind);

/**
 * The degradation TN modifier for one test (plan 5b.3): each channel counted ONCE, its band from the channel's total
 * boxes, and only when one of its present entries affects this kind of test. `channels` limits which channels the
 * test's context uses.
 */
export function degradationMod(monitors = {}, kind, channels = CHANNELS) {
  let tn = 0;
  for (const ch of channels) {
    const m = monitors?.[ch];
    const entries = Object.values(m?.entries ?? {}).filter(e => (Number(e?.boxes) || 0) > 0);
    if (!entries.some(e => affects(e.op, ch, kind))) continue;
    tn += signalBand(channelBoxes(m)).tn;
  }
  return tn;
}
