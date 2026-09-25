# Rules audit, round three — the "still to audit" list

_2026-09-24. Every finding checked against a rendered page of the corrected 11th
printing (book page = PDF page − 1 in this range). Closes the "Still to audit"
list from `RULES-AUDIT-2.md`; totem bonuses and initiation were already done._

Severity: **high** = wrong numbers on common rolls; **med** = wrong on a
less-common path; **low** = missing automation the GM can cover by hand.

## Combat

### C1 — Ranged damage stages on gross successes, not net (HIGH) — ✅ FIXED (`stageByNet`, PLAN-net-staging.md)
p.91 *Determine Outcome of Attack*: the attacker raises the base damage "for
every two full successes the attacker rolls **over the target's total**"; the
defender lowers it for every two full successes "the target rolls over the
attacker's total"; equal successes do base damage. p.110 repeats it: "the
character with the higher net successes wins".

The code does two independent stagings: the attack card stages up
`⌊attacker/2⌋` (`item.mjs` `stageUps = netToSteps(result.successes)`), then
`rollDamageResistance` stages down `⌊defender/2⌋`. These disagree whenever the
rounding splits: attacker 4 vs defender 3 is net 1 → **base M** by the book, but
**S** here (M→D, D→S). Attacker 2 vs defender 1 is base damage by the book, one
level up here. Usually in the attacker's favour, but because the up-staging
caps at D before the defender stages down it can also under-state: base M,
6 vs 6 is M by the book but L here (M→D, then D→L).

Same defect in the **blast rows** (p.97: "Compare the defender's successes
against those from the attacker's Success Test") and the **shotgun-spread
rows**, which both bake `netToSteps(attackerSuccesses)` into the level.
Vehicle resistance (p.108) takes the pre-staged level too — check p.108 when
fixing. `AUDIT-2026-07.md` §4 marked this ✅; it was wrong.

Melee is **correct** as is: its opposed test already produces a net (p.100
step 4), and the Body test then stages down on its own (p.102 Zipperhead
example).

### C2 — Knockdown threshold is off by one (med) — ✅ FIXED
p.91–92: the character must **overcome** the Threshold, and "a character who has
taken a Moderate wound must generate **more than 2** successes"; "with 1 or 2
successes, the character staggers". `knockdownOutcome` passes on
`successes >= threshold`. Should be `>`.

### C3 — Short bursts refuse instead of resolving (med) — ✅ FIXED (`burstFired`; spreads now get burst bonuses too)
p.92: a burst one round short gets +2 Power, no Damage Level increase, and the
+2 recoil still applies; a one-round burst resolves as a single shot. p.93:
full auto that runs short follows the same rule. `item.mjs` refuses the attack
("not enough for a N-round burst"). `burstDamageBonus(2)` already returns the
right numbers; only the refusal and the 1-round case are missing.

### C4 — Multiple-target modifier missing for ranged fire (med) — ✅ FIXED (PLAN-ranged-multi-target.md; also fixed recoil surviving a same-index turn change)
p.92: semi-auto and burst fire at a second target in the same Combat Phase is
+2. p.93: full auto walked between targets is +2 per new target, and wastes one
round per metre between them. Melee has this (`multiMod`); ranged does not.

### C5 — Melee dialog has no visibility modifier (low) — ✅ FIXED (visibility select, halved; defender pre-filled)
p.102: melee uses the Visibility Table "at half their value, rounding down,
except for Full Darkness". The melee TN omits visibility entirely. The defender
also types their own Reach modifier rather than it mirroring the attacker's.

### C6 — Grenade scatter direction is uniform, not the Scatter Diagram (low)
p.97: roll 1D6 on the Scatter Diagram relative to the direction of throw (1 =
carried on past the target, 4 = bounced back toward the thrower, 2/3/5/6 the
diagonals). `resolveBlast` picks a uniformly random angle.

### C7 — Melee 0 vs 0 (question for the GM)
p.100/102: "The one who generates the most successes has hit… Ties go to the
attacker." Read literally, a 0–0 exchange is a hit at base damage, which is what
the code does. Flagged rather than changed.

### C8 — Karma on a ranged attack never reaches its damage card (med)
The damage card is static: Karma rerolls or bought successes after it posts do
not change its staging, and an initial miss (0 successes) posts no damage card at
all, so Karma cannot turn it into a hit. Fix via the dependent-card sync used by
manipulation spells. Deferred from the net-staging pass.

### C9 — Vehicle-damage exceptions not modelled (low)
p.108: special ammunition lets a Light-rated weapon affect vehicles, and
anti-vehicle rockets/missiles do not have their Damage Level reduced (the Power is
still cut by armour). Neither is implemented.

## Magic

### M1 — Conjuring Drain ignores totem modifiers (med)
p.139: the Drain Resistance Test uses "Charisma (not Willpower) dice… **adjusted
by totem modifiers** and spirit foci". `rollConjuring` adds foci dice to drain
but not the totem bonus (it adds the totem only to the Conjuring Test).
Elementals (p.140) name only the spirit focus, so this is shaman-only.

### M2 — Drain that knocks the conjurer out does nothing to the spirit (med)
p.139: a nature spirit departs. p.140: an elemental "escapes free and
uncontrolled"; roll its Force vs TN 4 — 1+ success it flees, 0 it attacks the
mage. The spirit is always created.

### M3 — Summoning limits not enforced (low)
p.139: a shaman may summon or keep only **one** nature spirit at a time. p.140:
a mage may have at most **Charisma** elementals bound; the rite takes Force
hours and consumes 1,000¥ × Force of materials (spent even on failure).

### A1 — Astral combat is not an opposed test (HIGH for astral play)
p.147: astral attacks "are like melee combat (see p.100)". So: both sides roll,
most successes hits (ties to the attacker), the net stages the damage up, and
the hit party then resists with Astral Body, staging down per 2 successes. The
code has the attacker roll and the defender resist with Willpower, using
`attacker − resist` as the net — one roll where the book has two.

### A2 — Astral attack skill (low)
p.147: with an active weapon focus, Armed Combat; otherwise Unarmed Combat, *or*
Sorcery in place of either. The code always uses Sorcery, and falls back to raw
Willpower dice when there is no Sorcery skill.

### A3 — No Astral Combat Pool (med)
p.147: ⌊(Intelligence + Willpower + Charisma) ÷ 2⌋, works like the Combat Pool
for astral combat. Not modelled.

### A4 — Spells cast in astral space always drain Physical (low)
p.148, last line of the Spells section. Not applied.

## Verified correct

- Called shot +4 TN, +1 Damage Level to max D, SS/SA/BF only (p.92) —
  `canCallShot`, `CALLED_SHOT_*`.
- Recoil: SA second shot +1, burst +3 per burst, full auto +1/round,
  cumulative per phase, compensated one-for-one (p.92–93). Wedge example
  reproduces.
- Burst/full-auto Power +1/round, Damage Level +1 per 3 full rounds, max D
  (p.92–93).
- Knockdown TN ½ Power (gel: full Power), Deadly always drops (p.91–92); melee
  knockdown TN = striker's Strength (p.103).
- Melee opposed test, ties to the attacker, friends ±1 (max 4), reach, superior
  position −1, opponent prone −2, multiple targets +2 (p.100–102).
- Grenade range table, scatter dice and per-success reduction, blast falloff
  (offensive/concussion 1/m, defensive 1 per ½ m) (p.96–97).
- Conjuring Drain Table and Charisma vs Force TN, no Magic Pool (p.139–140).
- Astral damage codes: (Charisma)L unarmed, (Cha + ⌊Focus÷2⌋)M with weapon
  focus, (Force)M spirits (p.147).
