# In-Foundry tests (Quench)

`npm test` (Vitest) covers the pure rules math but runs in plain Node with no
Foundry — it can't open a sheet, edit a field, or read a compendium. **Almost
every regression this project has shipped lived in that uncovered layer**: blank
sheets, a mistyped item type (`adeptPower` vs `adept_power`), Good Karma not
saving, unlinked pregens, empty roll tables. Quench closes that gap by running
tests *inside* a live Foundry world.

## One-time setup
1. Foundry → **Add-on Modules** → **Install Module** → search **Quench** → install.
2. Enable **Quench** in the world (Game Settings → Manage Modules).
3. Reload. A **Quench** button appears at the bottom of the sidebar.

That's it — the SR2E batches register themselves (`module/quench/sr2e-quench.mjs`
via the `quenchReady` hook). With Quench *not* installed, the hook never fires and
nothing runs in normal play.

## Running
Open the **Quench** window → the `SR2E:` batches are listed → **Run** (all, or
selected). Green = pass. The batches create and delete their own temp documents,
so they don't pollute the world.

## What the batches assert (each maps to a real bug)
| Batch | Catches |
|---|---|
| **Actor Sheets** | Every actor type renders tabs + body, not just the header (the god-file-split blank-sheet regression). |
| **Item Types** | One of every registered item type creates without a validation error (the `adept_power` type bug). |
| **Persistence** | A `karma.current` update sticks on the directory document (the Good-Karma-not-saving bug). |
| **Metamagic** | Quickening a sustained spell drops it from the sustain penalty (Grimoire p.44). |
| **Compendium** | Sample runners are linked tokens (karma-desync cause); the Offensive Grenade has no ammo block (consumable); every roll table has result rows (lost-content bug). |
| **Magical healing** | Treat/Heal application persists: boxes come off the monitor, an undamaged or zero-success cast is refused without consuming the once-per-injuries allowance (SR2 p.155). |
| **Movement limiter** | The in-combat cap fires via `preMoveToken`/`preUpdateToken`: walk allowed, run flagged, over-max blocked, out-and-back counts cumulatively, a bystander is uncapped, and undo isn't counted as movement (SR2 p.84). |

## Adding a batch
Add a `quench.registerBatch("sr2e.<name>", (ctx) => { … }, { displayName })` inside
the `quenchReady` handler in `module/quench/sr2e-quench.mjs`. Use Chai's `assert`
from the context. Create temp documents and clean them up in an `after()` hook.
When you fix a UI/persistence bug, add the batch that would have caught it.

### `sr2e.spell-foci` — Spell Foci (p.137)

Covers what Vitest cannot: that focus dice are actually **persisted** as spent,
that they **come back** on refresh, and that the derived unbound flag the sheets
warn on is correct.

The two that matter most:

- **refresh with the actor pools already full.** `refreshDicePools()` returns
  early when the actor-side update is empty, and `spent` lives on an embedded
  item — so an early return would skip focus refresh entirely and present as
  "foci sometimes don't refresh".
- **a greedy request straight through `item.roll`**, bypassing the dialog: 4 cast
  + 4 drain from a rating-4 focus must spend **4**, not 8. The dialog is a
  convenience; enforcement is in `_rollSpellcast`.

Plus the original bug itself — a focus bound to one spell must contribute nothing
to a different one.

### `sr2e.damage-karma` — Damage application & Karma spends

The two most consequential mutations in the system, and neither had any coverage.
`applyDamage` runs on every hit; `applyKarmaToTest` spends Karma Pool, which the
book makes **permanent** — a bug there costs a player something they cannot get
back.

The case worth understanding is *"computes overflow from the PRE-hit value"*.
`applyDamage` captures `const monitor = this.system.conditionMonitor[type]`
**before** its own `await this.update(...)`, then uses `monitor.value` to work out
overflow. That is correct only while the data model **rebuilds** `system` on
update rather than mutating it in place — if that ever changed, `monitor.value`
would read back already-clamped and overflow would silently compute 0. Nothing
would error; wounds would just quietly stop being lethal.

Also pins stun→physical conversion, the vehicle/IC flat monitor, refusal to act
on non-positive amounts, and that a Karma action which cannot be afforded spends
nothing rather than going negative.

### `sr2e.guards-boundaries` — dump shock, melee defense, escape

Tested at their **guards and boundaries** rather than their dice, since that is
the deterministic part and the part that fails quietly.

- **recoverDumpShock** — a no-op when not shocked (no roll, no card), and the
  `dumpShock` flag must AGREE with what the chat card claims happened. A cleared
  flag under a "still disoriented" card is the failure worth catching.
- **rollMeleeDefense** — the attacker cannot defend against their own attack, and
  a resolved exchange cannot be re-rolled. Without the second, a defender who
  dislikes a result can simply click again.
- **rollEscapeTest** — a TIE auto-fails. The book supports `>=` from both ends:
  the escape fails if the pursuer has *more*, and the quarry gets away only if it
  generated *more*, so a tie satisfies neither.
  Worth knowing before editing: **the actor is the PURSUER**, not the fleeing
  vehicle. p.107 has the pursuer roll against the quarry's net successes, and
  **zero successes means the quarry escapes** — the method name reads backwards.
