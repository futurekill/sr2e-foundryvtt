# Plan: Restricted-use spells — exclusive and fetish-required (SR2E p.132–133)
_Round 0 — initial draft by Claude_

## Goal
p.133 "Restricted Use Spells" (text verified; formulas carry no ÷ glyphs):
- Chosen **when the spell is learned** (or at character creation, p.43); the
  modifier "applies to that spell permanently".
- **Exclusive**: "cast as if its Force Rating were 2 points higher, for the
  purposes of determining the spell's effect. Drain is calculated at the normal
  Force value." Casting it: no other spell may be cast or sustained in the same
  action. **While sustaining** it: no other spell and no other magical skill.
- **Fetish-required**: +1 Force with a **reusable** fetish, +2 with an
  **expendable** one (used up on casting). The fetish must be in hand (or worn and
  touched), belongs to that one spell, and can't be swapped. A spell is learned
  with one kind, never both.
- "Having learned these spells, a magician can cast them with a Force Rating
  higher than his Magic Rating without risking Physical damage" (Neddy: Magic 6,
  learned Force 6, casts at 8).
- "The magician can allocate Magic Pool dice, based on the adjusted rating."

## Approach
1. **Schema** (`SpellData`, shared `item-data.mjs`, dual-applied):
   `restriction: "" | "exclusive" | "fetishReusable" | "fetishExpendable"` and
   `fetishItemId: ""` (the gear item that is this spell's fetish).
2. **Pure rules**: `restrictedForceBonus(restriction)` → 0/2/1/2;
   `effectiveSpellForce(force, restriction)`.
3. **Learning / creation**: the Learn dialog and the item sheet offer the
   restriction (set once; changing it on a known spell = learning it again —
   the sheet locks it after creation except for the GM).
4. **Casting** (`_rollSpellcast`): the cast dialog's Force is the **learned**
   Force (the Drain Force). The effect uses `effective = force + bonus`:
   spell dice, Magic Pool cap, damage Power, resistance TN, area radius. Drain
   TN/level and the Physical-drain check use the learned Force. Label shows
   "Force 6 (as 8, exclusive)".
   - Fetish: refused unless the linked fetish item is on the caster (and, for
     gear with an `equipped` flag, equipped); an expendable fetish's quantity is
     decremented after a successful roll starts (or the item deleted at 0).
   - Exclusive: refused if the caster is sustaining any other spell; once
     sustained, casting any other spell or using another magical skill
     (Conjuring, Sorcery-based astral attack, learning) is refused with the
     p.133 reason.
5. **Tests**: unit for the bonus table; Quench — exclusive F6 casts with 8 dice
   and Drain at F6 (stun at Magic 6); exclusive refused while sustaining another;
   another spell refused while sustaining an exclusive; fetish-required refused
   without the fetish; expendable fetish consumed.

## Key decisions & tradeoffs
- **Which numbers the +2 touches.** "For the purposes of determining the spell's
  effect" + "allocate Magic Pool dice based on the adjusted rating" → everything
  except Drain. The spell's own dice pool (Force dice) is also taken at the
  adjusted rating, since the Success Test is how the effect is determined. This
  is a reading of the rule — **flagged for the GM** in the CHANGELOG.

## Out of scope
Grimoire spell design; fetish pricing by category (talismonger table).
