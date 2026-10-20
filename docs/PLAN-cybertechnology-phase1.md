# Plan: Cybertechnology Phase 1 — the `sr2e-cybertechnology` content module
_Final — after 6 Codex rounds; the last point (round 6) accepted verbatim, see REVIEW-LOG._ Follows docs/PLAN-cybertechnology.md (approved roadmap)._

## Goal
A content module that ships, as Cybertechnology's (FASA7119) own versions:
- every item in the Cybertechnology Table (p.93–99);
- the items described only in "Comfortably Numb" (p.17–41);
- the priced consumables, services, ammunition and skillsofts;
- the Chrome Kings NPCs (p.85–92).

There's no system code, and nothing in other books' packs changes (user decision,
2026-10-20). It requires sr2e ≥ 0.109.0.

## Sources, inventory and capture
- **The PDF** is a scan (the PDF page is the book page + 1). It's read from renders
  (the Read tool's `pages`, or `pdftoppm -r 200` crops for dense cells).
- **Value precedence (R1):** the MASTER TABLE (p.93–99) supplies every value it
  prints, per the roadmap.
  - A description-page table that disagrees is recorded as a discrepancy (both
    readings, with page and crop) in `docs/COVERAGE.md`.
  - A discrepancy changes a shipped value only when the user approves it. Columns the
    master table lacks (range, concealability, damage, levels) come from the
    description pages.
- **Independent inventory (R1).** `data/inventory.tsv` is captured in a SEPARATE pass,
  before any values: one line per source entry, with its page and crop reference. It
  covers:
  - every master-table row and level;
  - every priced item on the description pages;
  - every consumable, service, ammunition type, skillsoft and Matrix item;
  - every procedure (optical datajack emitter use, BrightLight flash, magnetic system,
    simrig use, repair rates);
  - every Chrome King.

  It's never generated from the value file.
- **Values:** `data/ct-items.tsv`, keyed by an immutable capture key (e.g.
  `ct:eye-gun`). Each row has its source readings, page and crop, verification
  status, and a `mechanics` column naming the system fields it drives.
- **Verification:** a second reading of every value from a fresh crop, recorded per
  cell. The validator refuses a row with an unverified or `UNREADABLE` cell unless
  the user approved an exclusion.
- **Completeness gate (R2):**
  - every TABLE ROW and priced item must ship as an item; nothing else satisfies it;
  - a cited GM reference entry is allowed only for procedures and services, and only
    with the user's approval;
  - an approved exclusion is the only other way out.

  The release is blocked otherwise.

## Ids and art (R1)
- `data/ids.json` is a checked-in registry: capture key → document id. It covers
  embedded documents too (`ct:chrome-kings/cyber-runner/items/hand-blade`).
- A new key gets a random 16-character id once. Renames and corrections never change
  an id, and two same-name entries have different keys.
- **Generators preserve art by id:**
  - `img`, and for actors also `prototypeToken.texture.src` and `lockRotation`,
    are read from the existing file with the same id;
  - a test regenerates the packs after art is set and asserts no art path changed.

## Packs (types read from module.json by the validator)
| Pack | Type | Contents |
|---|---|---|
| `ct-headware` | Item | communications, cybereyes and accessories, cyberears and accessories, cranial bombs, datajacks, memory, eye/oral weapon ware |
| `ct-matrixware` | Item | Matrix and rigging headware from the table (including the cyberarm cyberdeck's ware side) |
| `ct-bodyware` | Item | dermal plating/sheath, reflexes and enhancers, move-by-wire, simrigs and internal simlink, fingertip items, internal tank, auto-medication, IMS, body plating, cyberskull/torso |
| `ct-cyberlimbs` | Item | full and partial limbs, covering, enhancements, magnetic system, gyromount and DNI, built-in options, cyberguns' ware |
| `ct-weapons` | Item | the weapon halves of implant weapons |
| `ct-gear` | Item | consumables, services (repair rates as priced reference items), ammunition, skillsofts, the optical datajack emitter |
| `ct-chrome-kings` | Actor | the NPCs |

## Modelling (R1: item-by-item mapping)
- **Existing schema only.** Each TSV row's `mechanics` column maps to the existing
  CyberwareData/WeaponData/GearData fields: `isVcr`, `noReactionBonus`,
  `unarmedPowerBonus`, `cranialDeck` + `deck`, `isTacticalComputer`, `isWeapon`
  (melee), `armorBallistic/Impact`, `attributeMods`, `combatTnMod`, `capacity` +
  `modules`, `limbOption` + `linkedLimbId`.
  - A Cybertechnology version of an item the system already automates uses the SAME
    fields its system/SSC/Shadowtech counterpart uses, so automation applies once and
    never twice.
  - The validator diffs each such pair's mechanic fields and flags mismatches.
- **Levels with bonuses become fixed variants (R1):** `ratingStats` carries only
  rating, Essence, cost, availability and Street Index. So an item whose bonus changes
  by level (dermal sheath 1–3: Body +N+1, impact ⌈N/2⌉, p.28) ships one item per
  level, each with its own bonuses. `ratingStats` is used only where the level
  changes price/Essence and nothing else (eye dataport DFR levels, p.46).
- **Limb enhancements (R2–R3): fixed-point variants** (e.g. "Strength Enhancement +4"),
  each with `system.rating = N` and `flags.sr2e.rule = "limb-enhancement:strength"`
  (or `:quickness` / `:body`), so later phases read the points and kind without the
  name.
  Each is a `limbOption` with no `ratingStats`, no `costPerRating` and no
  `costMultiplierOfBase`, so the authored cost IS the charged and displayed price.
  `limbOptionCost` returns the authored cost when neither formula field is set.
  - **Strength** (p.31, p.50): cost +N = N × 150,000 + max(0, N−3) × 25,000; Essence =
    max(0, N−3) × .4.
  - **Quickness and Body:** their printed rates; Body comes in pairs only (p.51).
  - A smoke test checks the displayed price equals the charged price for every
    variant.
  - **Limits are MANUAL until Phases 2–3** (a purchase can't see the linked limb): 3
    points per limb before the extra cost; the average ≤ 2×Body or Body+4; Body ≤ +3
    per pair. Each variant's notes state them, and the +4 and above variants say
    "requires the per-limb limits check (GM)".
- **Percent-priced options (R1):** `costMultiplierOfBase` multiplies the option's OWN
  cost, not its limb's. So "+10%" semi-natural covering ships as fixed variants per
  limb type (arm/leg 10,000¥, hand/foot 4,500¥, forearm/lower leg 7,000¥, from the
  p.30 prices), each noted.
- **Installed on purchase (R1):** ware ships with `installed: true`, so a drop in play
  runs the cybersurgery the system now offers.
  - **A spare (R2):** unticking installed afterwards would keep the surgery fee and
    wound. So a spare is bought from a world-item copy with installed unticked BEFORE
    the drop (the system then offers no surgery). QA covers it, and the README says
    so.
- **Container accessories (R2), following the system's convention (read
  2026-10-20):** the system ships a Cybereyes container (`capacity` .5) with
  accessories as MODULE ROWS, AND standalone accessory items (Low-Light Vision,
  Thermographic Vision, Eye Camera) for buyers not using a container.
  - This module does the same:
    - the Cybertechnology cybereyes/cyberears ship as containers with NO prefilled
      rows;
    - each accessory ships as a standalone item whose notes give its module-row
      values.
  - **The allowance path (R3), documented in the README and each accessory's notes:**
    1. Before buying, configure the container's rows. The rows go on a world-item copy
       of the container, with each accessory's printed Essence and cost.
    2. Then drop it. The container's one purchase covers the eyes AND their
       accessories, so its grade and the cybersurgery apply to the whole Essence
       (base + overflow).
    3. Don't also install the standalone item.
  - **Accessory price (R3):** the system's purchase price (`itemBaseCost`) doesn't
    include `moduleCost`. The README gives the full charge for the rows: Σ row cost ×
    the container's grade multiplier × Street Index (or list in chargen), paid by hand
    at the same purchase.
  - **Adding an accessory LATER is UNSUPPORTED in Phase 1 (R4–R6).** The container
    stores one surgery % and applies it to all overflow, so a later operation's own
    outcome can't be represented.
    - **The row keeps its printed Essence**, so the allowance is used up correctly.
    - **The container's original surgery % also scales the new row's overflow.** The
      displayed Essence can therefore be off by the difference between the two
      operations' outcomes.
    - The README documents a GM ledger instead: record the operation, the correct
      Essence loss for that row, and the resulting correct remaining Essence, in the
      container's notes. No adjustment items (they would double count).
    - Phase 3 (eye allowance) adds per-row surgery and reconciles the ledger.
  - **Smoke tests (R3):**
    - Essence = `surgicalEssence(gradeEssenceCost(base + overflow, grade), pct)` for
      standard and delta grades, with surgery % 0 and +15;
    - rows below, at and above the .5 allowance, including an inactive row (which
      counts, per Phase 0);
    - a graded purchase with a non-unit Street Index, checking the documented hand
      charge.
- **Implant weapons (R1).** Each is TWO items, cross-referenced by capture key.
  - **The ware** (Essence, price) holds the whole price.
  - **The weapon companion** costs 0¥ (no double charge). Each one maps to its OWN
    source (R2):
    - eye dart and eye gun: "a hold-out pistol with one-half range" (p.22), derived
      from the system's hold-out pistol, pinned by uuid and system version;
    - oral dart and oral gun: hold-out pistol ranges, unhalved (p.25);
    - oral spur: "as a cyberspur" (p.25), copying the system's spur, pinned;
    - oral whip: range 1 m, 6M (p.25), authored;
    - tool laser: 4L, base TN 4, +1 per meter past 1, Power −1 to 2 m and −2 to 4 m
      (p.23), authored, with the TN/Power rules as notes;
    - cyberguns and the cyberarm taser: their own description pages, authored, with
      the Essence by mount (p.52) in the ware.
  - **Manual handling, stated in the notes:** the +1 recoil (the system has no
    positive recoil field; `recoilComp` can't go negative) and "Special Skill or
    Quickness" (the weapon's `skill` is set to the system key whose untrained default
    is Quickness, if one exists; otherwise firearms, with the note).
  - **Ammunition:** `ammo` items with the core quantity and bundle-price fields, priced
    from the core round × the printed multiplier (eye dart ×4, eye gun ×5, oral dart
    ×2, oral gun ×3), so reloading works.
- **Flat bonuses** the book states outright are authored. A bonus a later phase will
  derive carries `flags.sr2e.provisional = {rule, fields}`. Conditional effects are
  notes.
- **Flags on every document:** `flags.sr2e.source = {book: "Cybertechnology",
  code: "FASA7119", page}`, plus `flags.sr2e.rule` keys for the items later phases
  need: limb type, IMS, auto-medication, move-by-wire level, dermal sheath, reaction
  enhancer, cybereye pair.
- **Names exactly as printed.**

## Chrome Kings (R1)
- **`npc` actors.** NPCs don't aggregate embedded ware, and preparation rebuilds
  Reaction and Initiative. So the printed values map to the NPC's AUTHORED fields:
  - attributes → `base` (and `mod` for the printed augmented difference, e.g.
    Body 5 (6));
  - Reaction → the base from the attributes, with `reaction.mod` = printed augmented −
    base;
  - Initiative dice → `initiative.dice`;
  - Essence and Body Index → their authored fields.

  A smoke test asserts each displayed value equals the print.
- **Armor (R2):** NPC preparation ADDS equipped armor to the authored armor.
  - Printed armor that comes from worn gear is NOT also authored: the gear is embedded
    and equipped, and the authored field holds only intrinsic armor (dermal sheath and
    plating, from the ware's fields).
  - The smoke test asserts each NPC's final Ballistic/Impact equals the print.
- **Embedded ware is for display and reference.** Copies of this module's items, or
  of the system/SSC/Shadowtech/Fields of Fire items, with:
  - `_stats.compendiumSource` kept;
  - embedded references (`linkedLimbId`, smartlink pairs) remapped to the new
    embedded ids;
  - every image copied into this module's assets, or swapped for this module's art.

  Tested with every other content module disabled.
- Negative printed Essence ships as 0 with the printed value in notes (roadmap).
- Portraits: square 1024 webp tokens, lockRotation.

## Repo and tooling
- **Repo:** `futurekill/sr2e-cybertechnology`, shaped like `sr2e-shadowtech`:
  `module.json` (sr2e ≥ 0.109.0), packs-src, build/extract/validate/art tools,
  generators, eslint, `lint.yml`, `release.yml` (CHANGELOG-section notes, packaging
  excludes), CHANGELOG, README, CLAUDE.md, `docs/QA-PLAN.md`, `docs/COVERAGE.md`.
- **Validator (R1–R2):**
  - pack types come from module.json (never hard-coded);
  - **recursive schema validation:** every document's `system` is validated by the
    system's own TypeDataModel. The validator imports the system's data models in Node
    with a minimal Foundry `fields` shim, or failing that runs the check in Foundry
    through the smoke script. That covers types, choices and bounds;
  - **authored vs derived (R3):**
    - derived-only properties (`capacityUsed`, `capacityOver`, `moduleCost`,
      `actualEssenceCost`, `actualBodyCost`) are ALWAYS rejected if stored;
    - schema-backed inputs that preparation overwrites from a rating row
      (`essenceCost`, `cost`, `availability`, `streetIndex`) are allowed only as the
      item's authored values, which must equal its rating-1 row when rows exist.
  - ratingStats sorted by rating, unique ratings, and every row complete;
  - references, assets and embedded ids resolve;
  - every inventory line resolved; ids match the registry;
  - pair cross-references hold, and mechanic fields match their counterparts;
  - a build → extract round trip is byte-stable.

## Tests and QA (R1)
- **CI:** `npm run validate` and `npm run lint`.
- **`tools/smoke.mjs`**, run in Foundry from the console and reported to the console:
  - every Chrome King's printed values;
  - every levelled item at every level;
  - a purchase at each grade, with cybersurgery at 0 and 6 successes;
  - a cancelled purchase and a free (alt) drop;
  - cybereyes plus accessories accounting;
  - an implant weapon pair (one charge, the weapon fires);
  - ammo reload.

  QA-PLAN records how to run it, plus a manual pass with other modules disabled.

## Order of work
1. Repo scaffold, id registry, validator skeleton.
2. Inventory pass (names, pages, crops) → `inventory.tsv`.
3. Value pass from the master table, then the description pages, then the
   verification pass → `ct-items.tsv`. Record the system's accessory convention and
   the pinned hold-out pistol.
4. Generators, the item packs, gear and ammo; COVERAGE.
5. Implant weapon pairs.
6. Chrome Kings.
7. Art; smoke run; release 0.1.0.

## Risks
- Master vs description disagreements wait on the user's rulings (listed in
  COVERAGE).
- Values cited from other books (laser designator → Fields of Fire; narcoject → SSC)
  are read from those books' renders and cited.
