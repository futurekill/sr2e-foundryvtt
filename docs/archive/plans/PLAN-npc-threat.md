# Plan: NPC Threat Ratings in play (core p.187)
_Round 2 — revised after Codex r1–r2 (docs/archive/plans/PLAN-npc-threat-REVIEW-LOG.md), 2026-11-27._ User (2026-11-27): next after social login, "Threat rating".
Rule text read from the page render (PDF 196 = book p.187) on 2026-11-27.

## The rule (p.187, "Threat Ratings")
"Each point of Threat Rating gives the NPC an extra die for any tests, offensive or defensive. Threat Rating dice are
not the same as a Dice Pool; Threat dice are always available and need not refresh. A number of dice equal to the
Threat Rating is available for multiple tests within a Combat Phase. If using Threat Ratings, do not use standard Dice
Pools for that NPC." "The Threat Rating is not added to Initiative dice for the purpose of determining the NPC's
Initiative." "Threat Rating dice should be treated as Combat Pool dice for determining a clean miss. See Combat Pool,
p.84."

## Today
- `NPCData.threatRating` (integer, **initial 1**) is stored and shown, and used nowhere for people. Robots (vehicles
  with `isRobot`) already add their Threat Rating to their own tests ("permanent dice on any test", item.mjs, vehicle-ops).
- Every NPC gets a derived Combat Pool (⌊(Q+I+W)/2⌋ + bonus, `npcDerived`), an Astral Combat Pool when Awakened, and
  a typed Magic Pool; the roll dialogs offer them.
- So a book NPC imported today "has" Threat 1 by default but never rolls it, and always has pools.

## Approach
1. **An explicit switch per NPC** — `NPCData.threatDice` (BooleanField, initial **false**): "Uses Threat dice instead of
   Dice Pools (p.187)". RAW makes it the GM's choice ("If using Threat Ratings"), and it avoids a migration: an existing
   NPC whose stored Threat Rating is the old default 1 can't be told apart from a deliberate 1 (the schema-default trap),
   so nothing changes for any existing NPC until the GM ticks the box. The schema's `threatRating` initial STAYS 1
   (r1 #2: book NPCs omit the field and inherit it; changing the initial would silently change them, a migration in
   disguise). The switch alone opts in.
2. **Threat mode** = `type === "npc" && threatDice && threatRating > 0`, ONE predicate (r1 #1): `npcThreat(type,
   system)` → the dice count (0 when off), in module/rules/npc-rules.mjs (pure). Derivation, rolling, the sheet and the
   app all use it; the switch on with a rating of 0 is simply off (pools stay).
3. **Every success test the NPC rolls** (`rollSuccessTest`, the single roll path): add `npcThreat` dice as their own
   source run ("Threat", sourceKey `threat`), shown in the card's dice breakdown. `diceSourceRuns` (sr2e-rules.mjs) gains
   a `threat` run (r1 #4) so `attributeDice` tags them; a test checks the returned dice and the persisted
   `flags.sr2e.test.dice` carry `sourceKey: "threat"`. They are not spent, never refresh,
   need no pool bookkeeping, and apply to every test in every Combat Phase (and outside combat — p.187 says "any
   tests"; the system's robot reading is the same). Karma dice are unaffected (NPCs hold no Karma Pool).
4. **No standard Dice Pools in threat mode — one effective view of all three** (r1 #5): `npcDerived` takes the threat
   count and returns `combatPool`, `astralPool` AND `magicPool` (the typed Magic Pool's max, or 0) — all 0 in threat mode;
   NPCData assigns value AND max of all three from it on EVERY preparation, both directions (the Magic Pool's max is
   restored from `_source` when the mode goes off), so refresh refills to 0 and dialogs offer none. `rollSuccessTest`
   resolves threat mode FIRST (before the `poolsLocked` check, r1 #3) and, for a threat-mode NPC, drops BOTH `poolDice`
   and `paidPoolDice` (a note on the card says so) — a stale dialog or a caller that pre-paid can't add pool dice.
5. **Not Initiative:** initiative isn't a success test (rollInitiative uses its own formula); a test pins that the
   threat dice are not added there.
6. **Clean miss** (p.84, p.91, p.103): wherever the system counts Combat Pool successes for a clean miss
   (`successesFromSource(dice, "pool:combat")` in the damage-resistance path, the melee Full Defense path, and the
   astral counterpart with `pool:astral` in astral-combat.mjs), it also counts `threat` successes. One helper
   `cleanMissSuccesses(dice, pool)` sums that pool's key + `threat`, so the call sites can't drift.
   **Full Defense** (r2 #1): the melee and astral defence dialogs offer Full Defense when the defender has that pool OR
   is in threat mode. Ruling (wiki Rulings): Full Defense trades the Combat (or Astral) Pool on the defender's own
   Attack Success Test for the clean miss (p.103); a threat-mode NPC pays the same price with its Threat dice — that
   test is rolled WITHOUT them (`rollSuccessTest` option `noThreat`), and its Threat successes on the resistance test
   count toward the clean miss.
7. **Sheet:** the NPC sheet gets the checkbox beside Threat Rating (localized, with the p.187 tooltip); with it on, the
   Combat Pool line reads "not used — Threat Rating N" instead of the pool.
8. **The app** (sr2e-chargen, after this release is pinned): its NPC export sets `threatDice: true` when the NPC has a
   Threat Rating above 0; the export's "roll Threat dice by hand" biography line and the page's note change to say
   Foundry now rolls them; `npcView` shows the pools as not used in threat mode (the same `npcDerived`).

## Proof
- Vitest: `npcThreat` (off by default, needs both the switch and a rating > 0, never for characters/vehicles);
  `npcDerived` with `threatDice` (pools 0) and without (unchanged numbers); `cleanMissSuccesses` (threat counts, other
  sources don't).
- Quench `sr2e.npc-threat`: an NPC with Threat 3 and the switch on rolls a skill test with skill + 3 dice and a
  "Threat" run on the card (sourceKey in the flags); `poolDice` and `paidPoolDice` requests add nothing and no pool
  value changes; the same NPC with the switch off rolls as today (pools offered, no threat dice); a damage resistance
  where only threat successes beat the attacker's is a clean miss; an ASTRAL clean miss the same way; a spell cast and
  its Drain with pool requests take threat dice and no Magic Pool; a pool refresh leaves all three at 0; initiative is
  unchanged; the melee and astral defence dialogs offer Full Defense to a threat-mode NPC, its own test then has no
  threat dice, and its resistance's threat successes give the clean miss (r2 #1); the same on an UNLINKED token NPC (r1 #6); an existing NPC (stored threatRating 1, no switch) behaves
  exactly as before.
- The existing NPC Quench batches stay green (npc-derived, npc-essence, astral).

## Key decisions & tradeoffs
- **Opt-in per NPC** rather than a world setting or "Threat > 0 means on": no migration, no surprise for existing
  worlds, and RAW frames it as a per-NPC choice.
- **Threat dice on every test**, matching the system's existing robot ruling and p.187's "any tests".
- **One roll path** (`rollSuccessTest`) gets the dice, so attacks, defence, resistance, spells and skills all agree.

## Risks / open questions
- A roll path that bypasses `rollSuccessTest` would miss the dice — a grep in the plan's code review lists every NPC
  roll path; any outlier is routed through it or documented.
- The "within a Combat Phase" wording could be read as "TR dice per phase, shared across tests"; the system already
  rules "permanent dice on any test" for robots, and p.187's "always available and need not refresh" supports it. Wiki
  Rulings records it for people too.

## Out of scope
Prime runner grades (Companion p.84–85); Professional Rating morale automation (withdrawal is shown, not enforced).
