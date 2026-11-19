// Selling (sr2e-chargen RULINGS R6, docs/PLAN-M4b.md): refund parity with the old saleQuote, and the fence (p.188).
import { describe, it, expect } from "vitest";
import { refundQuote, saleQuoteOf, fenceValue, FENCE_STEPS, itemListValue, proportionalRefund, streetPrice } from "../module/rules/sr2e-rules.mjs";
import { rowsPaid } from "../module/rules/ware-rules.mjs";

/** The money.mjs saleQuote before it became refundQuote's caller — the reference for parity. */
function oldSaleQuote(it) {
  const paid = it.flags?.sr2e?.paid;
  const acquiredQuantity = it.flags?.sr2e?.acquiredQuantity;
  const isDrug = it.type === "gear" && !!it.flags?.sr2e?.drug;
  if ((it.type === "ammo" || isDrug) && acquiredQuantity != null) return {
    price: proportionalRefund({ paid: paid ?? 0, acquiredQuantity, currentQuantity: it.system.quantity ?? 0 }),
    note: ` (${it.system.quantity ?? 0}/${acquiredQuantity} ${isDrug ? "doses" : "rounds"} left — proportional refund)` };
  const rows = rowsPaid(it.system?.modules ?? []);
  if (it.type === "cyberware" && it.system?.secondhandFailed) return { price: rows,
    note: ` (failed second-hand ware: worthless, SSC p.100${rows ? `; ${rows}¥ for its accessories` : ""})` };
  return { price: (paid ?? streetPrice(Number(it.system.cost) || 0, it.system.streetIndex)) + rows,
    note: (paid != null ? " (refund of the price paid" : " (street price") + (rows ? `, plus ${rows}¥ for its accessories)` : ")") };
}
const row = (paid) => ({ id: "r", name: "Low-Light", essenceCost: 0.2, cost: 3000, listValue: 3000, paid, active: true });
const CASES = {
  untracked: { type: "weapon", system: { cost: 450, streetIndex: 0.5 }, flags: {} },
  paid: { type: "weapon", system: { cost: 450, streetIndex: 1 }, flags: { sr2e: { paid: 500 } } },
  ammoHalf: { type: "ammo", system: { cost: 20, quantity: 5 }, flags: { sr2e: { paid: 60, acquiredQuantity: 10, acquiredListValue: 60 } } },
  ammoEmpty: { type: "ammo", system: { cost: 20, quantity: 0 }, flags: { sr2e: { paid: 60, acquiredQuantity: 10 } } },
  drug: { type: "gear", system: { cost: 50, quantity: 2 }, flags: { sr2e: { paid: 150, acquiredQuantity: 3, drug: { key: "x" } } } },
  failed: { type: "cyberware", system: { cost: 5000, secondhandFailed: true, modules: [row(2500)] }, flags: { sr2e: { paid: 2500 } } },
  eyes: { type: "cyberware", system: { cost: 5000, capacity: 0.5, modules: [row(3000)] }, flags: { sr2e: { paid: 5000 } } }
};

describe("refund mode: the old saleQuote, unchanged", () => {
  for (const [name, item] of Object.entries(CASES)) it(name, () => expect(refundQuote(item)).toEqual(oldSaleQuote(item)));
});

describe("fence mode (p.188): 30% base, 10–50% in steps of 5", () => {
  it("prices the list value and allows only the nine steps", () => {
    expect(FENCE_STEPS).toEqual([10, 15, 20, 25, 30, 35, 40, 45, 50]);
    expect([fenceValue(1000, 30), fenceValue(1000, 10), fenceValue(1000, 50), fenceValue(999, 30)]).toEqual([300, 100, 500, 299]);
    for (const bad of [5, 12, 55, 30.5, "30"]) expect(fenceValue(1000, bad)).toBeNull();
  });
  it("a sale: a weapon at 30% of list; ammo by its bundle value and what's left; a failed part worthless", () => {
    expect(saleQuoteOf({ type: "weapon", system: { cost: 450, quantity: 1 }, flags: {} }, { mode: "fence", pct: 30 }).price).toBe(135);
    expect(itemListValue(CASES.ammoHalf)).toBe(30);   // 60¥ of bundles, half left
    expect(saleQuoteOf(CASES.ammoHalf, { mode: "fence", pct: 50 }).price).toBe(15);
    expect(saleQuoteOf(CASES.failed, { mode: "fence", pct: 50 }).price).toBe(0);
    expect(saleQuoteOf(CASES.paid, { mode: "fence", pct: 12 }).price).toBeNull();
    expect(saleQuoteOf(CASES.paid, { mode: "refund", pct: 12 })).toEqual(refundQuote(CASES.paid));
  });
});
