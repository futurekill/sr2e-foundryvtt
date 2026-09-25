# Plan: Astral combat as the book runs it (RULES-AUDIT-3 A1–A3)
_Round 3 — revised after Codex round 3_

## Goal
SR2E p.147–148 (rendered):
- "Astral combat works exactly like **Melee Combat** (p.100)." TN 4.
- Skill: armed with an active weapon focus → **Armed Combat**; otherwise **Unarmed
  Combat**, or **Sorcery** in place of either (p.138 adds a focus's rating to its
  Armed Combat dice when the owner wields it).
- Magicians in astral space have only the **Astral Pool** = ⌊(Int + Wil + Cha)/2⌋,
  "works like the physical Combat Pool … can be applied to astral combat".
- Damage (Astral Attack Table): unarmed magician (Astral Strength)L; armed
  (Astral Strength + ⌊Focus/2⌋)M; spirit (Force)M.
- Resist with **Astral Body**; dual beings with physical armor apply it (reduces
  Power). Physical or Stun at the attacker's choice; non-sentient astral entities
  (barriers, foci) always Physical and can only be hurt Physically.
- p.148: dual beings keep the same Attributes on both planes; purely astral beings
  have all Attributes equal to their Force (or Essence).
- Repercussion: damage lands on the physical body.

## Combatants (scope)
| Who | Eligible | Astral attributes | Attack / defence dice | Pool |
|---|---|---|---|---|
| Character, `astralState` perceiving/projecting | yes | own Int/Wil/Cha (Astral Strength = Cha) | best of the skills above (+ wielded focus rating for Armed) | Astral Pool |
| Spirit (summoned and present; a busy one can be attacked but not attack; a depleted/vanished one — Force spent — is not there to target) | yes | all = current effective Force | effective Force | none |
| NPC with new `dualNatured` flag (critters) | yes | own attributes (p.148) — resists with **Body**, damage = its physical attack (its unarmed/natural weapon item, else (Str)M) | its Unarmed Combat skill item, else defaulting as melee does | none (NPC pools unchanged) |
| Anyone else (mundane) | **refused** — "immune to direct effects from astral space" | — | — | — |
NPC **magicians** projecting remain a separate gap (NPCData has no `astralState`);
listed in RULES-AUDIT-3, not claimed here.

## Approach
1. **Pure rules** (`sr2e-rules.mjs`), one place for all three combatant kinds:
   `astralProfile({ kind, attrs, force, skills, focus })` →
   `{ eligible, dice, skillLabel, pool, resistDice, armor, damage: {power, level},
   forcePhysical }` with `astralCombatPool`, the skill choice (highest; the
   dialog may pick another eligible one) and the table damage.
2. **Weapon focus**: a specific focus is chosen — bonded, active, weapon type,
   and wielded (the linked weapon equipped). No boolean; its rating drives both
   the Armed Combat bonus dice and the damage, for the attack AND a riposte.
3. **Dual-natured flag**: `NPCData.dualNatured` (Boolean, editable on the NPC
   sheet; shared `actor-data.mjs`, dual-applied). The critter pack is populated
   where the printed entry says dual-natured (the biography text currently
   records it); `build-packs` run. Existing world actors: default false, the GM
   ticks it.
4. **Astral Pool**: `CharacterData.dicePools.astral` (dual-applied). Its max is
   `astralCombatPool` **always** (not zeroed while inactive — zero would reset the
   spent count in `applyPool`); it is only *usable* while astrally active. It
   refreshes at exactly the Combat Pool's refresh points (`dicePoolRefreshUpdates`).
   Test: spend → leave astral → reload → re-enter keeps the spend.
5. **Opposed exchange** — a NEW flag-backed card `flags.sr2e.astralMelee`
   (separate from `melee`, so the melee path and legacy `astral` cards are
   untouched), with its own renderer registered in `_syncDependentCards`:
   state `{ testMessageId, attackerUuid, targetUuid (the attacker's T target),
   successes, damage, damageType, focusUuid, resolved }`. **Exactly one
   eligible target is required before any dice or pool are spent** (none,
   several, a mundane one → refused up front). A target deleted later is refused
   at resolution; damage is never redirected. Posted **even at 0 successes** (a
   defender can still win and counterstrike).
   - **Defend** and **Undefended** both resolve against the stored `targetUuid`
     (not the selected token); the clicker must own it; it must be eligible.
     Defence dice per the table + Astral Pool. `meleeOutcome` picks the winner
     (ties to the attacker); the winner's damage is staged up per 2 net.
   - **Resistance** — a flag-backed `astralResist` card naming the **loser**
     (counterstrikes included), resolved by `rollAstralDamageResistance`:
     Astral Body (Willpower for a projecting/perceiving magician; Force for a
     spirit; **Body** for a dual being, whose attributes are the same on both
     planes)
     + Astral Pool (characters) vs TN = Power − (dual being's Impact armor, else
     0), staged down 1 per 2 successes, onto physical/stun (repercussion).
     Full Defense keeps melee's semantics with Astral Pool in place of Combat Pool
     (pool dice saved for resistance; pool successes alone beating the attacker's
     = clean miss).
   - **Karma**: the attacker may spend Karma until the exchange is decided; the
     card re-renders via `_syncDependentCards`. The exchange is **final** when
     the defence is rolled or Undefended is chosen: from then the attack test's
     AND the defence test's Karma actions are closed (a closure check honoured by
     both the card rendering and the Karma spend handler, like
     `learningClosed`). A resistance test is final on **every committed
     outcome** — damage applied, staged below Light, or a Full Defense clean
     miss — its marker is written and its Karma actions close the same way.
   - **Stale dialogs**: the Defend and resistance dialogs re-read the live card
     immediately before rolling (a `beforeRoll` guard, as damaging manipulation
     does) and abort with "the attacker spent Karma — click again" if the
     successes changed or the card was resolved.
   - **Resolution records, per card**: the exchange card and each resistance
     card carry their own `flags.sr2e.resolves` marker check
     (`isCardResolved(msg, key)`), their own in-flight guard, and their own
     ownership check (Defend/Undefended: the target's owner; resistance: the
     loser's owner). A non-author's resolution is honoured without editing
     someone else's message; the author/GM re-renders it. **Known limit**: two
     different clients resolving the same card at the same instant can both
     roll (the documented manipulation limit); every irreversible step re-reads
     live state first to narrow it.
6. **Damage type**: attacker's choice; forced Physical only for non-sentient
   entities (none of the three combatant kinds above are; barriers/foci are out
   of scope). A riposte uses the defender's choice in the Defend dialog.
6b. **Entry points**: `rollAstralAttack`'s type guard admits dual-natured NPCs;
   the NPC sheet shows the Astral Attack action when `dualNatured` is set.
7. **Legacy**: existing `flags.sr2e.astral` cards keep their current renderer and
   resolver untouched.
8. **Tests**: unit — profiles for all three kinds, pool, focus bonus/damage.
   Quench — a dual-natured NPC initiates an astral attack; a dual being resists
   with Body (Body ≠ Willpower) and hits with its physical profile (Strength ≠
   Charisma); a busy spirit can be attacked but cannot attack, a depleted one cannot be targeted; resistance that stages below Light and a clean miss both finalize (repeat click refused, Karma closed); no/two targets
   refused before spending; Karma on the defence test is closed after
   resolution; a Defend dialog left open while the attacker spends Karma aborts;
   a resistance card resolves once (repeat click, non-owner refused);
   projecting mage vs spirit end-to-end (card → defence → winner →
   loser's resistance with Willpower + pool); counterstrike binds resistance to
   the attacker; 0-success attack still posts and a defender win counterstrikes;
   dual-natured critter's armor lowers the TN; mundane target refused (Defend and
   Undefended); non-owner click refused; resolved-by-non-author honoured;
   attacker Karma before defence re-renders, after defence is refused; pool
   spend survives leaving astral + reload; legacy astral card still resolves.
9. CHANGELOG, QA-PLAN, RULES-AUDIT-3.

## Key decisions & tradeoffs
- A **separate card type** rather than a `realm` branch inside melee: melee's
  resistance button is Body/Combat Pool/Impact throughout, and branching every
  step invites leaks. Shared *pure* pieces (`meleeOutcome`, staging) are reused.
- NPC magicians projecting: deferred and logged, not half-supported.

## Out of scope
Astral barriers, spell interception, magical items fighting back, NPC magicians.
