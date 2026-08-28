# Plan: Karma Pool — derive capacity, split permanent from temporary

_Round 2 — revised after a second Codex review. Changes: provenance-preserving `drawn`
field replaces signed `spent`; `pool`/`poolMax` are no longer schema fields;
a 7th writer and two editable sheet inputs were missed in round 0._

## Goal

Make the Karma Pool obey SR2E p.191 without anyone maintaining it by hand. Today
`system.karma.pool` is a stored number that nothing derives and nothing
refreshes, and rerolls (temporary) are indistinguishable from bought successes
(permanent). Three rules are contravened:

- _"One-tenth (round up) of all Karma earned goes into the character's Karma
  Pool."_ — never computed; the value is whatever someone typed.
- _"The full value of the Karma Pool returns with the next encounter."_ — never
  happens.
- _"Karma Pool dice spent to buy a success are gone (pffft!) forever… They do
  not refresh with the pool in the next scene."_ — not modelled, so any refresh
  would resurrect them.

Existing hand-entered values are explicitly **not** preserved (user's call).
Correct going forward is the whole requirement.

## Approach

### 1. Schema (`module/data/actor-data.mjs`)

`karma` keeps `current` and `total` and gains **three** non-negative counters.
`pool` is **removed from the schema entirely**.

```js
karma: {
  current,   // unspent Good Karma for advancement — unchanged
  total,     // lifetime Karma earned — unchanged
  burned,    // NEW: personal capacity permanently expended
  spent,     // NEW: personal points used this encounter (>= 0)
  drawn      // NEW: Team Karma points held this encounter (>= 0)
}
```

Round 0 kept `pool` as a stored-but-derived number "so the 20 read sites don't
change". That was wrong, and Codex found the evidence: two sheet templates carry
**editable inputs** bound to `system.karma.pool`
(`actor-header.hbs:94`, `actor-bio.hbs:92`) and the sheet runs
`submitOnChange: true`, so every sheet interaction would submit a derived
snapshot straight back into source data. Dropping `pool` from the schema makes
strict validation discard such writes instead of persisting them.

The 20 *reads* keep working because `prepareDerivedData` assigns
`this.karma.pool` / `this.karma.poolMax` onto the prepared object. Undeclared
fields are excluded from `toObject()`, so nothing is persisted — but Codex is
right that this needs proving rather than assuming, so it is a required test
(§7). The repo's existing idiom for derived-not-in-schema is a prototype getter
(`get woundPenalty()`, `get sustainPenalty()`); getters cannot be used verbatim
here because the reads are at the nested path `system.karma.pool`, and moving
them to a top-level `karmaPool` getter would mean editing all 20 sites plus
templates. If the proof test fails, that is the fallback.

### 2. Derivation (`CharacterData#prepareDerivedData`)

```js
this.karma.poolMax = karmaPoolCapacity(this.karma.total, this.karma.burned);
this.karma.pool    = karmaPoolAvailable(this.karma.poolMax, this.karma.spent, this.karma.drawn);
```

with both helpers in `module/rules/sr2e-rules.mjs` so the arithmetic is
unit-testable:

```js
karmaPoolCapacity(total, burned)      = max(0, ceil(total / 10) - burned)
karmaPoolAvailable(cap, spent, drawn) = max(0, cap - spent) + drawn
```

**No second debit of the shared pool.** `onDrawTeamKarma` already calls
`changeTeamKarma(-amount)` at draw time (`sheet-actions.mjs:2907`), so a drawn
point has *already left* the shared setting. Round 1 debited it again on
buy-success — charging the team twice for one point. Buying with a drawn point
now only decrements `drawn`.

The permanence of that point is therefore recorded only by the shared setting
already being lower. That is a real limitation and it is **pre-existing**: Team
Karma is one flat world setting with no capacity/spent/burned split, so it
cannot distinguish "temporarily drawn, returns next scene" from "burned on a
success, gone forever". Nothing in this plan makes that worse, and modelling it
properly is a separate piece of work — see Out of scope.

**Why `drawn` rather than letting `spent` go negative.** Round 0 used one signed
counter, and it double-charges. Codex's sequence: draw 2 from Team Karma, buy a
success with one of them, refresh. The bought success permanently consumed a
point that had *already left the Team Karma Pool*, but a signed `spent` also
reduces the character's own future capacity — the character is charged twice for
one point. One counter cannot preserve provenance. RAW is explicit that team
points buying successes are lost *from the team pool*.

### 3. Rewrite the SEVEN writers

Round 0 said six. `macros/refresh-karma-pool.js:51` is a seventh and would have
become a silent no-op that still reported success.

Temporary spends consume **`drawn` first, then personal capacity** — borrowed
points are used before your own.

| Site | Becomes |
|---|---|
| `applyKarmaToTest` reroll | consume `drawn` first, remainder to `spent` |
| `applyKarmaToTest` avoidGlitch | same, cost 1 |
| `rollSuccessTest` karma dice | same, cost = karmaDice |
| `applyKarmaToTest` buySuccess | if `drawn > 0`: `drawn -= 1` (nothing else); else `burned += 1` |
| `onContributeTeamKarma` | `burned += amount`; refuse unless `poolMax - spent >= amount` (you cannot gift borrowed points) |
| `onDrawTeamKarma` | `drawn += amount` |
| `macros/refresh-karma-pool.js` | rewrite: set `spent: 0, drawn: 0` |

### 4. Refresh on the gesture that already exists

`SR2EActor#refreshDicePools()` sets `system.karma.spent = 0` **and
`system.karma.drawn = 0`** alongside the dice pools. It is already bound to *Refresh Pools (selected)* and *(whole combat)* on
the macro pad, so the GM learns one habit, not two.

The Karma Pool was deliberately excluded from the refreshable pools because
refreshing would have handed back permanently-spent points. `burned` removes
that objection: a refresh cannot touch it.

### 5. Migration

Append an entry that **gates on `source.type === "character"`** — the runner
calls `migrateActor` for every actor and unlinked token, and these fields exist
only on `CharacterData`; writing `system.karma.*` to a vehicle, spirit, host or
IC would be invalid. Set `burned/spent/drawn` to 0 and delete the stale stored
`pool` (`"system.karma.-=pool"`).

### 6. Sheet and compendium

- Convert both `system.karma.pool` inputs to **read-only displays** of
  `pool / poolMax`. This is required, not cosmetic: leaving them as form inputs
  under `submitOnChange` is precisely the corruption path above.
- Sample-runner compendium entries carry `total: 0, pool: 1` and derive to a
  pool of 0. Just remove the obsolete `pool` from their source and accept 0.
  Inventing a `total` to preserve the old 1 would be worse: the sheet's
  advancement ledger reads `total - current`, so fabricated lifetime Karma would
  report Karma spent that never was.
- Reconcile the award macro's comment, which currently states that awarding
  Karma deliberately does not touch the pool. Under derivation it raises
  capacity — which is correct per RAW, but the comment now says the opposite.

## Key decisions & tradeoffs

- **`pool` is derived-only, not a schema field.** Reads keep working because
  `prepareDerivedData` assigns it; writes get dropped by strict validation,
  which is the desired failure mode for stale macros and sheet submissions.
- **Capacity derives from `total`, not a stored max.** The award macro already
  writes `total`, so awarding Karma raises the ceiling automatically and rounds
  up. The cost: editing `total` moves the pool — correct per RAW, and worth a
  line in the changelog because it will surprise someone.
- **Three unsigned counters, not one signed one.** The signed version was
  smaller and wrong: it cannot tell a borrowed point from an owned one, and so
  charges the character permanently for a success bought with team Karma.
- **Refresh is manual, tied to the existing gesture.** No software can detect an
  "encounter"; RAW defines it narratively. Auto-refreshing on combat end would
  be wrong — legwork and a tense meet are encounters too.
- **Unused borrowed points evaporate at refresh.** `drawn` resets to 0 rather
  than being returned to the team pool. Simpler, and matches the team pool
  having its own refresh.

## Risks / open questions

- **Concurrency.** Every counter write is read-modify-write, so two
  simultaneous spends can clobber one another. Real, but a single table with one
  GM is not where this bites; noted rather than solved with locking.
- **Spend order is a house rule.** RAW does not say whether borrowed team points
  or personal points go first. Drawn-first is chosen because it is the only
  order that lets a player return unused borrowings at refresh.
- ~~`refreshDicePools()` early-return~~ — obsolete. Codex verified the guard was
  already fixed and the method continues past an empty pool update.
- Anything outside this repo writing `system.karma.pool` now has its write
  silently dropped by schema validation. That is the intended outcome, but it
  should be called out in the changelog.

### 7. Required proof test

A Quench test that, on a character: reads `system.karma.pool`; asserts
`actor.system.toObject()` contains no `pool`/`poolMax`; issues a legacy
`update({"system.karma.pool": 9})` and asserts it neither persists nor changes
the derived value. If any leg fails, switch to top-level getters and edit the
read sites.

## Out of scope

- **Team Karma capacity accounting.** The shared pool is a single flat setting
  with no max/spent/burned split, so it cannot record that a drawn point was
  permanently burned rather than temporarily lent. Pre-existing; worth its own
  plan if Team Karma sees real use.
- Karma award/advancement flow beyond what already exists.
- Any attempt to preserve or reconcile existing hand-entered pool values.
