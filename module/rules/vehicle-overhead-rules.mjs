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
export function assessMonth(months = {}, m, { value, stress }) {
  const missed = Object.entries(months).filter(([k, r]) => Number(k) < m && !r?.paid && !r?.missed).map(([k]) => Number(k));
  return { record: { amount: overheadAmount(value, stress), stress: Math.max(0, Number(stress) || 0), paid: false, missed: false, tx: null },
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
