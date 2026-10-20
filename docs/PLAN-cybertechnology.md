# Plan: Cybertechnology (FASA 7119)
_Final roadmap — APPROVED by Codex in round 4 (after rounds 1–3) and the user's decisions (2026-10-20).
Each phase gets its own detailed plan and Codex loop before code; this document fixes
the scope, order, cross-phase contracts and the optionality of every rule._

## User decisions (2026-10-20)
- **No errata to other books.** The module ships its OWN version of every item in the
  Cybertechnology Table, the ~60 that other books also print included. Players pick
  whichever version is available to them. Nothing in the system, SSC, Shadowtech or
  other packs changes.
- **Cybermancy (Phase 6) is in scope.**

## Source
- `Shadowrun 2e - Cybertechnology {FASA7119}.pdf`: a 105-page SCAN with no text layer.
  The PDF page is the book page + 1. Every value is read from a page render (never OCR).
- **Contents:**
  - item descriptions, "Comfortably Numb" (p.17–41);
  - Cyberware Rules (p.42–58);
  - cybermancy fiction (p.59–77) and Cybermancy Rules (p.78–84);
  - Chrome Kings: about six NPC stat blocks (p.85–92);
  - the master Cybertechnology Table (p.93–99): every cyberware item from this AND
    earlier SR2 books.
- **Already shipped** (0.108.0): delta grade (p.44), cybersurgery and medical fees
  (p.53).

## Content scope
- **Every row of the p.93–99 table**, about 110 items, as Cybertechnology versions with
  the table's values:
  - about 50 that are new to our content;
  - about 60 that other books also print.
- Each item:
  - carries `flags.sr2e.source = {book: "Cybertechnology", page}` and a cite in its
    notes;
  - has the name as printed. Two compendium entries with one name are told apart by
    their pack and source line, never renamed.
- **The new items:**
  - **Headware:** cranial bombs; Cybercomm Link; subdermal speakers; balance
    augmentor; spatial recognizer; smartcam/opticam; image link; protective covers;
    retinal clock; electronic magnification; eye dataport and optical scanning
    datajack; eye lasers; eye light/BrightLight; eye and oral weapons; tooth
    compartments.
  - **Bodyware:** auto-medication; body plating; cyberskull; CyberSquirt; fingertip
    picks and needle; induction datajack; IMS; internal air tank; shock hand; smartcam
    link; dermal sheath (+ coloration, controller); reaction enhancer; reflex trigger;
    move-by-wire; simrigs; internal simlink; weapon mounts.
  - **Cyberlimbs:** partial limbs; covering; foot anchor; magnetic system;
    replacement hand; built-in smartgun link; gyromount; cyberarm deck and taser;
    cyberguns; Body/Quickness/Strength enhancements.
- **Consumables and services the book prices:** flash-paks and bulbs, laser and light
  batteries, spray bonder (500¥/10), sheath sealer (1,200¥/10), healing lotion
  (20¥/30), auto-med refills (15,000¥), and repair rates (plating 2,000¥ × points lost;
  sheath 6,500¥/point), as gear items or cited GM reference entries.

## Optionality matrix
| Rule (page) | Mode |
|---|---|
| Item stats, Essence, price, grade (table) | Mandatory (per item version) |
| Cyberware-in-cyberlimb Essence (p.49) | Mandatory |
| Pairs of limbs +1 Body; cyberhand Power (p.49) | Mandatory |
| Bone lacing vs replacements (p.49–50) | Mandatory |
| Cybereye allowance and 1.2 cap (p.45, "should seriously consider") | Allowance math ON; the cap is a warning |
| Per-limb Strength/Quickness, average vs lead-with (p.50–51) | Mandatory when limb attributes exist; leading with a limb is a roll-dialog choice |
| Holding/dangling (p.51–52) | GM tool (a calculator card) |
| Bioware interactions (p.56–57) | Mandatory |
| Wired-reflex reaction (p.53, "gamemaster's discretion") | GM tool |
| Social penalties, contacts (p.57–58, "optional") | World setting OFF; contacts = a GM test card |
| Move-by-wire complications (p.54–55) | World setting ON; clock events PROMPT, outcomes GM-confirmed |
| Cyberware damage, secondary effects, scarring (p.44–56) | World setting OFF; GM-confirmed |
| Cybermancy (p.78–84, "gamemasters may decide") | World setting OFF; every operation and consequence GM-confirmed |

## Cross-phase contracts
- **Provisional bonuses** (R2): a Phase-1 item carrying a flat bonus that a later phase
  will derive records exactly what it added: `flags.sr2e.provisional = {rule, fields:
  {"attributeMods.reaction": 2, …}}`. That phase's migration subtracts a recorded
  value only where the field still equals it. A field the user changed is left alone
  and reported to the GM ("both your edit and the new rule apply: check it").
  - **Imports after the migration** (R3): the same suppression runs at PREPARATION.
    Once the deriving rule exists, a prepared item ignores each recorded provisional
    contribution whose source field still equals the recorded value.
  - So an old module pack imported any time later can't stack the provisional bonus
    with the automated one. The migration only tidies stored data; correctness
    doesn't depend on it.
- **Rule keys reach every version of an item** (R2). Older packs aren't edited, so a
  resolver classifies items:
  1. a `flags.sr2e.rule` on the item;
  2. else its compendium source id (`_stats.compendiumSource`), looked up in a table of
     known source uuids across the system and modules;
  3. else unclassified.

  The resolver runs at preparation, so a fresh import after a migration is still
  recognized. Unclassified custom items get a "Rule" select on the item sheet (GM)
  and a report line; nothing guesses from names.
- **One effective Essence** (R2): `actor.system.essence.value` stays the clamped
  value every existing consumer reads. Preparation also derives an UNCLAMPED
  `essence.signed` from the same inputs (max − loss), so it can't go stale: install,
  removal, surgery and permanent loss all flow through the one derivation. Manual
  `autoEssence` mode derives `signed` from the typed value. Only a cybermantic actor
  (Phase 6) USES the signed value; everyone else ignores it.
  - **One authority** (R3): Phase 6's `flags.sr2e.cybermancy` holds STATE only (that
    the actor is cybermantic, its operation record, schedules), never an Essence
    number.
  - **Manual mode:** Phase 6 adds a schema field `essence.manualSigned` (nullable, no
    min) for PCs and NPCs. When it's set (manual mode, cybermantic actor), it is the
    typed value `signed` derives from. Otherwise `signed` comes from the usual inputs.
- **Clock policy** (Phases 4–6): world-clock events only PROMPT, with a GM card. Money,
  damage, death and attribute changes apply on the GM's confirmation, keyed so a retry
  can't apply twice (the substance-ledger pattern).
- **Migration requirements** (any schema change): versioned entries in
  `migrations.mjs` over world items, embedded actor items and unlinked tokens.
  - Module content is rebuilt from packs-src.
  - Stable ids; user customization is preserved.
  - Ambiguous legacy data is reported, never guessed.
- **Rules apply to ALL versions of an item:** a mechanic keys on what the item IS
  (fields such as `limbType` or a rule key), never on its name or source book. So the
  SSC, Shadowtech and Cybertechnology versions of one implant behave alike.

## Phases, in order

### Phase 0 — fix: inactive cybereye modules shed Essence (system, small)
- `item-data.mjs:631` skips inactive modules when totalling Essence, so switching an
  installed accessory off refunds it.
- **Policy** (R2): a module ROW means installed (rows only exist on their parent
  implant). `active` governs only its TN bonus. Essence, allowance and cost count
  every row.
- **Legacy inactive rows:** they start costing Essence. The CHANGELOG says so, and a
  one-time GM report lists affected actors. A user who meant "not installed" deletes
  the row.

### Phase 1 — `sr2e-cybertechnology` content module (no esmodules)
- **Shape:** mirrors `sr2e-shadowtech`: packs-src + `tools/gen-*.mjs` from a transcribed
  data file, build-packs, validate, lint, CI, release.yml, QA-PLAN, CHANGELOG, art.
- **Packs:**
  - `ct-headware`, `ct-matrixware`, `ct-bodyware`, `ct-cyberlimbs`;
  - `ct-gear` (consumables, skillsofts);
  - `ct-weapons`;
  - `ct-chrome-kings`.
- **Implant weapons:** manually paired items: a cyberware item (Essence, price) plus a
  weapon item (damage, range, ammo), each noting the other. No automation is claimed.
- **Chrome Kings:** NPC actors with their stats AS PRINTED, authored directly and
  self-contained (they embed copies of their gear, no module dependencies). A Quench
  test pins the printed values. Any printed NEGATIVE Essence can't be stored before
  Phase 6 (the schema min is 0): it ships as 0 with the printed value in the notes and
  a COVERAGE entry deferred to Phase 6, whose release updates those actors (R2).
- **Completeness gate** (R2): `docs/COVERAGE.md` lists:
  - every table row;
  - every priced consumable;
  - the description-only content: implant-weapon ammunition (eye/oral darts and guns,
    cyberguns), flash-pak reloads, and the special procedures (optical datajack
    emitter, BrightLight flash, magnetic system, simrig use).

  Each table row must be SHIPPED as content; deferred automation is noted beside it,
  never instead of it. An unreadable required value BLOCKS the release unless the user
  approves an exclusion. The procedures each name their phase or "cited GM reference".

### Phase 2 — limb model (system; its own plan; before any limb rule)
- Cyberlimbs gain:
  - `limbType` (arm, leg, hand, foot, forearm, lower leg, skull, torso);
  - `side` (left/right/none/unknown);
  - `coverage` (full/partial).
- **Enhancements stay linked option items** (R2): the authority is the existing
  limb-option pattern (each with its own price and Essence). The limb's enhancement
  totals are DERIVED from its linked options, never stored, so they can't be counted
  twice.
- **Unknown side** (R2): rules that need a side (pair matching, Quickness mismatch,
  pairs-for-Body) skip an `unknown` limb and show a sheet warning until the GM sets
  it. Overlapping coverage (a hand under a full arm on the same side) is reported, not
  summed.
- **Containment:** `linkedLimbId` is valid only when the parent is an installed
  cyberlimb on the same actor. On removal or uninstall, children become unattached
  (reported). On copy/import, ids are remapped.
- A migration gives existing limbs `side: unknown`, reported to the GM.

### Phase 3 — limb and interaction rules (system; its own plan; needs Phase 2)
- Cyberware-in-cyberlimb Essence (p.49); pairs +1 Body; hand/foot unarmed Power; bone
  lacing; cyberguns' Essence by mount (p.52).
- Per-limb Strength/Quickness (p.50–51): limits, troll base 8, the average and
  lead-with TN, pair mismatch, Body in pairs, partial-limb pricing, +10% multiple
  enhancements.
- **Bioware interactions** (p.56–57), each with an explicit calculation contract:
  rounding (down for bonuses, per the pump example), the floor (0%), stacking order,
  and whether it changes the bonus, the price/Essence at purchase, or the installed
  state.
- **Cybereye allowance** (p.45): `capacity` stays the free allowance, plus a physical
  cap, single-eye/side data and weapon slots.
  - The migration infers a pair ONLY from explicit classification: the item's rule key
    or a known source uuid (R3; `capacity` is NOT evidence, since the generic module
    editor seeds it on any implant).
  - Anything else keeps today's behavior unchanged and is reported. Weapon rows with
    no side are reported, not assigned.
- **Social penalties** (optional): eligible-Essence (ware loss minus exempt items) and
  a `socialVisibility` field (hidden / obvious / flagrant).

### Phase 4 — move-by-wire and reflex add-ons (its own plan)
- Move-by-wire bonuses (from the description pages) replace the provisional values.
- Complication tests on the clock → TLE-x / CCSS (GM-confirmed), treatment tests, the
  CCSS recovery table.
- The reaction enhancer and reflex trigger with wired reflexes.

### Phase 5 — damage, repair, scarring (optional; its own plan)
- The quick-and-dirty damage check; grade resistance; the four secondary-effect
  tables; repair TNs; plating degradation; sheath repair; scarring. GM-confirmed
  cards.

### Phase 6 — cybermancy (optional, GM-gated; its own plan; IN SCOPE)
- **Negative Essence is a STATE, not a removed clamp:**
  - `essence.value` keeps its min of 0 for every normal actor;
  - a cybermantic actor carries `flags.sr2e.cybermancy` (state only) and reads the
    derived `essence.signed` (see the One effective Essence contract);
  - every consumer is enumerated and updated explicitly: Magic derivation, displays,
    manual `autoEssence`, surgery checks, healing magic TNs.
- **The operation:** a GM-confirmed card at a delta clinic.
  - **IMS** (R2): if the actor has an installed IMS (by rule key), nothing is added.
    Otherwise its .25 Essence enters the INTENDED Essence, so the survival TN, and its
    137,750¥ enters the operation cost. Both are computed once, before the roll, and
    shown on the card.
  - The survival test is by intended Essence.
  - Cancer is rolled once and recorded.
- **Consequences:**
  - auto-med refills every 10 days are PROMPTED;
  - the halved overflow and the Willpower test on overflow;
  - magic TN +2|E|; astral presence; Perception/Reaction modifiers; lost in the
    details;
  - the Willpower changes; social penalties; Karma at half;
  - CDS on the clock.

## Key decisions & tradeoffs
- Content first; automation follows, replacing only flagged provisional values.
- The module ships its own version of every item; other books are never edited, and
  rules key on item fields so every version behaves alike.
- Optional rules are world settings; anything on the clock or lethal is GM-confirmed.

## Risks / open questions
- The description pages (p.17–41) still have to be read for the omitted stats (Phase 1
  plan).
- Two compendium items sharing a name in different packs can confuse a drop search.
  Each one's source line and pack disambiguate it; no renaming.
