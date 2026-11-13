# Plan: Spell Defense protects allies, spent die by die (SR2E p.132)
_Round 5 — final; last Codex point applied (see log)_

## Goal
p.132 (text verified; example quoted): Spell Defense "is an area effect that
encompasses all characters or objects within the allocating magician's vision
(direct line-of-sight) that the magician chooses to protect … When protected
characters or objects are attacked by magic, the magician that allocated the Spell
Defense dice in the first place can choose to use those dice to protect that
target. Spell Defense dice, once expended, are lost until reallocated." Neddy
has 6. He "spends 2 … on each of them (a total of 4 dice). He holds 2 of the
dice in reserve." Also p.129: resisting magicians "may add unused dice from
their Magic Pool".

Today `rollSpellResistance` spends **all** of the resister's OWN Spell Defense
(and Shielding) automatically. No one else can be protected, dice can't be
held back, and unused Magic Pool can't be added.

## Approach
1. **The defence pool** of a magician is `spellDefense + shieldingBonus`, and
   Shielding (Grimoire p.45) is treated as more Spell Defense dice. Every spend
   takes ordinary Spell Defense first, then Shielding. A Shielding-only balance
   can be spent. Elemental Spell Defense aid (p.141) stays self-only and
   unchanged.
2. **Grants are keyed by attack, not by card.** Key =
   `(castTestMessageId, targetActorUuid)`, where the actor UUID is normalised:
   a token's actor UUID, which for a linked token is the world actor's. That
   key is the same whether the target's resist card is public (single target)
   or whispered (area), so an ally never needs to see a private card.
   - **Where the magician grants**: a "Spell Defense" button on the **public**
     cards — the single-target resist card, and the public area-spell summary
     card. The summary does **not** list who was caught; that stays whispered.
     Clicking it opens: *which of your magicians* (only those with defence
     dice > 0), *which target*, and *how many dice*. For the single-target
     card the target is the card's target. For an area summary or an
     **unbound** card (`targetUuid` ""), it is the tokens you have **targeted**
     (T). You protect whom you choose, as the book says.
   - Area cards are **de-duplicated per normalised actor** in
     `_postAreaResults` (two linked tokens of one actor give one card), so an
     (attack, actor) key belongs to at most one resistance.
   - **The transaction**:
     - The magician's client runs it (the owner spends their own dice, so
       there is no permission problem), serialised per magician in a client
       queue. **Every** Spell Defense mutation on that client uses the same
       queue: grants (including the creation-failure rollback), the magician's
       own resistance spend, `allocateSpellDefense`, `clearSpellDefense`, and
       the pool refresh when it runs on this client. So a clear or refresh
       cannot slip between a deduction and its rollback, and a grant and a
       self-resist cannot spend the same dice. A refresh run on the GM's client
       at a turn boundary is cross-client and covered only by the balance
       re-read (the documented race).
     - Inside the queue, it first checks the **public** resolution record for
       this key (`flags.sr2e.resolvesAttack`, step 3). If one exists, the grant
       is refused before any spend. It then re-reads the balance and deducts
       (ordinary Spell Defense first, then Shielding).
     - It creates the grant message `flags.sr2e.spellDefenseGrant = { id
       (random), castTestId, targetActorUuid, magicianUuid, magicianName, n }`.
       Only if that creation throws does it put the same split straight back,
       in the same call. That is the one refund in the design.
     - **No refunds otherwise.** Dice are expended when the magician grants
       them: "Neddy spends 2 dice from the Spell Defense Pool on each of them".
       A grant that arrives after the resister already rolled is spent, exactly
       like protecting someone too late at the table. The resistance records
       which grants it used (`usedGrants`), so that is visible, and the grant
       dialog warns that a grant counts only if it lands before the target
       resists.
     - Dice are expended at the grant, as in the book.
3. **Resistance** (`rollSpellResistance`):
   - **Refused if the card is resolved.** Resolution is a resister-authored,
     **public** outcome carrying `flags.sr2e.resolves = card.id` **and**
     `flags.sr2e.resolvesAttack = { castTestId, targetActorUuid }`, so a grantor
     who cannot see a whispered card can still tell it is done. The author/GM
     also re-renders the card. The per-card in-flight guard stops double
     clicks.
   - It opens a dialog **first**, and nothing is spent before confirming. The
     dialog shows:
     - your own defence dice (input 0..balance);
     - unused Magic Pool (input 0..balance, magicians only);
     - the **grants** for this attack and you: each ally and their dice,
       listed live; all of them count.
   - **After confirming**, it re-reads everything:
     - the pool balances, clamping to what is still there;
     - the elemental reservation;
     - that the card is still unresolved;
     - the grants for the key: all of them, not yet refunded, as they stand now.

     Only then does it deduct and pay elemental aid, then roll. Cancelling
     spends nothing.
   - The public outcome records `usedGrants: [grant ids]` next to
     `resolvesAttack`. A grant created after the snapshot is not used. It was
     spent (step 2), and the card shows which grants counted.
   - Elemental Spell Defense aid is paid exactly as today (the existing
     `rollSpellResistance` path). This plan does not change its payment or
     retry behaviour.
4. **Line of sight** is the GM's call (as for spellcasting LOS). The grant dialog
   says so. There is no automatic check.
5. **Damaging manipulation**: its current hint is unchanged (resisted as ranged
   damage).
6. **Tests** (Quench):
   - Magician A grants 2 to target B's single-target card: A's pool goes down
     by 2, and B's resistance rolls +2 with A's name.
   - A holds the rest in reserve.
   - An **area** spell: A grants to a caught target from the public summary,
     and the target's **whispered** card picks up the grant.
   - A grant to another attack or another target is ignored.
   - A Shielding-only balance can be granted.
   - Two grants started in parallel against a 3-die balance: one succeeds, the
     other is clamped or refused, and the total spent is ≤ 3.
   - A grant whose message creation fails puts its dice straight back.
   - A non-author resolves the card, and a second resist is refused.
   - Resisting with the dialog cancelled spends nothing, including elemental
     aid.
   - A pool refresh while the dialog is open clamps the spend.
   - A grant and a self-resist started together never spend more than the balance;
     a clear queued behind a grant waits for it (and its rollback).
   - A grant made after the resistance has rolled is refused (resolution
     record) or, if it slipped in, is not in `usedGrants`.
   - Area cards de-duplicate linked tokens of one actor.
   - The area summary lists no caught targets; a grant is made to T-targeted tokens.
   - An unbound card asks for the target when granting.
   - The resister's own dice are no longer auto-spent.

## Key decisions & tradeoffs
- **Keying by attack** makes whispered area cards workable without exposing
  them.
- **Grant messages** rather than editing someone else's card or actor, because
  that is the only shape that works for players without a GM relay (which was
  removed deliberately).

## Risks / open questions
- A resister who clicks Resist before an ally grants misses the grant; the
  dialog lists grants live, and the grant dialog warns when the card is
  already resolved.
- **Cross-client races** (two owners of one magician) are narrowed by balance
  re-reads, not eliminated. A single elected authority
  would need the GM relay that was removed on purpose. Codex R2 #4 is accepted
  only this far, and documented.
- **A grant to a target with no automated resistance** (0-success area hit,
  GM-adjudicated object) cannot be validated by the grantor, who cannot see
  whispered cards (Codex R2 #7, rejected with reason). The dice are spent,
  just as a magician who protects someone the spell turns out not to affect
  has spent them. The grant dialog says so.

## Out of scope
Automatic line of sight; spell interception in astral space.
