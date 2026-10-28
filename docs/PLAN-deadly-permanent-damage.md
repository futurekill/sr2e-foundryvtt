# Plan: permanent damage from Deadly wounds (core p.113–114)
_Round 4 — revised after Codex R1–R4 (see PLAN-deadly-permanent-damage-REVIEW-LOG.md)_

## The rule (rendered, corrected 11th printing, "Deadly Wounds and Permanent Damage")
"When a character suffers a Deadly wound, there is a chance of permanent damage to a vital organ,
limb, or biological system. Make a Body Test (dermal armor counts) against a Target Number 4. If a
trauma patch was used, apply a +2 modifier."
- **0 successes:** a vital organ, body part or system is gravely damaged. "The patient must be kept
  under continuous treatment by another character with Biotech Skill even if the wounded character
  has been stabilized. **Double the time for the entire healing process.** A replacement organ …
  must be transplanted." 1D6: 1 Body, 2 Strength, 3 Quickness, 4 Intelligence, 5 Willpower,
  6 Reaction — lose 1 point; it "cannot be recovered, though [it] can be replaced by cybernetic or
  other means", and the loss "drops the character's Racial Maximum for that Attribute by 1".
- **1 success:** a limb or eye is mangled beyond healing; a replacement (natural or cyber) is
  required; "**Increase the base healing time by 50 percent**". 1D6: right arm, left arm, right
  leg, left leg, an ear (1D6: 1–3 right, 4–6 left), an eye (1D6: 1–3 right, 4–6 left).
- **2+ successes:** no limb or organ damage.

## Approach

### 1. Episodes — derived, keyed by the owning actor (R1 #1, #2, #5, #10)
State under `flags.sr2e.permDmg.<stateKey(actor.uuid)>` (inherited state never read, like the
healing clock): `{ deadlyGen, woundGen, crossed: [{ g, woundGen }…] }`, maintained by a
`preUpdateActor` hook in the SAME update as the monitor change:
- Physical (incl. overflow) crossing INTO Deadly appends `{ g: deadlyGen, woundGen }` to `crossed`
  — the episode's wound is fixed at crossing and copied into its outcome (R2 #2).
- Physical dropping BELOW Deadly increments `deadlyGen` (the next crossing is a new episode).
- Physical reaching 0 increments `woundGen` (a new set of injuries).
The **outcome** of episode `g` is a durable record `recordEvent(actor, "permdmg:"+uuid+":"+g+":"+a,
{ kind, attr|part, side, woundGen, successes, trauma })`, where `a` is the attempt — the number of
VOIDED outcomes episode `g` already has — so a voided outcome can be re-rolled (R2 #3); the server
creates each key exactly once. **Pending** = every crossed `g` with no non-void outcome. Every fold
keeps only records whose key carries THIS actor's uuid, so an unlinked token's inherited effects
(its base actor's records) are ignored — outcomes and void targets alike (R2 #8).
- **Concurrency (R2 #1):** two clients committing Deadly damage to one actor at the same instant can
  compute the same transition from the same state — the general cross-client damage race the system
  accepts everywhere (commitDamage serializes per client only; accepted for the healing clock by
  Codex). Two writers that read the same state write the same values; nothing here is worse.

### 2. The roll (R1 #3, #13)
From the card or the sheet panel (owner or GM): dialog with **Trauma patch used (+2)**; roll the
Body test and the 1D6s with NO side effects other than the dice cards; then publish with
`recordEvent`. If the create loses (another device resolved it first), this roll's result is
discarded and a note says so. Nothing to strand: no claim precedes the roll.
- Dice: NATURAL Body (the authoritative natural value, §4) + dermal armor — the EFFECTIVE Body
  of working dermal plating / sheathing exactly as the attribute pipeline counts it (`skinBody(raw,
  skinLoss)`, R3 #4) and a troll's racial dermal armor (+1, as `rollDamageResistance`) — vs TN 4
  (+2 trauma patch). No Injury Modifier (a test to avoid damage).
- **Finalized at once (R3 #3, R4):** no Karma at all on this test — no pre-roll Karma dice (the
  dialog offers none) and the card is `closed` — so a roll that loses the publication, or never
  publishes, has spent nothing. The 1D6s are plain rolls. A losing attempt's test card is closed
  too, so no displayed result can change after an outcome is recorded.

### 3. Effects, all DERIVED from non-void records (R1 #4, #6, #7, #11, #12)
- **Attribute loss (characters), one formula (R2 #7, R3 #2):** natural = max(1, min(base + racial +
  edge, racial maximum + Exceptional Attribute) − losses), losses = CCSS + permanent, subtracted ONCE
  — so the effective ceiling is (maximum + Exceptional − losses). Base 6 / max 6 / one loss → 5;
  base 7 / max 6 / Exceptional +1 / one loss → 6. Advancement uses the same ceiling. Reaction's comes off `reaction.mod`. Tooltip line "Permanent damage".
  NPCs: the roll and the card only (printed stats).
- **Healing time (natural healing, p.113):** for records of the CURRENT `woundGen`:
  limb → the Healing Table **base** time × 1.5 before dividing by successes and clamping to the
  minimum; organ → the resulting time × 2 ("the entire healing process"). Both if both occurred.
  `naturalHealingHours(level, successes, { baseMult, totalMult })`.
- **Continuous treatment (organ):** while an organ record of the current wound exists, Heal requires
  "A doctor is involved" (the Biotech caregiver), and is refused otherwise with the reason.
- **Resolve first:** Heal (natural) is refused while a check is pending for the current wound —
  "roll for permanent damage first" — so a course never starts without its penalties.
- **Void (GM):** writes a `void` record for that outcome (durable, Phase-4 pattern); every effect
  re-derives and the episode is pending again (a new attempt key).
- **Courses are fenced by the penalties (R2 #4):** a natural-healing course stores `pk`, a key of the
  current wound's non-void outcomes. `commitStart` refuses and completion voids a course whose `pk`
  no longer matches the live key — so a void (or a late outcome) between admission and commit, or
  during the course, never lets the old time stand.
- **Continuous care (R2 #5, R3 #1):** under organ damage Heal requires a doctor, and the course
  stores `careGen`, a counter in the permDmg state that the sheet's GM **Care ends** button (and the
  healing clock's Care ends) increments. `commitStart` refuses and completion voids a course whose
  `careGen` no longer matches — care ending at any moment, even before the course exists, interrupts it.

### 4. One natural-attribute source (R1 #8, #9)
CharacterData exposes `naturalAttrs` (derived each preparation: `_naturalAttribute` for each base
attribute, i.e. after racial clamp, CCSS and permanent losses). Medical callers (`_naturalAttrs`,
Doctoring modifiers, the permanent-damage test) read it. `advanceKarma` prices from the effective
natural rating: new = effective + 1, double cost above the SAME effective ceiling as §3 (racial
maximum + Exceptional Attribute − losses, one helper), and the update
still adds 1 to the authored base — fixing the same mis-pricing for CCSS losses. The resulting
effective rating is computed BEFORE charging; a raise that would not change it (stuck at the floor
of 1 with losses, R2 #6) is refused with the reason.

### 5. Sheet panel
On the character (and NPC) sheet's condition area: pending checks with **Roll permanent damage**,
and the FULL outcome history (every wound, R2 #9) with each effect and a GM **Void** button. The card
is a notification only.

### 6. Pure rules + tests
`module/rules/permanent-damage-rules.mjs`: `permanentDamageResult(successes, d6, sideD6)`,
`foldPermLoss(records)`, `woundPenalties(records, woundGen)`, `deadlyTransition(state, before, after)`.
Vitest for each; Quench: crossing → pending → roll → record; two devices → one record; drop and
re-cross → a second episode; resolution required before Heal; organ requires a doctor; void restores
the attribute and cancels a course; inherited token state ignored; advanceKarma price with a loss.

## Decisions
- D1 trigger on crossing into Deadly — "when a character suffers a Deadly wound".
- D2 the outcome is automatic at 0/1 successes; the GM can void it.
- D3 no Injury Modifier on the test.
- D4 limb/eye loss is narrated, not modelled (no model for a missing natural limb).

## Out of scope
Transplant compatibility/failure (Body Part Grades), growing organs, Magic loss (already done).
