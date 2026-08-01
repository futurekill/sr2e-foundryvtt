# PLAN — post-session fixes: NPC rolls, spirits, called shot, aim, barriers, contacts
_Round 5 (final) — 52 findings across five Codex rounds, all accepted. NOT re-reviewed after this revision: the loop hit MAX_ROUNDS._

Six items from a live session (futurekill, 2026-08-01). Rules were read from
**300 dpi renders**, not the PDF text layer, per the repo's rules policy. Page
numbers are BOOK folios. Line references were checked in the current tree.

---

## 1. NPC attribute rolls — template only

`rollAttribute` is **already registered** on the NPC sheet
(`actor-sheet.mjs:1114`). The handler and `actor.rollAttributeTest()` exist. The
only gap is that `templates/actor/npc-sheet.hbs` renders attributes as static
text.

**Do.** Attach `data-action="rollAttribute" data-attribute="<key>"` to a
**dedicated clickable label or dice button**, NOT the containing cell or the
numeric input — the attribute cells are editable controls, and a click meant to
edit a value would bubble into a roll dialog.

**Check:** which attribute keys `rollAttributeTest` accepts — Reaction is derived,
not a base attribute, and may not be valid. Test it rather than assuming.

---

## 2. Spirit powers — needs a view-model, not a swapped iterable

`system.powers` is `ArrayField(StringField)` — an **array of power keys**
(`actor-data.mjs:1430`), populated by `rollConjuring` from
`spiritDomainPowers[domain]` (`actor.mjs:915`).

`actor-sheet.mjs:1417` instead passes `CONFIG.SR2E.spiritPowers`, the **global
catalogue**, and `spirit-sheet.hbs:41` iterates it as `(label, key)`. Simply
pointing the loop at the array would make the **array index** the action key.

**Do.** Build `context.spiritPowers = system.powers.map(key => ({ key, label:
game.i18n.localize(CONFIG.SR2E.spiritPowers[key] ?? key) }))` and update the
template to `{{#each spiritPowers as |p|}}` using `p.key` / `p.label`.

**Verify first** that a live summoned spirit has a populated `system.powers`. If
empty, the bug is in the summon path and this fix is wrong.

---

## 3. Spirit portraits too dark — measured

48 portraits; mean luminance **0.098–0.436**; 40 creature portraits average
**0.309**. earth-1 = 0.098, city-2 = 0.106, desert-3 = 0.436. A blanket lift
would blow out the desert set.

**Do.** Per-image gamma lift toward the creature baseline, applied only below a
threshold, computed from each file's own median.

**Codex was right that a marker file can lie and that repeated lossy re-encoding
degrades — and right that a `_source/` folder under `assets/` would ship the set
twice.** So: copy the current files once to a **tooling-only** location outside
`assets/` (`tools/art-src/spirit_portraits/`, added to the release rsync
excludes), generate outputs deterministically **from those**, and record source
SHA + gamma per file in a JSON manifest. Re-running compares
hashes; a changed source is re-derived, an unchanged one is skipped. No
compounding, and the marker cannot lie because it is keyed to content.

---

## 4–6 land as ONE change to the attack flow

Codex's most useful finding: the attack path is fragmented and **already drops
options**. `rollWeaponInteractive()` reconstructs an options object by hand and
omits `deployed` and `distance` that the dialog collects. Any new field added
naively will be dropped the same way.

**Do first, before any feature:** normalize the dialog result once and forward
`{...opts}` through **both** the personal and vehicle attack paths, and fix the
two already-dropped fields as part of it. Every feature below depends on this.

**And normalize EVERY caller-controlled option server-side, not just the ones
with a dedicated check.** After `{...opts}` forwarding, a macro or direct call
can submit an arbitrary barrier rating, forged `transparent`/`doorType`
values, a negative or oversized aim count, or a firing mode the weapon does not
have. Validate against canonical values — the nine rating presets, the mode
enum, the aim bounds, weapon eligibility — before anything is trusted.

**And move all eligibility validation ahead of every mutation.**
`_rollWeaponAttack()` currently decrements thrown/grenade quantity near the top,
before resolution — so a rejected called shot, a refused aim+pool combination, or
a barrier refused on a blast attack would consume the item anyway. Normalize and
validate first; mutate ammo, quantity, recoil and pools only after.

**Second, remove the double-application trap.** The `otherMod` tooltip currently
reads *"Aimed shot −1/Simple Action · called shot +4 …"* at
`sheet-actions.mjs:881` **and** `:937`. Dedicated controls plus those
instructions = double counting. Strip called-shot and aimed-shot from both
tooltips, leaving `otherMod` for genuinely unmodelled situational modifiers.

**Third, one TN computation.** Build `rawTN = base + range + visibility +
calledShot − aim + otherMod + …`, then apply the `Math.max(2, …)` floor **once**,
and render that same breakdown in the card. No intermediate clamping.

### 4. Called Shots (p.92)

+4 TN; Damage Code +1 level, capped at D. Sub-target on vehicle-sized-or-larger
uses **Barrier Ratings** for windows/tires, also +4. **Only SS / SA / BF are
eligible** — never full auto. Calling is a Free Action.

- **Concrete eligibility predicate**, not a gesture. `weaponType` is one of
  `melee | projectile | throwing | firearm | heavy | grenade`
  (`item-data.mjs:153`). Called shots require **`firearm` or `heavy`** — the
  rule is about firing modes, and `melee`/`throwing`/`grenade`/`projectile` have
  none. AND the selected mode must be one of `ss | sa | bf` AND actually enabled
  on the weapon: `weapon.system.firingModes[mode] === true`
  (`item-data.mjs:183`, four booleans). Checking `firingMode !== "fa"` alone is
  not enough — `_rollWeaponAttack()` defaults a missing mode to `"sa"`, which
  would make a mode-less weapon look eligible.
- **Revalidate in `_rollWeaponAttack()`** before rolling or consuming ammo; a
  dialog-only refusal is bypassable by macro or direct call.
- Couple the controls live: changing mode to FA must clear called shot.
- **Damage staging:** keep `baseLevel`, `calledShotSteps`, `burstSteps`,
  `successSteps` separate and cap **once** when deriving the final level. Damage
  is currently raised by burst and then by successes; adding a third increment
  blindly risks double staging.

### 5. Take Aim (p.82) — manual bookkeeping, and say so

Each Take Aim reduces the base TN by **1**; max sequential = `floor(skill / 2)`;
cumulative; lost on **any** other action including a Free Action; and a character
aiming across phases **may not use Dice Pool dice at all**.

**Decision (GM, 2026-08-01): a dialog control, tracked at the table.** The GM
accounts for the action economy themselves; the system does not need an engine
hook and will not pretend to have one. This removes the whole problem — a
persistent flag could not be cleared reliably (Foundry hooks observe document
mutations, not game actions), and now it does not have to be.

An **"Aim actions taken (0..max)"** spinner rather than a plain checkbox, because
aim is cumulative: each action is another −1, up to `floor(skill / 2)`. A
checkbox could only ever express "1". The cap follows the **currently selected
skill variant** — the dialog offers general, concentration and specialization
ratings and seeds `skillCap` from the highest, so a cap computed once can exceed
the skill actually chosen. Recompute on variant change; revalidate in
`_rollWeaponAttack()`.

**Aim eligibility.** p.82 allows aim only with a **ready ranged weapon**
(firearm, bow, or throwing weapon), so: `weaponType` in
`{firearm, heavy, projectile, throwing}` — never `melee`, and not `grenade`,
whose scatter path returns before the normal damage flow anyway (same reason
barriers are refused there). Require `system.equipped`; readiness beyond that is
player-asserted, and the tooltip says so. Revalidate the predicate in
`_rollWeaponAttack()`.

**The pool restriction applies to MULTI-PHASE aim only** — p.82: "Characters who
are aiming **over multiple Combat Phases** may not use Dice Pool dice." Banning
pools whenever `aim > 0` would over-apply it to a single-phase aim, which the
rule permits. Since aim is already player-asserted, add one more assertion:
an **"aim spanned multiple phases"** checkbox, enabled only when aim > 0. Set
`forbidPoolDice` from **that**, not from the aim count.

When it is set: disable the pool controls in `promptWeaponAttackOptions()`
**and** pass `forbidPoolDice` to the roll layer so a direct call cannot bypass
the dialog. **Failure contract, stated:** validate **before any side effect**; if pool dice
are requested alongside aim, abort with a notification rather than silently
zeroing them or throwing after ammo has been spent; and record the no-pool aim
restriction on the resulting card.

### 6. Barriers (p.98) — weapon fire only

**Ratings:** Glass 2, Cheap/Tires 3, Average/Ballistic Glass 4, Heavy 6,
Reinforced/Armored Glass 8, Structural 12, Heavy Structural 16,
Armored/Reinforced 24, Hardened 32. Doors use their material; **security doors
twice**; glass doors the glass.

**Firing Through:** +8 Blind Fire unless transparent; defender subtracts **both
armour and adjusted BR** from Power; if BR > Power the attack is **stopped
cold** (may still damage the barrier). Blunt melee normal; **edged melee twice**.

**Break Through:** **twice** BR vs firearms/ranged. Power < ½ BR → cosmetic;
≥ ½ BR up to BR → BR −1; > BR → per increment of half the BR above it, a
½-metre hole and BR −1. Regular door opens at ½ BR; security door at 0.

**The Power leak, located precisely — and a correction to my own round-1 fix.**
`effectivePower` is built at `item.mjs:801-826`, taking ammo `damageMod` (:812)
then `burst.powerBonus` (:822). `basePower` at :839 is `effectivePower - rounds`.

I claimed that subtraction was reverse-engineering a different quantity. **That
was wrong:** `burstDamageBonus(rounds)` returns `{powerBonus: rounds}`
(`sr2e-rules.mjs:329`), so the subtraction is currently exact. I also proposed
capturing before ammo, which would have **silently changed vehicle-armour
penetration**, since `basePower` deliberately includes `damageMod` and feeds the
p.108 check.

**Do.** Capture the **post-ammo, pre-burst** value as a named
`baseRoundPower` at :822, and have both the existing vehicle check and the new
barrier comparison read it. That is behaviour-preserving for vehicles, removes
the fragile subtraction, and is the right value for p.98 anyway — "the base
Power Rating **of the round**" includes the round's ammunition type (APDS, gel),
and excludes only burst/full-auto.

**Barrier metadata, not just a number.** A rating alone cannot express
transparency, security-door break behaviour, or which of the two procedures
applies. The selector carries
`{rating, transparent, doorType, barrierMode: "through" | "break"}` — `doorType`
is `"none" | "regular" | "security"`, NOT a boolean, or the regular-door
half-rating threshold would be applied to walls, windows and tires. And
`barrierMode` is **revalidated in `_rollWeaponAttack()`** — the two modes use
different adjusted ratings and produce different outcomes.

**Blind fire must REPLACE, not add to, the existing visibility selector**
(`#sr2e-visibility`, :717) — otherwise an opaque barrier plus a Blind Fire
visibility choice gives +16.

**Resolution shape.** The resolver takes the **base** rating plus metadata and
derives every adjustment itself — the caller must not pre-adjust, or the
advisory `newRating` and the door thresholds (½ BR regular, 0 security) would be
computed against a doubled number.

```
resolveBarrier({
  baseRating, transparent, barrierMode,                // the barrier
  doorType,               // "none" | "regular" | "security"
  comparisonPower,        // = baseRoundPower: post-ammo, PRE-burst (p.98)
  attackKind              // "ranged" only — melee kinds are out of scope
}) -> { stopped, powerReduction, barrierEffect, newBaseRating, opensDoor }
```

Two ratings are derived internally and never conflated:
- **`penetrationRating`** — the through-barrier value, for the stopped test and
  the Power reduction.
- **`damageRating`** — the break-through value (×2 vs ranged), for the Barrier
  Effect Table.

**`barrierEffect` is computed in exactly two cases**, and is `null` otherwise:
`barrierMode === "break"`, or a `"through"` shot that was **stopped** — p.98's
"this may still damage the barrier" is said of the stopped case. A through-shot
that penetrates does **not** also damage the barrier.

The resolver returns a **`powerReduction`, not a finished `damagePower`** — it
is not given `effectivePower` and must not invent one. The caller computes
`damagePower = effectivePower - powerReduction`.

**Armour is NOT subtracted here.** The existing resistance path already applies
it; doing it in the resolver would double-apply. `powerReduction` is the barrier
contribution only. Assert this in an integration test.

Called in `_rollWeaponAttack()` **before** the normal damage card is built,
with **three terminal outcomes** — a successful break-through must NOT fall
through to a defender damage card, because the barrier was the target:

| case | outcome |
|---|---|
| `barrierMode === "break"` | barrier-effect card **only**; stop |
| `"through"`, `stopped` | stopped + barrier-effect card; stop |
| `"through"`, penetrates | proceed to normal defender resistance | Barrier Rating reduction is advisory — `newBaseRating`
and `opensDoor` are reported in chat, not persisted.

**Armour is NOT subtracted inside `resolveBarrier()`.** p.98 says the defender
subtracts both armour and the barrier rating, but the existing resistance path
already applies armour — doing it here too would double-apply it. Barrier
resolution subtracts the barrier contribution only; armour stays where it is.
Assert this in an integration test.**Explicitly rejected for now:** blast and shotgun-spread branches return before
the ordinary damage-card path, so barrier selection is **refused** for them
rather than half-wired.

---

## 7. Contacts — TWO mechanics, not one

The original request ("a way for the contact to roll") was half right, and which
half depends on what is being asked for.

### 7a. Legwork — INFORMATION (p.200). The player rolls.

> "A success test using Street or Corporate Etiquette, **Target Number 4** …
> **The player character rolls a number of dice equal to his Etiquette Skill**
> to determine what information the contact knows and is willing to impart."

Successes tier the information and are cumulative. `archetype` is free text and
cannot deterministically pick Street vs Corporate — add an explicit
etiquette-domain choice, with archetype as a non-authoritative default.

### 7b. Acquisition — GEAR AND SERVICES (p.184). The GM rolls the CONTACT.

This is the one the fixer/18-wheeler question needs, and here the contact really
does roll:

> "To obtain the desired item, the character contacts the source, usually a
> Fixer… For this **Acquisition Test, the gamemaster rolls** a number of dice
> equal to either the source's relevant Special Skill (such as the Fixer
> contact's 'Equipment Acquisition' skill) or the standard Etiquette skill
> (Street, Corporate, and so on), **adding +2**, against the **first value of the
> Availability Code**, which serves as the target number."
>
> "For certain items, especially those with a variable rating, the gamemaster
> may wish to increase the Acquisition target number by **1 for every 2 rating
> points** of the item."
>
> "**Divide** the resulting number of successes **into the base time**… (the
> second part of the Availability Code)… **No successes: the item is not
> available at this time.**"

Then a **Negotiation Test** (p.185), opposed: the character rolls Negotiation
(or Charisma / Skill Web default) against the **source's Willpower**; the source
rolls against the **character's Willpower**. Price = **Cost × Street Index**.
Whoever wins adjusts the price in their favour by **5% per net success**.

**Do.** Two actions on a contact: **"Legwork"** (player, Etiquette, TN 4) and
**"Acquire…"** (GM-side: pick an item or free-text it, roll the contact's skill
+2 vs the Availability TN, report successes → time, then offer the Negotiation
Test and compute the final price from Cost × Street Index ± 5%/success).

**Schema gap this exposes:** `ContactData` has no skill rating to roll. It has
`loyalty` and `influence` only. An Acquisition Test needs *something* — see the
open question below.

**Content gap this exposes:** most Rigger Black Book vehicles ship with an
**empty `availability` field**, including the Conestoga Trailblazer Prime Mover.
Acquisition has no target number without it. Needs a pass over the vehicle
packs before 7b is usable.

**Open, for the GM:** `loyalty` and `influence` (1–6) are Companion flavour and
unused by either core mechanic. The natural fit is **`influence` as the
contact's Acquisition dice pool** (a better-connected fixer finds more), and
**`loyalty` as a Negotiation modifier** (a friend gouges you less) — but that is
an invention, not a rule, so it needs a ruling before implementation.

## Sequencing

1, 2, 3 are self-contained — ship first. Then the options-forwarding fix, then
4/5/6 together as one change to the attack flow. 7 is independent but blocked on
the loyalty/influence question.

## Testing

Pure math in `module/rules/sr2e-rules.mjs` with book-value tests:
`calledShotDamage()`, `aimTnReduction()`, `maxAimActions()`, `barrierEffect()`,
`adjustedBarrierRating()`.

Codex is right that this is not enough — and right that plain Vitest cannot
instantiate Foundry documents or DialogV2. So the integration cases go to
**Quench**, in-world, not Vitest:

- called-shot eligibility across SA/BF/FA, including the direct-call bypass of
  the dialog;
- **same-phase** aim PERMITTING pool dice, and **multi-phase** aim rejecting
  them, aborting **before** ammo is spent — the earlier draft asserted that any
  aim rejects pools, which would have locked my own over-restriction into tests;
- opaque vs transparent barrier producing +8 exactly once, never +16;
- `comparisonPower === baseRoundPower` and never `effectivePower`;
- a thrown weapon NOT consumed when the attack is refused;
- armour applied exactly once across barrier + resistance.

Vitest keeps the pure helpers. NPC and spirit sheets stay on Quench as before.

## Out of scope

Barriers as placed scene objects; barriers for melee, magic, blast and spread;
persistent Barrier Rating documents; contact loyalty/influence until ruled on; a
system-wide action dispatcher (the only thing that would make persistent aim
honest).
