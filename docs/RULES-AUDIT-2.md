# Rules audit, round two — combat & magic

Successor to task #76, covering mechanics added since. Prioritised combat and
magic at futurekill's direction.

**Method.** Rules cited in code but pinned by no test are the risk surface — a
cited page with a test is already verified, a cited page without one is an
unchecked claim. That diff drove the order of work. Every rule below was read
from the book; digits were never taken from the text layer alone.

---

## FINDING 1 — Spell foci are implemented as a permanent bonus. They are a pool.

**Severity: high.** Affects every spellcaster with a focus, always in the
player's favour. `item.mjs:1148-1165`.

The book (**p.137**, SPELL FOCI) is explicit on all three points we get wrong:

> Both types operate in a similar manner in that they make available an
> additional number of dice equal to their rating. **Like Dice Pools, once the
> Spell Focus dice are used, they are gone until the beginning of the magician's
> next action.** In fact, treat these dice exactly like Magic Pool dice for the
> purposes of when they refresh and so on. They should **NOT**, however, simply
> be added into the Magic Pool, as they have limited, specific uses.

> A specific spell focus provides extra dice equal to its rating for the tests to
> cast **and resist Drain** associated with **one specific spell**. The magician
> must indicate which spell at the time the focus is [acquired].

### 1a. Not bound to a specific spell

The book binds a *specific* spell focus to **one named spell**. Our `FocusData`
has no spell binding at all, and `item.mjs:1153-1158` sums **every** active
bonded spell focus into **every** spell cast. The code comment concedes it:
*"FocusData doesn't bind a focus to a category, so the player activates the one
matching the spell."*

That pushes a rules constraint onto the player as an honour-system toggle, and it
silently over-grants the moment they forget.

**This already bit us.** When Craft's Sleep Spell Focus was added to Queen
Euphoria it had to ship `active: false` specifically so it would not add +2 to
Mana Bolt. That was treated as a data-modelling quirk and worked around. It is
not a quirk — it is this bug.

### 1b. The dice never deplete

The book could not be clearer: *once used, they are gone until the beginning of
the magician's next action*, and *treat these dice exactly like Magic Pool dice
for when they refresh*. We add them as free dice on every cast, described in the
code as *"Free dice, like the totem bonus"* — which is the totem rule (p.119),
not the focus rule. A Force 4 focus currently yields +4 dice on every spell in a
turn instead of +4 once.

### 1c. Not applied to Drain resistance

The focus helps *"the tests to cast **and resist Drain**"* for its spell. We add
`focusDice` only to `spellDice` (`item.mjs:1165`). Drain resistance never sees
it, so we under-grant on drain while over-granting on casting.

### Also noted
- The book calls it a **rating**; we store `system.force`. Same number, confusing
  name.
- The book defines **two subtypes** — specific spell foci and spell category
  foci. We model one undifferentiated `spell` type.
- *"Dice from a spell category focus cannot be used as Spell Defense dice"* —
  implies specific-spell focus dice interact with Spell Defense differently.
  Unverified; check before implementing category foci.

### Fix shape (not yet implemented)
Model focus dice as a per-action pool alongside the Magic Pool, refreshed by the
same `dicePoolRefreshUpdates` path; add a bound-spell field to `FocusData` and
filter by it at cast time; feed the pool to both the spell test and the drain
test. This is a schema change plus a migration, so it wants a plan and a Codex
round of its own.

---

## VERIFIED CORRECT

- **Sustained-spell penalty, +2 per spell** (p.131, cross-referencing p.128).
  Confirmed in two independent statements: *"sustained also adds +2 to the target
  number"* and *"add an additional modifier of +2 per spell currently sustained."*
  Applied centrally in `rollSuccessTest`, which is the right place — it reaches
  every test rather than being re-implemented per call site.
  **Citation drift:** the code cites p.130; the rule is stated on p.131 and the
  book's own cross-reference points at p.128. Worth correcting.
- **Spell locks are exempt from the sustaining penalty** — the book lists spell
  locks as the sole exception to the focus rules and describes them as foci
  "which sustain spells". Our exemption of `spellLocked` and `quickened` from the
  sustain count is consistent with that.
- **Spell locks cannot exceed rating 1** (p.137). Worth a schema constraint;
  currently unenforced.

---

## QUESTION ANSWERED — firing at a target who is in melee

futurekill asked whether there is a penalty for shooting at someone engaged in
melee, what happens on a miss, and whether we handle it.

**There is no such rule in SR2, and that is a finding rather than a gap.**

The full **Ranged Combat Modifiers Table** (book p.89), read from a 300 dpi
render because a dropped table row is exactly the failure mode a text-layer sweep
produces:

| Situation | Modifier |
|---|---|
| Recoil, Semi-automatic | +1 for second shot that Combat Phase |
| Recoil, Burst-fire | +3 per burst that Combat Phase |
| Recoil, Full-auto | +1 per round fired that Combat Phase |
| Recoil, Heavy weapon | 2 × uncompensated recoil |
| Blind Fire | +8 |
| Partial Cover | +4 |
| Visibility Impaired | see Visibility Table |
| Multiple Targets | +2 per additional target that Combat Phase |
| Target Running | +2 |
| Target Stationary | −1 |
| **Attacker In Melee Combat** | **+2 per opponent** |
| Attacker Running | +4 |
| Attacker Running (difficult ground) | +6 |
| Attacker Walking | +1 |
| Attacker Walking (difficult ground) | +2 |

The only melee entry is **Attacker** In Melee Combat. There is **no "Target In
Melee"** row — SR2 imposes nothing for shooting *into* a melee. And a missed
firearm attack simply misses: there is no scatter or stray-round rule for
bullets, unlike grenades, which do scatter (p.116).

So the three answers:

1. **Penalty for firing at a target in melee?** No. Not a modifier we are
   missing — one the book does not have.
2. **What happens on a miss?** Nothing. The round is spent, ammo decrements, no
   stray-fire resolution exists in SR2 core.
3. **Do we handle it?** We correctly handle the case the book *does* have — the
   shooter being in melee — via `countEngagingFoes` and `ENGAGED_TN_PER_FOE = 2`,
   surfaced as an editable field on the attack dialog.

### One nuance worth a GM's attention

The p.90 text is narrower than the table row suggests: the +2 applies if the
attacker *"is engaged in melee combat with an opponent, **or if he is aware of
another character attempting to block the attempt** within two meters of him."*

Our auto-count is **any aware, undefeated, opposed token within 2 m** — broader
than "engaged, or actively trying to block". A hostile who is merely standing
nearby and doing something else would count for us and arguably should not.
Defensible, because the field stays editable and the alternative is asking the
system to infer intent, but a GM should know the box is a suggestion.

**If a GM wants a penalty for shooting into a melee anyway**, the printed hook is
**Partial Cover +4** — ruling that the other combatant obstructs the shot. That
is a judgement call, not a rule, and should be labelled as such.

## Still to audit

Combat: knockdown interactions with called shots, blast falloff vs cover,
recoil across burst/full-auto boundaries, opposed melee ties.
Magic: totem bonuses per category (pp.119-124), ritual sorcery (p.133),
conjuring drain (p.139), astral combat, initiation/metamagic.
