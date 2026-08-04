# Plan: make spell foci behave like the book says
_Round 1 — revised after Codex_

## Goal

`docs/RULES-AUDIT-2.md` FINDING 1: spell foci are implemented as a permanent
bonus, and the book makes them a **depleting pool bound to one spell**. Three
defects, all in the player's favour on the cast side:

1. not bound to a specific spell — every active focus adds to every spell;
2. dice never deplete — a Force 4 focus gives +4 on *every* spell in a turn;
3. not applied to Drain resistance, which the book explicitly includes.

Book, p.137: *"Both types operate in a similar manner in that they make available
an additional number of dice equal to their rating. **Like Dice Pools, once the
Spell Focus dice are used, they are gone until the beginning of the magician's
next action.** In fact, treat these dice exactly like Magic Pool dice for the
purposes of when they refresh… A specific spell focus provides extra dice equal
to its rating for the tests to cast **and resist Drain** associated with **one
specific spell**."*

## RESOLVED — one shared pool, split between cast and Drain

The open question is decided, and Codex's reading is the better-supported one.
A focus makes available *"an additional number of dice equal to their rating"*,
used dice *"are gone"*, and the dice operate *exactly like Magic Pool dice*. Magic
Pool splits across a test and its drain. **Granting the full rating to each test
independently would turn a Rating 4 focus into eight die-usages**, which no
reading of "equal to their rating" supports.

So: one allocation of `rating` dice per action, the player divides it between the
casting test and the Drain test — mirroring how the dialog already splits Magic
Pool.

## SCOPE — specific-spell foci only this round

Round 0 was internally inconsistent: cast-time logic handled categories while the
risks proposed shipping category fields schema-only. Resolved: **implement
`specific` only.** No shipped compendium content uses category foci, and the
book's category rules carry their own Spell Defense restriction that needs its
own verification pass. `spellSubtype` ships with both values defined so the data
model is stable, but matching logic rejects anything that is not `specific`.

**So the form must not offer `category` as a live choice.** A value that is
selectable but silently rejected at cast time is a trap: the player picks it, the
focus stops working, and nothing says why. Either hide the option this round or
show an explicit "not implemented" warning whenever it is selected. Hiding is
preferred — there is nothing useful a player can do with it yet.

**Spell Defense is explicitly deferred.** The audit noted *"dice from a spell
category focus cannot be used as Spell Defense dice"*, which implies specific-focus
dice behave differently — but the full rule has not been read. Nothing about
Spell Defense changes in this round, and that is a stated decision, not an
oversight.

## Approach

### 1. Schema — `FocusData`

Following the existing `bondedWeaponId` precedent:

- `spellSubtype`: `"specific" | "category"`, initial `"specific"`.
- `boundSpellId`: string — the embedded spell item id.
- `spent`: `NumberField({ integer: true, initial: 0, min: 0 })`.

**`spent` cannot express its real ceiling in the schema.** The cap is the focus's
current `force`, which is dynamic, and `NumberField.max` is static. So `min: 0`
only, and **every** path that writes `spent` clamps against current `force` —
spend, migration, and refresh alike. Written down because a schema that looks
like it validates and doesn't is worse than one that admits it doesn't.

**Lowering `force` must re-clamp `spent`.** Editing a Rating 4 focus with 4 spent
down to Rating 2 writes only `force`, leaving `spent: 4` — above its own ceiling,
and `remaining` goes negative. Normalise in an Item pre-update hook so it holds
however the field is changed, rather than only on the spend path.

`force` keeps its name though the book says **rating**; renaming touches every
focus document for no mechanical gain.

### 2. Refresh — ride the existing path, and mind the early return

`refreshDicePools()` (`actor.mjs:396`) currently **returns early** when the actor
pool update is empty. Appending an item-level refresh after that return would
skip it exactly when actor pools happened to be unchanged — a bug that would look
like "foci sometimes don't refresh".

So: compute both update sets, `await` the actor update if non-empty, then
**unconditionally** bulk-reset spent foci via
`this.updateEmbeddedDocuments("Item", updates)`. No early return between them.

Codex confirmed the existing triggers are the right ones — combat start, each
action in action mode, round refresh in optional mode, combat end, and the manual
reset button all route through `refreshDicePools()`. Embedded-item updates are
safe there when awaited through the owning actor, and must be **bulked** and
tested against an **unlinked-token `ActorDelta`**, which is the case most likely
to behave differently.

### 3. Eligibility — the full predicate

Round 0 said "matching the binding" and dropped conditions that already exist at
`item.mjs:1155`. A focus contributes only if **all** hold:

- `type === "focus"` and `focusType === "spell"`
- `bonded` and `active`
- `spellSubtype === "specific"`
- `boundSpellId === <the spell being cast>.id`
- `force - spent > 0`
- **not `expendable`** — see below

### 4. Expendable fetish foci — excluded

Sharp catch. Expendable foci are consumed by their own Spend button
(`sheet-actions.mjs:2331`). Giving them a *renewable* `spent` counter would let a
single-use focus refresh forever — turning a consumable into a permanent one.
**Expendable foci are excluded from this mechanism entirely** and keep their
existing spend-and-delete flow.

### 5. Allocation — per focus, explicit

A single aggregate number cannot say which item the dice came from, and several
foci can match one spell. Rather than invent a spending order, **render one
allocation per eligible focus**, each with a cast and a Drain field. The player
sees exactly which focus is being drained.

**The two fields share one budget: `cast + drain <= remaining`.** Capping each
field independently at `remaining` would let a Rating 4 focus be asked for 4 on
the cast and 4 more on the drain — eight dice from a four-die focus, which is the
exact doubling this whole plan exists to prevent. The clamp is deterministic:
**satisfy cast first, then Drain from whatever is left.**

### 6. UI — outside the Magic Pool conditional

`sheet-actions.mjs:1614` suppresses the entire `poolSection` when Magic Pool
availability is zero. Focus dice can remain when the Magic Pool is exhausted, so
putting the focus fields inside that section would hide them precisely when they
are the only dice left. **Focus allocation renders independently of the Magic
Pool conditional.**

`templates/item/item-body.hbs:925` exposes none of the new fields, so the focus
item form gains a **subtype-sensitive bound-spell selector**, plus a **persistent
unbound warning** on the focus item and on **both** actor surfaces.

**Both, because NPC casters use a different one.** The character sheet's magic
partial is not the only place foci appear — the NPC sheet has its own Foci
fieldset (`npc-sheet.hbs:182`, added this session so NPC magicians could cast at
all). Warning only on the magic partial would leave **Craft, Stone and Pride** —
the exact actors that motivated this work — with no persistent warning anywhere.

**The selector needs an options source that does not exist yet.**
`item-sheet.mjs:42` has no `focus` case and supplies no owned-spell collection, so
a selector added to the template would render empty. Add that case, feeding the
parent actor's spells — with an explicit fallback for a focus that is **unowned**
(sitting in a compendium or the sidebar with no parent), where the correct
behaviour is an empty, disabled selector and a note saying it must be bound once
owned. Migrating bindings to empty without shipping the control
to set them would leave every caster permanently and inexplicably nerfed.

### 7. Validation belongs in `_rollSpellcast`, not the dialog

`Item#roll` can be called directly (macros, hotbar, other code paths) and dialog
state can go stale between render and submit. So the dialog *requests* an
allocation; `_rollSpellcast` **re-resolves eligibility, re-clamps against current
remaining dice, and persists the consumption** before rolling. The dialog is a
convenience, never the enforcement point.

### 8. Migration — report, and keep reporting

Set `spellSubtype: "specific"` on every `focusType: "spell"` item, leave
`boundSpellId` empty, **never auto-bind**. Auto-binding invents a mechanical
choice the player owns.

Codex is right that a one-time notification is not enough — a missed toast leaves
a permanent unexplained nerf. So the persistent unbound warning from step 6 is
the **primary** signal: it lives on the sheet and does not go away until someone
binds the focus. That is what makes this safe, because it cannot be missed.

**The report needs a channel the migration API does not currently provide.**
`migrateItem(source)` receives only the item source — no parent actor, no way to
emit anything but update data, and `migrations.mjs:261` discards everything else.
So the report cannot be produced from `migrateItem`. Do it in **`migrateActor`**,
which does see the actor: scan its items for unbound spell foci, push
`{actor, focus}` onto a run-scoped accumulator, and emit **one** summary at the
end of the migration listing every affected actor.

A name-match suggestion (exactly one owned spell sharing the focus's name) may
appear in that summary as a one-click action. It must never be applied
automatically — the binding is the player's mechanical choice.

## Key decisions & tradeoffs

1. **One shared rating-sized pool, split.** The alternative doubles the focus.
2. **Chosen, not automatic.** Costs dialog fields; buys the actual rule and makes
   depletion visible rather than silent.
3. **Per-focus allocation** over an aggregate with a spending order — explicit
   beats clever, and it is what the player can actually reason about.
4. **Report and keep warning; never guess** on migration.
5. **Specific foci only**, category and Spell Defense deferred with reasons.

## Verification

Each of these exists because it is a way this can silently go wrong:

- split depletion — cast 2 + drain 2 on a Rating 4 focus leaves 0, not 4;
- **over-allocation via the dialog bypass** — request cast 4 **and** drain 4 from
  a Rating 4 focus through `item.roll` directly, and assert deterministic **4 + 0**
  consumption rather than 8. Repeat with stale `spent` already non-zero, since
  that is the state a second cast in one action actually produces;
- **refresh when actor pools are already full** — the early-return trap; foci
  must still reset;
- refresh on an **unlinked-token actor** (`ActorDelta`);
- **direct `item.roll`** bypassing the dialog is still clamped and still persists;
- a focus whose `boundSpellId` points at a **deleted spell** contributes nothing
  and does not throw;
- an **expendable** focus never gains renewable dice;
- migration leaves bindings empty, reports affected actors, and the sheet warning
  persists;
- a focus with `force - spent === 0` is not offered.

## Out of scope

- Weapon, spirit and power foci. Only `focusType: "spell"` changes.
- Category foci matching; Spell Defense interaction.
- The p.130 → p.131 citation drift (comment fix).
- Spell locks' rating-1 cap (real, separate defect — file it).
- Anything under "Still to audit" in `docs/RULES-AUDIT-2.md`.
