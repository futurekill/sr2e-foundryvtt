# Plan: elementals aiding sorcery (Aid Sorcery + Spell Sustaining)
_Round 5 — final: simplified plan + guards G1–G10 (MAX_ROUNDS reached; G8–G10 adopted, not re-reviewed)_

## Goal
A mage's bound elementals can help with spells as the core book describes. There are two
services, both used from the cast dialog and the spell row:
- **Aid Sorcery:** extra dice.
- **Spell Sustaining:** the elemental holds a sustained spell so the mage takes no +2 TN.

## Rules (rendered from the corrected 11th printing, pp.139–142)
- **Who.** Only a mage summons elementals (p.139). Nature spirits (shamans) serve only by using
  their powers: "To perform a service, a nature spirit will use one of its powers" (p.140). There
  is no core rule for nature spirits aiding sorcery or sustaining spells, so **shamans get nothing
  here**.
- **Services** (p.141): aid sorcery, aid study, spell sustaining, physical service, remote
  service. "Each of these costs one of the elemental's services to initiate." Commanding a
  service takes a Simple Action.
- **Aid Sorcery** (p.141):
  - "The elemental acts like an auxiliary Magic Pool of dice the magician can use at any time
    until the spirit is used up and disappears. Each point of Force bestows one die."
  - The dice "do not refresh, but they may be used to augment any test at any stage in
    sorcery, including Spell Defense", and must be "allocated at the same time and in the same
    manner as Magic Pool dice".
  - Category by element: fire → combat, water → illusion, air → detection,
    earth → manipulation. **None aids health spells.**
  - "Its Force is reduced by 1 for each die used for Aid Sorcery. When the spirit's Force is
    reduced to 0 through use, it vanishes. It can be called again if it is still bound. Doing so
    requires another Complex Action, and in this case costs one service. The elemental is,
    however, back at full Force when it arrives."
  - It may do this in astral form.
- **Spell Sustaining** (p.142):
  - "use its Force to sustain one spell in the appropriate category. The elemental can maintain
    the spell for one Combat Turn for each point of Force it has. Once its Force reaches 0, it
    disappears."
  - The mage can take the spell back before that happens.
  - Long-term binding: "a number of days equal to its Force", which permanently reduces Force by
    1 per day. **Out of scope** (GM-tracked).
  - "Once an elemental has been commanded to [sustain] a spell, it cannot perform any other
    service until this service is ended."
- Already in the code: `CONFIG.SR2E.elementalTypes` = { fire: combat, water: illusion,
  air: detection, earth: manipulation }. An elemental actor has `spiritType: "elemental"` and
  `domain` = its element. The mage's `system.boundSpirits` lists spirit UUIDs.

## Approach
1. **Schema (SpiritData)**, all additive with safe defaults:
   - `forceUsed: Number(0, min 0)`. The current Force is `force − forceUsed` ("reduced by 1 per
     die"), and `force` stays the full Force the spirit comes back at.
   - `aidActive: Boolean(false)`. An Aid Sorcery service has been paid for this call.
   - `sustainingSpellUuid: String("")`. The spell it is holding (a spell item uuid on the mage).
   - Derived `currentForce = max(0, force − forceUsed)`.
   - Decision: attributes and powers keep deriving from the full `force`. The book only says its
     "Force is reduced" for aid purposes. Re-deriving stats would weaken a combat elemental
     mid-fight and ripple into its sheet, which the book does not clearly ask for.
     **Contestable.**
2. **Pure rules (sr2e-rules.mjs + Vitest):**
   - `elementalAidsCategory(element, category)` returns true only for the element's own
     category; health is never aided.
   - `aidSorceryAvailable({ force, forceUsed, services, aidActive })` returns
     `{ dice, needsService, usable }`.
     - `dice` = the current Force.
     - Starting aid needs `services ≥ 1` if not already active.
     - A vanished spirit (current Force 0) needs a service to re-call. Re-calling resets
       `forceUsed` to 0 and consumes the service.
   - `applyAidSpend(state, dice)` returns the update: forceUsed += dice. When the current Force
     hits 0 it sets `aidActive: false` (vanished).
3. **Cast dialog (Dice tab):** a new "Elemental aid" block listing bound elementals where
   `elementalAidsCategory(domain, spell.category)` holds.
   - Each shows its current Force, services and status (active / needs a service / vanished).
   - Each has two inputs sharing the elemental's dice, mirroring the focus rows:
     `elem_cast_<id>` and `elem_drain_<id>`.
   - A vanished elemental shows "re-call: costs 1 service (restores full Force)", as a checkbox.
   - The preview (`spellCastDice`) gains an `aidCast` term added to `baseDice`. It is not rating
     dice, so it does not raise the Karma cap. Drain adds `aidDrain`.
4. **Roll (`_rollSpellcast`)**, before any spend:
   - Re-read each requested elemental via `fromUuid`, and require:
     - it is bound to this caster (uuid in `boundSpirits`, and `conjurerUuid` matches);
     - its type is elemental and its category matches;
     - the caster owns it.
   - Clamp: cast + drain ≤ current Force, or ≤ full Force if a re-call is requested and a
     service is available.
   - Spend order:
     - service (if starting or re-calling);
     - `forceUsed`;
     - `aidActive`;
     - a chat note: "Fire elemental aids: +3 dice, Force 6 → 3".
   - Persist before rolling, like foci.
   - The elemental's dice join the spell test as a separate source label ("Aid Sorcery") in the
     dice breakdown, and the drain test the same way.
   - An elemental that is sustaining a spell is ineligible ("cannot perform any other service").
5. **Spell Sustaining:**
   - A new action on a sustained spell row (next to the spell-lock toggle): "Elemental sustains".
     It opens a picker of eligible bound elementals: same category, not sustaining, current
     Force ≥ 1, services ≥ 1 or already under an active command. Paying costs 1 service.
   - It sets `spell.system.elementalSustainUuid` (new item field) and the spirit's
     `sustainingSpellUuid`.
   - `sustainPenalty` (CharacterData + NPCData) skips spells with `elementalSustainUuid`, like
     `spellLocked`.
   - Turn countdown: on the `combatRound` hook (GM client only), each sustaining elemental in a
     combat… **Problem:** the elemental need not be a combatant.
     - Choice: decrement every sustaining elemental bound to any combatant's actor, on each new
       round (`updateCombat` round change, active GM).
     - forceUsed += 1. At current Force 0: clear the spell's `elementalSustainUuid` (the spell
       drops back to the mage's own sustaining, so the penalty returns) and post "the elemental
       vanishes; X now sustains the spell or drops it".
     - **Contestable:** should the spell end instead? The book says only "it disappears". The
       mage can take over before it goes. Returning it to the mage (with the +2 TN penalty) is
       the conservative automation.
   - Manual controls on the spirit sheet: "End sustaining" (the mage takes it back), and
     "−1 turn" for time spent outside combat.
6. **Spirit sheet:** show current Force / full Force, aid status, and the spell being sustained.
   Add a "Re-call (1 service)" button that resets `forceUsed`.
7. **Tests:**
   - Vitest: category mapping, availability, spend/vanish/re-call math, and the preview with
     `aidCast`.
   - Quench:
     - a fire elemental aids a combat spell (dice +N, Force drops, service charged once, then
       active);
     - a water elemental is not offered for a combat spell;
     - aid to 0 → vanished → re-call costs a service and restores Force;
     - sustaining removes the penalty; a round change drains Force; at 0 the penalty returns;
     - an unbound or foreign elemental is refused at roll time.
8. **Migration:** none needed. New fields have defaults and nothing existing changes meaning.

## Round 1 revision (supersedes Approach §1, §4–§6 and the related decisions where they conflict)

### State model: one authoritative service state, one transition function
- **SpiritData (additive):**
  - `called: Boolean(false)`. The elemental has been called and is here (astral or manifest).
  - `service: String("")`, one of `""` / `"aid"` / `"sustain"`. The ONE current service
    (p.141: "can only perform one service at a time").
  - `forceUsed: Number(0)`.
  - `sustainingSpellUuid: String("")`.
- **Derived:** `effectiveForce = clamp(force − forceUsed, 0, force)` (clamped, so a Force edit
  cannot invalidate `forceUsed`), and `vanished = called && effectiveForce === 0`.
- **Effective Force is THE Force** for derived stats, spirit powers, spirit attacks and astral
  attacks (p.141: "its Force is reduced"). The full `force` is kept only so a re-call restores it
  ("back at full Force when it arrives"). `prepareDerivedData`, `rollSpiritAttack`, the astral
  attack and `useSpiritPower` read `effectiveForce`; while vanished or not called, the actor
  methods refuse powers and attacks (not just the UI).
- **Every change goes through `SR2EActor#elementalTransition(kind, args)`** on the spirit actor:
  - `call`: refused if the conjurer has any self-sustained spell (p.141: calling "is an
    exclusive activity so the mage cannot be sustaining any spells"). A re-call after vanishing
    costs 1 service (p.141) and resets `forceUsed` to 0. A first call costs nothing.
  - `dismiss`: sets `called` false, ends the service, and ends a sustained spell.
  - `startAid` / `startSustain`: require `called`, `service === ""` and `services ≥ 1`, and debit
    1 service. There is no "already active" credit for switching services.
  - `spendAid(n)`: requires `service === "aid"` and n ≤ effectiveForce. At 0 the elemental
    vanishes and its service ends.
  - `sustainTurn(n = 1)`: forceUsed += n. At 0 the **spell ENDS** through
    `spell.setSustaining(false)` (p.142: "Once its Force reaches 0, it disappears", and the mage
    must take over BEFORE that), then the elemental vanishes.
  - `takeOver`: the mage resumes the spell. The service ends, and the spell becomes
    self-sustained again with the +2 TN.
  - `endService`.
  - Each transition is ONE `spirit.update()` of the full state (atomic per document). Where the
    spell item also changes, the spirit is written FIRST and the spell link is derived from it
    (below), so a failed second write is recoverable.
  - A per-spirit in-flight lock on the client serializes transitions. A cross-client lock is not
    possible (no socket relay at this host); in practice only the owning mage acts on their
    elemental.
- **The sustain link lives on the spirit only** (`service === "sustain"`,
  `sustainingSpellUuid`). The spell carries no schema field, which also avoids touching
  item-data.mjs. The sustain-penalty exemption checks a **valid reciprocal relationship**:
  - a bound elemental (in the caster's `boundSpirits`, resolved with `fromUuidSync`);
  - `service === "sustain"`, `sustainingSpellUuid === spell.uuid`, `effectiveForce > 0`.

  A deleted, unbound or depleted spirit grants nothing. `setSustaining(false)` on the spell ends
  any elemental sustaining it (`endService`). Lock, quicken, recast and delete all route through
  `setSustaining`/delete hooks. One holder per spell and one spell per elemental are enforced in
  `startSustain`.
- **Permissions:** every transition checks `spirit.isOwner` (and `spell.isOwner` where
  relevant) BEFORE any write, and reports a refusal without mutating anything. Elementals created
  by the GM for a player need an ownership assignment; the transition reports this clearly.
- **Scope: the summoner's own elementals only.** Delegation to another character (p.141) is out
  of scope for this release and documented.

### Cast dialog / roll
- Offered: the caster's bound elementals that are `called`, and either have `service === "aid"`
  or can start aid (`service === ""` and services ≥ 1, which the dialog shows "starts Aid Sorcery:
  1 service"), with a matching category and `effectiveForce > 0`.
- Presence and line of sight: the dialog states "must be within the mage's line of sight
  (p.141)". GM adjudication, as with spell LOS everywhere in the system; no geometry check,
  because astral presence cannot be derived.
- **One pure allocation resolver shared by preview and roll**
  (`spellCastDice` → `resolveSpellAllocation`). It takes the Magic Pool request plus each
  elemental's `{ cast, drain, available }` and each focus's `{ cast, drain, remaining }`, and
  returns clamped integers.
  - Elemental aid is treated **as Magic Pool dice for caps** (p.141: "like an auxiliary Magic
    Pool … allocated … in the same manner as Magic Pool dice"). Magic Pool plus aid on the spell
    test ≤ poolCap (Magic Rating; area casts also ≤ original Force). Aid on drain is uncapped,
    like drain pool.
  - Each elemental's cast + drain ≤ its effectiveForce. The same helper fixes the existing focus
    preview, which sums raw requests.
  - Aid dice are not rating dice, so the Karma cap is unchanged. Non-finite or negative requests
    become 0.
- **Roll order:**
  1. resolve the allocation from live state;
  2. run `startAid` (if needed) and `spendAid` for each elemental, BEFORE any roll, in its
     transition;
  3. foci;
  4. the rolls.

  The aid dice appear as their own labelled source ("Aid Sorcery — Fire elemental") on the test
  and drain cards. A transition refusal aborts the cast before anything is spent.

### Sustaining UI
- A spell row action, "Elemental sustains", opens a picker of eligible elementals and calls
  `startSustain`.
- Spirit sheet:
  - status: called / service / effective vs full Force / the spell held;
  - buttons: Call / Re-call (1 service when vanished), Dismiss, End service, Take over spell,
    **"−1 Combat Turn"** (`sustainTurn`).
- **No automatic combat-round depletion in this release.** Exactly-once tracking across several
  combats, round jumps and GM hand-off is its own design. The sheet and the spell row show "held
  by <elemental>: N turns left", and the GM or player presses −1 per Combat Turn. A later release
  can drive the same `sustainTurn` transition from a combat hook.

### Spell Defense
Deferred deliberately. `allocateSpellDefense` exists, but elemental dice must not become
refreshing Magic Pool dice through `clearSpellDefense`/refresh. They stay a separate source when
this is added.

### Files shared with another session
`actor-data.mjs` (SpiritData, sustainPenalty) has another session's uncommitted edits (~line 449,
focus price). My edits are narrow and additive in different sections. At commit time they are
applied to the HEAD copy for my commit and to the working copy, so neither side's changes are
staged or lost (the same method used for sr2e-quench.mjs and CHANGELOG in 0.94/0.95).
item-data.mjs is NOT touched.

### Tests (added to §7)
- Vitest:
  - the transition state machine (every kind, every refusal);
  - the allocation resolver: caps, a shared budget, and aid + pool ≤ poolCap;
  - effectiveForce clamping.
- Quench:
  - two rapid casts using the same elemental → one spend (local lock);
  - a deleted or unbound elemental → the penalty returns and nothing is exempted;
  - a second `startSustain` on the same spell or the same elemental → refused;
  - `sustainTurn` to 0 ends the spell and removes its Active Effects;
  - a transition while a sustained spell exists → call refused;
  - the preview equals the dice actually rolled.

## Round 2 amendments (supersede the Round 1 revision where they conflict)
R1. **Depletion is independent of presence.** `depleted = forceUsed >= force`.

| state | `call` | `dismiss` |
|---|---|---|
| not called, not depleted | free; `called` = true | no-op |
| not called, depleted | re-call: 1 service, forceUsed = 0 | no-op |
| called, depleted (= vanished) | re-call: 1 service, forceUsed = 0 | `called` = false, depletion kept |
| called, not depleted | no-op | `called` = false; ends the service (a sustained spell expires as R8) |

R2. **Re-call cost (interpretation, documented to the user).** p.141: after aid depletion it "can
    be called again … and in this case costs one service", and comes "back at full Force". The
    re-call's service **is** the resumed Aid Sorcery, so the elemental returns with
    `service = "aid"` and full Force, for a total of 1 service. After a sustain depletion the spell
    has ended, and a re-call (1 service) returns the elemental idle (`service = ""`).
R3. **An exhausted binding cannot be called.**
    - A first call or re-call requires `services ≥ 1`. An idle elemental with 0 services left is
      no longer bound: it is offered for nothing, and the sheet says "binding exhausted —
      release it".
    - A final paid service (aid or sustain) still runs to completion at 0 services.
R4. **All four services are exclusive, for elementals only.** For `spiritType === "elemental"`:
    - `useSpiritPower`, `rollSpiritAttack` and the astral attack require `called`,
      `!depleted` and `service ∈ {"", "physical"}`. A power use with `service === ""` starts
      `"physical"` and debits 1 service (p.141).
    - `endService` returns to `""`.
    - Nature spirits keep their current behaviour untouched: no `called` / `service` gates, and
      a Quench test pins it.
R5. **Preflight, then commit.**
    - The cast resolves every requested elemental's transition PURELY
      (`planAidTransitions(live states, allocation)` → per-spirit updates or a refusal) and
      validates all of them before writing anything.
    - Writes then run sequentially. If one fails, the earlier spirit updates are reverted to their
      preflight snapshot (compensation) and the cast aborts before foci, pool or rolls.
    - `startAid` and `spendAid` are combined into one update per spirit.
R6. **Locks and executor.**
    - A client-side lock is keyed by BOTH the spirit uuid and the caster uuid, so one caster
      cannot attach two elementals to one spell concurrently.
    - Transitions require `isOwner` on the spirit (and the spell).
    - Cross-client races (the GM and the player acting on the same elemental at the same instant)
      remain possible without a relay. This is documented, and the manual −1 Turn button carries
      a hint: "one person tracks turns".
R7. **One eligibility predicate** `elementalCanServe(caster, spirit, { purpose, spell })` is used
    by the UI, transitions and the penalty exemption. It requires ALL of:
    - the spirit is an elemental;
    - it is bound (in `caster.boundSpirits`, and `conjurerUuid === caster.uuid`);
    - it is called and not depleted;
    - its category matches the spell's;
    - its service fits the purpose (aid: `""` or `"aid"`; sustain: `""`; exemption: `"sustain"`
      with `sustainingSpellUuid === spell.uuid`).
    - For sustain it also requires: the spell's parent is the caster, it is currently sustaining,
      its duration is sustained, it is not locked or quickened, and it is not already held by
      another elemental.
R8. **Expiration is recoverable.**
    - At depletion while sustaining, the spirit update writes
      `{ service: "", pendingExpireSpellUuid: <spell>, called: true, forceUsed: force }` in ONE
      update. Then `spell.setSustaining(false)` runs, and only on success is
      `pendingExpireSpellUuid` cleared.
    - Any pending expiration is retried idempotently when:
      - the caster's sheet renders;
      - the next transition runs;
      - the owner's client sees the spirit's `updateActor`.
    - The penalty exemption never applies while `pendingExpireSpellUuid` is set.
R9. **Force edits reconcile.**
    - The owner's `updateActor` hook on an elemental whose `force` changed clamps `forceUsed`,
      and if that depletes a sustaining elemental it runs R8.
    - `spendAid` and `sustainTurn` reject non-integer or negative amounts.
R10. **Holder changes never re-run spell activation.**
    - Attach (`startSustain`), `takeOver` and `endService` change ONLY the spirit's service fields.
      The spell's `sustaining` flag and Active Effects are untouched: the spell keeps running, and
      only who pays the +2 TN changes.
    - Only EXPIRATION (R8) calls `setSustaining(false)`.
    - A mage dropping the spell (the existing `setSustaining(false)`, or lock, quicken, recast,
      or delete) calls a non-recursive `detachElementalHolder(spell)` that clears the holder's
      service without calling back into the spell.
R11. **Caster sheets follow spirit changes.** An `updateActor` / `deleteActor` hook on an elemental
    with a `conjurerUuid` re-prepares and re-renders the conjurer (`fromUuidSync`, including
    synthetic token actors if the conjurer is a token). Binding changes on the caster re-render
    the caster already.
R12. **Characters only.** NPCData has no `boundSpirits`, so NPC mages are out of scope for this
    release. The NPC `sustainPenalty` is unchanged.
R13. **Test invariants corrected.**
    - Sequential sufficient-budget spends both consume.
    - An insufficient budget is refused with nothing spent.
    - A duplicate submission while locked: the second waits or is refused, and exactly the
      requested dice are consumed in total.

## Round 3 SIMPLIFICATION (authoritative; supersedes R1–R13 and the Round 1 revision where they conflict)
The state machine was growing a hook for every edge case. This release keeps only what Aid
Sorcery and Spell Sustaining need, and leaves presence, calling and physical service to the GM,
exactly as today.

**State (SpiritData, additive):**
- `service`: `""` / `"aid"` / `"sustain"`;
- `forceUsed`: integer ≥ 0;
- `sustainingSpellUuid`;
- `pendingExpireSpellUuid`.

There is **no `called` flag**: presence, calling and its exclusivity (p.141) stay GM
adjudication, like line of sight. Derived: `effectiveForce = clamp(force − forceUsed, 0, force)`,
and `depleted = effectiveForce === 0`.

**Unmanaged elementals are untouched.** An elemental with `service === ""` and `forceUsed === 0`
(every existing one, and every NPC-bound or standalone one) behaves exactly as today: no new
gates. Nature spirits are never gated.

**Gates:**
- An elemental with `service ∈ {"aid", "sustain"}` refuses `useSpiritPower`, `rollSpiritAttack`
  and the astral attack: "busy with <service> — end it first" (p.141 exclusivity).
- A `depleted` elemental refuses them too.
- Physical service stays the existing manual service counter. There is no "physical" state.

**Transitions** (one method, `SR2EActor#elementalTransition`; each is ONE spirit update;
`isOwner` is checked first; a client-side in-flight guard keyed by spirit uuid **rejects**
duplicate submissions instead of queueing them):

| transition | requires | effect |
|---|---|---|
| `aid(n)` | service `""` + services ≥ 1 → start (−1 service); or service `"aid"`. n integer, 1 ≤ n ≤ effectiveForce | forceUsed += n; at depletion service → `""` |
| `startSustain(spell)` | service `""`, services ≥ 1, not depleted, eligibility (R7 minus `called`) | −1 service; service `"sustain"`; sustainingSpellUuid |
| `sustainTurn(n = 1)` | service `"sustain"`, n integer ≥ 1 | forceUsed += n; at depletion → the EXPIRE step |
| `takeOver` / `endService` | service ≠ `""` | service `""`, links cleared (spell untouched, R10) |
| `recall` | depleted, services ≥ 1 | −1 service, forceUsed = 0, service `""` |

- **One uniform re-call rule, needing no history.** Re-calling a depleted elemental costs 1
  service (p.141, and p.142 "re-called in a manner identical to that of aid sorcery service") and
  returns it idle at full Force. Starting aid or sustaining again is a separate service, as every
  service start is (p.141: "each of these costs one of the elemental's services to initiate").
  This replaces R2; the reading is stated in the CHANGELOG as an interpretation.
- **EXPIRE step (inline, in the `sustainTurn` transition by the user who clicked):**
  1. Write `{ service: "", forceUsed: force, sustainingSpellUuid: "",
     pendingExpireSpellUuid: spell }` in one update.
  2. Call `spell.setSustaining(false)`.
  3. On success, clear `pendingExpireSpellUuid`.
  4. On failure, report it. The spirit sheet and the spell row show "expiring — Finish" (a
     manual button that retries steps 2–3).
  5. While `pendingExpireSpellUuid` names a spell, that spell cannot be recast or re-sustained
     (`setSustaining(true)` refuses and says why), so a retry can never end a newer casting.
  - There are no automatic reconciliation hooks and no re-entrancy.
- **Force edits:** no hook. `effectiveForce` clamps. A depleted, still-`"aid"` elemental after a
  Force edit is shown as "depleted — re-call"; the next `aid` refuses. A still-`"sustain"`
  elemental shows "Force edited below turns used: −1 Turn to expire". Only transitions mutate.
- **One elemental per cast.** No multi-document commit, no compensation:
  1. the cast resolves the single elemental's `aid(n)` transition first;
  2. if it is refused, the cast aborts with nothing spent;
  3. then foci, pool and the rolls.
- **Caster sheet refresh (R11)** stays: it re-renders only, with no mutations.
- **Characters only (R12).**
- **The sustain penalty exemption** applies only for a valid reciprocal link (R7), and never while
  pending expiration applies.
- **Tests (replaces R13):**
  - pure transition table and refusal reasons;
  - duplicate in-flight rejection;
  - sequential sufficient-budget spends both consume;
  - insufficient budget refused with nothing spent;
  - expire happy path (spell ends, AEs removed);
  - expire failure → pending, and recast refused until Finish;
  - an unmanaged or nature spirit's powers and attacks are unchanged;
  - re-call costs 1 and returns idle.

## Round 4 guards (added to the simplification)
G1. **The pending-expiry check runs at the ENTRY of `_rollSpellcast`,** before focus, pool,
    Centering, rolls or drain, and again in `setSustaining(true)`.
    `spellPendingExpiry(spell)` looks for any of the caster's bound elementals with
    `pendingExpireSpellUuid === spell.uuid`.
G2. **The same check blocks** `toggleSpellLock`, the quicken action (before any Karma is paid),
    and `startSustain` for that spell, before any payment or mutation.
G3. **Pending is terminal for that elemental.** While `pendingExpireSpellUuid` is set, the only
    allowed transition is `finishExpire`. `aid`, `recall`, `startSustain`, `takeOver`,
    `endService` and `sustainTurn` all refuse with "finish expiring <spell> first".
G4. **Attachment is guarded by spell uuid as well as spirit uuid.** The in-flight guard holds both
    keys from the eligibility check through persistence, so two elementals cannot attach to one
    spell concurrently on one client. It is re-checked after the lock is acquired.
G5. **A depleted, still-sustaining elemental must expire.**
    - When `service === "sustain"` and `depleted` (a Force edit), `takeOver`, `endService` and
      `recall` refuse ("its Force is spent — the spell ends; −1 Turn / Finish").
    - The only path is EXPIRE, which the sheet offers as "Expire now".
    - Takeover is allowed only BEFORE depletion (p.142).
G6. **`finishExpire` handles a missing target.**
    - If the spell no longer resolves, cleanup counts as complete. Any Active Effects on the
      caster whose origin is that spell uuid are deleted, and `pendingExpireSpellUuid` is cleared.
    - If the spell resolves, it runs `setSustaining(false)`, which is idempotent when the spell is
      already not sustaining. On success it clears the pending uuid.
G7. **Kept:** the shared allocation resolver and its Vitest coverage (aid + pool ≤ poolCap, and
    the Karma cap on rating dice only, with aid excluded), and preview = roll.

## Round 5 guards (adopted after the final round)
G8. **Banishing or unlinking a sustaining or pending elemental expires the spell first**
    (p.142: banishing a sustaining spirit ends the spell).
    - `banishSpirit` and the unbind action run EXPIRE / `finishExpire` for that elemental before
      unlinking or deleting it.
    - If cleanup fails, the removal is refused with the reason, so the record is never destroyed
      while cleanup is outstanding.
G9. **The pending-expiry lookup ignores binding membership.** `spellPendingExpiry(spell)` scans
    world spirit actors (and scene token spirits) for `pendingExpireSpellUuid === spell.uuid`, not
    just `boundSpirits`.
    - Test: unlink → recast refused → Finish → recast allowed.
G10. **The shared spell guard also blocks a depleted sustaining holder.**
    `spellBlockedByElemental(spell)` is true when EITHER a pending expiry names the spell OR an
    elemental has `service === "sustain"`, `sustainingSpellUuid === spell.uuid` and `depleted`
    (a Force edit).
    - Recast, lock, quicken and attach are all blocked before any spend, with "its elemental's
      Force is spent — expire it first".

## Key decisions & tradeoffs
- ~~Stats keep full Force~~ → superseded: effective Force drives everything.
- ~~Vanishing returns the spell~~ → superseded: the spell ends (p.142); the mage can Take Over earlier.
- **Aid dice are NOT rating dice** for the Karma cap (p.191 excludes pool dice; the book says they
  act "like an auxiliary Magic Pool").
- **Spell Defense aid, Aid Study and long-term binding are out of scope.** They have no automation
  to hook into yet: there is no Spell Defense allocation UI in the cast flow, and spell learning
  is not modelled.
- **Nature spirits are excluded** (the core has no rule for them). Grimoire or later books may add
  rules; to be checked before extending.

## Risks / open questions
- Round-change detection with several combats, and with the GM absent.
- Permission: a player mage must be able to update their own bound elemental. It was created via
  `createActorViaGM` and is "auto-owned to the creator". Verify the conjurer owns it.
- Elementals bound but not on the scene: aid works in astral form, so scene presence is not
  required.
