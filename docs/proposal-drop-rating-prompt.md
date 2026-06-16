# Proposal: Rating Prompt on Item Drop

**Status:** Draft for discussion — not implemented.

## Problem

We collapsed the compendia so each rated item is a single editable **template**
(one "Power Focus," one "Commlink," one "Attack" program, etc.) instead of a
copy per rating. The trade-off: when a player drags a rated template onto a
sheet, it lands at the template's **default rating** and they must then open the
item and set the real rating by hand. It's easy to forget, and it doesn't feel
like "buying at Rating X."

## Goal

When a player drops a *rated* item, prompt them to choose the rating/force
they're "buying," set it on the created item, and let the derived values
(memory Size, cost) recompute. Non-rated items drop through untouched.

### Non-goals
- No change to the compendium structure (we keep single editable templates).
- No nuyen/Karma bookkeeping or "can you afford it" checks — just sets the rating.
- No prompt when an item is moved *between* an actor's own sheets, or
  programmatically created (imports, the Adventure importer, generators).

## Proposed behavior

On a player dragging a rated item onto a character sheet:

1. A small **DialogV2** appears: *"Acquire {Item Name} — choose rating"* with a
   number input (sensible min/max), defaulting to the template's current value.
2. **Confirm** → the item is created with that value; Size/cost re-derive.
3. **Cancel** → nothing is created (the drop is aborted), so a misclick doesn't
   dump a junk item on the sheet. *(Open question — see below.)*

### Which items prompt, and on which field

| Item type | Field prompted | Range |
|---|---|---|
| `program` | Rating | 1–6 (or higher; book caps vary) |
| `focus` | Force | 1–6 |
| `adept_power` (leveled only) | Level | 1–N |
| `cyberware` | Rating | item-defined, only if it's a rated item |
| `gear` | Rating | item-defined, only if it's a rated item |

**Rule for "is it rated?"** — prompt only when the dragged item actually has a
meaningful rating, so plain gear (Goggles, a knife) never prompts. Candidate
rule: prompt if `program`/`focus`/leveled `adept_power`, **or** a
`cyberware`/`gear` whose `system.rating` (or the new `costPerForce`/rated flag)
is greater than 0 on the template. This is the main thing to nail down — see
open questions.

## Technical sketch (for reference)

- Hook point: `SR2EBaseActorSheet#_onDropItem` (module/sheets/actor-sheet.mjs).
  It currently just `toObject()`s the source and calls
  `createEmbeddedDocuments("Item", [itemData])`.
- Add: detect rated type → `await` a DialogV2 for the value → write it into
  `itemData.system.<field>` before create. Cancel returns `false` (no create).
- Derived recompute is automatic (ProgramData/FocusData `prepareDerivedData`
  already derive Size/cost from rating/force).
- Effort: small, contained, low-risk. No data-model changes required.

## Open questions for the group

1. **Cancel behavior:** abort the drop (nothing created), or create at default
   rating (current behavior) and let them edit? Aborting is cleaner but means a
   cancel = no item.
2. **Scope of "rated":** just the obvious four (program / focus / adept level /
   rated cyber-gear)? Or *any* item with a `rating` field, accepting that some
   incidental-rating gear would prompt at 0?
3. **GM drops:** should the prompt fire when the **GM** drags items (e.g. kitting
   out an NPC), or only for players? (Could skip the prompt for GMs to keep NPC
   building fast.)
4. **Remember last value:** default the dialog to the template's value, or to the
   last rating that player chose for that item type?
5. **Adept powers:** only the leveled ones (Increased Reflexes, Combat Sense), or
   also things like Improved Ability that take a rating?

## Alternatives considered

- **Keep it manual (status quo):** zero work, but the forget-to-set-rating
  problem remains.
- **Re-expand the compendia to per-rating copies:** removes the manual step but
  brings back the clutter we deliberately deleted.
- **A "rating" badge on the sheet item row** the player taps to set: lighter than
  a drop dialog, but easy to overlook (same forget problem).
