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
| **Movement limiter** | The in-combat cap fires via `preMoveToken`/`preUpdateToken`: walk allowed, run flagged, over-max blocked, out-and-back counts cumulatively, a bystander is uncapped, and undo isn't counted as movement (SR2 p.84). |

## Adding a batch
Add a `quench.registerBatch("sr2e.<name>", (ctx) => { … }, { displayName })` inside
the `quenchReady` handler in `module/quench/sr2e-quench.mjs`. Use Chai's `assert`
from the context. Create temp documents and clean them up in an `after()` hook.
When you fix a UI/persistence bug, add the batch that would have caught it.
