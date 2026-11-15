/**
 * Maintenance overhead and mechanic labour (Rigger 2 p.18–19; docs/PLAN-vehicles-phase2.md 2b.5). Pure: no Foundry.
 */

/** Monthly overhead: 1% of the cost value (rounded up) + 10 × the Stress Points of the past month (p.18). */
export const overheadAmount = (value, stress) => Math.ceil((Math.max(0, Number(value) || 0)) / 100) + 10 * Math.max(0, Number(stress) || 0);

/** Lifestyle credit against a month's total overhead (p.19): Middle 200, High 1,500, Luxury 3,000; lower, none. */
export const LIFESTYLE_DISCOUNT = { middle: 200, high: 1500, luxury: 3000 };
export const lifestyleDiscount = (lifestyle) => LIFESTYLE_DISCOUNT[lifestyle] ?? 0;

/** Each point of Good Karma covers 500¥ (p.18). */
export const KARMA_NUYEN = 500;

/**
 * A payment: the months' amounts, the lifestyle credit the payer still has for each month (distributable among their
 * vehicles), and Good Karma. Returns {discount: {m: credit used}, karma, nuyen} — Karma never buys more than is left.
 * `rows` = [{month, amount}]; `allowance` = {m: credit left}; `karma` = points offered.
 */
export function overheadPayment(rows = [], allowance = {}, karma = 0) {
  const byMonth = {};
  for (const r of rows) byMonth[r.month] = (byMonth[r.month] ?? 0) + Math.max(0, Number(r.amount) || 0);
  const discount = {};
  let due = 0;
  for (const [m, amt] of Object.entries(byMonth)) {
    const d = Math.min(amt, Math.max(0, Number(allowance[m]) || 0));
    if (d) discount[m] = d;
    due += amt - d;
  }
  const k = Math.max(0, Math.min(Math.floor(Number(karma) || 0), Math.ceil(due / KARMA_NUYEN)));
  return { discount, karma: k, nuyen: Math.max(0, due - k * KARMA_NUYEN), gross: Object.values(byMonth).reduce((t, a) => t + a, 0) };
}

/**
 * Closing month `m` for one vehicle: the new record, and the older months to mark missed now (unpaid, not yet missed;
 * reserved ones too — a reservation isn't a payment). Each missed month adds 1 Stress, counted in the NEW month.
 */
export function assessMonth(months = {}, m, { value, stress, maintenance = 1 }) {
  // A month superseded by optempo (R2 p.83, 6a.2) is never payable, so never missed.
  const missed = Object.entries(months).filter(([k, r]) => Number(k) < m && !r?.paid && !r?.missed && r?.superseded == null).map(([k]) => Number(k));
  // `maintenance`: Quality Factors' Maintenance Cost multiplier (R2 p.84: ×.9 / ×1.2 per level), rounded up.
  return { record: { amount: Math.ceil(overheadAmount(value, stress) * (Number(maintenance) || 1)), stress: Math.max(0, Number(stress) || 0), paid: false, missed: false, tx: null },
    missed, addStress: missed.length };
}

/**
 * Catch-up (p.19): a missed month can be paid only with the current (newest) month paid already or in the same payment.
 * `months` = the vehicle's records; `chosen` = month numbers in this payment. Returns the missed months that are refused.
 */
export function catchUpProblems(months = {}, chosen = []) {
  const keys = Object.keys(months).map(Number);
  if (!keys.length) return [];
  const current = Math.max(...keys);
  const currentOk = months[current]?.paid || chosen.includes(current);
  return currentOk ? [] : chosen.filter(m => months[m]?.missed);
}

/**
 * Mechanic labour (p.19) for `hours` of work: Level 1 100¥/h, 8 h a day and 5 days a week, overtime at ×1.5; Level 2
 * 50¥/h, Level 3 25¥/h, no overtime. `perDay`/`daysPerWeek` = the schedule asked for.
 */
export function mechanicLabour(level, hours, { perDay = 8, daysPerWeek = 5 } = {}) {
  const h = Math.max(0, Number(hours) || 0);
  const rate = { 1: 100, 2: 50, 3: 25 }[level] ?? 100;
  if (level !== 1) return { rate, regular: h, overtime: 0, cost: Math.round(h * rate) };
  const pd = Math.max(1, Number(perDay) || 8), dw = Math.min(7, Math.max(1, Number(daysPerWeek) || 5));
  let left = h, regular = 0, overtime = 0;
  for (let day = 0; left > 1e-9; day++) {
    const wd = day % 7;
    if (wd >= dw) continue;   // a day off
    const today = Math.min(left, pd);
    const reg = wd < 5 ? Math.min(today, 8) : 0;   // past 8 h, or a 6th/7th day: overtime
    regular += reg; overtime += today - reg; left -= today;
  }
  return { rate, regular, overtime, cost: Math.round(regular * rate + overtime * rate * 1.5) };
}

/** The Stress update every writer uses: the new Stress, and this month's counter raised by any increase (p.18). */
export function stressPatch({ before = 0, after = 0, counter = 0 }) {
  return { "system.stress": after, "flags.sr2e.overhead.stress": Math.max(0, Number(counter) || 0) + Math.max(0, after - before) };
}

/* ── Optempo (R2 p.83–84; docs/PLAN-vehicles-phase2.md 6a.2) ─────────────────────────────────────────────────── */

/** Per-km optempo rate (p.83): (list price + modifications at Vehicle List / Customization values) ÷ 20,000, nearest tenth. */
export const optempoRate = (value) => Math.round((Math.max(0, Number(value) || 0) / 20000) * 10) / 10;

/**
 * Whether an adventure's mileage puts this vehicle on optempo (decided when the GM closes the adventure, immutable):
 * replace → yes; split → yes at half rate (and half the monthly overhead); frequent → only vehicles flagged "used every
 * adventure"; mileage → only above the threshold (200 km vehicles / 50 km drones suggested). Returns
 * { optempo, factor, replacesOverhead, halvesOverhead }.
 */
export function optempoEligibility(mode, { km = 0, drone = false, frequent = false, thresholds = { vehicle: 200, drone: 50 } } = {}) {
  const k = Math.max(0, Number(km) || 0);
  if (mode === "replace") return { optempo: true, factor: 1, replacesOverhead: true, halvesOverhead: false };
  if (mode === "split") return { optempo: true, factor: 0.5, replacesOverhead: false, halvesOverhead: true };
  if (mode === "frequent") return { optempo: !!frequent, factor: 1, replacesOverhead: !!frequent, halvesOverhead: false };
  if (mode === "mileage") { const over = k > (drone ? thresholds.drone : thresholds.vehicle); return { optempo: over, factor: 1, replacesOverhead: over, halvesOverhead: false }; }
  return { optempo: false, factor: 0, replacesOverhead: false, halvesOverhead: false };
}

/**
 * The refund owed for SUPERSEDED bills from ONE original payment receipt (6a.2, rounds 3–5), deterministic:
 *   receipt = { rows: [{vehicleUuid, month, amount}], amount (cash), karma, discount: {month: credit} }
 *   superseded = Set of "vehicleUuid|month"; ledger = what was already refunded from this receipt {cash, credit, karma}.
 * Lifestyle credit is allocated only within its own month (pro rata over that month's bills); each Karma point's ¥
 * coverage (KARMA_NUYEN) is spread over the remaining bills after credit, then cash takes the rest — cash allocations
 * summing exactly to the cash debit. A superseded bill refunds its cash share, then its credit share; a Karma point
 * comes back only when NONE of its coverage is still needed by a bill that stands. Capped by the ledger.
 */
export function overheadRefund(receipt = {}, superseded = new Set(), ledger = {}) {
  const rows = (receipt.rows ?? []).map((r, i) => ({ ...r, i, key: `${r.vehicleUuid}|${r.month}`, amount: Math.max(0, Number(r.amount) || 0) }));
  // Credit per month, pro rata over that month's rows (largest remainder so it sums exactly).
  const credit = new Array(rows.length).fill(0);
  for (const [m, c] of Object.entries(receipt.discount ?? {})) {
    const idx = rows.filter(r => String(r.month) === String(m)), tot = idx.reduce((t, r) => t + r.amount, 0);
    if (!tot) continue;
    split(Math.max(0, Number(c) || 0), idx.map(r => r.amount)).forEach((v, j) => { credit[idx[j].i] = v; });
  }
  const after = rows.map(r => Math.max(0, r.amount - credit[r.i]));
  const karmaYen = Math.min(Math.max(0, Number(receipt.karma) || 0) * KARMA_NUYEN, after.reduce((t, v) => t + v, 0));
  const kCover = split(karmaYen, after);
  const cashOwed = after.map((v, i) => v - kCover[i]);
  const cash = split(Math.max(0, Number(receipt.amount) || 0), cashOwed);
  const sup = rows.filter(r => superseded.has(r.key));
  const standingNeed = rows.filter(r => !superseded.has(r.key)).reduce((t, r) => t + kCover[r.i], 0);
  // Karma points are indivisible (Codex 6a r1 #15): the standing bills keep as many whole points as their coverage
  // needs, every other point spent comes back — a ¥200 bill paid with one point refunds that point when superseded.
  const points = karmaYen > 0 ? Math.max(0, Math.floor(Number(receipt.karma) || 0)) : 0;
  const freeKarma = Math.max(0, points - Math.ceil(standingNeed / KARMA_NUYEN - 1e-9));
  // Credit comes back to ITS month (r1 #16), ledgered per month.
  const creditByMonth = {};
  for (const r of sup) if (credit[r.i]) creditByMonth[r.month] = (creditByMonth[r.month] ?? 0) + credit[r.i];
  const dueCredit = {};
  for (const [m, c] of Object.entries(creditByMonth)) { const d = Math.max(0, c - (Number(ledger.creditByMonth?.[m]) || 0)); if (d) dueCredit[m] = d; }
  const want = { cash: sup.reduce((t, r) => t + cash[r.i], 0), credit: sup.reduce((t, r) => t + credit[r.i], 0), karma: freeKarma, creditByMonth };
  return { cash: Math.max(0, want.cash - (Number(ledger.cash) || 0)), credit: Object.values(dueCredit).reduce((t, v) => t + v, 0), creditByMonth: dueCredit,
    karma: Math.max(0, want.karma - (Number(ledger.karma) || 0)), totals: want };
}
/** Split an integer total over weights so the parts sum exactly (largest remainder). */
function split(total, weights) {
  const W = weights.reduce((t, w) => t + w, 0);
  if (!W || !total) return weights.map(() => 0);
  const raw = weights.map(w => (total * w) / W), base = raw.map(Math.floor);
  let rest = Math.round(total - base.reduce((t, v) => t + v, 0));
  raw.map((v, i) => [v - base[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { base[i]++; rest--; } });
  return base;
}
