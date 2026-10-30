# Plan: the Virtual Realities 2.0 Matrix, part 4b — constructs and Shield against black IC
_Round 4 — revised after Codex round 4 (see Revisions; they override §1–§8 where they differ). Brief: Codex part-4 review R1 #10–#12, #14, #15, #18–#19 (constructs)
and R3 #5–#7 (black-IC Shield), in docs/PLAN-vr2-part4-REVIEW-LOG.md._

## Goal
1. **Constructs** (VR2.0 p.52): one IC icon built from two or more IC programs.
2. **Shield against black IC** (p.100): today the black branch never offers Shield.

## Rules (300 dpi renders; PDF = book + 8)
**Constructs (p.52).**
- A GM-designed icon of two or more IC programs ("a Matrix critter").
- Threat Rating (core p.187): Blue none, Green ≤ 1, Orange ≤ 2, Red ≤ 3. Threat dice "may be added to
  all tests except Initiative rolls". Optional: "gamemasters may skip giving constructs Threat Ratings".
- Building: capacity = 2 × SV; combined ratings ≤ capacity; no program > ⌈2/3 × SV⌉ (SV 8 → 16, max 6);
  gray +1 capacity, black +2; armor/shield/shift options (p.50) 2 points each (16 with armor + shift →
  12 left). "Pair a reactive form of IC with a proactive form" to protect reactive IC.
- Cybercombat: always proactive; attacks any available target with any one of its programs; resolved as
  ONE icon with ONE Condition Monitor — fill it and all its programs stop. SV for Attack and Damage
  Resistance tests; component ratings set effects only. Combat maneuvers allowed. Expert applies to
  constructs (p.52: "proactive IC programs and Matrix constructs").
- Initiative "based on the lowest rating of all its component IC programs" (p.120 formula).
- Tar in a construct: −2 TN (part-3 note; party half shipped in 4a).

**Shield (p.100).** "Whenever an attack affects the decker's persona, the decker may make a Shield Test
against a TN equal to the skill of the attacker — … the system's Security Value for IC programs … Reduce
the attacker's net successes by the number of successes achieved on the Shield Test." Loses 1 rating
point each use. Black IC attacks the persona (icon damage + the meat), so it applies.

## Approach
### 1. Identity: icon vs effect (Codex R1 #11)
- Pure `parseIcKey(k)` → `{ uuid, gen, comp }` for `"<uuid>#<gen>"` and `"<uuid>#<gen>/<comp>"`.
  `icKeyOf(ic, comp = "")` appends `/<comp>` for a construct component.
- The **icon** is `uuid#gen` (alive check, crash seq, maneuvers, crash tally, sessionKey). The **effect**
  key (with `/comp`) identifies hits, locks, traces, psychotropic steps, last-attack steps.
- Replace the 9 hand-parsing sites (`lastIndexOf("#")` / `split("#")`: vr2ic-rules `icAlive`;
  vr2ic `icCrashSeq`, :676, :728, :805, :819, :920, :1073; vr2 :1280) with `parseIcKey`. `icAlive` and
  `icCrashSeq` compare the icon part only.

### 2. Data
- `ICData.construct: SchemaField { enabled: Boolean false, threat: Number 0–3,
  components: Array<{ id: String (randomID), program: String blank, rating: Number int ≥ 1,
  psychotropic/scramble/worm: String blank }> }`. Neutral defaults; legacy IC untouched.
- Derived (VR2): `isConstruct`; initiative.base = min component rating (0 components → the actor rating);
  dice `icInitiativeDice(code)` (unchanged). Core-ruleset branch untouched.
- A construct's own `program`/`rating` are ignored by every IC path (sheet hides them).

### 3. The component profile (Codex R1 #10)
`icProfile(ic, comp = "")` → `{ comp, program, rating, icClass, psychotropic, scramble, worm }` from the
component, or from the actor's own fields for an ordinary IC. Consumers switch to it:
- `attackOnce` (vr2.mjs:580–616, 662): the dialog adds a **Program** select for a construct (its usable
  proactive-capable components: not crashed, not reactive-only); the chosen profile drives black kind and
  rating, trace (rating, `trapFor` stays the actor's — see §6), crippler attribute/rating/name, the card's
  `program`/`icClass`, `icKey = icKeyOf(ic, comp)`, `icRating`, and the admission payload.
- Dialog rating display (vr2.mjs:515) uses the profile.
- Freeze (`HANDLERS.black`) copies `psychotropic` from the card state into the `hit` fact; `psy` handler
  (:805) and `pcpicTN` (:819) read the hit's `psychotropic`, not the live actor. Legacy hits without it
  fall back to the live actor (old behaviour).
- Gray/sparky consequences already read `st.icRating ?? st.power` (4a); trace reads `st.icRating`.
- Crash tally when a decker crashes a construct (vr2.mjs:823): the construct's **highest** component
  rating (book silent — decision below).
- `blackRating(ic, decker)` gains a `rating` argument (profile rating) for the jack-out gate (vr2.mjs:1246,
  vr2ic :167): for a lock, the hit's frozen `rating` is used instead of the live actor.

### 4. Reactive components (Codex R1 #12)
- `offerTar` (vr2ic :433) iterates "reactive entries": every ordinary reactive IC on the host as today,
  plus each construct's reactive components (tar-baby, tar-pit, worm, scramble-poison) that aren't
  crashed. Buttons carry `card|icUuid|comp`; `icOp` resolves the profile.
- `tarStrike(actor, ic, ref, card, comp)`: dice/TN/pit from the profile; −2 TN when in a construct (or
  party). A tar WIN crashes **the component**, not the construct: a durable `compCrash` record on the IC
  `vr2:comp-crash:<gen>:<comp>`; a crashed component is excluded from attacks and offers until the
  construct's generation changes (a crash/reset of the whole icon restores it, as a fresh icon).
- `poisonTest`, `wormTest`: dice from the profile; the worm record's kind from the profile.
- **Not in constructs:** data bombs and exploding scramble (they link to separate bomb actors), and
  `trapFor` per component (the construct's own `trapFor` still applies to the whole icon). The sheet's
  component program list omits `data-bomb`; MATRIX.md says so.

### 5. Threat dice (Codex R1 #14)
`threatOf(ic)` = construct.threat clamped to the code's cap (Blue 0, Green 1, Orange 2, Red 3), else 0.
One helper `icTestDice(ic, base)` = base + threat used at EVERY construct test site except Initiative:
attackOnce (IC attack), vr2MatrixResist (IC defender), vr2Maneuver / opposeManeuver (IC side), tar,
tar-pit, poison, worm tests. It adds to the dice count (no `miscDice` override, so a dialog's own misc
dice survive). Expert also applies (4a's `expertOf`: a construct counts as proactive).

### 6. Budget and limits
`constructBudget({ sv, code, components, defenses, threat })` (pure, Vitest): capacity 2·sv; per-program
⌈2·sv/3⌉; gray +1, black +2; armorDefense/defense 2 each; ≥ 2 programs; threat ≤ cap. The sheet shows
"used/capacity" and the problems; an over-budget construct's attack is refused ("over capacity").
- Not with 4a's options: a construct can't be cascading or join a party (book doesn't combine them;
  `formParty` and the cascading checkbox refuse/disable for constructs). Expert is allowed.

### 7. Shield against black IC (Codex R3 #5–#7)
In `resistOnLog`'s black branch, BEFORE requesting the freeze:
- If no `vr2:shield:<card>` record exists: `askShield` once, then `recordEvent(defender, vr2:shield:<card>,
  { successes, itemId, loadGen })` (durable; a retry reuses it, never re-rolls) and wear once (addWear
  keyed by the card, as today).
- The `black` request carries nothing new: `HANDLERS.black` reads the shield record; frozen
  `attackSuccesses = max(0, successes − shield)`. If that is 0 → write `ack:attack:<card>` with
  `{ boxes: 0, shieldCancelled: true }` and NO hit (no lock, no resistance); further `black` requests for
  the card are no-ops (ack exists).
- `resistOnLog` waits for EITHER the hit or that ack; on the ack it posts "Shield stopped the black IC"
  and returns without resistance rolls.
- `foldVr2Ic`: an admitted card with an `ack:attack` and no hit is resolved (already true) → the exit
  barrier releases. 4a's classifier counts it as a neutralized hit (rating) for a cascading black IC.
- A Shield utility on the decker but the decker declines: a `{ successes: 0, declined: true }` record,
  so the question isn't asked twice.

### 8. Tests
- Vitest: `parseIcKey` (plain, component, odd uuids with `.`), `constructBudget` (SV 8: 16/6; armor+shift →
  12; gray +1, black +2; threat caps per code; 1 program → problem), `icProfile` (pure part).
- Quench `sr2e.vr2-constructs`: a construct (killer + black-psychotropic + tar-baby) — attack picks the
  black component: SV dice + threat, the hit freezes its psychotropic subtype, the lock is the effect key
  and releases when the construct crashes (one monitor); the killer component's card has the right icKey;
  Initiative = lowest rating; tar component wins → only it crashes, the killer still attacks; threat dice
  on its resistance; over-budget attack refused; legacy IC unchanged.
- Quench (black Shield): Shield cancels a black hit → no hit, no lock, ack boxes 0, exit not blocked; a
  partial Shield reduces frozen successes; a retry after a reload doesn't re-roll Shield or double-wear;
  a decision record written but wear not yet applied → the next sequencer pass applies the wear once; two
  clients' decisions → one record; Shield wear on two black cards at once → both charged; a decision with no `black` request → frozen by the next pass; a failed `black` handler (done, no hit) → frozen by the next pass.
- Interruption regressions: a pass over an old (v1) winning tar fact does nothing and doesn't block; a winning v2 tar fact with no `compCrash`/`crash`/`corrupt` → the next pass writes
  them; a construct ripper's interrupted resolution keeps its threat; the jack-out gate uses `icRating`.
- All VR2 batches re-run (part 3's black tests exercise the parse changes).

## Revisions after Codex round 1 (binding)
**R1. Central helpers** (vr2ic.mjs): `parseIcKey(k)`, `iconKeyOf(k)` (strip `/comp`), `icKeyOf(ic, comp)`,
`icProfile(ic, comp)`, `compAvailable(ic, comp, gen)` = the IC is a construct, `gen` matches its generation,
the component exists, no `compCrash` record for (gen, comp), and the icon monitor is below 10. Every
construct attack and reactive handler calls `compAvailable` at EXECUTION time (not only when offering).
Session/maneuver keys keep `uuid:gen` (unchanged).

**R2. Threat everywhere it's an IC test** (Codex #1): the attack card snapshots `threat`; `HANDLERS.black`
copies it into the `hit`, and the apply/resolved requests carry it into `gray`/`ripper` records.
`applyRippers` (:360), `resolveGray` (:382) and `STEP_RESOLVERS.finalShot` (:889, double rating) add the
record's `threat` once. Legacy records without it add 0. Initiative never.

**R3. Worms** (Codex #2–#4): infection dice stay host SV (+ threat for a construct); the profile gives the
subtype. Infection record key `${DECK}worm:${card}:${worm.id}:${gen}:${comp}`. Disinfect on a construct
component writes `compCrash` (no generation bump); an ordinary worm IC keeps today's behaviour.

**R4. Reactive actions carry the generation** (Codex #5): buttons are `card|icUuid|gen|comp`; `icOp`
refuses with "that IC has changed" unless `compAvailable` (constructs) or the generation matches (ordinary).

**R5. Tar: durable result + central reconciliation** (Codex R1 #6, R2 #1–#2): the `tar` fact stores
everything its consequences need — `{ v: 2, card, icKey (effect), gen, comp, won, pit, utility: { itemId, loadGen,
name, programKey, g }, conn, deckUuid }`. A pass step `reconcileTar(actor)` (in `passFor`, before
`processRequests`) finds every WINNING `v: 2` tar fact whose consequences are missing and writes them (older facts lack the
context and are skipped — they were applied in full by the old code path), each with a
deterministic key: the utility `crash` record, the component `compCrash` (construct) / the IC crash
(ordinary, only if that generation is still current), the tar-pit `corrupt` record on `deckUuid`. It never
re-checks availability (that gates NEW strikes only). `tarStrike` itself: availability → roll → the `tar`
fact → reconcile. A manual strike's key uses the GM's chosen card id, persisted in the fact, so a retry
finds it.

**R6. Dead icon** (Codex #7): a construct with a full monitor can't attack or trigger anything
(`compAvailable`). Reset = the GM lowers the monitor (as for any IC today); the new generation clears the
component crashes.

**R7. Manual tar strike** (Codex #8): the IC sheet shows one "Strike a utility" button per tar
component (`data-arg = comp`); `sheetOp("strike")` passes the profile.

**R8. Traps** (Codex #9–#10): `fireTrap`'s receipt is keyed by `iconKeyOf(key)`, so a construct's trap
fires once however many effects reach it. A construct can't BE a linked hidden trap: `trapFor` pointing
at a construct is refused on the sheet (warning) and ignored at runtime (`fireTrap` and the trace TN treat
it as no trap, with a GM whisper).

**R9. 4a options off for constructs at runtime** (Codex #11): `partyOf`, `cascadeBaseline().on` and
`cascadeOf` return 0/false for a construct whatever its stored fields; `expertOf` counts a construct
as proactive.

**R10. Black Shield, exact flow** (Codex R1 #12–#13, R2 #4), in `resistOnLog`'s black branch:
1. If the card has a `hit` or an `ack:attack` → skip Shield entirely (frozen or terminal: legacy-safe).
2. If a `vr2:shield:<card>` decision record exists → use it. Otherwise this client decides: no Shield
   utility → `{ successes: 0, none: true }`; declined → `{ successes: 0, declined: true }`; used → roll,
   `{ successes, itemId, loadGen }`; then `recordEvent` it. The server admits ONE record per card: a client
   that loses the race re-reads the winner's record and uses it (its own roll is void and charges nothing).
3. Wear is NOT applied by the clients: `HANDLERS.black` (the sequencer, serialized) applies `addWear` for a
   used Shield from the decision record, idempotent per card, before freezing — so two clients never write
   the utility's `wearEvents` concurrently, and an interruption is finished by the next pass.
4. The `black` request carries `shieldDecided: true`; `HANDLERS.black` requires the record when that's set
   ("no Shield decision" otherwise); a request WITHOUT the flag (an old client) freezes with 0 Shield.
5. Frozen successes = successes − Shield; 0 → `ack:attack:<card>` `{ boxes: 0, shieldCancelled: true }`, no hit.
6. The wear-and-freeze is one idempotent sequencer function `freezeBlack(actor, card)`. `HANDLERS.black` calls
   it, AND a pass step `reconcileShieldFreeze(actor)` (in `passFor`, after `processRequests`) calls it for
   every admitted black card on the live connection with a Shield decision but no `hit` and no `ack:attack` —
   independent of request/done records, so a client that stopped before sending `black`, or a handler that
   failed and was marked done, is finished by the next pass.

**R11. Schema** (Codex #14): `construct.enabled` Boolean false; `threat` Number integer 0–3 initial 0;
`components` ArrayField of SchemaField { `id` String required non-blank (randomID set ONLY when a row is
added), `program` String blank:true, `rating` Number integer min 1 initial 1, `psychotropic`/`scramble`/
`worm` String blank:true }. Programs offered: the proactive set + tar-baby, tar-pit, worm, scramble
(poison only — exploding refused at runtime). The sheet edits rows by id (never re-creates ids). Construct
sheet eligibility (Expert enabled, Cascading/Party hidden) comes from `isConstruct`, not the actor program.

**R12. Last attack prompt** names the component (`<IC> (<component program>) makes one more attack`).

**R13. Threat survives attribute recovery** (Codex R2 #3): the card's `threat` goes into the atomic
`vr2AttrPending` receipt and every reconstructed `resolved` request, and on to the `ripper` record.

**R14. Frozen black rating vs Power** (Codex R2 #5): the `hit` fact gains `icRating` (the component's
effective rating, from the card) beside `rating` (damage Power). The jack-out gate and `pcpicTN` use
`hit.icRating` + the CURRENT icon-down bonus; a legacy hit without `icRating` uses `hit.rating` as today.

**R15. Component validity** (Codex R2 #6): `constructBudget` also reports duplicate or blank ids, blank
programs, programs outside the allowed set, and `scramble: "exploding"`. Every construct action (attack,
reactive trigger, sheet strike) refuses while there are problems; the sheet lets incomplete rows exist
while editing and lists the problems.

## Key decisions & tradeoffs
- Effect key `uuid#gen/comp` instead of separate records per component: every existing fold keyed by
  icKey keeps working; only the parse sites change.
- Crashed components tracked per generation; the whole icon's crash is the existing generation bump.
- Construct crash tally = highest component rating (book silent; sum would over-punish crashing it).
- No data bombs / exploding scramble / per-component traps inside constructs (they need linked actors);
  documented.
- No cascading/party for constructs.

## Risks / open questions
- Any consumer missed in §3 makes a construct act as its first component — the Quench batch attacks with
  two different components to catch that.
- Psychotropic hits recorded before this change lack the subtype: fallback to the live actor.

## Out of scope
The utilities chapter (incl. the area-effect option), grid topology.
