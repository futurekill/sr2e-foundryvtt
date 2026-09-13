# Audit + Plan: Concentrations and Specializations (SR2E p.70, p.191)

_Round 6 — after six Codex reviews. Round 0's `chargen.inProgress` gating was
rejected outright; three findings were overstated and reworded; three more
defects were found that I had missed entirely. No code yet._

## The rules, verified from page renders

**p.70 — creation.** A Concentration is the general +1, general reduced by 1. A
Specialization is the original general +2, general reduced by 2, and the
character **also gains a Concentration at the original general rating**.
Firearms 5 → SMG 6 / Firearms 4; specializing → Uzi III 7 / SMG 5 / Firearms 3.

- _"All these numerical gymnastics are relevant only during character creation…
  Once the game has begun, skill advancement is handled according to the Karma
  rules on p.190."_
- _"When referring to the Skill Web, use only the general skill rating, never a
  Concentration or Specialization rating."_

**p.191 — advancement.** _"New Concentrations are based on the existing general
skill score… 5 × 1.5"_; _"New Specializations are based on the existing
Concentration score. If the character does not have an appropriate Concentration,
use the general skill."_ Costs ×2 / ×1.5 / ×1 of the new rating.

**Nothing after chargen reduces the general skill**, and the separate multipliers
only cohere if the three ratings advance independently. Buying Firearms 4 →
Pistols 5 does not touch Firearms; later raising Firearms does not raise Pistols.

## Already correct — leave alone

- `skillSubRatings(G)` → `{G+2, G+4}` reproduces p.70 against the final general.
- `rollSkillTest` honours a `concentration` / `specialization` variant **and adds
  adept / articulation bonuses** on that path.
- The **character** skills tab renders clickable variant tags.
- **Skill Web defaulting reads `system.rating` only** — p.70's last sentence.

## Findings

### 1. The chargen arithmetic never stops applying — the core defect

`SkillData#prepareDerivedData` recomputes named sub-ratings as `rating + 2` /
`rating + 4` on every preparation, for every actor type, in and out of chargen.
**Independent post-chargen ratings therefore cannot exist**, which is what p.191
requires. Most likely the player's report.

Precision, corrected across two reviews: it does **not** reduce the general
(that is manual), and it **masks** stored sub-ratings in prepared data rather
than necessarily overwriting source.

### 2. Chargen undercounts skill points

`chargenSpend` sums the reduced general, so a Concentration refunds 1 point and a
Specialization 2. The caller (`actor-sheet.mjs:976`) also projects only
`{category, rating}`, so the function cannot currently see sub-ratings at all.

### 3. `rating` means two different things

During creation it is "final reduced general"; afterwards "independent general".
The system does not automate the p.70 gymnastics — it asks the player to enter a
pre-reduced number — and the only explanation is a `title` tooltip.

### 4. Specializing does not grant its Concentration

p.70 grants one at the original general rating; nothing prompts for it.
**Chargen-scoped only** — p.191 expressly allows a post-chargen Specialization
with no Concentration.

### 5. A slotted ActiveSoft leaves stale sub-ratings

`_applySkillsofts` sets `system.rating` on the already-prepared item and
recomputes language ratings, but not sub-ratings. A chipped skill keeps
sub-ratings derived from its pre-chip rating. A skillsoft is not a Concentration.

### 6. The NPC sheet cannot roll a Concentration or Specialization

`npc-sheet.hbs:117` emits `data-action="rollSkill"` with **no** `data-variant`,
so every NPC skill rolls the general rating only. The character sheet has had
variant tags all along; NPCs never did.

### 7. Weapon fallback silently drops adept and articulation bonuses

`item.mjs` has two paths. The variant path does `skillRating = sub.rating +
bonus`. The **name-matching fallback** — which fires when a weapon's name matches
a concentration/specialization — does `skillRating = sub.rating`, with no bonus.
An adept with Improved Ability loses it precisely when their specialization
applies.

### 8. `getEffectiveRating` is dead code

Zero callers. Centralizing rating selection is now **load-bearing rather than
cleanup**, because skillsoft suppression (below) has to be enforced identically
across six call sites.

## Proposal — per-skill lifecycle

Gating on `chargen.inProgress` was rejected: a GM reopening chargen would resume
deriving and mask Karma-bought ratings; imported actors carry unreliable flags;
NPCs have no equivalent state; standalone and compendium skill items have no
chargen context; and `migrateItem` is parent-agnostic.

### A. Store the allocation; finalize per skill

Add to `SkillData`: `allocated` (points put in at creation) and
`ratingsFinalized`.

**While pending,** derive all three tiers from the allocation A — the manual
reduction disappears:

| | general | concentration | specialization |
|---|---|---|---|
| plain | A | — | — |
| concentration | A − 1 | A + 1 | — |
| specialization | A − 2 | A | A + 2 |

**Once finalized,** the three are independent stored ratings and **nothing is
derived between them** ever again. (Transient bonuses, skillsoft replacement and
display ratings remain derived — the rule is specifically that the three
purchased ratings stop relating to each other.)

**Initialization**, which a single schema default cannot cover:

| created on | `ratingsFinalized` | `allocated` |
|---|---|---|
| character in chargen | false | required |
| finished character | true | — |
| NPC / vehicle / world / compendium item | true | absent |
| import | preserve supplied fields; otherwise explicit policy, not defaults |

**Field shape.** `allocated` is optional/nullable with **no numeric default** —
`0` must never be readable as "missing". Legal allocation is a positive integer
whose derived general is non-negative; a specialization at A = 1 yields general
−1 and is **rejected, not clamped**, because clamping would silently distort the
allocation.

**Which field is editable** follows the lifecycle: a pending skill exposes
`allocated` as the input with the three tiers read-only; a finalized skill does
the reverse.

**Import policy** (the table's "explicit policy"): preserve lifecycle fields when
supplied; otherwise treat imported skills as **finalized authored data**. An
importer that wants the chargen workflow must pass `ratingsFinalized: false` and
`allocated` explicitly. Inferring "pending" from a missing actor flag is unsafe —
imported actors carry unreliable chargen state.

**`allocated` is RETAINED after finalization** — decided rather than left open.
It is provenance that explains how the three tiers were reached, and it keeps the
chargen budget readable in the actor-update-failure state below, where clearing
it would make the budget vanish at exactly the wrong moment. The invariants that
make retention safe:

- it is read-only once finalized, and never re-interpreted as editable;
- while the actor is still in chargen, budget accounting may use retained
  allocations for skills finalized in that session;
- reopening chargen does not make finalized skills editable as allocations;
- skills created **after** chargen carry `allocated: null` and are excluded from
  historical chargen spend.

**Finalization is irreversible.** Reopening chargen for gear pricing must leave
finalized skills finalized.

### B. Finalization is one actor-level transaction

Despite the state being per-skill, the trigger is the existing "finish creation"
action — one transaction, no partially-finalized characters, no accidental early
commitment. A per-skill button invites both; first-Karma-spend is too late and
cannot tell advancement from correction.

Contract: validate every pending skill (allocation present and legal, chargen
specialization has a concentration name, computed ratings non-negative) →
compute source updates **from `allocated` and the names**, never by copying
prepared fields → persist and set each flag → only then clear
`chargen.inProgress`. Foundry offers no atomic multi-document transaction, so both failure modes need
stating:

- **Item updates fail** → chargen stays open. Do not *assert* that nothing was
  finalized: check the bulk-update result, because a hook or Foundry itself may
  accept only a subset. A partial result is reported and recovered from, the same
  way as the case below.
- **Skills finalize but clearing `chargen.inProgress` fails** → this is a valid,
  recoverable state, not a contradiction. Finalization is irreversible, so do not
  roll back: report the failure, leave the finalized skills alone, and let the
  action be re-run to clear the flag. **The finish action must therefore be
  idempotent** — tolerating finding every skill already finalized.

### C. Chargen spend

Sum `allocated`. Fall back to `general + (spec ? 2 : conc ? 1 : 0)` **only** for
pending/legacy skills with no `allocated` — a finalized, Karma-advanced skill
cannot have its historical chargen spend reconstructed from current ratings.

### D. Migration preserves every current number

The migration must classify **every** owned legacy skill, not only those with a
named sub-rating — a plain skill still needs a lifecycle flag, or its value falls
to a schema default that the initialization table says cannot cover every
context.

| legacy skill on | outcome |
|---|---|
| NPC / vehicle | finalized |
| finished character | finalized |
| mid-chargen character | **left pending** — see below |

Skills **with named sub-ratings** additionally get their legacy effective ratings
stamped, computed **from source `rating` and the names** — never by copying
prepared state. Plain skills need no rating conversion, only the flag. Nobody's
numbers change.

**Mid-chargen characters** (`chargen.inProgress === true`) are left pending, so
their tiers keep deriving from `allocated` until they finish creation — that is
the new model's derivation, not the old one from the general rating:

- leave every one of their skills pending (`ratingsFinalized: false`);
- infer `allocated` from source — plain `rating`, concentration `rating + 1`,
  specialization `rating + 2`, which inverts the p.70 reduction the player
  applied by hand;
- do **not** stamp independent sub-ratings for them; that happens at finalization;
- **report every actor left pending to the GM**, so a stale or imported
  `chargen.inProgress` shows up in a list instead of silently keeping a finished
  character in the old behaviour.

**System compendium templates are not touched by runtime migration.** Their pack
sources must be given the finalized-template fields directly in `packs-src`, or
covered by the documented import rule above.

### E. Suppress sub-ratings while chipped — with a marker, not zeros

Set a transient `_subRatingsSuppressed` on the prepared item. **Do not zero
`concentration.rating` / `specialization.rating`,** even in prepared data: a
broad form submission could persist the zeros, and the natural ratings would have
to be reconstructed on un-slotting — impossible for a Karma-bought
specialization. With a marker, removing the chip simply restores everything on
the next preparation.

Every consumer must honour it: skills-tab rendering and clicks, roll-dialog base
dice, `rollSkillTest`, weapon choice construction, weapon attack resolution, and
weapon-name fallback matching. Suppressing only the visible tags is insufficient
— fallback matching would still find and roll the natural specialization.

### F. One helper for "which rating applies"

Route every path through a single function; absorb or delete
`getEffectiveRating`. This is what makes E enforceable.

### G. Fix findings 6 and 7 directly

Give the NPC sheet the same variant tags as the character sheet. Add `+ bonus` to
the weapon-name fallback branch so it matches the variant path.

### H. Make the mechanism visible

While pending: `Firearms 3 · SMG 5 · Uzi III 7 (5 allocated)`. Once finalized:
the three ratings plainly, with no allocation, because they no longer relate —
and as **editable numeric inputs**, or the independent model stays unreachable
through normal UI.

## Tests

Pure arithmetic in `module/rules/` with book values cited. Quench for: pending
name transitions changing all tiers; finalization failure leaving chargen open;
GM reopening chargen not un-finalizing; imported flag-less actors; NPC skills;
independent advancement after finalization; chip slot/un-slot restoring a
Karma-bought specialization; and the Skill Web still using the general only.

## Deliberately NOT proposed

- **A Karma advancement UI.** Costs are known (p.191); separate feature.
- **A permanent "specialization without concentration" warning** — correct only
  during chargen.
- **Enforcing "one Concentration and one Specialization per skill"** beyond the
  schema's single sub-objects; identity across renames belongs with advancement.

## The one policy call, already made

**Mid-chargen characters at migration time**, written into section D: trust
`chargen.inProgress` — they stay pending and keep deriving, finished characters
finalize — with a GM report of every actor left pending, so a stale or imported
flag surfaces in a list instead of silently keeping a finished character in the
old behaviour. It is the least disruptive automated option.

Say so if you would rather finalize everyone, or be prompted per character. It
is a judgement call about live tables, not a rules question, which is why it is
the one thing here I have not simply decided.
