# Plan: The rest of the drug rules (Shadowtech p.85, p.96, p.98, p.99)
_Round 2 — Round 0 plus the Codex R1 and R2 amendments at the end_

## Rules (rendered pages, already read)
- **Kamikaze (p.99)**: "negate the first four boxes of damage received
  (either physical or mental) after it is administered", in any mix.
- **Hyper (p.98)**:
  - "mild vertigo (apply a +1 to all target numbers)";
  - during the effect, "All concentration tasks … add +4 to their Target
    Numbers (including spellcasting)";
  - "any damage taken (whether physical or mental) will result in additional
    damage": half the inflicted damage, rounded up, on the **Mental** (Stun)
    monitor.
- **Atropine (p.96)**:
  - "+1 modifier to all Active Skill Target Numbers";
  - "an additional +1 for melee and close range firearms combat";
  - "+2 to all Knowledge, Technical, Build/Repair, Language, and Magic
    skills".
- **Stimulant overuse (p.85)**: "If an additional dose of a stimulant is
  administered before the effects of the first application have worn off …
  he/she takes an immediate Light wound on the Mental Condition Monitor.
  Moreover, the additional application … operates at only 50 percent
  efficiency. Divide bonuses in half, rounding down; penalties are not
  correspondingly altered."

## Choke point (verified by audit)
Every damage event already goes through `SR2EActor.damageUpdate(type,
amount)`: `applyDamage` uses it (weapons, melee, spells, Drain, astral,
spirits, falls), and so do ritual Drain and toxins. The only other monitor
writes are healing, vehicles, and manual monitor edits (absolute
corrections, not damage events). Drugs hook **there**, in one pure reducer,
committed in the caller's single update.

## Design
1. **Active-drug state (derived, read at the event)**: an effect is **in
   force** when it is a drug effect and not expired (`duration.remaining > 0`,
   or untimed). One helper, `drugsInForce(actor)`, returns the effects in force
   with their flags: `absorb`, `overload`, `tn`.
2. **Kamikaze absorption**:
   - The counter lives on the **actor**: `flags.sr2e.drugAbsorb[exposureId] =
     boxesLeft`. It is written when the dose is used, before the effect
     exists.
   - It counts only while that exposure's effect is **in force**, so an
     orphaned counter (a failed effect create) is inert.
3. **The damage reducer**, pure, in the rules module:
   `drugDamage({type, amount, absorbLeft, overload})` →
   `{ landed:{type, amount}, absorbUsed, overloadStun }`.
   - **Order**: absorption first, taken from the incoming boxes (physical or
     stun alike). Overload is then computed on what **landed**: ceil(landed ÷
     2) as Stun.
   - The overload Stun is **secondary**: it never triggers overload again, and
     absorption doesn't apply to it (it isn't a new "damage received").
   - Multiple absorbers are used oldest exposure first.
4. **`damageUpdate(type, amount)`** applies the reducer:
   - the landed damage through `damageUpdateFor` (with its Stun → Physical
     spill);
   - then the overload Stun through `damageUpdateFor` again, from the new
     values;
   - plus the decremented `flags.sr2e.drugAbsorb` keys, all as ONE update
     object.

   Every existing caller commits it in one update, so the ritual Drain marker,
   the toxin done-flag and plain damage all stay atomic. `applyDamage` for
   vehicles and IC is unchanged.
5. **TN penalties** go through a named component in `testTnModifiers`:
   `drugTN`, shown in the breakdown ("+N drugs") and summed into the total.
   - It is exempt from Centering's buy-down only if the book says so (it
     doesn't), so Centering can reduce it like the other penalties.
   - It is **not** applied under a ritual `tnPolicy` of "table"; it is applied
     under "injury" (the leader's own condition).
   - The context comes from the caller as `options.tnContext = { kind:
     "skill"|"attack"|"spell"|"resist"|"other", skillCategory, magic, melee,
     closeRange }`:
     - `rollSkillTest`: the skill's category and `isMagical`;
     - ranged attack: category active, `closeRange` = short range bracket;
     - melee attack and defence: active, `melee`;
     - spellcasting: `spell`, `magic`;
     - conjuring: `magic`;
     - damage, drain and toxin resistance: `resist`;
     - everything else: `other`.
   - **Hyper**: +1 on every test (`all`), plus +4 when `kind === "spell"`. The
     book names only spellcasting as a concentration task; any other
     concentration task is the GM's (card note).
   - **Atropine**, by skill category:
     - `active` +1, and +1 more when `melee` or `closeRange`;
     - `knowledge`, `language`, `build_repair` +2;
     - `magic` (Sorcery, Conjuring, spells) +2 instead of the Active +1.
     - "Technical" is not a category in this system; technical active skills
       get the Active +1 (a stated reading).
     - Resistance and plain attribute tests are not skills, so +0.
6. **Overuse** (drugs flagged `stimulant: true`; Kamikaze): a dose while the
   same drug is **in force**:
   - applies an immediate **Light Stun** (1 box) through `damageUpdate`;
   - creates the new effect with **positive** ADD changes halved (round down)
     and negative ones kept;
   - halves the new dose's absorption too (4 → 2).

   The card states it. A non-stimulant repeat only notes "same drug already
   active".
7. **Content** (sr2e-shadowtech): `flags.sr2e.drug` gains:
   - `absorb` (Kamikaze 4) and `stimulant: true` (Kamikaze);
   - `overload: true` and `tn: {all: 1, spell: 4}` (Hyper);
   - `tn: {active: 1, meleeClose: 1, knowledge: 2, language: 2,
     build_repair: 2, magic: 2}` (Atropine).

   The effect copies them into `flags.sr2e.drugEffect`. The card notes shrink
   to what stays manual: Kamikaze's long-term wasting, the adrenal pump
   interplay, Cyanide's onset, and dose counting and withdrawal.

## Tests
- Unit (reducer):
  - 5 boxes with 4 absorb → 1 lands, 3 absorb used;
  - 3 boxes with 4 absorb → 0 lands, 1 left;
  - overload on 6 landed → 3 Stun;
  - absorb then overload: 5 incoming, 4 absorb → 1 lands → overload 1;
  - overload doesn't recurse.
- Quench:
  - Kamikaze absorbs the next 4 boxes across two hits (physical then stun),
    then damage lands; after End, no absorption.
  - Hyper: a Moderate (3) physical hit adds 2 Stun; a skill test shows +1
    drugs; a spell shows +5.
  - Atropine: Firearms at short range +2, at long +1; a Knowledge test +2;
    Sorcery +2; a damage resistance test +0.
  - Overuse Kamikaze: 1 Stun at once; the second effect +0 Body/Quickness/
    Willpower (½ of 1 → 0) and +1 Strength; absorption 2.
  - Ritual Drain with absorption: the marker and the damage stay one update.
  - Expired Hyper (world time advanced past it): no overload, no TN.

## Out of scope (card notes)
Kamikaze's long-term wasting (monitor maximum loss, augmentation failure);
the adrenal pump interplay (MAO, ACTH); Cyanide's onset delay; dose counting,
rating growth and withdrawal; concentration tasks other than spellcasting.

## Round 1 amendments (Codex R1, all accepted)
1. **Centering**:
   - The casting path's Centering eligibility, modified TN and reduction cap
     use the same modifier set as `testTnModifiers`, `drugTN` included.
   - Hyper's +5 on a spell can be centred away like the wound and sustain
     penalties.
   - The chat breakdown shows "+N drugs".
2. **Rituals**: drug penalties are excluded under **both** ritual `tnPolicy`
   values. "injury" stays the leader's Injury Modifier only, the existing
   contract.
3. **Context inventory**: `rollSuccessTest` takes `options.tnContext`, and
   **`rollSkillTest` derives it itself** from the skill it resolves. That
   covers chipped skills, defaulting and the Skill Web, and every caller of
   `rollSkillTest` (learning, first aid, the GM skill request).

   Direct `rollSuccessTest` sites and the context they pass:

   | Site | Context |
   |---|---|
   | ranged attack (item.mjs) | `{kind: "attack", skillCategory: "active", firearm: skill==="firearms", closeRange: resolved bracket === "short"}` |
   | melee attack / defence (actor.mjs) | `{kind: "attack", skillCategory: "active", melee: true}` |
   | spell success test (item.mjs) | `{kind: "spell", magic: true}` |
   | conjuring (actor.mjs) | `{kind: "skill", magic: true}` |
   | astral attack/defence (astral-combat.mjs) | `{kind: "skill", magic: true}` for Sorcery; `{kind:"attack", skillCategory:"active", melee: true}` for an armed/unarmed astral fight |
   | ritual stages | none: the policy excludes them |
   | damage, drain, toxin, crash, knockdown, addiction/tolerance resistance | `{kind: "resist"}` |
   | attribute tests, perception, initiative-like, Karma-only, Matrix, vehicle handling | `{kind: "other"}` (the default) |

   Hyper's `all` applies to every kind, "resist" included (its text says
   "all target numbers"). Atropine applies only to "skill", "attack" and
   "spell".
4. **Close range**: only a **firearm** attack (skill Firearms) at the
   **resolved** range bracket `short` gets Atropine's extra +1. Throwing,
   projectile and gunnery (mounted) don't. Melee gets it through `melee`
   (attack and defence).
5. **Technical skills** (core p.71: "Technical Skills deal with all types of
   machines") are **Biotech, Computer and Electronics**, in a
   `TECHNICAL_SKILLS` set in the rules module. Atropine gives them +2
   (instead of the Active +1). Magical skills (Sorcery, Conjuring) also get +2
   instead of +1.
6. **Overuse order**: the Light Stun wound is applied **before** the new
   effect exists, as a damage event. So the **first** dose's remaining
   absorption can soak it: it is "damage received after [the first] was
   administered". The new dose's counter (halved) is written after, so it
   never absorbs its own overuse wound. Tests cover an intact and an
   exhausted first counter.
7. **One damage queue**:
   - `commitDamage(actor, type, amount, {extra})` runs in a per-actor queue
     (`damage:` + uuid), re-reads the monitors and counters inside it,
     computes via the reducer, and writes ONE update (monitors, absorb
     counters, the caller's extra marker).
   - `applyDamage`, ritual Drain and toxins all go through it; there is no
     re-entrancy (callers' own queues have other keys).
   - Cross-client stays the stated one-driver limit.
8. **Consequences use landed damage**: `commitDamage` returns `{landedBoxes,
   absorbed, overloadStun}`.
   - `rollDamageResistance` bases knockdown on the **landed** boxes (none
     when fully absorbed), and its card says "Kamikaze absorbs N".
   - `commitDamage` itself posts one short line whenever absorption or
     overload happened, so every other caller's report is complete.
9. **In force** = a drug effect that is **not disabled**, consistent with the
   shipped manual-ending contract: everything, attributes included, lasts
   until ended. Expiry only labels the row "expired", prompting End.
10. **Content**: `gen-drugs.mjs`'s serializer writes `absorb`, `stimulant`,
    `overload` and `tn`; the packs are rebuilt and validated. The dose copies
    them into the exposure. Existing world items and exposures keep their old
    data; the CHANGELOG says to re-drag drugs from the compendium, and
    exposures already running end as they are.
11. **Tests corrected**:
    - 5 boxes with 4 absorb → 1 lands, **4** used;
    - overload computed from reconstructed `{value, max}` monitors, covering
      Stun → Physical spill and Physical overflow;
    - two absorbers (oldest first);
    - a disabled effect ignored;
    - NPC and unlinked-token counters kept separate;
    - overuse Kamikaze asserts the Initiative die change is +0 (½ of 1).

## Round 2 amendments (Codex R2, all accepted)
1. **Direct skill callers pass an explicit context** (they call
   `rollSuccessTest` themselves, so `rollSkillTest`'s derivation never sees
   them):

   | Site (actor.mjs) | Context |
   |---|---|
   | untrained named skill (~1085, defaulting branch) | the named skill's category + key, from `CONFIG.SR2E` skill data |
   | chipped skill (~1191) | the chip's `grantedSkillCategory` + key |
   | spell learning (~3193) | `{kind: "skill", magic: true}` (Sorcery) |
   | First Aid (~3582) | `{kind: "skill", skillCategory: "active", key: "biotech", technical: true}` → +2 |
   | Matrix system operations (~2906) | `{kind: "skill", key: "computer", technical: true}` → +2 |
   | vehicle handling / position / crash (~1785) | `{kind: "skill", skillCategory: "active", key: <driving skill>}` → +1 |

   `atropineTN` reads `technical` (or `TECHNICAL_SKILLS.has(key)`) first,
   then `magic`, then the category. The crash **resistance** roll stays
   `resist`.
2. **Zero-duration exposures are tracking-only**: an exposure whose effect was
   created with `seconds: 0` (a failed duration, a toxin card) is excluded from
   `drugsInForce`, so it never absorbs, overloads or adds TN, even while
   enabled.
3. **Knockdown uses the landed boxes**. The book's threshold is "half the
   damage dealt" (p.91): L 1, M 2, S 3 is exactly ⌈boxes ÷ 2⌉ for 1, 3 and 6
   boxes. So:
   - `knockdownThreshold(boxes)` = ⌈boxes ÷ 2⌉; `knockdownOutcome(boxes,
     successes)` auto-drops only on a full 10-box (Deadly) landing;
     `knockdownPrompt(boxes, …)` the same.
   - The button carries `data-boxes` (the landed boxes, not the level); the
     handler passes them through; `rollKnockdown(power, boxes, …)`.
   - Old cards carrying only `data-level` map through `boxesForLevel`.
   - Tests: 2 boxes left → threshold 1; 5 left → 3; a Deadly hit reduced by
     absorption to 6 → offered (threshold 3), not auto-prone; fully absorbed →
     no knockdown at all. The existing L/M/S/D tests are rewritten against 1, 3,
     6 and 10 boxes with identical results.
4. **`commitDamage`'s chat line is best-effort**: wrapped in try/catch, after
   the update; it always returns the committed `{landedBoxes, absorbed,
   overloadStun}`, so a chat failure never turns a committed hit into an
   error for the caller.
5. **Tests**: the "expired Hyper: no overload" case is replaced by
   (a) expired-but-enabled Hyper **still** overloads and adds TN (in force =
   not disabled), and (b) a zero-duration exposure does neither.
