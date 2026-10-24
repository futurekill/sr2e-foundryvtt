# Plan: combat spells by the book (casting, targets, damage)
_Round 5 — final, after Codex R5 (all five points folded in), 2026-10-24._ _Round 0 — Claude, 2026-10-24._

Table feedback (2026-10-23 session): "Spells need some work. Combat spells should work more
like weapon combat; staging and damage didn't quite work right." The user asked for a
thorough reading of the core Magic chapter — not just casting but applying the effects,
including damage — and Codex passes before code.

## Sources read (corrected 11th printing; PDF = book +1 at p.127, +9 by p.151 — colour plates)
- **Types of spells, combat spells** p.127: combat spells ignore armor and non-magical
  external protection; target must be in the caster's line of sight; physical or mana.
  Physical spells resisted with Body, mana with Willpower; mana spells can't affect
  inanimate objects. Unless noted, both do Physical damage.
- **Spell components** p.128: Force = base dice (+ Magic Pool); Drain: Willpower vs the
  Drain code, Physical if Force > Magic, 2 successes per level.
- **Casting summary** p.129 (A–G), **spell stacking** and **multiple targets** p.129.
- **Spell targeting / target numbers / Object Resistance Table / area effect / situation
  modifiers / Spell Success Test / Spell Resistance Test / Determining result / Drain**
  pp.130–132 (Jason Eldrich's Power Dart example: 5 successes vs 2 → 3 net; base L staged
  one level per 2 net → M; 4 net → S).
- **Spell Defense** p.132, **Magic Pool** p.85 (cap = Magic Attribute on the spell test,
  none on Drain).
- **Combat spells vs vehicles** p.109 (PDF 110): only physical combat spells that do PHYSICAL damage, TN 8, the
  vehicle resists with Body + ½ vehicle armor vs Force, Spell Defense allowed, damage as
  for characters, a single-target spell hits the whole vehicle.
- **Spells and astral space** p.149, **Spell directory — combat spells** p.151 (rendered
  and checked against packs-src: every core combat spell's type, damage level and drain
  match; Sleep = Stun to living targets; Ram = vs objects/vehicles via Barriers p.98).
- **Barriers** p.98 (Barrier Effect Table; already in `barrierEffect`).

## What the system does today (combat spells)
- Dialog (`promptSpellOptions`): Force, Magic Pool split, an EDITABLE TN prefilled from the
  first target's Willpower/Body (else 4), foci, elemental aid, area options. No cover,
  visibility or magical-barrier modifiers; no multiple targets.
- Cast (`SR2EItem#_rollSpellcast`): Force + pool vs that TN (+ injury, sustaining, centering,
  cybermancy automatically); Drain; then ONE Resist Spell card for the first target.
- Resist (`SR2EActor#_rollSpellResistance` / `_finishSpellResistance`): attribute + Spell
  Defense + unused Magic Pool (magicians) + elemental aid vs Force; `net = caster − resister`.

## Gaps against the book (each a concrete case)
1. **Ties do nothing.** `net <= 0` → "no effect". p.131: a tie goes to the caster at the
   spell's minimum effect (combat spells: their base Damage Level); only a target with MORE
   successes is unaffected. (Mana Bolt, 3 vs 3 → should be Serious, is nothing.)
2. **Combat spells shown with a Power.** Card "Base 4S", result "takes 4S". Combat spells
   have no Power; damage is a Damage Level staged by net successes (no Damage Resistance
   Test). Confusing at the table ("damage didn't quite work right").
3. **Stun from the spell's NAME** (`/stun|sleep/`). Fragile; Grimoire "Death Touch" etc. fine
   by luck.
4. **Vehicles:** TN uses the vehicle's Body (should be 8); a mana spell is allowed (should
   be refused); the vehicle resists with "Body"/Willpower of a vehicle actor (should be
   Body + ½ armor); vehicle damage goes to its single monitor (that part is right).
5. **Objects / Ram:** Ram posts an ordinary Resist Spell card. p.151: Ram is unresisted, TN
   from the Object Resistance Table, effect = (Force + successes) against the Barrier
   Rating (p.98); vs a vehicle the Barrier Rating is Body + armor and each indicated
   reduction does Light damage (Body not reduced).
6. **No situation modifiers in the dialog** (p.130): cover and visibility (Ranged Combat
   Modifiers / Visibility Table p.89) and +1 TN per 2 points of a mana barrier / hermetic
   circle / medicine lodge the spell crosses (not for its creator / a shaman of that totem).
   Injury and sustaining are already automatic.
7. **TN taken from the dialog, not recomputed.** `options.targetNumber` is whatever the
   dialog (or a macro) passed; a target change between dialog and roll, or a macro with no
   TN, casts at TN 4.
8. **Rule of Ones on the cast** (p.131): all ones = misfire, no effect, Drain TN +2. Not
   implemented.
9. **Multiple targets** (p.129): split the Force dice (and Magic Pool, per target) among
   several targets; one Drain Resistance Test PER target, each at the original undivided
   Drain. Not implemented (only area spells hit several).
10. **Mana spells vs non-living targets** (p.127, p.149): no effect on objects/vehicles; mana
    area spells already skip them (`areaTargetEligible`), single-target casts don't.

## Approach (Round 1) — two phases
Phase 1 is the table-facing fix (ties, labels, damage type, every target kind, situation
modifiers, misfire, revivable casts, safe resolution). Phase 2 adds multiple targets once
Phase 1's per-target pipeline exists. Both ship before the plan is closed.

### P1.1 Pure rules (`module/rules/spell-rules.mjs`, unit-tested)
- `combatSpellOutcome({ casterSuccesses, resistSuccesses, baseLevel })` →
  `{ affected, net, level, boxes, why }`: caster 0 → miscast; resister > caster → unaffected;
  tie → base level (p.131); else base + ⌊net/2⌋, capped at Deadly. Never a Power.
- `combatSpellTarget({ spellType, damageType, target })` → `{ eligible, why, kind, tn,
  resist }` where `kind` ∈ `living | vehicle | object` (from the actor type: character/npc/
  spirit/critter → living; vehicle → vehicle; no actor / a barrier → object):
  - living: TN = Willpower (mana) or Body (physical) + cybermancy; resist = that attribute.
  - vehicle (p.109): eligible ONLY for a physical spell doing Physical damage; TN 8;
    resist = Body + ⌊vehicle armor / 2⌋.
  - object (a token without an actor, or a GM-picked "object" target): mana → not eligible
    (p.127); physical → **GM-resolved in this release** (R2 #7): the card shows the Object
    Resistance Table TN (p.130), the resist dice it implies (p.131) and Spell Defense is the
    GM's to apply; no automatic damage (there is no monitor to write).
- `spellSituationTN({ cover, visibility, barrierRating })` (per target, see P1.3).
- `ramEffect({ force, successes, barrierRating, vehicle })`: only when successes ≥ 1 and the
  target is not living (p.151, p.131); `barrierEffect(force + successes, barrierRating)`;
  vs a vehicle, Light per rating reduction, Body unchanged.
- `misfire(dice)`: true only when ≥ 1 die was ROLLED and all are 1s (area casts that withheld
  every Force die roll only their pool dice, if any; none rolled → no misfire).

### P1.2 Damage type as data, with a migration (R1 #16)
- New spell field `damageType` (`"physical" | "stun"`, `blank: true`, initial "" = unknown).
- Inference order (R2 #11), used by the migration AND by preCreateItem for any combat spell
  arriving with a blank field (old private packs, imports): (1) an explicit `damageType`
  is kept; (2) a damage code that says Stun → stun; (3) the compendium source default
  (core Sleep → stun; Grimoire Stun Bolt/Stun Missile/Stunball/Stun Cloud/Stunblast/Stun
  Touch → stun; other known combat spells → physical); (4) unidentified legacy → the old
  name test. Packs-src set it explicitly. The resolver reads only the field ("" → physical,
  p.127 "unless otherwise noted").
- The spell sheet shows **Damage type** (Physical / Stun) and **Resolve manually** (the
  `spellRule = "manual"` opt-in) for combat spells (R2 #12).

### P1.3 Targets: snapshot, per-target situation, line of sight (R1 #3, #4, #13)
- The dialog snapshots `targetTokens().map(t => t.document)` (R2 #2: live on a desktop,
  the shared targets on the phone — never the debounced user flag). Identity is
  `normActorUuid(token.actor.uuid)` — a string (R5 #5) — (the synthetic actor UUID for an unlinked token, so two
  unlinked copies stay distinct and one linked actor targeted twice counts once); the token
  UUID is kept only for targeting and geometry. The cast
  re-reads THOSE documents, never the live target set, after anything is awaited.
- The dialog's **Targets** table (single target and area alike): per row the kind, the
  computed TN, eligibility (and why not), and per-target situation: **Can see it**
  (unchecked → excluded, p.130/151 — no "blind fire" casting), **Cover** (none / partial
  +4), **Visibility** (the Visibility Table row, applied for the caster's vision type which
   the dialog asks once — Normal, Low-light (natural), Low-light (cybernetic/electronic),
  Thermographic (natural), Thermographic (cybernetic/electronic), defaulting from the
  caster's race vision and installed cybereye rows, overridable; p.89's slash columns are
  cybernetic/natural, R2 #4), **Magical barrier / circle / lodge rating** (+⌊rating/2⌋; "not for its creator"
  is a GM tick). An "other TN" field per row for GM rulings.
- Area casts (R2 #1): dialog 1 = Force, radius change, centre choice (as today) → the centre
  is placed (preview) → dialog 2 = the caught tokens' rows (the list depends on the final
  radius and centre) → cast. Cancelling either dialog or the placement spends nothing. The
  shared roll is judged against each row's own TN (p.130); caster-wide modifiers (injury,
  sustaining) stay in the roll.
- The companion keeps its explicit no-canvas refusal for area placement; a single-target
  combat spell works from the phone with the shared targets.

### P1.4 The cast (`_rollSpellcast`, combat branch)
- Recompute eligibility and TNs from the snapshot at roll time (the dialog only requests).
  Ineligible targets get a one-line card ("Mana Bolt can't affect the van — mana spells
  don't affect machines, p.127").
- Misfire (all ≥1 rolled dice are 1s): before Drain is rolled, the caster is offered **Avoid
  an Oops** (Karma Pool, p.191) in a prompt (R2 #5). The decision is ONE authoritative record
  (R3 #7): `once(caster, "oops:"+castTestId)` then the cast test's flag `oops: "avoided" |
  "declined"`. BOTH entry points — the prompt and the chat `avoidGlitch` button — call one
  `decideOops(castTestId, choice)` that takes that claim first, so only one decision ever
  runs (R4 #5); the cast test is closed to Karma once declined. A claim with no decision after
  STUCK_MS lets the GM decide on the card. Avoided → an ordinary failed cast (no
  effect, no +2); declined or no Karma → misfire, Drain TN +2 (p.131).
- One **Combat Spell card per eligible target**, ALSO when the caster rolled 0 successes
  ("Miscast — Karma can still revive it", like the ranged Miss card, R1 #7), shaped like the
  ranged damage card: "Mana Bolt at Smith — 4 successes vs TN 5 · Base: Serious Physical ·
  Resist with Willpower (+ Spell Defense), no armor." Area casts keep their current rule that
  Karma reroll/buy is refused on a multi-target area test (documented on the card).
- Karma sync (R2 #8): each new card is created from the LIVE cast test (Karma spent while
  Drain was rolling is already in it); `_syncDependentCards` keeps it current afterwards.
- Ram (R3 #8, R4 #7): an unresisted card per object/vehicle target with its own flag state
  (`flags.sr2e.ram = { testMessageId, successes, barrierRating, vehicleUuid, resolved }` —
  `testMessageId`, the field `_syncDependentCards` matches) and a renderer there (the
  reductions follow the live successes until `resolved`). Barrier
  Rating: vehicle Body + armor prefilled; object: the GM enters it (Barrier Rating Table
  hint). **Apply** (vehicle) follows the resistance contract exactly (R5 #4):
  `once(vehicle, "ram:"+testMessageId)` → a pending outcome message (keepId) with
  `closesTests: [testMessageId]` → re-read and freeze the live successes → the Light boxes
  via `commitVehicleDamage` with their receipt → the card's `resolved` set and the outcome
  finalized; an interruption is GM-reconciled the same way (Mark resolved).
  Object: text only (no monitor).
- **Special spells** (R1 #15): combat spells with rules the resolver doesn't model — Grimoire
  Death Touch, Ram Touch, Stun Touch (touch), Slay, Spirit Bolt, Wrecker, Urban Renewal,
  Sterilize — identified by compendium source (plus a `flags.sr2e.spellRule = "manual"`
  opt-in for custom spells), and ANY combat spell with `range === "touch"` (R2 #12), get a
  "GM resolves" card with the successes and base level, no automatic damage.

### P1.5 The resistance (R1 #10, #11, #12)
- Dice by kind: living → attribute (+ Spell Defense + unused Magic Pool for ANY magician
  actor with a Magic Pool — characters and NPCs; spirits/critters per their data) + elemental
  aid; vehicle → Body + ⌊armor/2⌋ + Spell Defense (no Willpower, Magic Pool or overstress);
  object (not Ram) → the table value.
- **Exclusive resolution, damage with its receipt, GM-reconciled interruptions (R4 — the
  simpler design).** Identity is `normActorUuid(target)` (the key Spell Defense grants and
  `resolvesAttack` already use); `key = <castTestId>:<normActorUuid>`.
  1. The defense dialog (cancel costs nothing).
  2. **Commit:** `once(target, "spellres:"+key)` (exclusive across clients), then ONE public
     message created with a deterministic id (`claimId(key)`, keepId) in a *pending* state,
     carrying `closesTests: [castTestId]` — from this moment the cast is closed to Karma for
     everyone (R4 #4). `applyKarmaToTest` checks `isTestClosed` at its start AND again just
     before it writes its result; an action that loses the race at that second check REFUNDS
     what it paid (the Karma Pool points, and a permanent burn's Karma) and writes nothing
     (R5 #1). The resolver re-reads the live cast test after the pending message exists and
     records that count (`castSuccesses`) in it.
  3. Spend Spell Defense / Magic Pool and write `flags.sr2e.spellRes[key] = { castSuccesses,
     own, mp, grantIds }` in ONE actor update. Elemental aid (if any) is paid next and its
     result recorded (`aidPaid: n | 0`) in the record.
  4. The resistance test (tagged `spellResTest = key`; rolled closed to after-the-fact
     Karma).
  5. Damage with its receipt in ONE update: people through `commitDamage(..., { extra:
     record.damaged })`; vehicles through a new `commitVehicleDamage(vehicle, boxes,
     { extra })` that writes the flat monitor and the receipt together (R4 #1).
  6. The pending message becomes the outcome (markers `resolves`, `resolvesAttack`,
     `usedGrants`, `closesTests: [castTestId, resistTestId]`).
  - **Interrupted?** A pending message older than STUCK_MS shows the GM exactly which receipts
    exist (spent? aid paid? test rolled — its link? damage landed — boxes?) and ONE button,
    **Mark resolved** (finalizes the outcome text from what landed; nothing re-run). The claim
    stays locked — there is no Release, because a timeout doesn't prove the original client
    stopped (R5 #2). An orphan claim (claimed, but the pending message never appeared) shows
    on the original Resist Spell card for the GM after STUCK_MS as "a resistance started and
    didn't finish — resolve by hand", with Mark resolved. No automatic re-running (R4 #2, #3).
- **Late Spell Defense (R3 #6, R4 #6):** `grantSpellDefense` refuses once a `spellres` claim
  exists for that attack/target (checked inside the granting magician's queue against the
  live target). A grant that still slips in is refunded by ONE executor (R5 #3): when an
  outcome message for that attack appears, a client that owns the granting magician (or the
  GM) takes `once(magician, "grantrefund:"+grantId)` and then writes the refund and its
  receipt (`flags.sr2e.grantRefunds[grantId]`) in one update; whoever loses the claim does
  nothing; an interrupted refund is the GM's to reconcile (the receipt shows whether it
  landed).
- **Karma sync (R3 #4):** after creating cast cards, bounded reconciliation (the
  `_reconcileManipCards` pattern) re-reads the live cast test. Area cards keep their
  per-target scoring.
- Outcome via `combatSpellOutcome` (tie fixed). Result card: "Smith takes Deadly Physical
  (10 boxes) — 3 vs 1 successes (net 2), base Serious." Karma on the RESISTANCE test after it lands
  would not re-stage, so the resistance test is rolled CLOSED to after-the-fact Karma (the
  existing `closed` option; pre-roll Karma dice stay available in the defense dialog) —
  R2 #9.

### P2 Multiple targets (p.129) — after P1 (R1 #5, #6)
- A single-target combat spell with 2+ eligible snapshot targets offers "Split between
  targets". The **allocation ledger** (validated in one pure function before anything is
  spent) holds, per target: Force dice (≥ 1, sum ≤ effective Force), cast Magic Pool, Drain
  Magic Pool, focus and elemental-aid dice for its cast and its Drain, and pre-roll Karma
  dice. Constraints (R2 #3): per CAST test, Magic Pool + elemental aid ≤ Magic Attribute (the
  existing `spellCastDice` ceiling) and Karma dice ≤ that test's rating dice (its Force
  share); per DRAIN test no Magic Pool cap (p.85); in total, Magic Pool ≤ available, focus
  dice ≤ each focus's remaining, aid ≤ the elemental's available Force, Karma ≤ the Karma
  Pool. Totem dice apply to each cast test.
- Forces: `effectiveForce` (restricted spells) is the resistance TN and the cap on the
  split; `actualForce` is each Drain test's Force (the "original, undivided" Drain, p.129).
- One Success Test per target with its share and own TN; one Drain Resistance Test per
  target; one card per target. Centering vs penalties is rolled PER cast test, against that
  test's own modified TN (`centeringTestTN(tn_i, grade)`, R2 #10) — the reduction depends on
  the TN, so one roll can't serve targets with different TNs; Centering vs Drain per Drain test.
- Karma per test via that test's own card (each is an ordinary single-target test).

### Docs and tests
- Vitest: `combatSpellOutcome` (Jason Eldrich p.131; tie; resister more; cap; miscast),
  `combatSpellTarget` (living / vehicle physical / vehicle stun refused / mana vs vehicle /
  object), `spellSituationTN`, `ramEffect` (0 successes → nothing; vehicle Light per
  reduction), `misfire` (empty roll ≠ misfire), the P2 ledger.
- Quench `sr2e.combat-spells`: tie → base level; Sleep → Stun via the field; vehicle TN 8 and
  Body + ½ armor; mana vs vehicle refused; Powerball over a vehicle → its own card; per-target
  cover in one Manaball; LOS unchecked → excluded; misfire → Drain TN +2; 0-success card
  revived by Karma; NPC magician adds Magic Pool; two clients' resolve → one claim wins;
  migration sets damageType; a Grimoire special → GM card; P2: split dice, two Drain tests.
  Plus (R2): target then cast at once (snapshot sees the new target); an interrupted
  resolution finished by the GM without re-spending; Karma on the cast during the defense
  dialog is used; an old-pack Stun Bolt created with a blank type becomes stun; a misfire
  with Avoid an Oops → ordinary failure, no +2; area: cancel at dialog 2 spends nothing.
  Plus (R3/R4): an interruption after the spend (stub the next step to throw): the GM card
  lists what landed and Mark resolved never re-spends or re-damages; vehicle damage and its
  receipt land together; an unlinked target's grant
  matches; Karma spent while a cast card is being created reaches it; a grant after the
  claim is refused/refunded; two clients pressing Avoid an Oops → one decision; two GMs
  applying Ram → one application.
  Plus (R5): Karma paid then rejected at the closure → refunded; a delayed original worker
  while the GM looks at an interrupted card → no second resolution; claim made then the
  pending message fails → orphan shown to the GM; two owners of a granting magician → one
  refund; Karma during Ram application → refused/refunded.
- CHANGELOG, QA-PLAN, wiki Magic page.

## Key decisions & tradeoffs
- Situation modifiers are exactly p.130's (injury, cover, visibility, magical barriers/
  circles/lodges, sustaining). Running/walking rows are not applied (open question).
- Visibility uses the book's table with a vision type the caster picks; it never permits an
  unseen target.
- Resistance Karma after damage stays as weapons do.
- Special Grimoire spells → GM-resolved, not approximated.

## Out of scope
- Spell stacking; astral-plane casting cases (p.149, dual-natured targets); Grimoire
  special-case spells beyond ordinary handling; drain/health/illusion/detection changes.
