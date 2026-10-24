# Plan: drag an eye accessory onto a cybereye's row
_Round 5 — revised after Codex review (2026-10-23)_

## Goal
Today a cybereye's accessories are rows typed by hand into the eye item's `system.modules`
table (item sheet). The compendiums also ship each accessory as its own cyberware item
(core `sr2e.cyberware` "Eyes" folder: Low-Light Vision, Thermographic Vision, Flare
Compensation, Eye Camera, Eye Cosmetic Modification; Cybertechnology `ct-headware`: eye
gun, dart, lasers, tool laser, light system, vision magnification, opticam package…).
Dropping one of those on a character makes a separate implant that costs its own Essence
and skips the eye's free allowance — wrong by RAW (Cybertechnology p.45: a pair takes
.5 Essence of accessories free, "accessories can be added or removed without impacting
the Essence of the character"; the 1.2 cap and one weapon per eye are reports).

Make it work the way players expect: **drop an accessory item onto the cybereye's row on
the Gear tab** and it becomes a module row of that eye, priced and charged like any
other purchase.

## Approach (Round 2 — the eye's price includes its accessories)
0. **Prerequisite, done in 0.116.2:** the core Cybereyes compendium item no longer ships
   six catalogue rows (they all counted: a plain pair cost .7 Essence). Each accessory
   is its own item in the same folder. GMs told to delete stale rows on existing eyes.
1. **Scope: purchases only.** A drop of an accessory from a compendium or the world
   sidebar (not already on this actor) onto a cybereye row. Owned items keep the
   existing `item.parent === actor → return false` exit; the out-of-scope section says
   so, with the manual route (delete the loose item after noting its price; the GM
   adjusts nuyen by hand).
2. **Identity** (R1 #2): host `wareRule === "cybereye-pair"`; accessory in a new
   `EYE_ACCESSORIES` table (compendium source uuid → kind) or
   `flags.sr2e.rule = "eye-accessory:<kind>"`. Anything else: normal drop. New explicit
   `"accessory"` kind choice; blank stays "unclassified".
3. **Money: a dedicated, fully awaited purchase (Round 3; the repricing hook is NOT
   used — it settles in an un-awaited `updateItem` step and prices at the host's SI).**
   - `itemBaseCost`, `PURCHASE_DRIVERS` and the repricing hook are untouched.
   - **Accessory purchases are final.** No per-row refund provenance: removing a row or
     selling the eye never refunds accessory money (selling the eye refunds the eye's
     own `paid`, as today). This is a deliberate scope decision (the sell button is a
     table convenience, not a rule); it removes R3 #5, #6, #7, #8.
   - **Price** = the accessory's list price at its chosen Rating, priced at STANDARD
     grade; in play × the ACCESSORY's own Street Index (`streetPrice(list,
     candidate.system.streetIndex)`), in character creation list price (R3 #4). Same
     list/street rule as the ordinary drop.
   - **Chargen budget:** each row records `listValue` (its list price; 0 for free,
     Alt-dropped or hand-typed rows). `chargenBudgetOf`'s item projection passes
     `moduleListValue: Σ rows' listValue`, and `chargenItemCost` adds it after the
     host's own pricing (tested through `chargenBudgetOf`, R4 #3). Deleting a row or
     the eye during creation un-buys it, exactly as deleting any item in creation does
     today (creation is a draft).
   - **Copies (R4 #5):** whenever a cybereye ITEM is created on an actor by a drop
     (bought or Alt), its rows' `listValue` is zeroed first: they weren't bought by
     this character.
   - **New row fields:** `id` (StringField, initial ""), `listValue` (NumberField ≥ 0,
     initial 0). No migration needed.
4. **The purchase** (`fitEyeAccessory` in a new `module/eye-accessories.mjs`), the whole
   thing inside one awaited per-actor queue entry (R3 #1, #2):
   a. Buy dialog for the accessory's Rating only (no grade, no surgery: p.45).
   b. Placement: weapon / tool laser into a pair asks left or right, on every path.
   c. Re-read the live host (still embedded, still a cybereye) and the actor; build the
      row from the live state.
   d. Essence (installed host only): candidate copy of the host with the new row;
      refuse if Essence would drop below 0; report the delta past the allowance. A
      spare (uninstalled) eye skips it.
   e. Affordability: live nuyen ≥ price, else refuse, nothing written.
   f. Write the row (`host.update`), then re-read nuyen; if the fresh balance no longer
      covers the price, remove the row by `id` and refuse (R4 #2); else debit — the
      ordinary drop's order (row/flags first, then money). Every write's result is
      checked: a falsy return or a throw is a failure (R3 #3).
   g. On a failed debit: remove the row by its `id` (re-reading the live rows, so
      nothing else is touched); if that removal fails too, a permanent error ("X has
      the accessory but wasn't charged — charge N¥ by hand").
   h. Only after (f)/(g) settle does the queue entry finish and the success notice show.
   Alt-drop / NPC / auto-charge off: (a)–(d) and the row write only (`listValue` 0).
   **One money queue per actor (R4 #1, #3; R5).** A shared helper
   `moneyQueue(actor, fn)` (= `enqueueAttack(\`money:${actor.uuid}\`, fn)`, the
   existing client-local queue) wraps the MUTATION part — re-read, check, write, debit
   or refund — of every money operation on this client:
   - this accessory purchase (c)–(g);
   - the ordinary drop's charge block (`_dropItemWorkflow`, from the flags write to the
     debit/delete);
   - `_surgeryPurchase`'s charge;
   - `onSellItem`, AFTER its confirmation dialog: inside the queue it re-reads the item
     (still there?) and the actor's nuyen before deleting and refunding;
   - the repricing `updateItem` settlement in `sr2e.mjs`.
   Dialogs stay outside the queue (a person deciding never blocks other operations);
   each operation re-validates its documents once it holds the queue. Cross-client
   overlap remains out of scope (one driver per actor).
   **Host form lock (R5 #2):** while the purchase holds the queue, the host's uuid is in
   an `IN_FLIGHT` set; the item sheet's form submit and its add/remove row buttons for
   that item refuse ("finishing a purchase — try again in a moment") and re-render, so
   no row field, Essence or grade edit lands mid-settlement.
5. **Discoverability.** Cybereye row tooltip; wiki line.
6. **Tests.** Vitest: price (accessory SI, standard grade, chargen list), `chargenItemCost` with row `listValue`,
   `EYE_ACCESSORIES` lookup, row building at a rating, standard-grade pricing of a beta
   accessory. Quench `sr2e.eye-accessory-drop` on the SHIPPED core eye (R2 #9): buy into
   a pair (nuyen once = the accessory's street price; Essence unchanged within .5),
   overflow (Essence delta), below-0 refused, spare eye, Alt-drop free, unaffordable → refused, nothing added; funds spent between the check and the debit →
   row removed, nothing charged; an ordinary purchase overlapping the debit (delayed `actor.update` stub) → both
   charged exactly once; a sale confirmed during settlement waits, then re-validates;
   a host form submit during settlement is refused;
   a copied eye's rows arrive with `listValue` 0; a falsy debit removes the row by id; a
   falsy row write charges nothing; chargen counts `listValue`;
   non-table item onto the eye row → separate item.

## Key decisions & tradeoffs
- **Rows, not linked items** (the Essence/cap/slot/damage code reads `modules`).
- **Accessory purchases are final** — no refunds on row removal or eye sale. Keeps the
  money path one forward transaction.
- **Accessory priced at its own SI, ungraded**; host grade governs Essence only.
- **No surgery** for an accessory (p.45).
- **No cross-path lock** (one driver per actor, the system-wide contract).
- **Known limitation:** an eye copied from another actor or the world sidebar brings
  whatever rows it has at no extra charge (the shipped compendium eye now has none).
  `shortcut:` comment in the drop path; GM's call.

## Risks / open questions
- Foundry v13 DragDrop: `event.target.closest(".cyber-row[data-item-id]")`.
- A GM editing `listValue` by hand isn't possible from the sheet (not shown); fine.

## Out of scope
- Moving an accessory item the character already owns onto an eye (manual route above).
- Cyberears and other containers; ear accessories as items.
- Second-hand parts, shop grades.
