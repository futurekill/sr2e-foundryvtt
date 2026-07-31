# PLAN — Language skills as specializations of a family (SR2E p.74)

Status: **implemented in 0.73.0.** Reviewed adversarially by Codex, arithmetic
re-decided as a result, signed off by the user 2026-07-31.

## The rule, verbatim from a 300 dpi render of book p.74

> Language skills are an exception to the basic skills rule because each
> specific language is a Specialization of a family of languages. Thus, a
> character will have some facility with languages related to his specific
> language, but will not be fluent in additional languages within that family
> unless he or she also acquires Specializations in those languages. Different
> language families are not considered to be related.
>
> When language Specializations are taken as part of character generation, the
> Specialization Ratings automatically increase by +2. The language family, as
> the equivalent of the general skill, would have a skill rating of 4 less than
> the Language Rating itself. Any modified rating less than 1 is treated as a 1.

Read from the rendered image, not the text layer, per the repo rules policy.

### The arithmetic — SETTLED after review (see §1 of the review below)

**Decision, user sign-off 2026-07-31:** "the Language Rating" means the
language's own rating *after* the chargen +2, so the family sits 4 below it —
i.e. 2 below the purchased number. This keeps the language↔family spread at 4,
matching the generic specialization rule (`skillSubRatings`, p.55/p.70), and
means p.74 introduces no arithmetic the rest of the skill system doesn't
already use.



Let `R` be the rating the player writes down (what they bought).

| Quantity | Value |
|---|---|
| The specific language (the Specialization) | `L = R + 2` if taken at chargen, else `L = R` |
| The language family (the general skill) | `max(1, L - 4)` |

Spanish bought at 4 during chargen: **Spanish 6, Romance 2**. Bought at 4
afterwards: **Spanish 4, Romance 1** (`0 → 1`).

The rejected reading took "the Language Rating" to mean `R`, giving a family of
`R − 4` and a language↔family spread of 6 — which contradicts the generic
specialization rule two pages earlier, where the spread is 4.

## Decisions taken (user, this session)

1. **The +2 is flag-gated, not automatic.** p.74 grants it for chargen
   purchases. A per-skill boolean, default **true**, so hand-entered skills get
   it without bookkeeping and the flag exists to turn it OFF for karma-raised
   languages and chipped ones.
2. **Families are rollable**, not display-only — a clickable family rating
   beside the language, reusing the existing concentration/specialization roll
   variant machinery.
3. **No migration of existing ratings.** Whatever is on a PC's sheet today is
   treated as the purchased Language Rating, so languages effectively go up by
   2 at the table. Explicitly the user's call.

## Design

### Schema — `SkillData` (`module/data/item-data.mjs`)

```js
// Language skills only (SR2E p.74). A specific language is a Specialization of
// a family; the family is the general skill at Rating - 4.
languageFamily: new fields.StringField({ initial: "" }),
chargenLanguage: new fields.BooleanField({ initial: true }),
```

`chargenLanguage` defaults **true** so the 18 shipped language skills and every
already-entered PC language pick the rule up with no migration — decision 3.

### Derivation — `SkillData#prepareDerivedData`

*Superseded by the review — as shipped, the math lives in
`languageSkillRatings` and is applied by `SkillData#applyLanguageRatings`, which
`prepareDerivedData` calls and `_applySkillsofts` calls again (review §2):*

```js
const language = r + (chargen ? 2 : 0);
return { language, family: Math.max(1, language - 4) };
```

**`this.rating` is never mutated.** Bumping it in derivation would render the
boosted number into the item sheet's rating input and re-save it, ratcheting +2
on every save. New derived fields only. (Review §4: this is an *item*-sheet
hazard; the actor sheet's input is `data-field` and is not submitted.)

### Rolling — `SR2EActor#rollSkill` (`module/documents/actor.mjs`)

Base pool currently reads `skill.system.rating`. For a language skill it reads
`languageRating`. Add `"family"` to the accepted `options.variant` values,
resolving to `familyRating` and labelling with the family name.

### Chips must not get the chargen bonus

`CharacterData#_applySkillsofts` overwrites an existing skill's rating when a
soft is slotted, and pushes synthetic skill entries for ones the character does
not have. A LinguaSoft is not a chargen purchase, so the +2 must not apply. **Superseded
by review §3:** the draft wrote `chargenLanguage: false` on the prepared item,
which the item sheet would have persisted and outlived the chip. As shipped the
suppression rides on the transient `_chipped`, and the schema field is never
written. The synthetic-entry path still supplies the derived numbers by hand,
since it builds a bare `system` object rather than running through the model.

### Content — family names for the 18 shipped languages

From the p.74 family table:

| Language | Family | | Language | Family |
|---|---|---|---|---|
| Arabic | Semitic | | Mandarin | Sino-Tibetan |
| Aztlaner Spanish | Romance | | Portuguese | Romance |
| Cantonese | Sino-Tibetan | | Russian | Slavic |
| English | Germanic | | Salish | Salish |
| French | Romance | | Spanish | Romance |
| German | Germanic | | Japanese | Japanese |
| Italian | Romance | | Korean | Korean |
| Lakota | Siouan | | | |

Three ship with **no family**, deliberately:

- **Cityspeak** — listed under "Common Tongues and Hybrids" but Special
  Languages says City Speak "is not part of any formal language group".
- **Sperethiel** — p.74 Elvish points at Special Languages: "no direct
  connections to existing language groups".
- **Or'zet** — not in the book at all; p.74 states there are no formal ork
  languages.

**Lakota** is a judgement call: the Siouan list prints Dakota, not Lakota
(they are dialects of the same language). Flagged rather than hidden.

### UI

- `templates/item/item-body.hbs` — family name input + chargen checkbox, both
  shown only for `category === "language"`.
- `templates/actor/parts/actor-skills.hbs` — a family chip beside the language,
  `data-action="rollSkill" data-variant="family"`, matching the existing
  concentration/specialization chips. **Corrected by review §6:** the four
  copies in that file are one per skill CATEGORY, so the chip belongs only in
  the language block — and the NPC sheet is a separate template
  (`templates/actor/npc-sheet.hbs`) the draft had missed entirely.

### Tests

`test/language-skills.test.mjs`, pure math in `module/rules/sr2e-rules.mjs`:
chargen +2, non-chargen no bonus, the family 4 below the language, the min-1
floor, the shipped family assignments — plus Quench cases for the parts Vitest
cannot reach (review §2/§3): stale derived values after chipping, and the flag
never reaching `_source`.

## Deliberately NOT doing

- **No family-skill items.** The family is a derived number on the language,
  not a second skill document. Nothing in the book requires a family to be
  bought, raised, or defaulted from independently.
- **No full p.74 family table in CONFIG.** Free text on the item. A lookup of
  ~400 languages buys nothing until something validates against it.
- **Skill Web defaulting keeps reading raw `rating`.** Defaulting from a
  language is vanishingly rare and the purchased rating is the defensible
  source. Noted, not fixed.
- **No karma-cost changes.** Advancement costs are untouched.

---

# Adversarial review (Codex, read-only over the repo)

Findings I accept, with what changes as a result.

## 1. The family arithmetic is not settled — BLOCKING

My "family = R − 4" was presented as fact. It is one of two readings, and the
review's counter-reading is the stronger one.

The generic rule already in this codebase (`skillSubRatings`, p.55/p.70) is
**specialization = general + 4** — allocate 5 with a specialization and you get
general 3 / specialization 7. p.74 then says a language *is* a specialization
and its rating rises **+2** at chargen, which is exactly the generic
allocated → specialization step (allocate 5, specialization 7 = 5 + 2).

If "the Language Rating" in "4 less than the Language Rating itself" means the
**language's own (boosted) rating**, then family = (R + 2) − 4 = **R − 2**, and
the spread between language and family is 4 — identical to the generic rule.
p.74 is then not new math at all, just a statement that languages are
automatically specialized.

Under my reading the spread is 6, which contradicts the generic rule the book
gives two pages earlier. That is a real argument and I did not have one against
it. **Needs the user's call — it changes numbers at the table.**

## 2. Preparation order makes the derived fields go stale — ACCEPTED

`SkillData#prepareDerivedData` runs on the embedded item *before*
`CharacterData#_applySkillsofts` overwrites `existing.system.rating` with a
slotted chip's rating (`actor-data.mjs:534`). Any `languageRating` /
`familyRating` computed in `prepareDerivedData` is therefore computed from the
pre-chip number and never recomputed.

The review is right that the Spanish 3 + chip 5 example *looks* fine only by
coincidence (3 + 2 = 5, and both floor to family 1). Native Spanish 6 + chip 5
would keep languageRating 8 while displaying rating 5.

**Change:** the math goes in one exported helper in `module/rules/`, called from
`prepareDerivedData` **and again** in `_applySkillsofts` after the overwrite.

## 3. Never write `chargenLanguage = false` during preparation — ACCEPTED

I planned to clear the flag on a chipped skill. But the item sheet binds real
schema fields with `submitOnChange` (`item-sheet.mjs:30`), so opening a chipped
skill's sheet and touching anything would **persist** the prepared `false` —
permanently stripping the bonus once the chip comes out. The repo already has a
scar from exactly this (`item-sheet.mjs:51`, the authored-value projection, from
bone lacing compounding (Str)M → (Str+3)M → (Str+3+3)M).

**Change:** use a transient `_`-prefixed flag, the convention already used by
`_chipped` / `_nativeRating`, never the schema field.

## 4. My ratchet reasoning was wrong about the actor sheet — NOTED

The actor sheet's rating input uses `data-field`, not `name`, and is explicitly
not submitted with the form (`actor-sheet.mjs:244`) — so no ratchet there. The
**item** sheet is the real exposure. Conclusion ("don't mutate `rating`")
stands; my stated reason did not.

## 5. Missed consumers — ACCEPTED

- `sheet-actions.mjs:279-285` — the roll prompt seeds base dice and the Karma
  cap from `system[variant].rating` / `system.rating`. A flat `familyRating`
  does not fit that shape, and a plain language roll would be capped at the
  unboosted number. Must be handled.
- `templates/actor/npc-sheet.hbs:111` is a **separate** template from the four
  copies in `actor-skills.hbs`. NPC language ratings would display a number the
  dice disagree with.
- `sheet-actions.mjs:265` — chip-granted skills roll through `rollChippedSkill`,
  which takes no variant at all. **Not fixing:** a LinguaSoft grants the
  specialization, not family facility, so a chipped language having no family
  roll is the correct behaviour, not a gap.

## 6. Rejected

- *"Karma advancement never clears `chargenLanguage`, so a raised language keeps
  the +2 forever."* That is correct behaviour. The bonus is for having acquired
  the language at character generation; later improvement does not un-acquire
  it.
- *"Add `family` to `getEffectiveRating`."* That method has **no callers** —
  it is dead code (`item-data.mjs:94`). Extending dead code is not integration.
  Left alone.



---

# Shipped (0.73.0) — what was left out on purpose

- **Skill Web defaulting still reads the raw `rating` for a language**
  (`actor.mjs:600`). Defaulting *from* a language is vanishingly rare and the
  purchased number is the defensible source. Known, not fixed.
- **NPC rows show the right number but have no family chip.** The NPC template
  has no variant plumbing at all; a GM needing a family roll can use a PC sheet
  or roll it by hand.
- **A chip-granted language has no family roll.** Not a gap — p.74 gives family
  facility to someone who *learned* the language, and `rollChippedSkill` takes no
  variant, so implementing it would mean plumbing a rule the book doesn't grant.
- **No family lookup table in CONFIG.** The family is free text on the item.
  Transcribing p.74's ~400 languages buys nothing until something validates
  against it.
