# Plan: purchase flow for derived-cost gear

_Locked 2026-07-16. Hardened by Codex over 4 adversarial rounds (12 findings, 3 of
which would have shipped as live bugs)._

_**Implemented.** The pricing helpers, all five derivation sites, and the
charge/refund hook (§§1–5) shipped earlier; the purchase-prompt dialog (§6) —
`purchasePromptFields()` driving `_hasPurchaseOptions` / `_promptPurchaseOptions`
so skillsoft/program/focus prompt for their cost drivers — landed 2026-07-18.
Pure logic is unit-tested (`test/purchase.test.mjs`, incl. the 29,000¥ exploit
regression); the DialogV2 flow itself still wants an in-Foundry check. The
implementation-level Codex review is deferred (image/code quota exhausted)._

## Why

Most items have an authored cost, or a `ratingStats` table of per-rating costs.
**Four** paths instead COMPUTE cost from other fields at prepare time:

| Path | Derivation | Buyer picks | Catalog supplies |
|---|---|---|---|
| `gear` + `category: "skillsoft"` | `skillsoftCost(grantedSkillCategory, rating, authored)` | category, rating | authored DataSoft price |
| `program` | `programCost(rating, multiplier)` / `programCostVR2` per the `matrixRuleset` **world setting** | rating | `multiplier` |
| `focus` (flat) | `focusCost(force, costPerForce)` when `costPerForce > 0` | force | `costPerForce` |
| `focus` (weapon, bonded) | `weaponFocusCost(bondedWeapon.reach, force)` — computed on the **ACTOR** (`_applyWeaponFoci`), overriding the item-level path | force, bondedWeaponId | the weapon's Reach |

### Problem 1 — no prompt (the user-visible ask)

`_hasPurchaseOptions()` gates the dialog on `rows.length > 1 || cyberware || bioware`.
None of these types has `ratingStats`, so **no dialog opens**. A dropped ActiveSoft
is silently created at `rating: 1` and charged 1,000¥.

### Problem 2 — the hook cannot reprice them (an exploit)

`itemBaseCost` falls back to the flat `sys.cost`, which for these types is **the
value already derived for the CURRENT rating** — a snapshot, not a formula. So
`preUpdateItem` builds `newSys = {...oldSys, rating: 6}` with the OLD cost and
computes `delta: 0`.

**Verified: ActiveSoft rating 1 → 6 charges nothing. True cost 1,000¥ → 30,000¥.
29,000¥ free.** Same family as the chargen hole: a pricing site not routed through
the real cost function. The dialog only sets the initial value — the hook governs
every later change, so this is the load-bearing half.

## Design

### 1. One pure helper, called by EVERY derivation site (anti-drift)

```js
/** ctx: { authoredCost?, vr2?, bondedWeaponReach? } */
export function derivedItemCost(sys, ctx = {}) { … }        // null if not derived
export function itemBaseCost(sys, ctx = {}) {
  const base = derivedItemCost(sys, ctx) ?? ratedCost(sys?.ratingStats, sys?.rating, sys?.cost);
  return base * gradeCostMultiplier(sys?.type, sys?.grade);
}
```

The rules module is Foundry-free: it can read neither `game.settings` (VR2) nor
`_source`. Both arrive via `ctx`, supplied at each call site.

**All five sites must route through it**, or the drift returns:
`GearData` / `ProgramData` / `FocusData` `prepareDerivedData`,
`CharacterData._applyWeaponFoci` (passes `bondedWeaponReach`), and
`_bondWeaponFocusOnDrop` (actor-sheet.mjs:514 — currently calls `weaponFocusCost`
directly and stamps `itemData.system.cost`).

### 2. One row-selection policy, so cost and Street Index can't disagree

```js
export function ratedRow(ratingStats, rating) { … }          // exact, else nearest
export function ratedCost(ratingStats, rating, flatCost) {
  const row = ratedRow(ratingStats, rating);
  return row ? (row.cost ?? 0) : (flatCost ?? 0);            // PRESERVE: a row without cost is 0
}
export function ratedStreetIndex(ratingStats, rating, flatSI) { … }   // NOT `||` — numeric 0 is present
```

`prepareDerivedData` copies the active row's `streetIndex` over the flat field, so
the PREPARED SI belongs to the OLD rating. Price each side at **its own** SI,
using `_source.system.streetIndex` as the flat fallback.

### 3. The gate: configuration drivers vs catalog metadata

The single sharpest point of the review. Gate on **what variant the character
bought**, never on **what the catalog says it costs** — otherwise a GM fixing a
price retroactively transacts against every actor who owns one.

```js
// Changing one of these IS a purchase decision → charge/refund.
const PURCHASE_DRIVERS = ["rating", "grade", "force",
                          "grantedSkillCategory", "bondedWeaponId",
                          "category", "focusType"];
// NEVER gated (still READ for pricing): ratingStats, cost, streetIndex,
// multiplier, costPerForce — catalog coefficients, not variants.
```

### 4. Two contexts for rebonding

Resolving both sides from the *changed* `bondedWeaponId` yields a zero delta —
i.e. reintroduces the very bug this fixes.

```js
const reachOf = (id) => actor.items.get(id)?.system.reach ?? null;
const oldBase = itemBaseCost(oldSys, { ...base, bondedWeaponReach: reachOf(oldSys.bondedWeaponId) });
const newBase = itemBaseCost(newSys, { ...base, bondedWeaponReach: reachOf(newSys.bondedWeaponId) });
```

`authoredCost` is `item._source.system.cost` **from the hook** (`this._source.cost`
inside the model). Never use prepared `system.cost` as authored input.

### 5. Rollback must restore every gated field

The current `revert` snapshots only `{rating, grade}`. Widening the gate without
widening this leaves an item **changed but unpaid** on a failed charge. Snapshot
every gated field from the pre-change source, dotted, applied with
`{ sr2eNoCharge: true }` (the existing bypass, sr2e.mjs:641). Ignore semantically
unchanged values before computing delta or recording rollback.

### 6. Dialog

Per-type spec of cost-driving fields; `_hasPurchaseOptions` true if a spec exists.
Skillsoft: `grantedSkill` (text), `grantedSkillCategory` (select incl. `data`),
`rating` 1–10 (SKILL_MEMORY has exactly ten rows — chip availability isn't bounded
by a character's skill cap). Program: `rating`. Focus: `force`. The result must
**apply all spec fields**, not just rating/grade. Affordability revalidated at
submit; live price readout optional but cheap here.

## Tests

- `ratedCost`: row present without `cost` → **0** (not flatCost); no rows → flatCost; neither → 0.
- `ratedStreetIndex`: numeric `0` is PRESENT; `""` falls back; missing row falls back.
- Skillsoft rating 1→6 charges **29,000¥** — the exploit, as a regression test.
- Rebond: old/new contexts resolve DIFFERENT Reach → non-zero delta.
- **ActiveSoft ↔ DataSoft category transition with a nonzero authored DataSoft
  price** — cannot be reconstructed from prepared cost alone.
- A GM editing `ratingStats` / `cost` / `streetIndex` / `multiplier` /
  `costPerForce` charges **nothing**.
- Unchanged driver update → no charge, no rollback record.

## Not in scope

Item-sheet redesign (see `.impeccable/critique/`), second-hand/shop grades.

## Codex round log

- **R1 REVISE** — missed weapon foci entirely (4th path, needs actor context); a DataModel method can't price hypotheticals; don't absorb VR2 into `multiplier`; skillsoft 1–10; rollback must widen.
- **R2 REVISE** — `item._source.cost` wrong path; **rebond needs two contexts** (would have re-created the zero-delta bug); gate omitted 3 drivers; `_bondWeaponFocusOnDrop` is a 5th site; SI must be per-configuration.
- **R3 REVISE** — my "`ratedCost` refactor is identical" claim was **wrong** (`row?.cost ?? 0` ≠ `?? flatCost`); "gate = helper inputs" is the wrong frame → configuration vs authorship.
- **R4 REVISE (final)** — `multiplier` AND `costPerForce` are both catalog coefficients; remove both from the gate. Gated list then complete.
