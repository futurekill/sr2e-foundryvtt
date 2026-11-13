# Plan: the Virtual Realities 2.0 Matrix, part 4a — expert, cascading and party IC (pp.51–53)
_Round 5 — revised after Codex round 5 (constructs + black Shield → part 4b)_

## Goal
Implement VR2.0's optional **expert IC**, **cascading IC** and **party IC** on the part-3 engine
(`module/vr2.mjs` attack/resist, `module/vr2ic.mjs` GM-client sequencer + event log), and fix the
**Shield-to-zero** bug found on the way. All three are opt-in per IC document (GM design choices in
the book), so no world setting; untouched IC behave exactly as today.

**Constructs move to part 4b** (own plan). They need every IC effect consumer to read a per-attack
component profile instead of `actor.system.program/rating` — Codex round 1 #10–#12, #14, #15 list the
reads; that refactor is too large to ride along here.

## Rules (300 dpi renders; PDF = book + 8)
**Proactive IC** (p.41, p.45): killer, cripplers (white); blaster, sparky, rippers (gray); black IC;
and trace IC during its hunt cycle (it "makes Attack Tests", then "becomes reactive" after a hit).
Reactive (never cascade/expert): tar baby, tar pit, data bomb, scramble, worms.

**Cascading IC (p.51).** "Any proactive IC program may be programmed to cascade."
- Misses (its Attack Test fails): +1 to the Security Value used for its attacks, each subsequent
  Attack Test, cumulative.
- Attacks successfully but the decker "resists all of the damage or otherwise neutralizes the IC's
  effect": +1 to the IC's rating for subsequent attacks, cumulative.
- Each increase capped (Cascading IC Table): Blue 1; Green 25% of original rating or 2; Orange 50% or
  3; Red 100% or 4, whichever higher. The example caps SV and rating separately (Green-6 → 8; Killer-5 → 7).

**Expert IC (p.52).** Proactive IC: raise the attack rating (Attack Test dice = SV) or the damage-
resistance rating (dice = SV) by 1–3; the other drops by the same. Expert Offense-2/Blaster-5 on Red-6:
attack 8 dice, resistance 4.

**Party IC (p.52–53).** A cluster of independent IC (each a separate icon, beaten separately).
- Every Attack Test by a member: +N TN (N = programs in the cluster).
- The decker's TN to hit any member: +N, except tests with an area-effect combat utility.
- Both continue after the decker crashes members (N = original size).
- Capacity 2 × SV of combined ratings; at most ⌊SV ÷ 2⌋ components; every IC option costs 1 point;
  "non-IC component programs may have any rating". Part 3: PCPIC can't share a party with other black
  IC (p.50). Tar inside a construct or party IC gets −2 TN (part-3 note, unimplemented).

**Shield (p.100).** "Reduce the attacker's net successes by the number of successes achieved on the
Shield Test." Reduced to 0 = the attack has no successes = no damage. Today `matrixCombatOutcome(level,
0, r)` still stages BASE damage (Codex R1 #6) — a bug in both damage paths.

## Approach
### 1. Pure rules (`module/rules/vr2ic-rules.mjs`, Vitest)
- `PROACTIVE_IC` set (above); `isProactive(program)`.
- `cascadeCap(code, original)`: blue 1; green max(⌊o/4⌋, 2); orange max(⌊o/2⌋, 3); red max(o, 4).
  Rounding down (book silent; affects o ≥ 12 Green, o ≥ 8 Orange). Separately for SV and rating.
- `cascadeBonus(records, { code, sv, rating })` → { sv: min(misses, capSV), rating: min(neutral, capR) }.
- `expertDice(sv, expert)` → { attack: max(0, sv + e), resist: max(0, sv − e) }, e ∈ [−3, 3].
- `partyBudget({ sv, members })` → { capacity: 2·sv, used, maxMembers: ⌊sv/2⌋, problems[] } with options
  (expert ≠ 0, cascading, armorDefense, defense shield/shift) 1 point each; PCPIC + other black → problem.
- Shield: `matrixCombatOutcome` callers treat attacker successes ≤ 0 after Shield as "no damage"
  (`{ level: null, boxes: 0 }`) — done at the call sites, not inside the shared staging function.

### 2. Data (`ICData`, all neutral defaults; StringField blank traps avoided)
- `expert: Number { integer, initial 0, min −3, max 3 }`.
- `cascading: Boolean { initial false }`; `cascadeEpoch: Number { integer, initial 0, min 0 }` (GM reset
  bumps it; NOT the generation, which part 3 uses for locks/traces/maneuvers).
- `party: SchemaField { id: String { initial "", blank true }, size: Number { integer, initial 0, min 0 } }`.
- Prepared: `isProactive`. No migration needed: defaults are inert.

### 3. Expert (vr2.mjs)
- One predicate `expertOf(ic) = isProactive(ic.system.program) ? ic.system.expert : 0` for BOTH paths
  (a program changed to reactive keeps the field but it does nothing).
- `attackOnce` IC branch: `dice = expertDice(sv + cascade.sv, expertOf(actor)).attack`.
- `vr2MatrixResist` IC defender: `dice = expertDice(st.securityValue, expertOf(defender)).resist`
  (the DEFENDER's, read live; no cascade). `resistOnLog` (a decker resisting) untouched.
- Card state snapshots `expert` and the dice used.

### 4. Cascading — DERIVED from the deckers' durable records (nothing written to the IC)
- **Attack-time snapshot** (`attackOnce`, before rolling, IC attacker only): `cascade0 = { on, gen, epoch,
  code, sv0, rating0 }` where `on` = `cascading && isProactive(program)`, `gen` = generation, `epoch` =
  `cascadeEpoch`, `program`, `hostUuid`, `sv0` = host base SV, `rating0` = AUTHORED rating; plus
  `successes` (final: IC have no
  Karma). Stored on the card state AND passed in the `attack` request; `HANDLERS.attack` copies it into
  the `admit` fact (`{ ..., cascade0, successes }`).
- **Pure classifier** `cascadeOutcomes(records)` (vr2ic-rules.mjs, Vitest) over ONE decker's
  `recordsOf()` (all connections, live and ended) → `[{ icKey, card, kind }]`, built from DISTINCT
  `admit` facts with `cascade0.on` (one increment per card at most):
  - `successes === 0` → `sv` (miss; refused cards never get an `admit`).
  - `successes > 0` and the card's `ack:attack` has a numeric `outcome.boxes === 0` → `rating`.
  - `successes > 0` and an attribute ack with a numeric `outcome.lost === 0` → `rating` (missing → nothing).
  - black: the `hit` plus BOTH its icon and meat resistance acks, both `boxes === 0` → `rating`.
  - an ack with a `trace` PROPERTY (`"trace" in outcome`, even `{ trace: 0 }`) → nothing.
- **Bonus** `cascadeOf(ic)`: `{ sv: 0, rating: 0 }` immediately unless the IC is CURRENTLY `cascading`
  and proactive (turning it off stops the bonus at once). Otherwise run the classifier, keep only outcomes with `icKey === icKeyOf(ic)` (this IC, this
  generation — two identical IC never share increments), then over every decker (`allDocs()` characters), keep entries
  whose `cascade0` matches the IC's CURRENT `{ gen, epoch, program, hostUuid, code, sv0, rating0 }`,
  count by kind, cap with
  `cascadeCap(code, sv0)` / `cascadeCap(code, rating0)`. Pure + recomputed each attack → no lost or
  doubled increments, nothing to reconcile.
- **Explicit reset:** a `preUpdateActor` hook on IC bumps `cascadeEpoch` whenever `program`, `rating`
  or `hostUuid` changes (so reverting a change can't resurrect old outcomes); the GM button bumps it too.
  HOST baseline edits (the host's Security Value or code) are matched, not reset: outcomes under another
  baseline don't count, and editing the host back restores them. Deliberate — the GM controls hosts.
- **Ordering:** a cascading IC's attack must be rolled by the ACTIVE GM (the sequencer); another client
  is refused with "Cascading IC attacks are rolled by the active GM". Before computing the bonus,
  `attackOnce` awaits `Y.flush()` = the full sequencer pass (`processRequests`, `applyResults`, the rest
  of `schedule`'s body) for EVERY on-log decker, in the sequencer queue — so admissions and any already-
  rolled `apply`/`resolved`/black resistance are acknowledged before the next attack. A resistance not
  yet rolled simply hasn't neutralized anything yet.
- **Effective rating** `rating0 + cascade.rating` feeds every attack-time rating consumer in
  `attackOnce`: ordinary Power, `blackRating` (+2 icon-down on top), crippler/ripper `effect.rating`
  (the decker's opposed TN), trace's `rating` in `traceFactor`. The card state gets `icRating` =
  effective rating, and the consumers that read Power as a rating switch to it: `traceStart` (reads
  `st.icRating ?? st.power` → now always set) and `resistOnLog`'s apply request (`rating: st.power` →
  `st.icRating ?? st.power`, legacy cards fall back), which feeds the gray (blaster/sparky) record. The
  authored `system.rating` is never changed.
- **SV bonus** adds to the Attack Test dice only (not resistance, not trace's TN).
- **Scope:** only attacks on a decker on the connection log cascade (the admission is the evidence). An
  IC attacking a decker without `vr2Conn` (the legacy direct path) or another icon doesn't — documented
  in MATRIX.md, and the attack card says "no cascade (not on the connection log)".
- Sheet: "Cascading" checkbox (disabled for reactive programs); "Cascade: SV +a/capA, rating +b/capB";
  GM "Reset cascade" (bumps `cascadeEpoch`).

### 5. Party IC
- **Formation:** GM action "Form party IC" on the selected IC tokens (IC sheet header / token HUD):
  dedupe by actor UUID (linked tokens share one), require ≥ 2 members, one common host, all IC; validate
  `partyBudget`; refuse with the problems listed. Writes `party.id` (random) and `party.size = N` to all.
  "Leave party" clears one member's id (size unchanged on the others — N is the original size).
  A duplicated IC keeps its party fields; the sheet shows "Party: N members (id …)" so the GM sees it.
- **TN:** in `attackOnce`, AFTER the effect-specific TN (trace replaces the base TN) and before the
  final `max(2, …)`: attacker in a party → `+party.size`; decker attacking an IC in a party → `+size`
  unless the dialog's "Area-effect utility" box (shown only for a party target) is ticked. The choice
  is stored on the card. IC-vs-IC attacks get no target penalty (the rule is the decker's).
- **Membership** `partyOf(ic)` = nonblank `party.id` AND `party.size ≥ 2` → size, else 0; the ONLY gate
  for the attacker TN, target TN and tar.
- **Tar:** `tarStrike` TN −2 when the tar IC is in a party (before the final minimum).
- Non-IC party components: deferred (no non-IC Matrix program actors exist yet) — noted in MATRIX.md.

### 6. Shield-to-zero fix (p.100)
Short-circuit BEFORE armor wear and simsense overload at both NON-BLACK damage sites: `vr2MatrixResist`
(direct) and `resistOnLog` (on-log): `atkS ≤ 0` → outcome `{ level: null, boxes: 0 }`, so the apply
request carries `boxes: 0` (→ a `rating` cascade for a cascading IC). Attribute attacks already work
(Shield successes add to the decker's opposed test). **Black IC never offers Shield today** (p.100 says
it should): that needs its own freeze/ack/retry design (Codex R3 #5–#7) → part 4b.

### 6a. Attribute admission + recovery (Codex R1 #5, R3 #8–#9)
- `vr2MatrixResist` → `resistAttribute` for a decker on the log: verify the card's `admit` on the live
  connection BEFORE committing any attribute loss; unadmitted → "that attack wasn't admitted".
- `HANDLERS.resolved` requires a numeric `lost` (else refuse, no ack).
- `resistAttribute`'s committed receipt gains the recovery metadata `{ conn, card, rating (effective),
  program }` alongside `{ attr, lost }`. The sequencer pass runs a `recoverResolved` step BEFORE
  `processRequests`: for any receipt whose card has no `resolved` request and no ack, it writes the
  request; `processRequests` then acknowledges it in the same pass, so `flush()` returns only after the
  ack exists. Old receipts without the metadata are skipped (legacy, logged).

### 7. Tests
- Vitest: cascadeCap (Green-6 → +2; Killer-5 Green → +2; Blue 1; Red-3 → 4; Orange-10 → 5), cascadeBonus
  (gen/epoch filtering, caps), expertDice (Red-6 ±2: 8/4 and 4/8), partyBudget (SV 8: cap 16, max 4
  members, options 1 each, PCPIC+lethal black → problem), isProactive, Shield-to-zero outcome.
- Quench `sr2e.vr2-optional-ic` (VR2 world setting on, a host, a connected decker, sequencer = GM):
  expert offense/defense on attack AND IC resistance; cascading killer: a forced-0 attack → next attack
  +1 SV; a fully resisted hit → +1 rating; caps; refused attack doesn't cascade; replaying the
  sequencer pass doesn't double-count; reset epoch and crash clear it; changing the IC's rating makes
  old outcomes stale; an outcome acked under an old epoch doesn't count; the rating bonus raises Power,
  black Power and a crippler's TN; trace miss → SV, trace success → nothing; mixed black outcome (icon 0,
  meat 2) → nothing, both 0 → rating; a reactive IC's expert does nothing; Shield-to-zero → no damage
  and a rating cascade; flush picks up an already-rolled pending resistance; a non-sequencer GM is
  refused; two identically configured IC on one host cascade independently; rating changed and changed back → still reset (epoch); party of 3: member attack +3 TN, decker +3 TN, area box removes it, still +3 after a
  member crashes; formation dedupes a linked IC selected twice and refuses over-budget; legacy IC
  unchanged (expert 0, not cascading, no party).

## Key decisions & tradeoffs
- Split constructs out (risk isolation).
- Cascade is DERIVED from durable decker records (admission snapshot + acks) by a pure classifier,
  never stored on the IC: nothing to lose on interruption, nothing to double-count, no player writes to
  GM-owned IC (Codex R1 #1–#4, R2 #2–#5).
- Separate `cascadeEpoch` for resets so generation semantics (locks, traces) are untouched.
- Percent caps round down.
- Area-effect = a dialog box until the utilities chapter models program options.

## Risks / open questions
- Cost: the bonus scans every decker's records per IC attack — a handful of actors; fine.
- Part-3 records must not be pruned for this to stay correct (they aren't today; if pruning is ever
  added, cascade needs a snapshot first).
- A decker attacked while NOT on the connection log (shouldn't exist under VR2) — such attacks don't
  cascade; documented.

## Out of scope
Constructs and black-IC Shield (part 4b), the utilities chapter, grid topology, non-IC party components.
