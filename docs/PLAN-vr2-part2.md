# Plan: the Virtual Realities 2.0 Matrix, part 2
_Final — 5 Codex rounds; round 5's single finding applied (see PLAN-vr2-part2-REVIEW-LOG.md)_

## Goal
Continue the VR2.0 Matrix from `docs/PLAN-vr2-core.md` (0.106.0). Everything here is
behind `isVR2()`, or follows the card's `ruleset`; the core Matrix is untouched.
Load: one GM world, a decker or two, a handful of IC.

**In scope:** three part-1 corrections; IC programs and defenses; program wear and Swap
Memory; combat maneuvers; improvised attacks; Shield and Medic; attribute attacks
(cripplers, and the poison/restrict/reveal utilities); probe; the security sheaf; and the
book's "a black-IC kill doesn't disconnect" (no new black-IC state).

**Deferred to a part 3 (each needs its own state machine):** black IC's damage to the
decker (two resistance tests, the jack-out gate, the final attack, the icon-down +2),
trace, hog, slow, tar
baby/pit, rippers and blaster/sparky (permanent hardware damage), data bombs,
psychotropic IC, black hammer/killjoy, Restore, steamroller, scramble, and every
optional rule (utility options p.102, cascading/expert IC, constructs, party IC).

## Rules (read from VR2.0 renders; PDF = book + 8)
- **Crashing IC (p.40):** add the IC's rating to the decker's tally, unless the decker
  suppresses it as it crashes. Each suppressed IC lowers the Detection Factor by 1 while
  the decker stays on that system. Releasing it returns the point, and its rating goes
  on the tally then.
- **A black-IC kill doesn't disconnect (p.124):** "when black IC kills an icon, it does
  not disconnect the decker". Any other persona crash dumps the decker.
- **Armor utility (p.99):** reduces Power by its rating. It loses 1 point every time it
  fails to absorb a hit completely.
- **Combat maneuvers (p.121–122):**
  - A Simple Action and an opposed test. The maneuvering icon rolls Evasion against TN =
    the opponent's Sensor; the opponent rolls Sensor against TN = the maneuverer's
    Evasion.
  - For IC, the host's Security Value stands in for both its dice and its attribute.
  - Cloak lowers the maneuverer's TN by its rating; Lock-On lowers the opponent's.
  - Non-IC programs without the attribute can't maneuver or oppose. If the maneuverer
    gets 0 successes, the maneuver fails.
  - **Evade:** the maneuverer must win (more successes). IC re-detects it after (net)
    Combat Turns, 1 sooner for each tally point gained meanwhile. A decker re-detects
    with Analyze Icon (IC) or Locate Decker (personas).
  - **Parry:** the maneuverer must win. Attacks by the opponent on the maneuverer get
    +net TN until the opponent's next attack. A position attack by the opponent keeps
    it; an evade by either side ends it.
  - **Position:** whoever wins the opposed test (either side) gets −net TN or +net Power
    on its next attack. A tie, or 0 successes for both, gives nothing.
  - Book examples (p.122–123): Sushi (Evasion 6, Cloak-4) evades Orange-8 IC at TN 4,
    3 vs 1, so 2 turns. Sushi (Evasion 6, Cloak-2) against a decker (Sensor 5,
    Lock-On-3): TN 3 each way.
- **Improvised attack (p.123):**
  - Build: a Simple Action. Points from Evasion and/or Bod become the Power, which may
    not exceed the MPCP. Then a Computer test against TN = Power: 1 success L, 2 M,
    3 S, 4+ D.
  - It's a one-shot. The ratings stay reduced until it's used; if the build fails, until
    the decker's next action.
- **Shield (p.100):**
  - When an attack affects the persona, the decker may roll its rating against TN = the
    attacker's Computer skill (IC: the Security Value). Each success removes one of the
    attacker's net successes.
  - Against cripplers and other opposed tests, its successes add to the decker's.
  - It loses 1 point per use.
- **Medic (p.100):** a Complex Action. Roll its rating against 4/5/6 by the icon's wound
  level; each success repairs a box. It loses 1 point per use. **User ruling:** filled
  boxes map 1 = Light, 2 = Moderate, 3+ = Serious (the Condition Monitor Table's
  counts); Deadly also uses 6.
- **Swap Memory** reloads a fresh copy of a degraded or crashed utility (p.99–100).
- **Cripplers (p.41, white IC):**
  - The IC's Attack Test (Security Value dice vs the cybercombat TN) is opposed by the
    decker's affected attribute against TN = the crippler's rating. Acid → Bod, binder
    → Evasion, jammer → Sensor, marker → Masking.
  - The attribute loses 1 per 2 net IC successes, never below 1. Neither Armor nor
    Hardening helps.
  - Selena: Acid-4 scores 4 against Bod 6's 2, so Bod becomes 5.
- **Poison / Restrict / Reveal (p.98–99):** on a successful attack, the target tests Bod
  / Evasion / Masking against TN = the utility's rating; the attribute drops 1 per 2 net
  successes. No floor is stated, so the floor is 0.
- **Killer (p.41)** is white; tar baby is white (p.43); probe, scramble, data bomb and
  trace are reactive.
- **Black IC (p.47–48; for reference — deferred to part 3 except the kill rule above):**
  - Lethal: (Rating)M on Blue/Green, (Rating)S on Orange/Red, applied to both the
    decker and the icon, staged up 1 per 2 attack successes.
  - Two resistance tests. The decker resists with Body against the Power less Hardening
    (Karma Pool yes, Hacking Pool no); the icon resists with its Bod (Armor applies).
  - Physical damage; Stun on a cool deck. Non-lethal: Mental (Stun) damage, resisted
    with Willpower; if it knocks the decker unconscious, the connection breaks.
  - With the icon down, the connection stays and the IC's rating is +2.
  - After a black IC hit, jacking out takes a Complex Action and a Willpower (IC Rating)
    test; the IC makes one more attack before the link drops.
  - If black IC kills the decker, it takes a shot at the MPCP (deferred, with blaster).
- **Probe (p.42):** on every System Test, the host rolls Probe (its rating) against the
  Detection Factor; the successes go on the tally.
- **IC defensive options (p.50):** armor (−2 Power against the IC); shield or shift (+2
  TN to hit it). Shield and shift are mutually exclusive. Chaser and penetration are
  utility options, out of scope.
- **Security sheaf (p.150):** each host lists trigger steps, each naming an event: IC,
  passive alert, active alert, or shutdown.

## Approach

### 1. One tally-event API (replaces the System-Test-only path)
- **Event.** `flags.sr2e.vr2TallyEvent = { eventId, actorUuid, sessionId, base, source }`
  on the message that justifies it (a System Test card, an IC-crash choice, an
  unsuppress, a probe roll). A message carries one event.
- **`applyTallyEvent(message)`:**
  - Runs in the decker's `sessionQueue` on the message author's client (the existing
    rule).
  - Refuses when the session isn't live, the session ids differ, or `receipts[eventId]`
    exists.
  - Adds `max(0, base)` in ONE update with the receipt and any crossed sheaf steps
    (`pendingSheaf`). Each crossed step is `{key: hostUuid:step, step, event, note}`.
- **Reconcile on load:** for every message I authored that carries an event.
- **Sheaf delivery.**
  - Crossed steps are written, in the same tally update, to
    `flags.sr2e.vr2SheafPending[<key>]` on the decker. That's OUTSIDE the session
    records, so no session change can drop it. Key = `<hostUuid>:<sessionId>:<rowId>` (§10).
  - The active GM handles each pending entry in the host's queue
    (`enqueueAttack("host:"+uuid)`, with a fresh read):
    1. if `host.flags.sr2e.sheafApplied[key]` is unset, ONE host update raises the
       alert monotonically and sets it;
    2. the GM whisper (event, step, decker, note);
    3. the decker's pending entry is removed.
  - A retry after a crash between 2 and 3 whispers again. The whisper is at least once,
    never lost; the alert is exactly once.
  - On load, the active GM drains every pending entry.
- **The System Test card** becomes an event (eventId = card id); `receipts` keeps its
  shape. The old cards' `vr2SystemTest` stays readable, and reconcile treats it as an
  event with eventId = msg.id and base = hostSuccesses.

### 2. Part-1 corrections
- **Crash transition.** `matrixDamage` returns `{before, after}`. A crash is
  `before < 10 && after >= 10`, so a hit on an already-crashed icon is not a new crash.
- **IC crash → tally.**
  - When the decker's attack crashes an IC, the outcome card gets two buttons for the
    decker's owner: **Suppress** (−1 Detection Factor) and **Let it register** (+Rating
    to the tally).
  - It resolves once, by the existing resist-once markers (in-flight set, a `resolves`
    marker message, and the closure hook rendering the choice).
  - The attack card snapshots the attacker's session id and host when the attack is
    made (`attackerSession`, `hostUuid`). The crash choice validates against those, so
    an attack made on host A can't charge a session the decker opened later on host B.
    An old session is refused, and the card says so.
    Both choices are ONE atomic update of the decker's session, in its session queue.
    It is refused unless the session id matches and none of `receipts["crash:<id>"]`,
    `suppressed[<id>]` or `released[<id>]` exists.
    - *Register:* tally + receipt + crossed sheaf steps.
    - *Suppress:* `suppressed[<id>] = { icUuid, name, rating }`.
  - The Detection Factor subtracts the number of suppressed IC, floor 0 and then TN 2.
  - The Matrix tab lists suppressed IC with **Release**. One atomic session update
    deletes `suppressed[<id>]`, sets `released[<id>]`, and adds the rating to the tally
    with receipt `release:<id>` and the crossed sheaf steps.
- **Black-IC kill.** In `vr2MatrixResist`, a persona crash whose card's
  `(icClass ?? icType)` is "black" doesn't call `vr2LeaveMatrix`. The outcome says the
  decker stays connected, and that while the icon is down the IC's rating is +2 (p.48,
  the GM's to apply). There's no new state; black IC's own effects are part 3.
- **Armor wear.** After a hit that still fills boxes, the decker's Armor program (the
  same copy whose rating was used, by item id) gets a wear event keyed by the card id
  (§4), so a re-run can't charge twice.

### 3. IC programs and defenses (ICData)
- `program`: a StringField with `blank: true`. Values: "" | killer | crippler-acid |
  crippler-binder | crippler-jammer | crippler-marker. The deferred programs aren't
  offered; probe is a host rating (§11), not an IC program.
- `defense`: a StringField with `blank: true`: "" | shield | shift. Plus `armorDefense`:
  a BooleanField (armor stacks with either).
- `icClass(program, icType)`, a pure helper: killer and cripplers are white; "" falls
  back to the authored `icType`.
  - In VR2.0, `ICData` derives `icClass`; the card snapshots `icClass` and `program`.
  - Simsense overload and crash handling read `st.icClass ?? st.icType`, so part-1
    cards resolve exactly as they snapshotted.
- Defense in the attack: shield/shift add +2 TN to attacks on the IC; armor −2 Power on
  its resistance.
- `ICData.generation`: an integer, initial 0. The crash transition (§2) increments it in
  the same update as the monitor. The IC's "session" for maneuver records is
  `<uuid>:<generation>`, so a reset or re-used IC starts with none.
- IC sheet (VR2.0): program and defense selects, and the armor checkbox.

### 4. Program wear and one usable-program rule
- `ProgramData.wearEvents`: an ArrayField of strings `<loadGen>:<cardId>`, never cleared.
  `ProgramData.loadGen`: an integer, initial 0. `ProgramData.crashed`: BooleanField.
- Derived `effectiveRating`: in VR2.0, `max(0, rating − (count of wearEvents with prefix
  "<loadGen>:"))`; in core, `rating`, ignoring wear entirely. Recomputed every prepare
  from source.
- When Armor, Shield or Medic is USED, the resolver captures `{itemId, loadGen}`. Wear is
  appended as `<capturedLoadGen>:<cardId>` in a per-program queue
  (`enqueueAttack("program:"+item.uuid)`) that re-reads the item. So a Swap Memory while
  the resistance is pending wears the old copy (no longer counted), never the fresh
  one. It does nothing if any entry already ends with `:<cardId>`.
- `usablePrograms(actor)`, one helper used by EVERY consumer: `loadedUtility`,
  `promptAttack`, `vr2MatrixAttack`, `_derivePersona`, Shield, Medic and cloak/lock-on.
  - Core: loaded programs at `rating` (part-1 behavior).
  - VR2.0: loaded, not crashed, effectiveRating > 0.
  - `_derivePersona` treats a loaded persona program that's unusable as present with 0
    (the attribute is 0), not as absent: no fall-back to the authored value.
- **Swap Memory** (a program-row button, VR2.0, owner): in the same queue, `loadGen + 1`
  and `crashed = false`. Old wear stays recorded, but no longer counts.

### 5. Icon attribute damage (session-bound)
- `vr2Session.iconDamage: { <id>: { attr, points, floor, source } }`. `floor` is 1 for
  cripplers, 0 for utilities; `<id>` is the resolving card id, so a retry overwrites
  rather than adds.
- Entries are committed in the defender's session queue. Each takes the next `seq`
  (`vr2Session.damageSeq + 1`, written in the same update) and records the ACTUAL loss:
  `lost = v > floor ? v − max(floor, v − points) : 0`, where v is the live attribute at
  commit. `_derivePersona` subtracts the recorded losses in seq order, floor 0:
  `v = max(0, v − lost)`. Crippler damage stops at 1; Poison after it can still take
  Bod from 1 to 0.
  - A later persona-program change never makes earlier, ineffective damage count: only
    what actually landed is recorded.
  - The entry is IMMUTABLE and doubles as its receipt. Inside the queue, a card id that
    already has an entry (even `lost = 0`, which IS written) returns at once. A
    same-roll retry of a floor-limited hit can't recompute against the reduced value. The improvised reduction comes LAST: `v = max(0, v − improvised[attr])`, validated
  against the pre-improvised value, so the floor can't undo a sacrifice.
- `_derivePersona` keeps choosing program values only when MPCP > 0 and there are
  programs. The VR2.0 phase (icon damage, then improvised) ALWAYS runs afterwards,
  manual fallback personas included.
- An entry is written only when points > 0: `points = max(0, floor(net / 2))`.
- It lives in the session, so it ends with it (white IC affects only the online icon,
  p.40). A reconnect's new session starts clean, which is the book's behavior.

### 6. Combat maneuvers
- **Records live on the actor whose ATTACKS they change**, so only that actor's own
  client consumes them. `flags.sr2e.vr2Maneuvers`:
  - `parriedBy: { <parrierUuid>: {net, mySession, theirSession} }`: my attacks on the
    parrier get +net TN.
  - `position: {vs, net, mySession, theirSession}`: one record, for my next attack.
  - `lostSight: { <evaderUuid>: {turns, tallyAtStart, combatId, roundAtStart, mySession,
    theirSession, observer: "ic"|"decker"} }`: I can't attack the evader.
  - An IC's session id is `<uuid>:<generation>` (§3). A record whose sessions no
    longer match both live participants is ignored and pruned.
  - `applied: { <outcomeMessageId>: true }` is written in the SAME update as each record,
    and kept after the record is consumed, so a replay can't recreate a spent effect.
- **Resolution, a pure helper** `maneuverOutcome(kind, mS, oS)`:
  - evade/parry → `{beneficiary: "maneuverer", net}` when mS > 0 and mS > oS; else none;
  - position → the maneuverer when mS > oS and mS > 0; the opponent when oS > mS; none
    on a tie.
- **Flow.** A *Maneuver* button (decker's Matrix tab; IC sheet) opens a dialog: kind;
  opponent (the targeted token's actor, PINNED by uuid); host (IC side).
  - A decker maneuverer's Evasion test: `rollSuccessTest`, closed, `tnContext
    {kind:"other"}`. It's an attribute test, not a skill; drug modifiers that hit all
    tests still apply through "other".
  - An IC opponent: plain dice once, on the maneuverer's client.
  - A decker opponent: an **Oppose** card for its owner, resolved once (resist-once).
- **Applying.** The outcome message carries `vr2ManeuverResult` (the records and their
  target actors).
  - A dedicated `createChatMessage` handler, separate from the card-author closure hook,
    picks ONE writer per affected actor: the lowest-id active non-GM owner, else the
    active GM.
  - That client applies the record and the `applied` receipt in one update. It skips
    when the receipt exists.
- **Consumption in `vr2MatrixAttack` (attacker A, pinned target T):**
  - Refused if `A.lostSight[T]` is live. Expiry:
    - IC observer: lazily, elapsed rounds in the same combat plus the tally gained
      since start ≥ turns, as the nets' `advanceTurns` does.
    - Decker observer: never by time; only the **Re-detect** button (after Analyze Icon
      / Locate Decker) or the GM clears it.
    - Out of combat, the GM's Re-detect clears it.
  - `A.parriedBy[T]`: +net TN.
  - `A.position` (if `vs === T`): the dialog asks −TN or +Power.
  - After the attack test is ROLLED (committed), A's client deletes `A.position` (any
    target: it's "the next attack") and every `A.parriedBy` entry (the parry lasts "until
    the next attack by the opposing icon"). A cancelled dialog consumes nothing.
  - An evade by either side clears the parry records between the two (in the evade's
    result writes).
- **Pinned target.** A NEW VR2.0 attack or maneuver requires a target: the dialog
  refuses without one and pins its uuid. The card stores it, and `vr2MatrixResist`
  refuses any other defender, except the GM. Only legacy part-1 cards (no `targetUuid`)
  keep untargeted resolution.

### 7. Improvised attack
- The attack dialog no longer refuses a decker with no attack utility. It offers
  **Improvise**: Bod points + Evasion points. Each is at most the current attribute;
  the sum is at least 1 and at most the MPCP.
- The build is a Computer test against TN = Power (`skillTnContext("computer")`), closed
  to Karma: its successes fix a persistent Power and Level at once. Then
  `vr2Session.improvised = { id, bod, evasion, power, level|null }`. `_derivePersona`
  subtracts bod/evasion while it exists. A new build is refused while one exists.
- If the build succeeds, the next attack dialog offers "Improvised (Power P, L)". It
  rolls P dice (the program's rating is its Power, p.123) and deletes the record once
  the attack test is rolled.
- If the build fails (`level: null`), the decker's next action clears it. One helper,
  `commitAction(actor, startedWithBuildId)`, is called AFTER the action's test is rolled
  by attack, maneuver, System Test, Medic and Swap Memory. It clears a failed build only
  when it is the one that existed when the action started, so the build's own commit
  never clears itself. A cancelled dialog changes nothing.
  Leaving the Matrix clears it with the session.

### 7b. Zero dice
- VR2.0 resolvers pass the attribute's real value: a persona attribute at 0 rolls no dice
  and gets 0 successes. Part 1's `Math.max(1, dice)` goes in VR2.0 paths. Verify that
  `rollSuccessTest` handles a pool of 0 (it has a floor note for misc penalties); if it
  doesn't, the resolver records 0 successes without rolling.

### 8. Shield and Medic
- **Shield:**
  - In `vr2MatrixResist` and the crippler/attribute resolvers: if a usable Shield is
    loaded, a small dialog asks "Use Shield-N?".
  - If yes, roll it (closed) against TN = the card's `attackerComputer`. The card
    snapshots that: the decker's Computer rating, or for IC the Security Value.
  - Its successes reduce the attack successes before staging; in an opposed attribute
    test, they add to the decker's. A wear event keyed by the card id, on that item.
- **Medic:** a program-row button. Rating dice against `medicTN(boxes)` = 4 at 1 box,
  5 at 2, 6 at 3 or more (user ruling); 0 boxes refuses. It repairs min(successes,
  boxes) in the monitor queue; a wear event (keyed by its own test message id) either
  way.

### 9. Attribute attacks
- **Cripplers (IC program):** the card says `effect: "attribute"`, `attr`, `floor: 1`,
  `rating` (the IC's). The resolver: the decker rolls the attribute (+ Shield) against
  TN = rating, closed. Then net = live attack successes − decker's; points = floor(net
  / 2); the iconDamage entry is written under the card id. No Armor, no Hardening; no
  box damage.
- **Poison/Restrict/Reveal** (a decker's loaded utility named so, or
  `ProgramData.offense` = poison | restrict | reveal, a StringField with blank: true):
  same resolver, `floor: 0`, TN = the utility's effectiveRating. The target is a
  persona only: the dialog refuses IC targets for these.

### 10. Probe and the sheaf
- `HostData.probe`: integer, min 0.
- `HostData.sheaf`: an ArrayField of `{id: string (a stable randomID made when the row
  is added), step: int ≥1, event: StringField (blank: true; ic | passive | active |
  shutdown | other), note: string}`. Several rows may share a step.
- Delivery keys are `<hostUuid>:<sessionId>:<rowId>`.
- **Probe:** `vr2SystemTest` also rolls `probe` dice against the Detection Factor when
  it's > 0. Its successes are a SEPARATE event (`probe:<cardId>`) on the same card's
  follow-up message. They never touch the verdict.
- **The sheaf:** a pure helper `sheafCrossed(sheaf, oldTally, newTally)` returns the
  rows with old < step ≤ new, in step order, every row at a shared step included. The host sheet edits the list (add/remove
  rows).

### 11. Tests and docs
- **Vitest:**
  - `maneuverOutcome` with both book examples, ties and zero successes;
  - improvised level (1→L … 4+→D) and its bounds;
  - `medicTN`; `icClass`; `sheafCrossed` (including several steps crossed at once);
  - the iconDamage floor math (mixed floors, Selena 6 → 5);
  - negative attribute nets writing nothing.
- **Quench, per step, including failure and retry:**
  - the tally event applied once across a retry and a reload;
  - suppress / release;
  - a duplicate-crash hit isn't a second crash;
  - armor wear;
  - parry/position consumed; evade refusing then expiring;
  - the improvised reduction, then cleared;
  - Shield reducing net and wearing;
  - Medic;
  - crippler floor 1; poison to 0;
  - a black-IC icon kill doesn't dump; a part-1 card without `icClass` resolves by its
    `icType`;
  - a cancelled attack or maneuver dialog consumes nothing; a re-run resolution writes
    nothing twice (wear, iconDamage, tally);
  - the opponent reconnecting invalidates a maneuver record;
  - mixed floors in order (crippler to 1, then poison to 0);
  - a host change between attack and crash resolution is refused;
  - an untargeted new attack is refused;
  - concurrent wear from two cards both lands; wear survives Swap Memory as a receipt;
  - Bod 0 resists with 0 dice;
  - a reused IC (new generation) has no stale records;
  - probe as a separate event;
  - sheaf: monotonic alert applied exactly once, whisper at least once; two rows at one
    step both delivered;
  - a retried floor-limited crippler hit leaves the stored loss and Bod unchanged;
  - reverse-order resolution of two attribute cards; excess crippler damage, then a
    persona-program change; Swap Memory during a pending resistance;
  - stale-session cleanup (an old card can't touch a new session);
  - core batches unchanged.
- **Docs:** CHANGELOG, AUDIT-VR2, QA-PLAN and the wiki.

## Key decisions & tradeoffs
- The scope is cut hard (see the deferred list): each deferred item needs persistent
  per-turn state and its own review.
- **Timers are lazy:** evade expiry is computed at use, as nets do. Nothing ticks in
  the background in this part.
- **Session-bound state:** maneuvers, icon damage, the improvised build,
  suppression and pending sheaf steps live in, or carry, the session id, so a
  reconnect never inherits or loses them wrongly.
- **Multi-step resolutions:** every mutation is a keyed SET, never an increment (wear
  events, iconDamage entries, tally receipts, maneuver records keyed by message id). An
  interrupted resolution re-run with the same rolls can't double-charge.
  - A re-run with a NEW roll is still possible if the client dies between the writes
    and the resist-once marker. That's the part-1 accepted limit, the same as every
    card in this system (a durable roll journal would be a system-wide change).
  - Cross-client simultaneous resolution stays the accepted limit too.

## Risks / open questions
- An IC maneuvering against a player's decker needs the player online (the Oppose card),
  like every other opposed card.
