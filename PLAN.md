# Plan: Shadowtech (FASA7110) — Bioware + Body Index for sr2e
_Locked via grill — by Claude + jcandalino; hardened by Codex round 1_

## Goal
Bring Shadowrun 1e **Shadowtech** into the sr2e FoundryVTT system so it meshes with the
existing cyberware/Essence rules. The one genuinely new subsystem — **Bioware** and the
**Body Index** — lands as core-system code (`sr2e-foundryvtt`). Everything else
(expanded cyberware, industrial chemistry, gene-tech, microbiologicals) ships as
**compendium content** in a new standalone `sr2e-shadowtech` content module that rides
on data models the system already has. Codex round 1 corrected the field names, the
registration surface, the awakened signal, and the natural-Body source — this revision
reflects the real code.

## Approach

### Part A — Core system (`sr2e-foundryvtt`, minor release)
1. **New `bioware` item type** in `module/data/item-data.mjs`. `BiowareData` uses the
   **exact existing field names/types from `CyberwareData`** (no shared-base refactor of
   CyberwareData — lower risk; Codex offered both, I take the non-refactor path):
   - `attributeMods: SchemaField` (the real modifier field — NOT `modifiers`), same shape as
     cyberware so `_collectItemModifiers()` can read it.
   - `streetIndex: StringField`, `availability: StringField`, `cost: NumberField`,
     `rating: NumberField`, `installed: BooleanField` — matching cyberware types.
   - `bodyCost: NumberField` (`min:0`, finite) — listed Body Cost, **pre-grade**.
   - `grade: StringField` choices `standard | cultured` (default standard).
   - `bodySystem: StringField` (circulatory/dermal/endocrine/hepatic/lymphatic/neural/renal/
     respiratory/structural) — sheet grouping + flavor, non-mechanical.
   - **Its own** rating-row schema for `ratingStats` carrying rating-dependent **`bodyCost`**
     (cyberware's rows carry `essenceCost`; do NOT reuse them unchanged). Rows must be
     **sorted, unique ratings** (enforced: the content `validate` rejects duplicate ratings, and
     the item-sheet add-row action refuses a duplicate); `prepareDerivedData()` copies the selected row's `bodyCost`/
     `cost`/`availability`/`streetIndex` into the flat fields (exactly as CyberwareData does),
     with an explicit **exact-match-else-clamp-to-nearest** fallback (not "use last row").
   - **One** canonical mechanical getter, `actualBodyCost`, returning the **unrounded**
     effective cost via a shared pure `effectiveBodyCost({bodyCost, grade})`
     (`grade==="cultured" ? bodyCost*0.75 : bodyCost`). Rounding happens **only at render**
     (2 dp), never in the mechanical value — so the model's Body Index/Essence totals match the
     unit-tested helper exactly.
   - **Nuyen: no derived cost.** The compendium stores each item's **listed** price (the book's
     equipment table already prints the ×4 cultured price; neural bioware "monetary factors
     already figured in"). So `cost` stays authoritative and **no purchase-path code changes**
     (avoids threading a cultured multiplier through drop-purchase/sale/refund/resource-spend —
     smaller blast radius). Limitation, documented: manually flipping an item's grade in Foundry
     re-derives `actualBodyCost` but NOT nuyen; the GM adjusts price on a manual grade change.
2. **`bodyIndex` in `CharacterData.defineSchema`** — a real `SchemaField { value:Number,
   max:Number }` (strict TypeDataModels reject assigning undeclared derived props). Scoped to
   **`character` only**: `_collectItemModifiers`/`_calculateAttributeValues` exist solely on
   CharacterData; NPCData uses hand-set stat blocks and derives nothing from items, so bioware
   items on an NPC are inventory flavor with no Body-Index/Essence effect — consistent with how
   cyberware already behaves on NPCs. (NPC parity = backlog.)
3. **Derivation order in `prepareDerivedData`** (the load-bearing fix):
   - At the **top**, capture `const isAwakened = this.magic.type !== "none";` (stable pre-
     derivation signal; stays true even when Essence later drops Magic to 0).
   - Compute `bodyIndex.max` from **natural Body only** — `body.base + body.racial`, clamped by
     `CONFIG.SR2E.racialMaximums[this.race]` — via a small `naturalAttributeValue("body")`
     helper, **before** `_collectItemModifiers`/`_calculateAttributeValues`, so item/AE/bio
     Body mods can't contaminate the cap. Never read `body.value`/`body.mod`.
   - Change the signature to **`_collectItemModifiers({ isAwakened })`** and pass the captured
     boolean in (it must not consult mutable derived Magic). It walks installed **bioware**:
     adds `attributeMods` to the same totals; accumulates a `bodyIndex` total in the returned
     result; and adds `actualBodyCost` to `mods.essenceLoss` **only if `isAwakened`**. Mundanes
     take zero Essence from bioware.
   - **Aggregation ≠ mutation:** the collector *returns* the bodyIndex total; `prepareDerivedData`
     assigns `this.bodyIndex.value` **exactly once**. Both the model getter and the pure helper
     call the same `effectiveBodyCost()` — one canonical representation, no rounding divergence.
   - Existing `essence.value = max(0, essence.max - mods.essenceLoss)` → `magic.max =
     floor(essence.value)` pipeline is otherwise untouched, and stays behind the **`autoEssence`**
     setting (bioware Essence honors the same toggle as cyberware — stated explicitly).
   - **Idempotence (correctly stated):** `_calculateAttributeValues` *adds* totals onto `.mod`,
     relying on Foundry to restore SOURCE + reapply Active Effects before each `prepareData()`.
     A single collect pass alone does NOT guarantee no drift — the guarantee comes from Foundry's
     prepare cycle. The Quench idempotence test therefore exercises the **real `actor.prepareData()`
     cycle** (with an installed bioware modifier AND an Active Effect present), run twice, asserting
     Body/Reaction/Body Index/Essence/Magic are identical — not direct repeated `prepareDerivedData`.
4. **Registration surface (explicit, all points):**
   - Export `BiowareData` from `module/data/_index.mjs`; add `bioware: dataModels.BiowareData`
     to `CONFIG.Item.dataModels` in `module/sr2e.mjs`; add `bioware` to `system.json`
     `documentTypes.Item`.
   - `module/config.mjs`: `SR2E.biowareGrades` (cultured body-cost multiplier ×0.75; the nuyen
     ×4 factor is recorded **informational-only**, never auto-applied — cost stays as stored),
     `SR2E.bodySystems`, lang keys `SR2E.Bioware.*`.
   - `item-body.hbs`: add a `bioware` branch (Body Cost, grade, bodySystem, rating) — the
     template currently gates the whole augmentation block on `type === "cyberware"`.
   - `item-sheet.mjs`: supply bioware context in its `getData`/context (currently cyberware-only),
     **including the header icon branch**, and make the `_addRatingRow` action **type-aware** so
     bioware rating rows are created with `bodyCost` (not the cyberware default `essenceCost`).
   - `onToggleEquip` (`sheet-actions.mjs`): route `bioware → system.installed` (today it falls
     through to `system.equipped`, which bioware won't have).
   - Actor sheet context: add a `context.bioware` collection grouped by `bodySystem`, creation
     controls, row rendering, and installed-toggle — parallel to `context.cyberware` (drag/drop
     itself is generic in `SR2EBaseActorSheet`).
5. **Sheet display:** Bioware subsection in the augmentation tab (grouped by `bodySystem`);
   **Body Index `value / max`** readout beside Essence, red when `value > max`. Passive
   indicators (no automation): overstress penalty **`+Math.ceil(Math.max(0, value - max))`** TN
   to Body tests (zero-floored so it never shows negative under the cap) and magical-healing
   interference **`+Math.floor(value/2)`** to heal TNs.
6. **Pure helpers + tests.** In `module/rules/sr2e-rules.mjs` (Foundry-free), accept
   **normalized primitives** not documents: `bodyIndexTotal(rows:{installed,bodyCost,grade}[])`
   and `biowareEssence(rows, isAwakened)`, sharing one `effectiveBodyCost({bodyCost,grade})`
   helper (ignore non-finite/negative, default unknown grade to standard). Rounding: **no
   per-item rounding of the running sum**; cultured uses ×0.75 kept as float, `actualBodyCost`
   is unrounded in the model (templates round `actualBodyCost` to 2 dp for display only);
   penalties use `ceil`/`floor` as above (Shadowtech p.6-7). Vitest:
   cultured, awakened-vs-mundane, magic-reduced-to-zero, over-cap, malformed input. **Quench**
   (Foundry-side): model construction/registration, installed toggle, natural-Body cap,
   essence→magic order, and a **double-prepare idempotence** check (Body/Reaction/Body Index/
   Essence/Magic must not drift).
7. **CHANGELOG + minor version bump**; `npm test`; build/validate packs. No **stored-document**
   migration expected (additive type). The `bioware` type only exists once this release is
   installed, so the content module declares a **hard minimum-system-version dependency** (Part B
   §8) rather than relying on graceful unknown-type behavior (which Foundry does not guarantee).

### Part B — Content module (`sr2e-shadowtech`, new repo, mirrors `sr2e-fields-of-fire`)
8. Scaffold like fields-of-fire: `packs-src/` (per-doc JSON = source of truth), `tools/`
   generators, `npm run build-packs` → LevelDB (gitignored), `npm run validate`, `module.json`
   (packs only, **no esmodules**), CHANGELOG/README/CLAUDE.md. `module.json` declares a
   **`relationships.systems` dependency on `sr2e` with a minimum version** = the release that
   adds the `bioware` type, so Foundry refuses to enable the module against an older system.
   `validate` also **asserts no compendium JSON contains derived fields** (`actualBodyCost`,
   `effectiveBodyCost`) — only base `bodyCost` + `grade` + listed `cost`.
9. Packs:
   - `st-bioware` — every bioware item: **base** `bodyCost` + `grade`, the book's **listed**
     nuyen `cost`, availability, street index, `bodySystem`, description. Neural items stored with
     **base** Body Cost + `grade:"cultured"` so `actualBodyCost` reproduces the printed value
     (never store the already-reduced number — would double-reduce). No derived fields in JSON.
   - `st-cyberware` — Shadowtech's expanded cyberware as existing-type `cyberware` items via
     `ratingStats`/`attributeMods`. Any item the current model can't express (e.g. Tactical
     Computer dice pool, Encephalon, Skillwire Plus) is **flagged in the module's notes**, not
     force-fit; if one needs a new modifier field, that's a scoped core follow-up.
   - `st-gear` — Chemistry, Gene-Tech treatments, Microbiologicals as `gear` items: stats +
     descriptions, **no auto-effects**.
   - `st-journals` (optional) — one GM lore journal (Bionetics/Eugenics/Genetics/Tech & Law).
10. Item stats transcribed from the Equipment Table (p.109+) and per-item descriptions,
    cross-checked against the book (CLAUDE.md rules policy: cite pages, never from memory).

## Key decisions & tradeoffs
- **Split** (system mechanics + content module) — modules can't add item types/derived stats. (Q1)
- **Dedicated `bioware` type** with cyberware's exact field names, no CyberwareData refactor. (Q2, R1)
- **Warn, don't block** the cap; over-cap is the GM's call. (Q3)
- **Awakened = `magic.type !== "none"`**, captured at the top of derivation → no essence↔magic
  circularity; mundanes pay Body Index only. (Q3, R1)
- **Cap = natural Body** (`base + racial`, racial-clamped), computed before any modifier pass so
  bioware/AE Body mods never inflate it. (R1)
- **Cultured double-count avoidance:** store base Body Cost + grade; `actualBodyCost` applies
  ×0.75; neural bioware stored base + cultured grade. (Q3, R1)
- **Scope to `character`**; NPCs derive nothing from items today. (R1)
- **Automation deferred** (overstress, healing-TN, drug effects) → backlog. (Q3/Q4)
- **Reuse proven pipelines:** bioware rides `_collectItemModifiers` → `essenceLoss`/`.mod`; no
  new attribute/Magic math; honors `autoEssence`.

## Risks / open questions
- A few expanded-cyberware items may not map onto the current `attributeMods` model — flagged
  per item; a new modifier field would be a scoped core follow-up, not silent force-fitting.
- Data-entry fidelity of dozens of items vs the book (classic content risk) — validate + cite.
- Confirm `naturalAttributeValue` matches `_calculateAttributeValues`' own base/racial/clamp so
  the cap and the attribute can't diverge (shared helper).

## Out of scope
- Automating overstress, magical-healing TN, or drug/treatment effects (backlog).
- Body Index on NPC/critter actors (backlog); genetics/eugenics mechanics; bioware system-damage
  rules; overstress recovery timers — lore/notes only.
- Any change to existing cyberware grades (standard/alpha) or CyberwareData's schema.
- Chargen point-buy enforcement of the Body Index cap (displayed, not enforced).
