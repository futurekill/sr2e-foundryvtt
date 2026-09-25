# Plan: Restricted-use spells — exclusive and fetish-required (SR2E p.132–133)
_Round 3 — revised after Codex round 3_

## Goal
p.133 "Restricted Use Spells" (text verified):
- Chosen **when the spell is learned** (or at character creation, p.43). The
  modifier "applies to that spell permanently". To have it with other options,
  the magician "must learn it all over again, at which point he will know
  **both versions**".
- **Exclusive**: "cast as if its Force Rating were 2 points higher, for the
  purposes of determining the spell's effect. Drain is calculated at the
  normal Force value." While casting it, no other spell may be cast or
  sustained in the same action. While **sustaining** it, no other spell and
  no other magical skill.
- **Fetish-required**: +1 Force with a **reusable** fetish, +2 with an
  **expendable** one (used up on casting). The fetish must be in hand, or worn
  and touched. It belongs to that one spell and can't be substituted. A spell is
  learned with one kind, never both.
- The magician "can cast them with a Force Rating higher than his Magic Rating
  without risking Physical damage", and "can allocate Magic Pool dice, based on
  the adjusted rating".

## Terms
- `learnedForce`: the item's `force`.
- `actualForce`: the Force the magician chooses for this cast, at most
  `learnedForce`.
- `effectiveForce` = `actualForce + bonus` (exclusive 2, reusable fetish 1,
  expendable 2).

## Approach
1. **Schema** (`SpellData`, shared `item-data.mjs`, dual-applied):
   - `restriction: "" | "exclusive" | "fetishReusable" | "fetishExpendable"`;
   - `fetish: { itemId: "", label: "" }`, **chosen when the spell is learned**
     (p.133: "choosing it at the time of learning") and kept permanently, even
     if the gear is later deleted:
     - **Reusable**: `itemId` is the specific gear item picked in the Learn
       dialog. That item, and only that item, is the fetish. If it is lost, the
       spell can't be cast until the GM intervenes; "a magician cannot
       substitute one fetish for another".
     - **Expendable**: `label` is the stock specification typed at learning
       (for example "eagle-feather tuft"). Restock is gear bound through the
       spell sheet's "Bind fetish stock" action (drop gear on the spell), which
       accepts only an item whose name equals `label` and which is not bound to
       another spell. Bound stock carries `flags.sr2e.fetishFor = <spell id>`.
     - Both fields are covered by the `_preUpdate` permanence rule (step 5).
   - `sustainedEffectiveForce: 0`, alongside the existing `sustainedForce`,
     which keeps the **actual** Force.
2. **Pure rules**: `restrictedForceBonus(restriction)`;
   `spellForces({ learnedForce, actualForce, restriction })` →
   `{ actual, effective }`; and the helper `personallySustaining(spell)`.
   `personallySustaining` is the same predicate `sustainPenalty` uses: not
   spell-locked, not quickened, not held by an elemental.
3. **Who uses which Force.**

   | Consumer | Force |
   |---|---|
   | Spell dice, resistance TN, damage Power / effect | effective |
   | Magic Pool ceiling | **Magic Attribute, unchanged** (p.85); an area spell's Force-based cap uses effective |
   | Drain TN / level | actual |
   | Physical-drain check (actual > Magic) | actual |
   | Astral always-Physical override | unchanged |
   | Quickening Karma (Grimoire: actual Force) | actual |
   | Area radius | Magic Rating, unchanged (p.130) |
   | Area withholding cap | effective |
   | `sustainedForce` | actual |
   | `sustainedEffectiveForce` | effective (read by effects) |

   - The **Magic Pool ceiling** stays the p.85 Magic Attribute cap. p.133's
     "based on the adjusted rating" is applied where the ceiling depends on the
     spell's Force, which is the area-spell cap. It is defined once in
     `spellCastDice`, used by the dialog preview, the cast and shared elemental
     aid. This reading is flagged for the GM with the rest of the table.
   - Labels read "Force 6 (as 8, exclusive)".
4. **Learning twice** (`_learnSpell` / `completeLearning` and the Learn
   dialog): the duplicate check is by canonical name **plus restriction**, so an
   exclusive Fireball and a plain Fireball are two items. Spell foci keep
   binding by item id, so each variant has its own focus. The Learn dialog and
   chargen take the restriction and, for fetishes, the fetish choice (step 1).
5. **Permanent restriction**: `SR2EItem#_preUpdate` refuses a change to
   `restriction` on an owned spell unless the user is the GM (the sheet shows
   it read-only). `cleanSpellDefinition` drops the restriction and both
   sustained Force fields when copying a source spell, so learning sets them
   fresh.
5b. **Cast dialog bounds**: the Force input's max and default and
   `readPreview`'s clamp follow `learnedForce`, not Magic. Casting above Magic
   is allowed (Physical Drain on actual Force, as today). The preview shows
   actual and effective Force and uses the same `spellForces` as the document
   path, which also re-validates `actualForce ≤ learnedForce`.
5c. **Sustained state lifecycle**: `sustainedForce` (actual) and
   `sustainedEffectiveForce` are set together at cast, and cleared together by
   `setSustaining(false)`, expiry, and definition copying.
6. **Fetish enforcement** (in `_rollSpellcast`, **before** any Drain, pool or
   Karma spend, serialised in the caster's attack queue):
   - Fetish-required spells need their fetish on the caster: the reusable
     `itemId` item (present, `quantity > 0`), or bound expendable stock with
     `quantity > 0`.
   - The player confirms it is **in hand, or worn and touched**: a cast-dialog
     checkbox, or `options.fetishInHand` from macros. It defaults to off, which
     refuses the cast.
   - An **expendable** fetish loses one from its quantity *before* the spell
     test, and it is used whether the cast succeeds or not. At 0 it stays at 0
     (it is not deleted, so the kind is still there to restock).
   - "Cannot substitute": the reusable fetish is fixed at learning. Expendable
     restock must match the learned stock and be unbound elsewhere.
     `completeLearning` re-checks, before Karma is paid, that the chosen
     reusable item exists and is not another spell's fetish.
7. **Exclusive enforcement**, before any spend.
   - **Pre-cast check, any duration, success or not**: casting an exclusive
     spell is refused while the caster personally sustains any other spell,
     and casting any other spell is refused while the caster personally
     sustains an exclusive one.
   - **State transitions**: one check on the **resulting** personally-sustained
     set: `exclusiveConflict(setAfter)` is
   true when the set contains an exclusive spell and any other spell. It runs
   on every transition that changes who concentrates on what:
   - casting (including the in-action rule: no other spell cast in the same
     action as an exclusive);
   - `setSustaining(true)` on **either** kind;
   - removing a spell lock (the sheet's unlock update goes through a checked
     method);
   - an elemental's `endService`, `takeOver` and `sustain` handing a spell
     back;
   - quickening removal.

   A transition whose result conflicts is refused with the p.133 reason.
   - Other **magical skills** are refused while one is personally sustained:
     `rollConjuring`, a Sorcery-based astral attack, `learnSpell`, and the
     generic skill roll for skills in the magical category (Sorcery,
     Conjuring, Magical Theory as an action). Each check reports the p.133
     reason.
   - An elemental or a spell lock holding the exclusive spell releases the
     restriction: the magician is no longer sustaining it.
8. **Tests**:
   - Unit: bonus table, `spellForces`, and the consumer table as pure
     functions.
   - Quench: exclusive F6 at Magic 6 → 8 dice, Drain at F6 (stun), label
     "as 8".
   - Casting at actual 4 of a learned 6 → Drain at 4, effect 6.
   - Quickening charges on actual Force.
   - An area spell's radius is still Magic.
   - Learning exclusive after plain gives two items.
   - A player's direct update of `restriction` is refused.
   - Exclusive is refused while sustaining another.
   - Sustaining an exclusive spell refuses a second cast, `setSustaining`,
     conjuring, and a magical skill roll; handing it to an elemental releases
     it.
   - An instant spell is refused while an exclusive one is sustained, and an
     instant exclusive is refused while another is sustained.
   - A reusable fetish is fixed at learning: binding a different item is
     refused, and a deleted fetish blocks casting.
   - Expendable restock must match the learned stock.
   - Fetish-required: refused without the item, without "in hand", or at
     quantity 0; an expendable decrements before the roll, even on a failed
     cast.
   - Binding an item already bound elsewhere is refused.
   - setSustaining an exclusive while sustaining another is refused.
   - Unlocking or `endService` that would conflict is refused.
   - The cast dialog allows a learned 6 at Magic 4 (Physical Drain) and caps at the learned Force.
   - Dropping a spell clears both sustained fields.

## Key decisions & tradeoffs
- **Which numbers the bonus touches** is the table in step 3. It is a reading
  of "for the purposes of determining the spell's effect" together with
  "allocate Magic Pool dice based on the adjusted rating", and it is **flagged
  for the GM** in the CHANGELOG.

## Out of scope
Grimoire spell design; fetish pricing by category (talismonger table).
