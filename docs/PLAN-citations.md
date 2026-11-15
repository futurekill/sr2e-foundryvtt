# Plan: structured citations (chargen milestone M1b)
_Draft 1 (2026-11-15). Implements milestone **M1b Citations** of the standalone character generator
(../sr2e-chargen/docs/PLAN.md, approved at Codex round 12: "Citations (U19)", decision D8). Independent of M1
(docs/PLAN-portable.md): a citation is plain item data, carried as is by the portable bundle (§1.4 kind `data`)._

## Goal
Every catalog item says where it comes from, as DATA: `system.citation = { book, page }`, shown as a badge on Foundry
item sheets (`SSC p.59`, full title on hover) and in the character generator's catalog. Today the page lives as free
text in `notes`, in several forms, or nowhere:

| Repo | items | a parsable `(… p.N)` | any `p.N` anywhere |
|---|---|---|---|
| system | 470 | 98 | 375 |
| Cybertechnology | 243 | 235 (120 with several pages) | — |
| Rigger 2 | 157 | 110 | 125 |
| Street Samurai Catalog | 107 | 3 | 13 |
| Shadowrun Companion | 106 | 2 | 22 |
| Grimoire | 85 | 43 | — |
| Fields of Fire | 81 | 18 | — |
| Corporate Security Handbook | 61 | 20 | — |
| Shadowtech | 60 | 59 | — |
| Cyberpirates | 46 | 11 | — |
| Neo-Anarchists' Guide | 39 | 0 | 39 |

(scratchpad survey, 2026-11-15; "—" = not counted separately.) So the backfill parses what exists and the rest is
read from page renders — the bulk of the work.

## Approach

### 1. The field (system)
- `SR2EDataModel.citationField()` (module/data/base-data.mjs): `SchemaField({ book: StringField({ initial: "", blank:
  true }), page: StringField({ initial: "", blank: true }) })`, added to EVERY item type's `defineSchema` (17 types)
  and to the `vehicle` actor (the Workshop's catalog and the Rigger 2 vehicle list are vehicles). `blank: true` is
  mandatory (the StringField blank trap: without it every existing document goes invalid). No migration: the default
  is blank, and nothing reads it for rules.
- Vitest: every Item type in system.json's `documentTypes` (and `vehicle`) has `citation` in its schema.
- `page` is a string: `"59"`, `"59–60"` (en dash normalised), never a prefix ("p.").

### 2. The book table (system, pure)
`module/rules/books.mjs`: `BOOKS = { <id>: { abbr, title, module, pdf, offsets } }` for the core book and every
book a content module draws on (sr2, ssc, sc, grim, r2, rbb, st, ct, ff, csh, cp, naw, vr2, …: ids are short and
stable, used in data). `aliases` maps the free-text forms the notes use (`SR2E`, `SR2`, `SRII`, `Shadowrun Second
Edition`, `SSC`, `Street Samurai Catalog`, `CSH`, `Grimoire II`, …) to ids. `offsets` = the measured PDF↔book page
segments from renders (the offset is NOT constant: colour plates shift it), only for the later "open my PDF at this
page" — never used to cite. `citationLabel(c)` → `"SSC p.59"` and `citationTitle(c)` → the full title; both used by
Foundry and the chargen (D1: the system is the shared package).

### 3. The backfill tool (system `tools/citations/`, run per repo)
`node tools/citations/backfill.mjs <repo> [--write]`:
- Reads the repo's `packs-src` items AND the items embedded in its actors (pregens, NPCs, vehicles' factory items).
- Parses `notes`, `description` (HTML stripped) and qualities' `source`: `(<book>? p.N[–M])`, bare `p.N` / `pp.N–M`,
  `<book> p.N`; a page with no recognised book belongs to the repo's OWN book (the module → book map in the table);
  section words before `p.` ("Design specifications p.110", "Cyberware Rules p.12") don't name a book.
- Picks the item's citation in this order (measured on every repo, 2026-11-15; a plain "first own-book reference" is
  wrong: Cybertechnology notes read "… move-by-wire (p.39) … (Cybertechnology, table p.99, p.38.)", whose first page is
  a cross-reference to ANOTHER entry):
  1. a **source parenthetical** — one whose content is only book names, pages and the word "table" — preferring the
     repo's own book, the LAST such one in the text; inside it the **description page** wins over a `table p.N` page
     (the citation is where the rules are; the price table only when the item has no other entry);
  2. else the first page reference with no other book named just before it and not inside a "see …"/"(p.N)"
     cross-reference — attributed to the repo's own book.
  Coverage of this rule over the current notes: 1,247 items placed (source parentheticals 457, first references
  790), the rest are the gaps the overrides fill. Several candidate pages with no source parenthetical → reported as
  ambiguous, nothing written.
- **Description page, not table page** is the convention throughout (overrides included). A repo with its own
  coverage map (Cybertechnology `docs/COVERAGE.md`, which lists the TABLE page for tabled entries) is cross-checked:
  disagreements are listed in the report for a human look, never auto-resolved.
- An embedded item whose `_stats.compendiumSource` resolves to a cited catalog item takes that citation.
- **Overrides** `tools/data/citations/<repo>.tsv` (`name`, `_id`, `book`, `page`, `checked` = how it was verified)
  win over parsing; they are how gaps get filled.
- Without `--write`: a report (cited / ambiguous / missing, per type) and a gaps TSV to fill. With `--write`: writes
  `system.citation` only where it is blank (never overwrites), then `npm run build-packs` is the repo's own step.

### 4. Filling the gaps (per book, from renders)
For every item the parser can't place, the page is found in the book from **page renders** (`pdftoppm`), never the
text layer (it corrupts glyphs, and several of the books are image-only), and written to the overrides TSV with
`checked: render` and the printed folio read from the page footer (the PDF offset varies). Large books go in
batches by chapter; each batch is its own commit in the content repo. Items not printed in any book (the system's
generic `Service: …` entries, a macro-made item) cite the RULE page they implement; anything that truly has none
gets `book: "none"` with a reason in the TSV — the validator accepts only those listed.

### 5. Enforcement
Each content repo's `npm run validate` (and the system's packs check in `npm test`) fails on a catalog item with a
blank `citation.book` or `citation.page`, an unknown book id, or a page that isn't `N` / `N–M` (`book: "none"`
only when its TSV row says so). Turned on per repo once its backfill is complete, so repos can land one at a time.

### 6. Showing it
- Foundry item sheets: a badge in the header (`citationLabel`, `citationTitle` on hover), editable by the GM in the
  item's details (two small fields), hidden when blank.
- The chargen catalog build (M3) reads `system.citation` through the same helpers.
- Notes keep their text (no stripping: the prose stays readable and the citation is extra data).

### 7. Releases
System first (schema, table, helpers, sheet badge, tool, the system's own backfill + gaps), then each content module
as its backfill and gaps complete (its validate rule on). Content data is harmless on an older system (the unknown
field is dropped), so module `minimum` versions don't move. CHANGELOG + QA plan + wiki (the badge) per release.

## Key decisions & tradeoffs
- **Data, not parsing at runtime**: the notes are inconsistent (several books, cross-references, no page at all);
  a one-off parse plus human-checked overrides is reliable, a runtime regex wouldn't be.
- **Own book's first reference** as the entry: items routinely cite rule pages of other books after their own entry.
- **Overrides TSV in each content repo** (not edits by hand in packs-src JSON): reviewable, re-runnable, and records
  how each gap was verified.
- **Vehicles included**, other actors (critters, spirits, NPCs) later: the chargen catalog needs items and vehicles;
  critters aren't chosen at creation.
- `offsets` stored but unused for citing (the "open my PDF" feature is later and optional).

### Gap research (done 2026-11-15, before review)
Every catalog item with no page anywhere in its text now has a row in its repo's
`tools/data/citations/<repo>.tsv`, read from renders: SSC 95, Shadowrun Companion 84, the system 96 (17 GM-invented
contacts are `none`), Rigger 2 32, Cyberpirates 10, Cybertechnology 8. Still open (named in no book searched): the
system's **Subsonic** ammo, and the **Launch Weapons** and **Pilot** skills. Found on the way: the system's Ex-Explosive
Rounds and Tracers are Fields of Fire p.51 (their notes say SSC); Cybertechnology's docs/COVERAGE.md already maps every
entry to a page and agreed with the renders — a second source the backfill should cross-check. Items whose notes DO
carry a page (Fields of Fire, CSH, Grimoire, Shadowtech, Neo-Anarchists and most of the rest) are left to the parser.

## Risks / open questions
- Gap filling is large (≈ 600+ items without a parsable page) — batched per book; the validate gate per repo keeps
  partial work shippable.
- Items that appear in two books (reprints): cite the book of the module that ships them.
- Pregens/NPC items without a compendium source: parsed like catalog items; gaps there are reported but don't block
  validate (validate covers catalog items).

## Out of scope
Critter/spirit/NPC actor citations; "open my PDF at this page"; citations for rules text in journals; any change to
notes text.
