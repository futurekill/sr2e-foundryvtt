# Plan: Net-success damage staging (RULES-AUDIT-3 C1 + C2)
_Round 3 — revised after Codex round 3_

## Goal
Ranged, blast, shotgun-spread and vehicle damage must stage on **net**
successes (SR2E p.91, p.97, p.108, p.110): compare attacker vs defender; the
winner stages one level per 2 full net successes; a tie does base damage; below
Light = no damage. Today the attack card stages up on ⌊attacker/2⌋ and the
resistance roll stages down on ⌊defender/2⌋ independently, which over-grants
damage whenever the rounding splits (4 vs 3: book M, us S). Bundle the
knockdown off-by-one (C2: must *exceed* the threshold, p.91–92).

## Approach
1. **Pure rule** in `sr2e-rules.mjs`:
   `stageByNet(baseIdx, attackerSuccesses, defenderSuccesses)` →
   `{ idx, net }`, with `base` first clamped to [0, 3] (printed + burst +
   called shot can sum past D): `min(3, base + ⌊net/2⌋)` if net > 0, `base − ⌊−net/2⌋` if
   net < 0 (idx < 0 = no damage), `base` on a tie. Unit-tested with p.91's
   Liam/Snot example (9M: 5 vs 3 → S, 3 vs 5 → L, 3 vs 3 → M, 7 vs 3 → D)
   and rounding splits (4 vs 3 → M; 2 vs 1 → M; 1 vs 4 → L).
2. **Immutable snapshot, one format marker.** A new-format resist button
   carries `data-stage="net"`, `data-level` = the **pre-staging** level (printed
   level + burst levels + called shot) and `data-stage-vs` = the attacker's
   successes **as posted**. No live read at resist time: complete-miss and
   staging use the same frozen number, and a blast's scatter and every row use
   the same number. `data-attacker-successes` keeps its single meaning (p.91
   complete-miss eligibility), so blasts get `data-stage-vs` but not it.
   Buttons without `data-stage="net"` run the old path unchanged.
3. **Producers — every one enumerated**
   - Direct ranged card (`item.mjs` ~l.989–1100): pre-staging `data-level`,
     `data-stage="net"`, `data-stage-vs`, plus `data-rated-level` (printed
     level) and `data-called-shot` for vehicles (step 5). Card shows the
     pre-staging code and "N successes — net against the target's resistance
     roll".
   - **Blast launcher** (`item.mjs` ~l.905 `.sr2e-blast-btn`) gains
     `data-stage="net"` → click handler → `resolveBlast({…, netStaging})` →
     rows: `data-level` = base level, `data-stage="net"`,
     `data-stage-vs` = the same `attackerSuccesses` used for scatter,
     `data-rated-level` = base level. **Called shot propagates:** the attack
     already paid the +4 TN (`canCallShot` admits a heavy weapon firing SS/SA/BF),
     so the launcher carries `data-called-shot`, and rows get `data-level` =
     base + 1 (clamped to D) and `data-called-shot` for the vehicle exception.
     An old launcher (no marker) still emits legacy pre-staged rows.
   - **Spread launcher** (`item.mjs` ~l.931 `.sr2e-spread-btn`) → handler
     (`sr2e.mjs` ~l.2212) → `resolveShotgunSpread` → rows: same treatment,
     keeping their existing `data-attacker-successes` (complete miss applies to
     spreads today, unchanged); `data-rated-level` = base level; called shot
     propagated exactly as for blasts (a shotgun firing SS/SA/BF passes
     `canCallShot`).
   - **Damaging manipulation** (`resistManipDamage`, `sr2e.mjs` ~l.1811): p.158
     routes it through the ranged procedure, so it has the same defect. Pass
     `snap.baseLevel` and `stageVs: snap.successes` instead of pre-staging; its
     existing snapshot + `beforeRoll` guard already freezes the total (and
     manipulation, unlike weapon cards, stays Karma-synced via
     `_syncDependentCards`). **Versioned:** new cards write
     `flags.sr2e.manipDamage.staging = "net"`; the renderer and
     `resistManipDamage` branch on it, so an unversioned card resolves exactly
     as it displays.
   - Melee hits, astral, spirit attacks: unchanged (opposed tests / separate
     findings).
4. **Consumer** — the `.sr2e-resist-btn` handler passes
   `stageVs` (only when `data-stage="net"`) to `rollDamageResistance`. There:
   flechette +1 on the base (unchanged) → complete-miss check (unchanged, same
   frozen `attackerSuccesses`) → `stageByNet(startIdx, stageVs, d)` instead of
   `startIdx − ⌊d/2⌋`. The dialog text and the outcome line explain the net
   ("attacker 4 vs your 3 → net 1: base damage") on the new path; legacy
   wording on the old.
5. **Vehicles** — `rollDamageResistance`'s vehicle dispatch forwards
   `stageVs`, `ratedLevel` and `calledShot`. `rollVehicleDamageResistance` on the
   new path: "weapons **rated** as Light cannot affect vehicles unless… called
   shot" is judged on `ratedLevel` + `calledShot` (a Light burst is still
   Light-rated); then −1 level on the (clamped) pre-staging level, then
   `stageByNet`. No floor needed: Light + called shot = M → L. The
   **special-ammunition** exception and the **anti-vehicle rocket/missile**
   exception (no level reduction) are NOT implemented — neither is today; both
   are logged in RULES-AUDIT-3 rather than claimed. Legacy path unchanged.
6. **Knockdown** (C2): `knockdownOutcome` → `s > threshold` is "none";
   JSDoc + `test/knockdown.test.mjs`.
7. **Tests** — unit: `stageByNet`; knockdown boundaries (M: 2 → stagger,
   3 → none). Quench (deterministic dice): single-shot 9M, attacker 4 vs
   defender 3 → M (3 boxes); a legacy resist button, an old blast launcher and
   an old spread launcher (no marker) each still produce the old staging; an
   unversioned manipulation card still resolves as displayed; vehicle: base-M
   hit, attacker 4 vs vehicle 3 → L (proves `stageVs` is forwarded), and
   separately a Light-rated burst → no effect; the same Combat Pool result is a
   complete miss on a spread row but ordinary net staging on a blast row;
   manipulation 4 vs 3 → base level; unit cases where the modified base
   exceeds D with a tie and a defender win, and base-M 6 vs 6 → M (the old
   code gave L — the defect also UNDER-states); end-to-end: an S weapon, 3-round
   burst + called shot (S+2 → clamped D), tied successes → D against a
   character and S against an eligible vehicle (clamp before the −1); a called
   shot through the spread launcher lifts the row level.
8. CHANGELOG (Unreleased), QA-PLAN rows, `AUDIT-2026-07.md` §4 correction.

## Key decisions & tradeoffs
- **Frozen snapshot, not live.** Karma spent on the attack *after* its card
  posts is not reflected (pre-existing: the card never updated). Live sync —
  including turning an initial miss into a hit, which today posts no damage
  card at all — is a separate follow-up via the existing
  `_syncDependentCards` machinery, logged in RULES-AUDIT-3 (C8). Manipulation
  cards are the exception: they already sync, guarded by `beforeRoll`.
- **Separate `data-stage-vs`** so blasts stage by net without inheriting the
  complete-miss rule.
- **Explicit format marker** on launchers and rows; unmarked = legacy.
- The attacker no longer sees a final damage code, because it is not
  knowable until the defender rolls — the book's procedure.

## Risks / open questions
- Blast rows have no complete miss by design.

## Out of scope
Short bursts (C3), multiple targets (C4), melee visibility (C5), scatter
diagram (C6), conjuring/astral findings — separate passes.
