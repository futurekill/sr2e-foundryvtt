# Plan: VR2.0 part 5a — the utilities chapter (utilities)
_Round 5 — revised after Codex rounds 1–6; see the REVIEW-LOG_

## Goal
Finish the utility programs of VR2.0's Programs chapter (book pp.95–100) under the optional
`matrixRuleset: "vr2"`: Restore, Black Hammer, Killjoy, Track (and Relocate against it), Hog,
Slow, Steamroller and Evaluate's decay. Along the way, fix decker-against-decker attacks on the
connection log, which every new offensive utility needs and which part 3 left unadmittable.

## Out of scope
- **Part 5b** (its own plan): utility options (p.102–104: area, chaser, DINAB, limit, one-shot,
  optimization, penetration, sensitive, skulk, squeeze, targeting), option-aware design size and price,
  and the programming task (p.100–102). Until then the attack dialog's "Area-effect utility" box stays.
- Frames and SKs (p.105, AI chapter). Command sets (p.104). Compressor (p.97): nothing models data
  sizes in transit. Missing System Operations (Download/Upload Data, Crash Application/Host, Command
  Slave, Dump Log, Validate Passcode, Retrain, Tap Comcall, Decoy): they belong to the System
  Operations chapter pass, not this one; this plan only fixes utility names on operations that exist.
- The programmer-skill caps on black hammer/killjoy rating (half Computer, round up): a creation-time
  limit with no programming model yet (5b).

## Rules (110 dpi renders; PDF = book + 8; every number re-read from the image)
- **Restore (p.100).** Repairs damage to online icon attributes, never permanent persona-chip damage
  from gray or black IC. Restore Test (utility-rating dice) against TN = the rating of the program
  that caused the damage; several damaging programs → use the HIGHER rating. 1 point repaired per
  2 successes. No action cost or wear is printed (Medic, by contrast, is a Complex Action and wears).
- **Black Hammer (p.98).** Multiplier 20; target deckers. A black IC program that targets the decker,
  not the deck: "its effects are identical to those of lethal black IC (p.47)", but it "lacks the
  blaster-like capabilities of mainframe-driven black IC" and kills "without knocking his cyberdeck
  off-line, so the jackpoint remains traceable". Cannot go in a frame; can go in an SK (out of scope).
- **Killjoy (p.98).** Multiplier 10; mimics NON-lethal black IC: Stun to the meatbody; otherwise
  identical to black hammer.
- **Black IC (pp.47–49), as it applies to both.** A hit (even for no damage) starts subverting the
  ASIST: jacking out then takes a Complex Action and a Willpower (rating) Test, and the attacker gets
  one more attack before the connection drops. Damage Code by the host's Security Code: (Rating)M
  for Blue/Green, (Rating)S for Orange/Red; +1 level per 2 attack successes. Two Resistance Tests:
  lethal → Body for the meatbody (Hardening reduces the Power, p.49's worked example; Karma Pool yes,
  Hacking Pool no); non-lethal → Willpower, Mental (Stun) damage that can overflow into Physical, the
  same on hot and cool decks (p.49). The icon resists "as it resists damage from killer IC", armor
  normal. Part 3 already implements exactly this (`resistOnLog`); this plan reuses it UNCHANGED. Icon
  down → connection stays, rating +2. Cool deck → lethal acts as non-lethal. Killed (or, non-lethal,
  knocked unconscious) → connection drops; mainframe black IC then takes its final shot at the MPCP
  "as if it were blaster IC" (pp.48–49) — the "blaster-like capability" black hammer lacks (p.98).
  Killjoy is "otherwise identical to the black hammer", so neither takes an MPCP shot.
- **Track (pp.97–98).** Special utility, multiplier 8; a combat program against deckers. After each
  successful attack, note the attack successes; the target makes an Evasion (Track Rating) Test. If
  the Evasion successes fail to equal or beat them, the track locks on the datatrail and begins a
  location cycle like trace IC (p.45): 10 ÷ the attacker's NET successes = turns to locate the
  jackpoint. The target may escape by logging off or jacking out, but track makes logoff harder and
  traces a jacked-out decker like trace IC. Relocate works against it (p.46) with TN = the attacking
  decker's Sensor instead of the Control rating; a Relocate success makes the track fail completely:
  the attacker must hit again before using it again. Crashing the attacking persona stops it.
- **Hog (p.98).** Multiplier 3; target deckers. On a successful attack the target makes an MPCP (Hog
  Rating) Test, Hardening reducing the TN. If the attacker wins, the highest-rated program running on
  the target deck loses 1 rating point per 2 net successes, and the same number again at the end of
  every subsequent Combat Turn until it crashes; then the next highest, until every program has
  crashed. Infected programs operate at their reduced ratings. Purge: a Complex Action and a Computer
  (Hog Rating − Hardening) Test, TN raised by the infected program's ORIGINAL rating; one success
  wipes the virus AND the infected program from active memory. Swap Memory reloads crashed/purged
  programs.
- **Slow (p.99).** Multiplier 4; target IC (proactive only; trace only while hunting). On a hit, an
  opposed Resistance (Slow Rating) Test for the IC. More IC successes: nothing. More Slow successes:
  the IC loses 1 action per 2 net successes (the book's "net successes the IC achieved" is a slip: the
  sentence is the case where the SLOW test wins). With no actions left this turn it hangs (goes dead).
  Disabling it this way doesn't raise the tally, but SUPPRESSING it costs a point of Masking (p.40);
  not suppressed by the start of the next Combat Turn, the GM rolls its Initiative and it resumes.
- **Steamroller (p.99).** Multiplier 3; target tar baby and tar pit only. (Rating)D damage; immune to
  tar. Crashing tar with it raises the tally unless the program has the stealth option (5b) or the
  decker suppresses the IC.
- **Evaluate (p.97).** At the end of each run the GM rolls 1D6 ÷ 2, round up; every evaluate program
  (in play or not) loses that many rating points. 1 Karma restores 1 rating point (or upgrade, out of
  scope).
- **Lock-On, Cloak, Camo, Armor, Shield, Medic, Sleaze, Mirrors, the operational utilities**: already
  built (parts 1–4). Commlink lists Retrain and Tap Comcall (neither exists); `makeComcall` keeps it.

## Approach

### 0. Decker attacks on the connection log (R1 #1–#5)
1. Reproduce first (Quench, live): decker A attacks decker B, who is on the connection log. Expected
   today: B's resist waits for an admission that never comes, because `attackOnce` requests admission
   only for IC (vr2.mjs `isIC && state.targetConn != null`), and a player can't write a request onto
   another player's actor. Poison/restrict/reveal (`resistAttribute`) wait the same way.
2. **Admission is discovered by the sequencer, not filed by a client.** A decker attack card
   (`attackerType: "character"`, `targetConn` set) is admitted by the active GM's client:
   - on `createChatMessage` (GM client, sequencer): `sequencer(() => admitCard(target, message))`;
   - and by a reconcile step in `passFor`, BEFORE `processRequests` (so before any exit request is
     handled): every decker card targeting this actor on its LIVE connection with neither an admit nor
     a refusal is admitted (cards in creation order). A card whose `targetConn` isn't the live
     connection is refused (`refuse:<card>` fact, posted "hit an earlier connection").
   - Cards are found by scanning ALL of `game.messages` (in memory; no cutoff) for `flags.sr2e.matrix`
     with `attackerType: "character"` and `targetUuid` = this actor; the `admit`/`refuse` facts make
     it idempotent (R2 #4).
   So an exit requested after the card exists can't outrun its admission (the pass admits first), and
   no request crosses a reconnect: admission validates `targetConn === f.live.n` (R1 #1, #2).
3. The `attack` handler (also used for IC) gains the same check: an IC request carries `conn:
   st.targetConn`; a mismatch is refused (R1 #1).
4. Decker attacks then resolve exactly like IC attacks: damage via `resistOnLog`, attribute attacks via
   `resistAttribute`, whose `vr2AttrPending` receipt and `resolved` request now apply whenever the card
   was admitted (attacker type no longer matters) (R1 #3).
5. `attackerKey` for a decker: `deck:<uuid>@<connN>` (the attacker's live connection, captured before
   the roll like `icKey0`). New pure `parseAttackerKey(key)` → `{ kind: "ic"|"deck", uuid, gen|conn,
   comp }`; `parseIcKey` stays for IC keys; every fold/lock site that parses keys goes through the new
   helper.
6. **Last attacks by a lock (R1 #4; R2 #2, #3; R3 #4).** Locks END per hit (§2), but last-attack
   OBLIGATIONS stay one per distinct attacker key among the surviving hits (as the fold does today for
   IC keys): two live black hammer hits from one decker are one obligation `L` = that attacker key.
   While the exit's `lastAttack` step for lock `L` has
   no `exitRes`, the discovery step (and the `attack` handler for IC) admits exactly ONE card for it:
   the admit fact carries `lastAttack: L`, and any further card from that attacker is refused while an
   admit with `lastAttack: L` exists on this connection. The `exitRes` is then reconciled from that
   admit on every pass (admit written, exitRes missing → write it), so an interruption between the two
   writes heals. This also tightens the existing IC path (today a second card could qualify).
7. **Waive (R1 #5; R2 #1).** Each outstanding `lastAttack` exit step gets a GM-only "Waive the last
   attack" button (IC and deck locks alike): it writes the step's `exitRes` with
   `{ cancelled: true, waived: true }` — `cancelled` is what the fold already treats as terminal.
   Refused if a `lastAttack` admit for that lock exists. Nothing times out by itself.
8. **Attacker incarnations (R2 #6, #8; R3 #1, #2).** `matrixDamage` (the one monitor writer the
   sequencer uses) writes, IN THE SAME UPDATE as a transition to a full monitor on a decker on the log,
   the receipt `flags.sr2e.vr2IconCrash.<conn>.<inc>` (`inc` = 1 + the crashes already on that conn).
   That receipt is the durable crash: no separate fact, so no interruption gap. A card snapshots the
   attacker's incarnation at the roll: `attackerInc` = the count of crash receipts on the attacker's
   live conn. An effect from that card (lock, track cycle) ends when the attacker's conn has ended or
   has a crash receipt with `inc > attackerInc` — independent of when the target resolves.

### 1. Restore (R1 #16)
- `iconDamage` entries gain `rating` (the damaging program's rating: `st.rating`) going forward.
- Repairs: `vr2Session.iconRepair.<rollMessageId>: { attr, points, seq }` (receipted by the roll's id,
  in the session so it ends with it).
- Pure `restoreState(damage, repairs)`: per attribute, FIFO — damage entries in `seq` order, repairs in
  `seq` order, each repair point paying down the OLDEST outstanding loss of its attribute. Returns per
  attribute `{ outstanding, ratings: [ratings of entries still outstanding] }`. TN for a Restore =
  the highest rating among entries still outstanding on ANY attribute (p.100 "use the higher");
  an outstanding entry without `rating` (pre-0.128) makes the TN a required GM-typed number.
- `vr2Restore(actor, item)`: attribute picker (outstanding > 0 only), the TN above, rating dice;
  points = min(⌊successes ÷ 2⌋, outstanding). Written through `sessionQueue` like `resistAttribute`.
- `_applyIconState` derives each attribute as `max(0, base − outstanding)` from `restoreState` (R2 #5:
  base 6, lose 6, restore 6, lose 6 → 0), then applies the improvised sacrifice as now. Permanent chip damage (ripper/black) lives elsewhere, untouched.

### 2. Black Hammer and Killjoy (R1 #6, #7)
- A decker's program named `black hammer*` / `killjoy*` (or `system.offense: "blackHammer"|"killjoy"`)
  is offered in the attack dialog only against a decker on the connection log. Dice = rating (Hacking
  Pool as usual); Power = `blackRating` (rating, +2 icon down); level by the host's Security Code.
  The card: `program: "black-lethal"` (hammer) / `"black-nonlethal"` (killjoy), `attackerType:
  "character"`, `icKey: attackerKey`, `noBlaster: true`, and `icRating` = the utility's effective
  rating at the roll (the jack-out Willpower test's TN source in `leaveOnLog`; R2 #7), separate from
  Power and the icon-down bonus.
- Admitted by §0, then the part-3/4b black path unchanged (Shield decision, `freezeBlack`, the two
  resistance tests, `applyResults`, the jack-out Willpower test, the last attack). Changes:
  - `freezeBlack` copies `noBlaster` into the immutable `hit`; `foldVr2Ic` emits no `finalShot`
    step for a `noBlaster` hit (lethal down or non-lethal unconscious alike).
  - Locks end per HIT (R2 #6; R3 #1): the `hit` copies the card's `attackerInc`. `reconcileEnds(target)`
    writes `lock-end:<card>` for every live deck-keyed hit whose attacker incarnation has ended (§0.8).
    It runs at the start of `passFor` AND at the top of every tick entry point (the `updateCombat`
    trace/hog ticks and the manual trace advance), before anything is ticked or announced (R3 #3). The
    fold releases exactly the hits with a `lock-end`; a new hit from a new incarnation is a new lock.
  - Creation checks too (R5 #1; R6 #1): `freezeBlack` re-checks the card's attacker incarnation; if it
    has already ended, it STILL writes the hit (the attack was committed: both resistance tests and the
    damage go ahead) but with `lockless: true` in the same fact, and the fold never counts a lockless
    hit as a lock or a last-attack obligation.

### 3. Track (R1 #8, #9)
- A decker's `track*` program in the attack dialog against a decker on the log. Card `program:
  "track"`, `rating`, no damage. Resolution (`resistTrack`, beside `resistAttribute`, after §0's
  admission): the target rolls Evasion dice vs TN = the Track rating, recorded as a `res` fact
  (`side: "track"`). The sequencer then writes, once: if attack > evasion, a trace record keyed by the
  CARD: `trace:<conn>:track~<card>` with `icKey: "track~<card>"` (the cycle's identity, used by ticks,
  notices, Relocate and exit steps exactly as an IC key is today), `attacker: <attackerKey>`,
  `turns = locationTurns(attack − evasion)`, `rating`, `track: true`; then the card's ack. Else an ack
  `{ evaded: true }`. A second hit after a Relocate makes a NEW cycle (new card, new key). Before
  writing the trace record the sequencer re-checks the card's attacker incarnation (R5 #1): ended →
  ack `{ attackerGone: true }`, no cycle (this also covers a zero-turn cycle, >10 net successes, that
  would otherwise be "located" at once).
- Termination is sequenced (R1 #9; R2 #8; R3 #1, #3): `reconcileEnds` (§2: start of every pass and
  every tick entry point) writes `trace-dead:<conn>:track~<card>` when the card's attacker incarnation
  has ended, BEFORE any tick is written, so a crash that happened first can never lose to a later completion tick
  (and an offline-GM crash is still on the attacker's log, durable, when the GM returns). Relocate's
  success writes the same fact with `{ relocated: true }`. A dead cycle never revives.
- Relocate against a track: TN = max(2, the attacking decker's Sensor (live, at the roll) − Relocate)
  — the p.46 Relocate test "against the attacking decker's Sensor Rating instead of the system's
  Control Rating"; success → `trace-dead` (fails completely), not a per-turn spoof.
- "Makes logoff more difficult": no number printed — a reminder line on Graceful Logoff only.

### 4. Hog (R1 #10–#12)
- A decker's `hog*` program against a decker on the log. Card `program: "hog"`, no damage.
  Resolution (`resistHog`): MPCP dice vs TN = max(2, Hog rating − Hardening), a `res` fact. The
  sequencer: `net = attack − mpcp`, `points = ⌊net ÷ 2⌋`; if ≥ 1, `hog:<conn>:<card>` `{ points,
  rating }` and the ack; else the ack `{ resisted: true }`.
- **Every application is a fact written BEFORE its consequences** (R1 #11): `hogtick:<card>:<boundary>`
  `{ itemId, loadGen, original, wear }`, `wear` = the EXACT capped count min(points, rating left)
  frozen when the tick is written (R2 #9) — boundary 0 is the hit, then one per Combat Turn boundary on
  the target's combat clock (the trace-tick clock). The infected program is PERSISTED (R1 #10): a tick
  keeps the previous tick's `itemId`/`loadGen` while that copy is still usable; only when it has
  crashed (or was reloaded/purged) does the tick pick the next highest-rated usable program (ties:
  lowest item id). `original` = that copy's rating before any hog wear. No usable program → `hog-done`.
- Hog wear is NOT written into the shared `wearEvents` array (R3 #6: its read-replace writers on two
  clients could erase each other). Each tick's wear is its own key on the program,
  `flags.sr2e.hogWear.<loadGen>_<card>_<boundary>: wear` (a distinct-key merge, never a replace), and
  `effectiveRating` subtracts the entries for the current `loadGen`. Reconciled every pass: a tick
  fact without its key gets it; rewriting the same value is a no-op.
- Purge (`vr2HogPurge`, Matrix tab, per infection): Complex Action; Computer dice vs TN =
  max(2, Hog rating − Hardening + original) (R1 #12). The purge freezes its target (`itemId`,
  `loadGen`) when the dialog opens; the request is refused if the infection's current target differs
  (R2 #10). ≥ 1 success → `hog-purged:<card>` `{ itemId, loadGen }`; the reconcile unloads that item
  ONLY while its `loadGen` still equals the fact's (a Swap Memory meanwhile bumps it, so a fresh copy
  is never unloaded), receipted by `hog-unload:<card>`.
- Swap Memory today bumps `loadGen` and clears `crashed` but never sets `loaded` (R3 #5): it also sets
  `loaded: true`, so a purged program comes back as the rules say.
- The infection ends with the connection.

### 5. Slow (R1 #13–#15; R2 #11–#13)
- A decker's `slow*` program against an IC. Refused against reactive IC (`!isProactive`) and against a
  trace that is locating. The IC's resistance (Security Value + expert + threat, as for damage) vs
  TN = the Slow rating is rolled by whoever resolves, then ONE result per card is committed by the
  sequencer: `slow:<card>` on the IC `{ lost = max(0, ⌊(attack − resist) ÷ 2⌋), combatId, round, gen,
  deckerUuid, session }` (a second resolution of the card is refused; R2 #13). Ties and resistance
  wins: `lost: 0`, posted as no effect.
- Consequences reconciled with receipts: applying requires the fact's combat, round, combatant and
  IC `gen` to still be current (R3 #8); then, in ONE combatant update, Initiative −10 per lost action
  (floor 0) and the receipt `flags.sr2e.slowApplied.<card>: { hung }`, where `hung` is true only when a
  POSITIVE loss took the remaining Initiative to 0 (R3 #7). A stale fact gets the terminal receipt
  `"stale"` and changes nothing. A hung IC is not marked defeated: `nextRound` re-rolls every living
  combatant, so it resumes by itself.
- Driver (R3 #9): `schedule`/`passFor` today accept only characters. IC get their own pass,
  `passForIC(ic)` = `reconcileSlow(ic)`, scheduled on `ready`, on a `vr2:` record created on an IC, on
  `updateCombat`, and when a decker's session ends (suppression cleanup).
- **Suppression is Slow's own lifecycle (R2 #11, #12)**, not the crash choice: while the hang is
  current (`hung` receipt, same combat, same round, same IC `gen`), the card offers the decker "Suppress
  (−1 Detection Factor)", which files `request(decker, "slowSuppress", { card })` on the decker's
  OWN log (R5 #5: a player can't write onto GM-owned IC); the sequencer validates the hang is still
  current and the session live, then writes ONLY `slow-suppress:<card>` on the IC `{ deckerUuid,
  session }` (R3 #10). Release is the same: `request(decker, "slowRelease", { card })` →
  `slow-release:<card>` on the IC. That fact is authoritative: the decker's Detection Factor charge is DERIVED from the live
  `slow-suppress` facts naming their live session (no second write to get half-done). It ends — the IC
  resumes, with NO tally — on a `slow-release:<card>` (the decker's button), when that session ends, or
  when the IC's `gen` changes. Releasing never adds tally.
- Central guard (R1 #15; R2 #11): `icDisabled(ic)` = a current-round `hung` receipt OR a live
  `slow-suppress`; `attackOnce` and every IC sheet action refuse when it's true. Slow NEVER touches
  `defeated` or writes Initiative for a suppression (R5 #2; R6 #2). Instead combat eligibility itself
  excludes it, synchronously: `SR2ECombatant#isHeldOut` = `isDefeated || slowSuppressed(actor)`
  (a pure read of the IC's facts), and `SR2ECombat` uses it wherever it uses `isDefeated` today —
  `livingCombatantIds` (who re-rolls at `nextRound`), `nextEligibleTurnIndex`, `_pointAtFirstLiving`,
  `_clearDefeatedInitiative` (a held-out IC's Initiative is cleared to null like the defeated). The
  pure helpers take the predicate as a parameter, so Vitest covers them. Ending the suppression makes
  it eligible again from the next roll. Independent defeat is never touched.
- A pending last attack by a disabled IC waits, or the GM Waives it (§0.7).
- No combat: the result is posted as text ("loses N actions") for the GM.

### 6. Steamroller
- A decker's `steamroller*` program, offered only against tar IC (`tar-baby`, `tar-pit`). Card level
  `D`, Power = rating. Resisted like any IC damage. Crashing tar with it uses the existing crash
  choice (tally or suppress); no stealth option until 5b. `offerTar`/`tarStrike` skip it (immune).

### 7. Evaluate (R1 #17, #18; R2 #14, #15)
- Degradation is DERIVED from receipts on the program, never read-modify-written: `degradation =
  max(0, Σ flags.sr2e.evalRuns.<opId> − Σ flags.sr2e.evalRestores.<txId>)`, each key written once. GM
  decay and player restores touch different keys, so they can't overwrite each other (R2 #14). ONE
  accessor applies it in both rulesets: `effectiveRating` subtracts it (VR2), `programRating` returns
  `max(0, rating − degradation)` under core. UI only under VR2.
- Run end: `game.sr2e.degradeEvaluate()` (GM; GM macro row) creates the operation card first, with
  `{ opId, roll, loss = ⌈roll ÷ 2⌉, targets: [program uuids] }` — the population is SNAPSHOTTED there
  (R2 #15): evaluate programs on world actors, on every unlinked token actor on every scene, and world
  Items — deduplicated by the program's full document UUID (a linked token resolves to the world
  actor's item; each unlinked token's synthetic actor is its own target; R3 #12). Then each target gets `flags.sr2e.evalRuns.<opId>: loss`.
  "Resume" on the card applies only to snapshotted targets lacking the key.
- Player "Restore with Karma" goes through the sequencer (R3 #11): the player's click files
  `request(actor, "evalRestore", { itemId, points })`. `txId` = the request's id (R5 #3): the handler
  first looks for `evalKarma.<txId>` — present → only finish the item receipt, never debit again —
  and otherwise checks `points ≤ degradation −
  pending` (pending = `evalKarma` receipts whose item restore hasn't landed) and `points ≤ karma`, then
  writes the actor update `karma.current −= N` + `flags.sr2e.evalKarma.<txId>: { itemId, points: N }`
  (one update), then the item's `flags.sr2e.evalRestores.<txId>: N`. Every pass completes any
  `evalKarma` whose item restore is missing. Serialized, so two restorations can't both buy the same
  points. Needs a GM online, like every request. Other Karma writers in the system (learning,
  advancement) are NOT routed through this; see Risks (R5 #4, declined).

### 8. Tests
- Vitest (`vr2ic-rules.test.mjs`): `restoreState` (FIFO allocation, TN after a full repair),
  `restorePoints`, `parseAttackerKey`, `foldVr2Ic` with deck locks + `lock-end` + `noBlaster`
  (no finalShot), track cycle identity + `trace-dead` ordering, hog tick target selection (6/5 with
  points 2 → stays on the 6 until it crashes), Slow `lost` clamping, evaluate loss ⌈d6 ÷ 2⌉.
- Quench batch `sr2e.vr2-utilities`: §0 repro (fails before the fix); reconnect-before-admission
  refused; exit requested after the card still admits the card first; poison by a decker resolves;
  black hammer lock + jack-out test + last attack + Waive + no MPCP shot; killjoy Stun; track lock,
  Relocate kill, a second Track cycle; hog drain over two rounds with an interrupted wear write
  finished next pass, and purge; purge → Swap Memory → reconcile leaves the fresh copy loaded;
  admission → interrupted lastAttack exitRes healed; a second last-attack card refused; Waive releases
  the exit; slow hang + resume next round + suppress/release (no tally) + double resolution refused;
  steamroller vs tar; restore incl. lose 6 / restore 6 / lose 6 → 0; evaluate degrade (interrupted,
  resumed; a program created after is NOT degraded by Resume) + Karma restore interrupted between
  the two receipts and completed by reconcile + two restore requests with the first item receipt
  delayed (the second is refused); attack → attacker crash → LATE resistance (no lock); crash → direct
  combat tick (trace dead before the tick); purge → Swap Memory (loaded again); failed Slow on an IC
  already at Initiative 0 (not hung, no Suppress); an already-crashed attacker's zero-turn Track (no
  cycle); independent defeat during a Slow suppression survives the release; a restore interrupted
  before the request's `done` (no second debit); Suppress/Release by a non-GM player.

## Key decisions & tradeoffs
- Decker attacks are admitted by the sequencer discovering the card (hook + a reconcile pass before
  exits), so no client needs to write onto another player's actor and UI timing can't reorder them.
- Attacker keys are a second format (`deck:`) parsed by one helper, rather than reusing `uuid#gen`
  with a fake generation.
- Hog drain is its own per-tick flag keys subtracted in `effectiveRating` (not the shared
  `wearEvents` array), so nothing else needs to know about hog and no array is ever replaced.
- Slow's "action" = one Initiative pass (10 points), the same unit SR2ECombat uses; "hangs" =
  Initiative 0 for the rest of the turn (re-rolled next turn); a suppressed IC is held out of combat
  eligibility, never marked `defeated`.
- Track's logoff difficulty is not invented.

## Risks / open questions
- Karma has many writers system-wide (spell learning, advancement, awards); a restore racing one of
  them on another client could lose one write. Pre-existing for every Karma writer, not new here;
  unifying Karma writes is its own change (R5 #4, declined in this plan).
- §0 changes behaviour for every decker-vs-decker fight on the log (good, but wide).
- The black last-attack gate for a player attacker depends on that player being online; the GM's
  Waive is the way out.
- Restore's TN when old damage has no stored rating: a GM-typed TN.
- Slow on IC outside the Combat Tracker can only be advisory.
