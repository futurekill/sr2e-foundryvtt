# PLAN — Language skills as specializations of a family (SR2E p.74)

Status: **draft, awaiting adversarial review + sign-off.** No code written yet.

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

### The arithmetic

Let `R` be the purchased **Language Rating** (what the player writes down).

| Quantity | Value |
|---|---|
| The specific language (the Specialization) | `R + 2` if taken at chargen, else `R` |
| The language family (the general skill) | `max(1, R - 4)` |

Two readings of "4 less" are possible: 4 less than `R`, or 4 less than the
boosted `R + 2`. The sentence says "4 less than the **Language Rating itself**",
and "itself" is there precisely to contrast with the boosted specialization
number — so family is off `R`. A character with Spanish 4 at chargen speaks
Spanish at 6 and muddles through Romance at 1 (`4 - 4 = 0 → 1`).

This is also consistent with the existing generic rule already implemented in
`skillSubRatings` (p.55/p.70): specialization = general + 4, i.e. general =
specialization − 4.

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

```js
if (this.category === "language") {
  this.languageRating = this.rating + (this.chargenLanguage ? 2 : 0);
  this.familyRating   = Math.max(1, this.rating - 4);
}
```

**`this.rating` is never mutated.** The sheet's rating input is bound to
`system.rating`; bumping it in derivation would render the boosted number into
the input and re-save it, ratcheting +2 on every save. New derived fields only.

### Rolling — `SR2EActor#rollSkill` (`module/documents/actor.mjs`)

Base pool currently reads `skill.system.rating`. For a language skill it reads
`languageRating`. Add `"family"` to the accepted `options.variant` values,
resolving to `familyRating` and labelling with the family name.

### Chips must not get the chargen bonus

`CharacterData#_applySkillsofts` overwrites an existing skill's rating when a
soft is slotted, and pushes synthetic skill entries for ones the character does
not have. Both paths must set `chargenLanguage: false` — a LinguaSoft is not a
chargen purchase, and the +2 on top of a chip's rating would be a straight
error. The synthetic-entry path also needs `languageFamily`/`familyRating`
supplied, since it builds a bare `system` object by hand rather than running
through the data model.

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
  concentration/specialization chips. Four copies of that line exist (character,
  NPC, and two others); all four need it or the feature is invisible on some
  sheets.

### Tests

`test/language-skills.test.mjs`, pure math in `module/rules/sr2e-rules.mjs`:
chargen +2, non-chargen no bonus, family = R−4, the min-1 floor at R ≤ 4, and
that a chipped language gets neither.

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
