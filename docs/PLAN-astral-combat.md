# Plan: Astral combat as the book runs it (RULES-AUDIT-3 A1–A3)
_Round 0 — initial draft by Claude_

## Goal
SR2E p.147 (rendered):
- "Astral combat works exactly like **Melee Combat** (p.100)."
- Skill: armed with an active weapon focus → **Armed Combat**; otherwise **Unarmed
  Combat**, or **Sorcery** in place of either. TN 4.
- "Magicians in astral space … have only one dice pool, the **Astral Pool**, …
  equal to the sum of the magician's Intelligence, Willpower, and Charisma,
  divided by 2 (round down). This Astral Combat Pool works like the physical
  Combat Pool in that it can be applied to astral combat."
- Damage (Astral Attack Table): unarmed magician (Astral Strength)L; armed
  (Astral Strength + Focus Rating/2)M; spirit (Force)M.
- Damage Resistance with **Astral Body**; dual-natured beings "that have physical
  armor receive the benefits of that armor in astral space" — the armor reduces
  the Power. Astral damage is Physical or Stun at the inflicting character's
  choice; non-sentient astral entities always do Physical.
- Repercussion: damage lands on the physical body.

Today: the attacker rolls Sorcery (or raw Willpower dice) and the defender rolls
Willpower against Power, with `attacker − resist` as the net. That is one roll
where the book has two, and there is no Astral Pool.

## Approach
1. **Pure rules** (`sr2e-rules.mjs`):
   - `astralCombatPool({ intelligence, willpower, charisma })` = ⌊(I+W+C)/2⌋.
   - `astralAttackSkill(skills, hasActiveWeaponFocus)` → the candidates
     (armed+sorcery with a focus; unarmed+sorcery without), each with its rating.
     The dialog defaults to the highest.
   - `astralDamageCode({ kind, charisma, force, focusRating })` → `{power, level}`
     per the table (the code already has these numbers; lifted into one place).
2. **Astral Pool** — a new `dicePools.astral` resource on CharacterData, derived
   max = `astralCombatPool` for a character whose `astralState` is perceiving or
   projecting (0 otherwise), refreshed by the same `dicePoolRefreshUpdates` path
   as the Combat Pool. The schema edit to the shared `actor-data.mjs` is
   dual-applied. Spirits get none (the book gives it to magicians).
3. **The opposed test reuses the melee machinery.** `rollAstralAttack` posts a
   melee-style card (`flags.sr2e.melee` with `realm: "astral"`), carrying the
   attacker's astral damage code and chosen damage type. The Defend button runs
   `rollMeleeDefense`, which branches on `realm`:
   - the defender must be astrally active (perceiving, projecting, a spirit, or
     dual-natured). Otherwise it refuses: "mundane characters are immune" (p.147).
   - dice = the defender's best astral skill (step 1) + Astral Pool dice. No
     Combat Pool.
   - `meleeOutcome` decides the winner (ties to the attacker). The winner's
     astral damage code is staged up one level per 2 net successes (p.102).
   - The hit party resists with **Astral Body (Willpower)** plus Astral Pool
     dice. TN = Power − armor, where armor is the physical Impact armor for a
     dual-natured being and 0 otherwise. The result stages down one level per 2
     successes and goes on the physical/stun monitor (repercussion).
   Full Defense and Undefended behave as in melee.
4. **Damage type**: the attacker's dialog choice. A spirit or other non-sentient
   entity attacking is always Physical. The defender's riposte uses the
   defender's own choice (a default of Physical, editable in the Defend dialog).
5. **Legacy cards**: an old `flags.sr2e.astral` card keeps its current
   resolution path unchanged.
6. **Tests**:
   - Unit: pool, skill choice, damage codes.
   - Quench:
     - A projecting mage attacks a spirit: the card carries `realm: "astral"`.
     - The defender rolls its skill and the winner is decided (ties to the
       attacker).
     - The hit party rolls Willpower (+ pool) against Power.
     - A dual-natured target's armor reduces the TN.
     - A mundane defender is refused.
     - Astral Pool dice deplete and refresh.
     - A legacy astral card still resolves.
7. CHANGELOG, QA-PLAN, RULES-AUDIT-3.

## Key decisions & tradeoffs
- **Reuse the melee opposed flow** rather than build a parallel one. The rules
  are "exactly like melee"; the differences are the skill set, the pool, the
  resistance attribute and the armor. The cost is one `realm` branch in several
  functions.
- **Astral Pool as a schema field** (not a flag): it is a real dice pool that
  refreshes. That needs the shared `actor-data.mjs` edit, applied with the
  dual-apply technique.
- **Whether a creature is dual-natured** is read from existing critter data
  where present (a `dualNatured` power or flag), else it defaults to false. The
  GM can still adjust the TN.

## Risks / open questions
- NPC magicians: NPCData has its own pools. Is the Astral Pool characters-only
  for now? Should the NPC be refused, or handled by the GM?
- Astral barriers (hermetic circles, p.147–148) and spell interception are out
  of scope.

## Out of scope
Astral barriers, intercepting spells in astral space, magical items fighting back.
