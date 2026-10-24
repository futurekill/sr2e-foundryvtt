# Plan: one money queue per actor, then eye accessories dropped onto a cybereye
_Round 5 — final, after Codex R5, 2026-10-23._ _Round 0 — Claude, 2026-10-23. Supersedes docs/PLAN-eye-accessory-drop-v1.md (5 Codex
rounds, not converged: the remaining objections were system-wide money races). The user
chose "the most complete and correct thing": fix the money layer first, then build the
feature on it, with refunds and moves included._

## Goal
**A.** Every operation that moves a character's nuyen (or the `paid` provenance that
decides refunds) runs its re-read → check → write → compensate section in ONE per-actor
queue on the client doing it, checks every write's result, and never loses or
duplicates money when two operations overlap on that client.

**B.** Dropping an eye accessory (a compendium/sidebar item, or one the character already
owns) onto a cybereye's row on the Gear tab fits it as a row of that eye (RAW:
Cybertechnology p.45 — .5 Essence of accessories free in a pair, .25 in a single eye,
grade adjustments before the allowance; "accessories can be added or removed without
impacting the Essence"; 1.2 cap and one weapon per eye are GM limits → reports), charged
like any purchase, refundable like any purchase.

---

## Part A — the money layer

### A1. `module/money.mjs` (new, small)
- `moneyQueue(actor, fn)` = `enqueueAttack(\`purchase:${actor.uuid}\`, fn)` — the key
  surgery and cybermancy ALREADY use, so they join automatically. Client-local.
- Checked writes (R1 #7), every money-path write goes through one of:
  - `updated(promise)` — true only for a truthy resolved document;
  - `created(actor, promise, n)` — the returned array has exactly `n` documents AND
    each id is now in `actor.items`;
  - `deleted(actor, promise, ids)` — afterwards none of `ids` is in `actor.items`
    (an empty or short result array is a failure).
  - `settingSet(ns, key, value)` — `game.settings.set(ns, key, value, { document: true })`
    and success = a returned Setting document (a legitimate `0` pot is not a failure,
    R4 #1).
  A throw is a failure in all of them (logged).
- `adjustNuyen(actor, delta, extra = {})` — INSIDE the queue only: re-reads
  `actor.system.nuyen`, refuses (returns false) if the result would be < 0, writes
  `{ "system.nuyen": live + delta, ...extra }` in ONE update via `writeOk`. Relative to
  the live balance, never to a value read before the queue.
- Re-entrancy rule: code running inside `moneyQueue` NEVER awaits another
  `moneyQueue` call for the same actor (it would deadlock). Hooks fired by writes inside
  the queue enqueue (not awaited) and run after. A dev guard: `moneyQueue` keeps a
  client-local `ACTIVE` map of actor uuid → entry label; a call made while an entry is
  running only queues (fine), and a watchdog warns in the console if any entry runs
  > 30 s ("money queue for X stuck in <label>"), so a deadlock is loud.
- Dialogs, rolls and confirmations happen OUTSIDE the queue; inside, each operation
  re-validates its documents (still exist, still the same price/state) and refuses with
  a notice if anything changed.

- `game.sr2e.adjustNuyen(actor, delta)` — the public entry (queue + `adjustNuyen`) for
  macros (R1 #1).

### A2. Every writer, moved into the queue
| Writer | Today | Change |
|---|---|---|
| Ordinary drop (`_dropItemWorkflow`) | create item → flags → debit, no queue | The whole create → flags → re-check → debit → compensate block is ONE queue entry (R5 #4: an unpaid item can't be sold mid-purchase, because selling waits in the same queue). |
| Surgery purchase (`_surgeryPurchase`) | queued; unchecked writes | `writeOk` on debit, create, refund; refund failure → permanent error. |
| Sell (`onSellItem`) | unqueued after the dialog | After the confirm: queue entry re-reads the item, re-quotes, deletes, credits via `adjustNuyen`, restores on failure (existing logic, now inside). |
| Delete (`onDeleteItem`) | unqueued | For character-owned items: the delete runs in a queue entry, re-fetching the item. (No money moves, but a delete must not land between another entry's write and debit.) |
| Repricing (`preUpdateItem` + `updateItem`, sr2e.mjs) | settlement unqueued; `newPaid` precomputed | **The driver change itself moves into the queue (R1 #5, #6).** preUpdate: a driver change on a paid item of a character, NOT carrying `options.sr2eQueued`, is vetoed (`return false`) and the WHOLE `changes` object is handed to `repriceQueued(item, changes)`, which in one queue entry: re-reads the item (still there) and nuyen; ONLY when `linkedLimbId` actually changes against the live item, recomputes the cyberlimb placement facts (`limbSurcharge`, `limbAdjacent`) from the LIVE siblings with the existing placement helper and prices THOSE; otherwise the recorded facts are kept, as the placement hook does today (R2 #4, R3 #4); computes old/new price from the LIVE item (same pricing code, moved into a pure helper); refuses when unaffordable; `item.update(changes + recomputed facts, { sr2eQueued: true, sr2eKeepPlacementFacts: true })` (checked — the placement hook doesn't recompute again); `adjustNuyen(-delta)`; `paid = live paid + delta` (clamped ≥ 0) via a checked flag update; on any failure reverts the drivers (checked) and refunds as today. The `updateItem` settlement hook and `options.sr2ePurchase` are deleted; no pending set exists, so nothing can stick. Sales/moves of that item queue behind it. The sheet re-renders when the queued update lands. |
| `consolidateAmmo` | unqueued; untracked piles merge to `paid: 0`; rollback writes absent flags as 0 | Whole merge in one queue entry. **Resale entitlement preserved (R4 #2):** an all-untracked group's survivor gets `paid` = Σ each pile's current sale quote (street price of its bundle), `acquiredQuantity` = Σ quantities, `acquiredListValue` = Σ list values — exactly what selling the piles one by one would pay, now proportional. Tracked groups sum as today. **Merge only when value is preserved (R5 #1, #2):** a group merges only if the merged pile's sale quote (`proportionalRefund` of the summed basis, rounded as selling rounds) equals the SUM of the piles' separate quotes; otherwise that group is left as is and the report says why ("different prices per round" / "empty boxes would lose their resale value"). **Rollback restores presence (R4 #3):** the snapshot records whether each flag existed; absent flags are restored by `unsetFlag`, present ones by value. |
| Starting money (`offerStartingMoney`) | absolute set, unqueued | Dialog quotes (unspent, current nuyen); roll; then in the queue: re-read chargen finished, a `flags.sr2e.startingMoneyGranted` marker unset, unspent resources and nuyen unchanged from the quote — else refuse with "something changed, finish creation again to re-quote" (R1 #4). Set total + marker in ONE checked update. |
| Cybermancy charge/refund | charge queued, validation and items outside | `applyOperation`: the snapshot check, affordability, the charge (with its receipt, one checked update) AND the deterministic-id item creation run in ONE queue entry; a failed charge stops the application. `cancelOperation`: refund and item removal in one entry (items deleted first, checked, then the refund). Sell, delete, the eye-accessory move/purchase AND any repricing driver change REFUSE items carrying `flags.sr2e.cymOp` whose operation isn't `done`/`cancelled` (R1 #2, #3; R2 #1). Resume recreates an item only if its operation is still unfinished AND no `sold` marker exists for its slot (selling sets none now that selling is refused). |
| Conjuring materials (actor.mjs) | unqueued | `adjustNuyen(-materials)` in the queue before the test; refused → no conjuring. |
| Ritual materials (`pay`) | inside the ritual queue | The leader's nuyen write + `ritualPaid` marker go through `moneyQueue(leader)` from within the ritual's `mutate` (different key — no deadlock; the ritual queue never runs inside a money entry). |
| The sheet's nuyen field | absolute `update` on change | Turned into a DELTA against the input's own previous value: `delta = typed − input.dataset.prev`, then `dataset.prev = typed` immediately, so rapid edits chain (1000→1100→1200 = +100, +100; R1 #8); applied with `adjustNuyen` in the queue. On a refused/failed adjust the sheet re-renders (prev resets to the live value). |
| Award-nuyen macro (`macros/award-nuyen.js`) | unqueued read+write; pot read before the dialog | The payout runs in a client-local `payout` queue entry (R2 #3): re-read the communal pot and refuse if it differs from the quote; **pot first, then credits (R3 #1, #2):** write the pot to `res.newPot` (checked; failure → nothing paid, stop), then credit each recipient through `game.sr2e.adjustNuyen` (each actor's own money queue, awaited from the payout entry — a different key, no deadlock); the shares that failed go BACK into the pot in one more checked write (`pot += failed`); if that write fails, a permanent error names the amount to add by hand. The chat report lists who was paid and who failed. A second payout waits in the queue and re-validates the pot it quoted. |
| Ammo reload (`reloadWeapon`) and drug doses (`useDose`) | quantity writes unqueued | The live stock check and the quantity / consumption commit move into the actor's money queue (dialogs and rolls stay outside), because refundable value follows quantity (proportional refunds) and `consolidateAmmo` / sale read it (R2 #2). |
| Quantity edits on item sheets (ammo, drugs/gear with acquisition basis) and the actor sheet's inline quantity fields | direct submit | For an EMBEDDED item with refundable stock: a `system.quantity` change is taken only when it differs from the value the sheet rendered, and is applied in a queue entry that checks the live quantity still equals that rendered value (else re-render, nothing written); unchanged fields are stripped from whole-form submits so a stale quantity is never resent (R3 #3). |
| Host eye's module rows (item sheet) | form submit / add / remove rows write the whole array | For an eye EMBEDDED on an actor: every modules change (form field edit, add row, remove row) is diffed against the rendered rows BY ROW ID and applied to the LIVE rows inside a queue entry (R1 #9). Unembedded items keep today's behaviour. |

Cross-CLIENT overlap stays out of scope (one driver per actor, the system-wide contract
in `jackpoints.mjs`); the GM editing a player's nuyen while the player buys is a human
race outside this.

### A3. Tests (Part A)
Plus (R5): two tracked piles bought at different per-round prices (not merged, reported);
two empty untracked piles (not merged).
Plus (R4): a payout that empties the pot (settings write returns 0 → success);
consolidating two untracked boxes (merged pile sells for the sum of their street
prices); a failed consolidation leaves untracked piles untracked (flags absent).
Plus (R3): mixed new-money/pot payout (pot = newPot + failed shares); a failed pot
write pays no one; an item-form quantity edit during a consolidation (refused,
re-rendered); a rating-only change on a limb option keeps its placement facts; manual
Essence with `manualSigned: null`.
Plus (R2): reload vs consolidation and vs sale; a dose consumed while a sale is queued;
downgrading an unfinished-operation implant refused; two payouts of the same pot (the
second refused); a failed credit in a payout leaves its share in the pot; two limb
options attached quickly (each charged at its committed placement); manual-Essence
accessory overflow refused; a free-allowance accessory on a negative-Essence character
allowed; legacy id-less rows normalised before the first edit.
Plus (R1): award macro during a purchase; cybermancy apply after an intervening
purchase (re-validated, refused); selling an unfinished operation's implant refused;
starting money after an intervening purchase (refused, re-quote); a vetoed or failed
queued reprice leaves nothing pending (a second change goes through); a sale queued
behind a downgrade refunds the settled `paid`; a delete batch returning `[]` counts as
failure; rapid nuyen field edits chain correctly.

Quench `sr2e.money-queue` with a delayed-write stub (wrap `actor.update` to await a
gate): ordinary purchase overlapping a sale; two purchases overlapping; a sale confirmed
while a purchase settles (waits, re-validates); two rapid Rating upgrades on one item
(the second vetoed while the first settles; `paid` = sum, R5 #2); a falsy debit
(compensated); a falsy refund (permanent error); the nuyen field edited while a purchase
settles (both apply); conjuring materials refused when unaffordable inside the queue.
Vitest: `adjustNuyen` math via a pure helper.

---

## Part B — eye accessories

### B1. Identity
- Host: `wareRule === "cybereye-pair"` (core + Cybertechnology cybereyes, or
  `flags.sr2e.rule`). Cyberears: out of scope.
- Accessory: new `EYE_ACCESSORIES` table in `rules/ware-rules.mjs` (compendium source
  uuid → `kind`: core "Eyes" folder items, every Cybertechnology eye accessory), or
  `flags.sr2e.rule = "eye-accessory:<kind>"` for custom items. Not in the table → the
  drop is an ordinary drop (a separate item), unchanged.
- `kind` gains an explicit `"accessory"` choice (`blank: true` already set); blank stays
  "unclassified" for `eyeReports`.

### B2. Row schema additions (`modules[]`, no migration — defaults)
`id` (StringField ""; every creation path — add-row button, drop, move — assigns `foundry.utils.randomID()`, and legacy rows are normalised BEFORE they can be edited: when an embedded eye's item sheet (or the Gear tab's drop target) finds rows without ids, it renders the rows read-only and runs one queue entry that assigns ids to every id-less row, keyed by the full row snapshot it rendered (if the live rows differ, it re-renders and retries); only then are the rows editable (R1 #10, R2 #5)), `paid` (Number ≥ 0, 0: what the character handed over for this
row, refundable), `listValue` (Number ≥ 0, 0: list price, counted in chargen),
`grade` is NOT stored: a row is always the host's grade.

### B3. Grade and price
- Grades apply to all cyberware (SSC p.98), and p.45 grades the accessories' Essence
  with the eye, so an accessory is bought AT THE HOST'S GRADE: row list price =
  accessory list price at its Rating × the host grade's cost multiplier (same helper
  `itemBaseCost` uses, called on the candidate with `grade: host.system.grade`).
  The single-eye 60% is the eye's own price, never the accessories'.
- Street price: × the ACCESSORY's own Street Index (in play); list price in creation.
- A host with purchased rows (`paid > 0` on any row) VETOES a grade change (preUpdate):
  "remove its accessories first" — a regraded eye is a different eye.

### B4. The drop (`module/eye-accessories.mjs`)
Two sources:
1. **Purchase** — from a compendium/sidebar (not on this actor). Buy dialog for the
   accessory's Rating only (no grade picker, no surgery section: p.45).
2. **Move** — an accessory item the character already owns, dropped from its own row
   onto the eye. Handled BEFORE the existing `item.parent === actor → return false`
   exit. Refused if the item's grade ≠ the host's grade ("an accessory must match its
   eye's grade"), if it's damaged (`conditions.length`), or has Active Effects. Its row
   carries `paid` = the item's SALE QUOTE (its `paid` flag, or street price when
   untracked — exactly what selling it would have paid, R1 #7) and `listValue` = its
   list price; `active` = its installed state. No money moves.

Then, both: placement (weapon / tool laser into a pair asks left/right, on every path),
and ONE money-queue entry:
a. re-read the host (still embedded, still a cybereye, same grade) and, for a move, the
   source item (still there, same quote);
b. Essence: build the WHOLE proposed actor (`actor.toObject()` with the host's rows
   replaced and, for a move, the source item removed; prepared via a temporary
   `new Actor.implementation(data)`), and take the change in Essence LOSS between it and
   the live actor from the SIGNED values (R2 #6): automatic Essence → the signed derived
   Essence (not the clamped `essence.value`); manual Essence → the proposed inventory's
   net Essence-cost delta applied to `essence.manualSigned ?? essence.value`, the same
   fallback the derivation uses (R3 #5). This covers
   installation, grade, surgery modifiers and the freed Essence of a moved standalone
   accessory (R1 #11). Refuse ONLY when the transaction increases Essence loss AND the
   result is below 0 (R2 #7): a free-allowance accessory, a spare eye, or a change that
   frees Essence is allowed even on an already-negative cybermantic character. Notice
   "+X Essence" when the loss grows;
c. purchase: `nuyen ≥ price` (live), write the row (`host.update`), then
   `adjustNuyen(-price)`; failure → remove the row by `id` (re-read rows), and if that
   fails a permanent error. Move: write the row, then delete the source item; delete
   failure → remove the row by `id`;
d. Alt-drop / NPC / auto-charge off: row with `paid` 0, `listValue` 0 (purchase) — no
   money.
While the entry runs, the host uuid is in `IN_FLIGHT`: the host's item-sheet form
submit and add/remove-row buttons refuse and re-render (R5 #2 of v1).

### B5. Money afterwards
- **Removing a row** (item-sheet ×): in a queue entry, re-read the row by `id`, remove
  it, then `adjustNuyen(+row.paid)`; credit failure → put the row back by `id`.
  Hand-typed / legacy rows have `paid` 0: nothing to refund.
- **Selling the eye**: quote = eye's own quote + Σ rows' `paid`; same queue entry as A2.
- **Deleting the eye**: no refund (as any delete today).
- **Copies**: whenever an eye ITEM is created on an actor by a drop (bought or Alt), its
  rows' `paid` and `listValue` are zeroed first — they weren't bought by this
  character; the eye's own price covers only the eye (known: a configured eye copied
  from another actor brings its rows free; `shortcut:` comment; the shipped compendium
  eyes have no rows since 0.116.2).
- **Chargen**: `chargenBudgetOf`'s projection passes `moduleListValue = Σ rows'
  listValue`; `chargenItemCost` adds it after the host's own pricing. Tested through
  `chargenBudgetOf`. Removing a row in creation un-buys it (creation is a draft, as for
  any item).

### B6. Discoverability, docs
Cybereye row tooltip "Drop an eye accessory here"; wiki Cyberware page; CHANGELOG;
QA-PLAN.

### B7. Tests (Part B)
Vitest: row price (host grade multiplier, accessory SI, chargen list, single eye
unaffected), `EYE_ACCESSORIES`, `chargenBudgetOf` with rows. Quench
`sr2e.eye-accessory-drop` on the SHIPPED core eye: buy into a pair (Essence unchanged
within .5; nuyen once = street price; row paid/listValue), beta eye (graded Essence
fits; price ×beta), overflow notice, below-0 refused, spare eye, Alt-drop, NPC,
weapon placement, move an owned tracked item (no money; row paid = its paid; item gone),
move an untracked item (row paid = street price), grade mismatch refused, row removal
refunds, sell eye refunds eye + rows, grade change vetoed with purchased rows,
copied eye zeroed, falsy debit removes the row, failed source delete removes the row,
form submit refused while settling, non-table item → separate item.

## Key decisions & tradeoffs
- One CLIENT-local queue (the existing `purchase:` key), not a world lock; cross-client
  overlap stays the one-driver contract.
- The sheet's nuyen field becomes a delta — a deliberate behaviour change (typing 5000
  when it showed 4000 adds 1000 to whatever the live balance is).
- Rows, not linked items; accessory = host grade; per-row refundable `paid`.
- Grade change of an eye with purchased rows is vetoed rather than repriced.

## Risks / open questions
- Deadlock if any future code awaits `moneyQueue` inside `moneyQueue` (watchdog makes
  it loud; code review rule in money.mjs header).
- The delete queue entry: deleting several items quickly serialises them (fine).
- Foundry v13 DragDrop source for "move": the drag data's uuid is this actor's item.

## Out of scope
- Cross-client locking; cyberears; second-hand parts; shop grades.
