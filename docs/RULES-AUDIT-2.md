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

## Still to audit

Combat: knockdown interactions with called shots, blast falloff vs cover,
recoil across burst/full-auto boundaries, opposed melee ties.
Magic: totem bonuses per category (pp.119-124), ritual sorcery (p.133),
conjuring drain (p.139), astral combat, initiation/metamagic.
