# Plan: ammo stacking, consolidation, and the value basis

_Locked 2026-07-16. Hardened by Codex over 2 adversarial rounds. Companion to
`PLAN-derived-cost-purchases.md` — both touch the drop/purchase path and should be
implemented together. Not yet implemented._

## What was asked

1. "when we add ammo of the same type it should just add to the existing pile"
2. "it'd be nice if there were a button to consolidate ammo. Perhaps a macro?"

## What investigating it found

Four problems, all from one root: **`cost` means "price of this whole bundle" for
ammo, while `quantity` is treated as a multiplier everywhere else.**

| # | Problem | Status |
|---|---|---|
| 1 | No merge logic — every drop creates a new item | the ask |
| 2 | No consolidate action | the ask |
| 3 | **Free ammo**: buy a 15¥ box → reload (quantity 10→0, `cost`/`paid` untouched, item never deleted) → sell the empty box → refunds `paid` in full. Repeatable. | found |
| 4 | **Chargen charges 10× for ammo**: `itemBaseCost(i) * quantity` = 15 × 10 = 150¥ for one 15¥ box. Pre-existing; the `* quantity` is right for gear, wrong for ammo. | found |

Shipped data confirming the semantic: Regular Ammo qty 10 / cost 15 · APDS qty 10 /
cost 120 · MG Belt qty 50 / cost 100 · Mini-Grenade qty 6 / cost 50.

## Design

### The rejected design (and why it matters)

My first plan scaled `cost`/`paid` down as rounds were consumed. **Codex killed it:**
reload can **eject** rounds back to the reserve (`item.mjs:238` —
`oldReserve.update({ quantity: quantity + current })`), and the weapon stores no
value allocation. Quantity would return; value would not. **Every load/swap cycle
would silently destroy player nuyen.** Verified against the code.

### The design: don't touch reload. Fix the basis.

- **`system.cost` is never modified.** It stays the catalog bundle price — authorship
  data under the sibling plan's configuration-vs-catalog rule.
- **Acquisition basis in flags, set at purchase:**
  - `flags.sr2e.paid` (exists)
  - `flags.sr2e.acquiredQuantity` — quantity at purchase
  - `flags.sr2e.acquiredListValue` — `itemBaseCost` at purchase (what chargen counts)
- **Sell refunds proportionally, capped:**
  ```js
  refund = acquiredQuantity > 0
    ? Math.min(paid, Math.floor(paid * currentQuantity / acquiredQuantity))
    : 0;
  ```
  Empty box → 0 (problem 3 dead). Ejection → quantity returns → value returns, with
  no special case. No drift: always computed from the original basis, never from a
  rounded remainder. The `min` cap stops GM quantity inflation refunding more than
  was paid. `acquiredQuantity === 0` must not divide by zero.
- **Chargen** uses `acquiredListValue` for ammo instead of `cost * quantity`
  (problem 4). This records the fact chargen actually cares about, works across
  differently-sized bundles, and needs no purchase-count reconstruction.
  **The actor-sheet projection currently passes no flags into `chargenSpend` — it
  must.** Legacy ammo falls back to `itemBaseCost` once.
- **Merge sums** `quantity`, `acquiredQuantity`, `acquiredListValue`, `paid`.

### Merge identity

Shape equality is **always** required; a matching compendium source never overrides
it. The drop path is `fromUuid(...).toObject()` + direct create, so there is **no
code-level guarantee `compendiumSource` is populated** (packs-src has it null).

```js
sameSource = a.src && b.src && a.src === b.src
sameShape  = name && ammoType && damageModifier && armorModifier &&
             damageType && armorCalc && streetIndex && cost
merge if (sameSource && sameShape) || (!(a.src && b.src) && sameShape)
```
Two *conflicting* sources block the merge. Same actor only.

### Consolidation

Prefer a **loaded** pile as the survivor. Re-point **both** weapon references —
`system.ammo.loadedSourceId` **and** `system.ammo.sourceId` — wherever they name a
duplicate. Re-pointing only the first leaves weapons aiming at a deleted item.

**Atomicity is not ordering.** Updating the survivor before deleting duplicates
*duplicates* rounds and value if the delete fails, and retrying compounds it. Take
explicit rollback snapshots of the survivor and every weapon reference; surface
rollback failure loudly (matching the purchase hook's "every failure is surfaced"
rule). All writes use `{ sr2eNoCharge: true }`.

Expose on the sheet **and** on `game.sr2e` for macro use (the `cleanupQuench`
precedent).

### Legacy

Ammo bought before this has `paid` but no basis. Stamp `acquiredQuantity` /
`acquiredListValue` in a **controlled migration**, or on the first
consolidation/sell — **not** on "arbitrary first read". A prior GM quantity edit is
indistinguishable from legitimate state; document that.

## Tests

- Buy → reload to empty → sell refunds **0**, not `paid` (problem 3 regression).
- Chargen: one 15¥/10-round box counts **15¥**, not 150¥ (problem 4 regression).
- Reload → eject → sell: value returns intact (the design Codex's objection saved).
- Merge sums all four basis fields; two conflicting sources do NOT merge; one
  missing source with matching shape DOES.
- Consolidation re-points **both** `sourceId` and `loadedSourceId`.
- Refund cap: GM inflates quantity → refund never exceeds `paid`.
- `acquiredQuantity === 0` → no divide-by-zero.
- Merge triggers no purchase transaction (quantity/cost/flags aren't gated).

## Codex round log

- **R1 REVISE** — the proportional-reduction design would destroy value on eject. Counter-design (fix selling via an acquisition basis, never touch reload) adopted wholesale. Also: don't trust `compendiumSource`; re-point rather than block; chargen already wrong.
- **R2 REVISE** — atomicity is not ordering (survivor-then-delete *duplicates* value on failure); re-point **both** weapon refs; replace `bundleQuantity`+`ceil()` with `acquiredListValue`; cap the refund at `paid`. Confirmed `acquiredQuantity` is the right shape and the identity predicate is correct.
