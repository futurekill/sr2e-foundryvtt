# Plan: Spell Defense protects allies, spent die by die (SR2E p.132)
_Round 0 — initial draft by Claude_

## Goal
p.132 (text verified; example quoted): Spell Defense "is an area effect that
encompasses all characters or objects within the allocating magician's vision
(direct line-of-sight) that the magician chooses to protect … When protected
characters or objects are attacked by magic, the magician that allocated the Spell
Defense dice in the first place can choose to use those dice to protect that
target. Spell Defense dice, once expended, are lost until reallocated." Neddy has
6, "spends 2 … on each of them (a total of 4 dice). He holds 2 of the dice in
reserve." Also p.129: resisting magicians "may add unused dice from their Magic
Pool".

Today: `rollSpellResistance` uses **all** of the resister's OWN Spell Defense (and
zeroes it), so (a) nobody else can be protected, (b) a magician can't hold dice
in reserve, and (c) unused Magic Pool dice can't be added.

## Approach
1. **The magician grants, from their own client.** Every unresolved Resist Spell
   card (and area-spell per-target card) gets a **"Spell Defense"** button for
   any user who owns a character with Spell Defense dice > 0. It opens a small
   dialog: which of *your* magicians, how many dice (≤ remaining). Confirming
   deducts the dice from that magician (they own it — no permission problem)
   and posts a **grant message** they author:
   `flags.sr2e.spellDefenseGrant = { cardId, targetUuid, magicianUuid, n }`.
   The dice are expended at that moment, which is what the book's Neddy does.
2. **The resister collects grants.** `rollSpellResistance` sums every grant whose
   `cardId` is this card and `targetUuid` is the resister, adds them to the dice
   with a note naming each magician ("+2 Spell Defense (Neddy)"). Grants never
   need to be edited: a card resolves once, so its grants are consumed by that
   resolution. Grants to a card that is never resolved are simply spent — like
   dice spent on an attack that never lands.
3. **Self-protection is the same flow**, plus the resister's own dialog offers
   "Spell Defense (own, N left)" and "unused Magic Pool (N)" number inputs — no
   more automatic spend-everything. Shielding (Grimoire) keeps its current
   behaviour (it is a free bonus tied to Spell Defense, unchanged).
4. **Line of sight** is the GM's call (as with spellcasting LOS). The grant
   dialog says so; no automatic LOS check.
5. **Elemental Spell Defense aid** (p.141) stays self-only and unchanged.
6. **Damaging manipulation** keeps its current hint (resisted as ranged
   damage — "if the GM allows" misc dice). Unchanged.
7. **Tests**: Quench — magician A grants 2 dice to target B's resist card: A's
   pool drops by 2, B's resistance rolls +2 with A's name; A keeps the rest in
   reserve; a grant to another card or another target is ignored; the resister's
   own dice are no longer auto-spent (dialog 0 → pool unchanged); unused Magic
   Pool dice can be added and are deducted.

## Key decisions & tradeoffs
- **Grant messages** instead of editing someone else's card or actor: the only
  shape that works for players without GM relay (removed deliberately).
- Spending happens at grant time, matching the book's sequence.

## Risks / open questions
- A resister clicks Resist before an ally grants: the grant arrives too late and
  is wasted. Mitigation: the resist dialog lists grants live and says "waiting on
  allies? grant first".

## Out of scope
Automatic LOS; spell interception in astral space.
