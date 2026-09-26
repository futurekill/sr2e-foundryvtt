# Plan: Substance use and abuse — the full lifecycle (Shadowtech p.85–88, p.95, p.99, p.100)
_Round 5 — event ledger (R1) plus the Round 2–5 amendments at the end; a later round wins. MAX_ROUNDS reached: one open decision (R5 #7) awaits the user._

Builds on docs/PLAN-drugs.md (lean core) and docs/PLAN-drugs-full.md
(absorption, overload, TNs, overuse). All rules read from rendered pages.

## Rules (rendered pages)

**Ratings and doses (p.87).** Every drug has Addiction, Tolerance and Strength.
- "Every time the number of applications taken/administered equals a multiple
  of the compound's Strength Rating, add +1 to both the Addiction and Tolerance
  Rating." These become that character's ratings for that drug.
- "Every 30 minus the drug's Strength days of uninterrupted non-drug use (for
  that particular drug), Addiction and Tolerance Ratings are reduced by 1",
  never below the base ("clean period").
- Tests (after the effects wear off): Addiction — Body (P) / Willpower (M) vs
  the current Addiction Rating, one success to stay unaddicted, a separate test
  per type. Tolerance — Body vs the current Tolerance Rating; no successes =
  permanently immune to the substance's effect. "Characters who are addicted
  and who acquire immunity go into immediate withdrawal."

**Addicted (p.87).**
- Needs a dose every Body × 4 hours (physical) / Willpower × 4 hours (mental).
- The period can be extended ONCE by another Body/Willpower hours with a
  successful Body/Willpower Test vs the current Addiction Rating.
- Missing it → immediate (forced) withdrawal.
- For every week addicted: −½ Essence (permanent) and −1 box from BOTH
  monitors' maximum. Dies at Essence 0, or when damage exceeds the new maximum.

**Forced withdrawal (p.88).** Not a recovery.
- Losses keep accruing.
- +3 to all TNs (+6 to Concentration skills, including spellcasting).
- "Behave as if suffering … a persistent Moderate mental wound. This status is
  his/her minimum Damage Level": damage penalties to Initiative and TNs.
- A dose removes it at once, and the current Addiction Rating +1.
- Every 24 hours without a dose: Addiction −1 (never below base); still
  addicted, still in withdrawal until dosed.

**Recovery (p.87–88).**
- Only when the GM feels it's warranted; one substance at a time.
- Starts with a Willpower Test vs current Addiction +1 (mental), +3
  (physical), +4 (both). Successes may be bought with Karma.
- During it: addiction losses halted (not removed); +2 all TNs (+4
  concentration incl. spellcasting).
- A dose → addicted again, Addiction +1.
- Addiction drops 1 every three days; at base, no longer addicted. Essence
  loss halted permanently; lost Essence never returns.
- Then **rest** for a time equal to the Addiction Rating **in weeks** (user
  ruling 2026-09-26: the book gives no unit; weeks "makes the most sense in
  context"). During rest: +1 all TNs (+2 concentration); one physical and one
  mental lost box return every three days; after the full period all penalties
  go. Only then "cured".
- Magic can't aid recovery. Cleansing therapy (GM) removes physical
  addictions and returns lost boxes; no help for mental.

**Kamikaze (p.99).** "Every four applications of the drug permanently subtract
one box from the maximum of both the Physical and Mental Condition Monitors."
"After a number of uses equal to half the character's Body (round down), the
character's bioware and cyberware will no longer function."

**ACTH (p.95).** Once administered, "it instantly activates the adrenal pump".
Not addictive; tolerance builds.

**MAO (p.100).** With an active adrenal pump: Level 1 gets only the Reaction
bonus; Level 2 gets its normal Reaction bonus but other attributes as Level 1
(+1 Quickness, +1 Strength, +1 Willpower). Further doses have no effect until
flushed out.

## Design — an event ledger, state derived

### 1. Why a ledger
Owners (a dose, a test), the GM (recovery, therapy) and time all change a
substance. Stored, mutable state (clocks, ratings, status) would be written by
several clients and races on every field (R1 #1–#5, #15–#17). Instead:
- **Events are append-only**, each under its own key:
  `flags.sr2e.substanceLog.<eventId> = {v: 1, t, drug, type, …}`. Foundry
  merges flag updates by key, so two clients adding events never collide. An
  event is only ever rewritten by its own writer (a Karma reconcile, below).
- **All state is a pure fold**: `substanceState(events, drugs, now)` in the rules
  module replays the events in time order and returns, per drug: uses, current
  Addiction/Tolerance, addicted {P, M}, immune, state, deadlines, boxes lost,
  Essence lost, implants failed, and the list of timed steps that happened.
  Same events + same `now` → same result, on every client, so ticks need no
  writes and a big time jump equals many small ones by construction.
- **World time is the clock**: rewinding world time rewinds the derived state
  (a stated consequence; the log itself is unchanged).

### 2. Events
| type | written by | payload |
|---|---|---|
| `dose` | Use a dose (owner) | exposureId; drug snapshot {addiction, tolerance, strength, P, M} (base); natural Body and Willpower at the dose |
| `test` | Addiction/Tolerance roll | exposureId, kind (P/M/tolerance), TN, successes, messageId |
| `extend` | owner, once per dose window | successes, messageId |
| `recovery` | GM | successes, TN, messageId |
| `therapy` | GM | kind: "cleansePhysical" / "geneCleanse" |
| `edit` | GM | a patch {addiction?, tolerance?, clearAddiction?} — the manual escape hatch |

Event ids: the exposureId for a dose (so a retried write is the same key);
`<exposureId>_<kind>` for a test (a re-roll of the same test overwrites itself,
it can't stack); random for the rest. `v: 1` versions the shape; the fold
ignores unknown versions and types (logged once).

**Karma** (R1 #8): a test/extend/recovery event stores its messageId. When that
success-test card's total changes (the existing Karma buttons), the writer of
the event updates its `successes` from the card; the fold always uses the
event's stored value. No other event depends on a roll.

### 3. The fold (transition table)
Replayed in time order; ties: dose → test → extend → recovery → therapy →
edit. Timed steps are computed from the previous event and applied before the
next event, so every event sees the elapsed consequences first (R1 #4).

| state | enters when | timed rules while in it | leaves when |
|---|---|---|---|
| none | start; rest completes | clean period: every max(1, 30 − S) days since the last dose, Addiction & Tolerance −1 (≥ base) | an addiction test fails → addicted |
| addicted | a failed P or M test | weekly: −½ Essence, −1 box both tracks, counted from entry (accrued fraction kept across states); dose window = min over P/M of (Body or Willpower at the last dose) × 4 h, plus the one extension if its test succeeded | window passes → withdrawal; immune → withdrawal |
| withdrawal | missed window; addicted + immune | weekly losses continue; every 24 h without a dose Addiction −1 (≥ base) | a dose (not immune) → addicted, Addiction +1, new window |
| recovery | GM event with a successful test, only if no other drug is in recovery or rest (one substance at a time) and it's addicted/withdrawal | weekly losses paused (the accrued fraction is kept); every 3 days Addiction −1; at base → rest at once (also if entered at base) | at base → rest; a dose → addicted, +1 |
| rest | Addiction reaches base | length = base Addiction **weeks** (user ruling); every 3 days one box returns (both tracks), never more than lost | full period → none (cured); a dose → addicted, +1 |

- Entering rest clears addicted {P, M} ("no longer addicted").
- **Doses** always: uses +1; every Strength-th use, Addiction & Tolerance +1.
- **Immune** is sticky; an addicted immune character stays in withdrawal — a
  dose while immune has no effect and doesn't end withdrawal (R1 #6).
- **Addiction and immunity are sticky** until recovery/therapy/edit: a later
  passing test changes nothing (R1 #7).
- **Cleansing therapy** clears P only; if M remains, the state and windows are
  recomputed from M alone (Willpower × 4 h); boxes lost return (R1 #10).
- **Gene cleansing** clears immunity.

### 4. Kamikaze wasting and implant failure (R1 #12–#14)
- Wasting: ⌊Kamikaze uses ÷ 4⌋ boxes off both maxima (permanent, not
  restored by rest or therapy — it's metabolic damage, not addiction loss).
- Implant failure **latches** at the first Kamikaze dose where uses ≥
  max(1, ⌊natural Body at that dose ÷ 2⌋); nothing un-latches it but a GM edit.
- One predicate, `implantsWork(actor)`, gates every passive and activated
  implant function: `_collectItemModifiers` (character and NPC paths), armour,
  the woundPenalty compensator/pain-editor scan, skillsoft capacity and chip
  slots, triggered activation (the pump), VCR/tactical computer. Essence and
  Body Index keep counting (the implants are still there).
- Every one of those derivations is assigned in both directions each prepare,
  and a Quench test flips normal → failed → edited back on the same documents.

### 5. Derived effects
- Monitors: max = 10 − (addiction boxes lost + wasting), floored at 0, character
  and NPC. When damage exceeds the new maximum, or Essence reaches 0, the
  derived `substanceDeath` reason is set; the sheet and a card say the
  character dies (R1 #11). No damage is synthesised.
- Essence: Σ Essence lost added to `mods.essenceLoss` (autoEssence off: the
  card reports it for the GM).
- `woundPenalty`: Stun counted as max(stun, 3) while any drug is in
  withdrawal (Initiative follows).
- `addictionTN` in `testTnModifiers`: the worst state across drugs —
  withdrawal +3 (+6 on spellcasting), recovery +2 (+4), rest +1 (+2). Ritual
  stages excluded; centrable; named in the breakdown.
- MAO × pump (p.100), while MAO is in force and a triggered pump is active:
  Level 1 → only its Reaction bonus (+2); Level 2 → its Reaction bonus (+4),
  Quickness/Strength/Willpower +1 each (Level 1's).
- `prepareDerivedData` folds at `game.time.worldTime`; `updateWorldTime`
  re-prepares actors with a log (world actors and every loaded token actor).

### 6. Actions and their writes
- **Use a dose**: the dose event is written in the same update as the
  absorption counter, BEFORE the effect; if the effect create fails, the event
  is removed (compensating write). Immune → no effect/absorb/TN (toxin damage
  still applies: immunity is to the effect — stated reading). ACTH, not
  immune: activates an installed, inactive, working pump; none → card note.
  MAO already in force: no new effect (the Stun still applies).
- **Addiction/Tolerance** button: enabled once the exposure's effect is ended
  or expired; prefilled with the folded ratings (the GM may edit the TN);
  cancelling writes nothing.
- **Extend** (owner): only in the addicted state, once per window; Body or
  Willpower (the dependency's) vs current Addiction.
- **Begin recovery** (GM): the Willpower Test at Addiction +1 (M) / +3 (P) /
  +4 (both); written only on success (Karma may add successes later, which
  the reconcile carries).
- **Therapy / Gene cleansing / Edit** (GM).
- **Reports**: the active GM (`game.users.activeGM`) posts one card per actor
  for newly passed steps, tracked by a high-water mark
  (`flags.sr2e.substanceReported = t`) — best-effort, after state is already
  correct everywhere; a duplicate card is harmless.

### 7. Display
"Substances" on character and NPC gear tabs: per drug — uses, Addiction /
Tolerance (base), P/M, immune, state and next deadline ("dose due in 3 h",
"withdrawal since …", "recovery: 5 → base 4, next drop in 2 days", "rest: 3
weeks left"), buttons per role. Monitors show their reduced maximum.

## Tests
- Unit, the fold (pure, the heart of it): Strength-multiple increments; clean
  period (S = 4 → 26 days; S ≥ 30 clamps to 1 day); P/M windows with snapshot
  Body/Willpower, shorter wins, one extension; addicted → withdrawal at the
  deadline; weekly losses (2 weeks → 1 Essence, 2 boxes) across withdrawal,
  paused in recovery with the fraction kept; withdrawal 24 h drops floored at
  base; recovery 3-day drops → rest (and immediate rest at base); rest 1 box / 3
  days, cured after base weeks; a dose in every state; addicted + immune stays
  in withdrawal; sticky addiction; therapy P-only with M remaining; one
  recovery at a time; one big `now` equals stepping through; tie ordering;
  unknown event versions ignored; implant latch; wasting.
- Unit: MAO × pump exact values L1/L2 (before, during, after); addiction TN by
  state and kind; withdrawal Stun floor.
- Quench: dose → tests → addicted → advance world time past the window →
  withdrawal on the sheet, +3 on a skill roll, Initiative shows the Moderate
  floor; a dose restores (+1); GM recovery (a Karma buy after the roll counts)
  → rest → boxes return → cured; Kamikaze ×4 → maxima 9/9; implants fail and
  every gated path stops (Initiative, armour, skillsoft), Essence unchanged,
  then a GM edit restores them on the SAME documents; ACTH activates a pump;
  MAO L1/L2; two clients' events never overwrite (two concurrent event writes
  both survive); NPC and unlinked token logs separate and correct after reload;
  a failed effect create leaves no dose event; shrinking maxima below damage →
  death flagged.

## Risks / open questions
- The weekly Essence loss makes Magic drop (derived from Essence) — intended.
- Rewinding world time rewinds derived state (time is the source of truth).
- Event logs grow with every dose; the fold is O(events), fine for play.
- `autoEssence` off: Essence isn't derived, so the loss is only reported.
- With no GM connected, state is still exact on every client; only the
  chat reports wait for a GM.

## Out of scope
"Dosages required … begin to increase" and toxic overdose levels (flavour, no
numbers); Resist Pain's relief (GM); the psychological side of recovery
(modifiers for peer support etc. — the GM edits the TN).

## Round 2 amendments (Codex R2) — these override sections 1–7

1. **Action concurrency** (R2 #1): resource-consuming owner actions (a dose,
   an extension) keep the system-wide contract used by every other spend
   (Karma, pools, ammo, the drug lean core): one person drives an actor, and a
   per-actor local queue serialises that client (MAO's "already in force"
   check runs inside it). GM-only events (recovery, therapy, edit) consume
   nothing. Stated limit, same as docs/PLAN-drugs-full.md.
2. **Total, causal order** (R2 #2): every event carries `t` (world time),
   `at` (the writer's `Date.now()`) and its id. The fold sorts by (t, at, id):
   within one world instant, wall-clock order is the observed order; the id
   breaks true ties deterministically. The type-based tie order is dropped.
3. **Rolls are claimed once and finalised** (R2 #3–#5):
   - Every substance roll (addiction P/M, tolerance, extend, recovery) is
     written as an event whether it succeeds or fails, keyed
     `<exposureId>_<kind>` / `<windowId>_<dep>_extend` / random for recovery.
     If that key already exists, the button refuses a fresh roll.
   - Karma on its card updates the event's `successes` (reconcile by
     messageId, done by the client that changes the card, which owns it).
   - **Finalisation**: any later substance action on that actor first closes
     its open substance cards (the existing closed-test mechanism), so a result
     can't change after something depended on it. The fold uses stored values.
   - Recovery eligibility is decided by the finalised result: a failed attempt
     that Karma turns into a success starts recovery at the attempt's `t`.
4. **Clean period, as quoted** (R2 #6): independent of state. Every
   (30 − Strength) days since the last committed dose of that drug, Addiction
   AND Tolerance −1, never below base. It overlaps withdrawal's 24 h and
   recovery's 3-day Addiction drops; they all apply (each is its own rule),
   floored at base. Strength ≥ 30 has no clean period (no printed drug has
   one) and the sheet says so; no invented interval.
5. **Relapse keeps the dependency types** (R2 #7): entering rest stores the
   P/M it had in `relapseTypes`; a dose in rest restores exactly those.
6. **Per-dependency windows** (R2 #8): a dual addiction has a P window (Body ×
   4 h) and an M window (Willpower × 4 h), each opened by the committed dose
   (windowId = that dose's id). An extension event names `{windowId, dep}`,
   one per dependency per window; the fold ignores one whose window isn't the
   current one. Withdrawal starts when EITHER dependency's deadline passes.
7. **Test gating** (R2 #9): the Addiction/Tolerance button needs a committed
   dose whose exposure is NOT in force (`drugsInForce`: disabled/ended, or
   zero-duration) — the same condition attributes, absorption and TNs use.
8. **Resumable dose operation** (R2 #10): the dose event is written first with
   `status: "pending"` and a stable exposureId, then the effect, then
   `status: "committed"` (with the dose spend). The fold counts only committed
   doses. On ready, the owner's (else the active GM's) client resolves stale
   pending doses: an effect carrying that exposureId exists → commit; else →
   `aborted`. Tests can only attach to committed doses.
9. **Rewind** (R2 #11): events always count; only timed progress uses
   `max(0, now − t)`. Rewinding world time pauses or reverses timed steps but
   never un-does a dose, so the fold agrees with the spent inventory and
   effects. A real correction is a GM `edit`.
10. **Death is latched and adjudicated** (R2 #12): the fold tracks the lowest
    monitor maximum and Essence reached since the actor's last report, and
    the active GM's report compares current damage to that minimum. A lethal
    step writes a `death` event (reason, t) and posts the card; the sheet
    shows it until a GM edit clears it. Test: one jump through a fatal loss
    and into rest's restoration still reports the death.
11. **Edit / baseline events** (R2 #13): `edit` accepts, each validated:
    `addiction`, `tolerance` (≥ base), `clearAddiction` (P/M), `clearImmune`,
    `restoreImplants`, `clearDeath`, and `baseline {uses, kamikazeUses,
    boxesLost, essenceLost}` for importing an existing character's history.
    Permanent losses change only by an explicit baseline edit.
12. **Identity and legacy** (R2 #14): the drug key is canonical (MAO + MAO
    Injector are one substance). Base ratings come from the drug's FIRST
    committed dose snapshot (later item edits don't rewrite history; deleting
    the item changes nothing). A legacy card (no dose event) can still roll its
    tests; its test event carries the card's snapshot, which acts as the base
    when that drug has no dose event yet.
13. **Safe re-preparation** (R2 #15): the world-time hook calls
    `actor.reset()` (a full prepare from source, never `prepareDerivedData`
    alone) on world actors and on instantiated unlinked token actors
    (deduplicated by uuid); an unlinked token on an inactive scene folds when
    it's next prepared. Quench: 20 time ticks leave armour, Initiative and
    chipped ratings unchanged on a character and an NPC.
14. **Reports by transition identity** (R2 #16): each derived step has an id
    `drug:type:t:eventRevision`; the active GM keeps
    `flags.sr2e.substanceReported` as a map of reported ids (pruned to the
    last 200). A late event or Karma revision produces new ids, so the
    correction gets reported; a rewind never re-reports.
15. **Tests added**: conflicting-action queueing on one client; permuted
    event arrival gives the same fold; frozen world time sequences ordered by
    `at`; a failed recovery turned by Karma; an interrupted dose resolved on
    ready (both ways); a jump through death and restoration; a re-roll refused.

## Round 3 amendments (Codex R3) — override R2 where they differ

1. **Logical order** (R3 #1): every event has `seq` = 1 + the highest `seq`
   the writer's client has seen for that actor (a Lamport counter), then
   `at`, then id. An action taken after observing another always sorts after
   it; equal `seq` means genuinely concurrent, broken by (at, id).
2. **Commit first, side effects after, each with a receipt** (R3 #2–#3;
   replaces R2 #8's pending/aborted):
   - After the duration roll, ONE actor update does the spend and the record:
     the dose event (`committed`), the item's quantity − 1 (an embedded update
     in the same `actor.update({items: [...]})` call), and the absorption
     counter. Either all land or none.
   - Then the side effects, each idempotent and receipted on the dose event:
     `receipts.overuse` (the Light Stun), `receipts.effect` (the Active Effect,
     found by exposureId before creating), `receipts.pump` (ACTH), `receipts.card`.
     Immune, repeat-MAO and zero-duration doses record `effect: "none"` on
     purpose, so "no effect" is never mistaken for a failure.
   - On ready, the owner's client (else the active GM's) finishes any committed
     dose with a missing receipt. Nothing is ever aborted or un-spent.
3. **Rolls apply when finalised, at the finalise time** (R3 #4–#5):
   - A substance roll writes its event `open`. The fold ignores open events.
   - It is finalised by its card's Finalise button, by any later substance action
     on that actor, or by the GM client when world time advances. Finalising
     reads the authoritative card total (`testTotalSuccesses`), writes
     `{successes, final: true, tFinal}` in one update and closes the card.
   - The fold applies it at `tFinal`: Karma bought before finalisation counts;
     nothing after it; and nothing is rewritten back into play that happened in
     between. No per-Karma sync write, so no two-write drift.
4. **Monotonic substance clock** (R3 #6; replaces R2 #9): an event's `t` =
   max(world time, the latest event `t`); the fold's `now` = max(world time,
   the latest event `t`). Rewinding world time freezes substance progress until
   time passes the last event again; history is never reinterpreted. A real
   correction is a GM `edit`.
5. **Death** (R3 #7–#8; replaces R2 #10):
   - **Essence 0** is decided by the fold itself (Essence history is entirely
     in the ledger) and is shown at once.
   - **Monitor** death is a *candidate*: the GM report shows the lowest maximum
     reached since the last report beside the current damage, with a
     "Confirm death" button (GM). Only that confirmation writes a `death`
     event, naming the ledger `seq` it reviewed. Reporting never writes death
     on its own.
6. **Reports** (R3 #9; replaces R2 #14's pruning): `substanceReported` keeps
   every reported step id (`drug:type:t`), unpruned — a campaign produces
   dozens, not thousands. A revision that changes a step changes its id, so the
   correction gets reported; nothing old re-reports.
7. **Legacy cards are informational** (R3 #10; replaces R2 #12's legacy path):
   a pre-ledger card can't roll substance tests. The GM can import a history
   with a `baseline` edit carrying the drug key, Strength, base and current
   ratings, uses and the last dose time.
8. **Cleansing therapy transitions** (R3 #11), GM, per substance:
   - not physically addicted (M only, or none) → no effect; the card says so;
   - P only → P cleared, state none, all boxes lost to this substance return;
   - P + M → P cleared, boxes return, M remains (its window and weekly losses
     continue);
   - in rest → P removed from `relapseTypes`, the remaining lost boxes return.
   Essence never returns.
9. **Tests added**: same-`seq` concurrency vs sequential ordering; a GM clock
   behind the owner's; interruption after the commit (every receipt resumes,
   once); immune/no-effect doses complete; Karma before vs after finalisation
   (after world time advanced it no longer counts); both death counterexamples
   (capacity restored before the damage → no candidate; healed before the
   report → still a candidate for the GM); more than 200 reports.

## Round 4 amendments (Codex R4) — override R2/R3 where they differ

1. **Persisted substance clock** (R4 #1): `flags.sr2e.substanceClock` = the
   highest world time the substance rules have processed for that actor. The
   active GM raises it (never lowers it) on every world-time advance, even with
   no event. The fold's `now` = max(world time, substanceClock, latest event
   `t`). A rewind after an event-free advance freezes progress; it never undoes it.
2. **Essence death uses the real total** (R4 #2): the current check is the
   derived `essence.value` (cyberware, bioware and the drug losses together)
   ≤ 0. A past zero that a jump passed through is a GM-confirmed candidate,
   like monitor death (below).
3. **The commit is ONE item update; the plan travels with it** (R4 #3–#4;
   replaces R3 #2's actor-update commit). Probed live: `actor.update({items:
   [...]})` is NOT atomic (a failing item change still wrote the actor's flags,
   and it added an item), so it isn't used.
   - The dose's single atomic write is on the drug item: `quantity − 1` plus
     `flags.sr2e.doseCommits[exposureId] = plan`. The plan is the whole
     decision made at that moment: `{t, seq, drugSnapshot, body, willpower,
     overuse: bool, effect: {name, changes, duration, flags} | {none: reason},
     absorb, pumpItemId | null}`.
   - Then, each idempotent with durable evidence, in order:
     - the ledger event on the actor (key = exposureId, carrying the plan);
     - the absorption counter, in the same actor update as the ledger event;
     - overuse: `commitDamage(actor, "stun", 1, {extra: {receipt}})` — the
       damage and its receipt are one update;
     - the effect: created with a deterministic id derived from exposureId,
       so "exists" is checkable. Its receipt is also written when it's ended
       (`endDrug`) or deleted (a `deleteActiveEffect` hook on the owner's
       client), so a later resume never recreates an effect the player ended;
     - ACTH: `pump.update({"system.active": true, "flags.sr2e.acthExposure":
       exposureId})` — activation and its receipt in one item update;
     - the card: `cardFor(...)` already makes it idempotent.
   - On ready, the owner's client (else the active GM's) scans the drug items'
     `doseCommits` and completes each missing step from the STORED plan, never
     re-deciding from current state. A resume test covers an interruption
     after every step.
4. **Open rolls resolve before time moves, at their roll time** (R4 #5–#6;
   replaces R3 #3's "apply at tFinal"): an open substance roll applies at its
   roll `t`/`seq`. It is finalised (Karma window closed) by its Finalise button,
   by any later substance action, or by the active GM immediately BEFORE it
   raises `substanceClock` for a time advance. Finalising: close the card (the
   existing closed-test flag, which every Karma path already refuses), then
   read the card total and write `{final: true, successes}`. So a roll made
   before a jump counts at its own time, and Karma can't touch it once time
   has moved. Stated limit: a Karma spend racing the GM's finalise from
   another client in the same instant falls under the one-driver contract.
5. **Karma and a failed roll** (R4 #7): buying successes needs at least one
   natural success (SR2 core, `applyKarmaToTest`). The recovery quote ("may be
   purchased with earned Karma") names the purchase, not an exception, and a
   Willpower Test needs only one success to succeed, so Karma can never turn
   a 0-success recovery into a success. The "failed recovery turned by Karma"
   test is dropped; a test instead asserts the extra successes are recorded.
6. **Therapy in rest** (R4 #8): the rest branch is checked first and needs P
   in `relapseTypes`; without it, no effect.
7. **Report ids carry their content** (R4 #9): `drug:type:t:hash(payload)`.
   When a previously reported id disappears from the fold, one "correction"
   line says that step no longer applies, and it's recorded as reported.
8. **Monitor death is always an adjudication prompt** (R4 #10): whenever the
   lowest maximum since the last report is below current damage, OR it fell
   while the character carried damage, the GM gets "Check: capacity fell to N
   (damage now D) — did this character die?" with Confirm/Dismiss. Both
   ambiguous histories produce that labelled prompt (tested); nothing is
   decided automatically.

## Round 5 amendments (Codex R5 #1–#6) — override earlier rounds

1. **Commits belong to their actor** (R5 #1): a commit records `actorUuid`
   and is ignored anywhere else; `preCreateItem` strips `doseCommits` from a
   copied or transferred item; `preDeleteItem` refuses to delete a drug item
   with an unreconciled commit (a warning, after trying to reconcile it).
2. **Drain before acting** (R5 #2): every substance action first completes the
   actor's unfinished commits, inside the per-actor queue, and refuses to go
   on if one can't complete.
3. **One clock for events and the fold** (R5 #3): an event's `t` =
   max(world time, `substanceClock`, the latest event `t`).
4. **Substance time moves only through the frontier** (R5 #4): the fold's
   `now` = max(`substanceClock`, the latest event `t`), never world time
   directly. Only the active GM advances `substanceClock`, after resolving
   open rolls. No GM connected → substance time waits (only GMs advance world
   time anyway), and the sheet says "waiting for the GM".
5. **Effects are never resurrected across sessions** (R5 #5): `endDrug` writes
   an end tombstone to the ledger BEFORE deleting. Resuming in the same
   session (the drain) may recreate a missing effect with no tombstone. On a
   new session, a committed effect that's missing with no receipt is marked
   `lost`, and its card offers the GM "Re-apply". Losing a buff to a crash is
   recoverable; resurrecting an ended one isn't.
6. **Historical death is always the GM's call** (R5 #6): any unreviewed fall in
   monitor capacity or drop in Essence since the last review raises the
   labelled adjudication prompt with the numbers, whatever the damage is now.
   Only a current total Essence ≤ 0 is shown at once.

## OPEN — R5 #7, for the user: when does a substance roll stop taking Karma?
The conflict: Karma may buy successes on these rolls (p.87), but results must
be settled before time advances, or bought successes rewrite weeks of past
losses. An automatic GM finalise at time advance can race an owner's Karma
spend on another client. Options:
- **A. Karma closes when time moves (Claude's pick).** No finalise write at
  all: a roll counts at its own time with its card total, and the Karma buttons
  refuse once `substanceClock` has passed the roll. Residual risk: only a spend
  sent within the network-latency instant of the GM's time advance.
- **B. Explicit finalise.** The roller must press Finalise (or take another
  substance action) before the GM can advance substance time. No race, but the
  GM's time advance is blocked on players' open rolls.
- **C. No Karma on substance rolls.** Simplest and race-free, but drops the
  printed allowance.
