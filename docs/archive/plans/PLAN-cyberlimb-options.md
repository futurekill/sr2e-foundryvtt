# PLAN — Cyberlimb options (SR2 core p.261)

Add the three cyberlimb sub-options the core Cybertech table prints but the
system does not model. **Mirror the shipped weapon-accessory pattern exactly** —
this introduces no new concepts, only a second instance of one that already works.

Read `CLAUDE.md` first; its rules-accuracy policy governs this task.

## What the book prints (p.261, verified against the corrected 11th printing)

Under **Limbs**, indented beneath `Cyber Limb` (1 Essence, 100,000¥, 4/4 days):

| Option | Essence | Availability | Cost | Street Index |
|---|---|---|---|---|
| Increased Strength | — | 6/4 days | + (Rating × 150,000¥) | 1.5 |
| Built-In Smartlink | .25 | 6/4 days | +2,500¥ | 1.5 |
| Built-In Device | — | Varies | + (4 × Normal Cost) | Varies |

Also missing from the same block and in scope:

| Simple Replacement | 1 | 4/48 hrs | 50,000¥ | 1 |

Costs are **additive to the parent limb** ("+"). Do not flatten a formula into a
single number — see CLAUDE.md, "Costs printed as formulas must stay formulas".

## The pattern to mirror

Weapon accessories (`module/data/item-data.mjs` GearData ~line 677 onward):

- the accessory is its **own item** carrying `weaponAccessory: true` and
  `linkedWeaponId` = the parent weapon's item id;
- `accessorySummary(attached, opts)` in `module/rules/sr2e-rules.mjs` aggregates
  them purely, and **both** the roll (`module/documents/item.mjs`) and the dialog
  (`module/sheets/sheet-actions.mjs`) call that one helper so they can't disagree;
- attach/detach are sheet actions; `permanentAccessory` marks integral ones.

Read all three call sites before writing code.

## Design (frozen — build this, do not redesign)

### 1. Schema — `CyberwareData`

Add, alongside the existing fields:

- `limbOption: new fields.BooleanField({ initial: false })` — this item is a
  sub-option, not a standalone implant.
- `linkedLimbId: new fields.StringField({ initial: "" })` — parent cyberlimb item id.
- `costMultiplierOfBase: new fields.NumberField({ initial: 0, min: 0 })` — for
  **Built-In Device** (`4 × Normal Cost`): the GM enters the device's normal cost
  in `cost`, and the derived surcharge is `cost × costMultiplierOfBase`.
- `costPerRating: new fields.NumberField({ initial: 0, min: 0 })` — for
  **Increased Strength** (`Rating × 150,000¥`).

Do not add a field the book does not justify.

### 2. Derived cost — `prepareDerivedData`

A limb option's effective nuyen cost is, in order of precedence:
`costPerRating × rating`, else `cost × costMultiplierOfBase`, else `cost`.
Keep this **idempotent** (re-preparing must not compound), exactly as
`strengthMinWeaponStats` does for bows.

### 3. Aggregation — a pure helper in `module/rules/sr2e-rules.mjs`

```js
export function cyberlimbOptionSummary(options) // → { essence, cost, strengthBonus, grantsSmartlink }
```

Pure, no Foundry globals, unit-tested. Sums the options' essence and derived
cost; `strengthBonus` = the Increased Strength rating; `grantsSmartlink` = true
if a Built-In Smartlink is attached.

**Essence is NOT double-counted:** options are ordinary `cyberware` items, so the
existing installed-cyberware essence sum already includes them. `summary.essence`
is for **display on the parent limb only**. Verify this against
`_collectItemModifiers` before wiring anything, and state in a comment which
path is authoritative.

### 4. Deliberate non-automation (matches existing project precedent)

- **Do NOT auto-apply the Strength bonus to the character's Strength attribute.**
  A cyberlimb's Strength applies to *that limb*, not the whole body, and the core
  book does not give a general-case rule for it. Surface it as an indicator on
  the limb (like the bioware overstress penalty, which ships display-only).
- **Built-In Smartlink**: reuse the existing smartlink path — a limb-mounted
  smartlink should behave as the character's smartlink for the receptor benefit
  (p.90). If that means simply setting `combatTnMod` on the option item, do that
  rather than adding a parallel code path. **If it does not fit cleanly, stop and
  report** — do not invent a second smartgun mechanism.

### 5. Content — `packs-src/cyberware/`

Four new items, matching the existing file convention exactly
(`Name_<16-hex-id>.json`, `_id` matching the filename, notes citing "table p.261"
in the voice of the neighbouring cyberware notes):

- **Increased Strength (Cyberlimb)** — `limbOption`, `costPerRating: 150000`,
  essence 0, avail `6/4 days`, `streetIndex: "1.5"`
- **Built-In Smartlink (Cyberlimb)** — `limbOption`, cost 2500, essence .25,
  avail `6/4 days`, `streetIndex: "1.5"`
- **Built-In Device (Cyberlimb)** — `limbOption`, `costMultiplierOfBase: 4`,
  essence 0, avail `Varies`, `streetIndex: ""`
- **Simple Replacement (Limb)** — a normal implant (NOT a limbOption), essence 1,
  cost 50000, avail `4/48 hrs`, `streetIndex: "1"`

`streetIndex` on cyberware is a **StringField** — write `"1.5"`, not `1.5`.

Icons: **256×256 WebP** at `assets/item_icons/cyberware/<kebab-name>.webp`, in
the style of the existing cyberware icons. Every shipped item has a real icon;
do not point `img` at a file that does not exist.

### 6. Attach / detach UI

Mirror the weapon-accessory sheet actions: attach an option to a cyberlimb,
detach it, and show attached options nested under their limb on the character
sheet's cyberware list. Only items with `location: "cyberlimb"` are valid
parents. Detaching must clear `linkedLimbId`.

### 7. Audit reference

Add the four rows to `tools/data/street-gear-prices.tsv` (12 tab-separated
columns — count them; a short row silently shifts every field). For the two
formula-priced options put the formula in `cost` (`150000*rating`, `4*base`) and
extend `tools/audit-costs.mjs` to understand those forms, the way it already
handles `100*strMin`. `npm run audit-costs` must report **no drift** afterwards.

## Proof

```
npm test && npm run audit-costs && npm run build-packs
```

`npm test` is 446 tests today and must stay green, plus new unit tests for
`cyberlimbOptionSummary` and the derived-cost precedence (assert the book values
and cite p.261). Add a Quench batch case if the attach/detach UI is touched
(`module/quench/sr2e-quench.mjs`) — that tier covers sheet/persistence work.

Report a table of the four items with derived cost at rating 1 and rating 3.

## Out of scope

Bioware (already complete in `sr2e-shadowtech`), the `Cyber Limb`/`Cybertorso`
items themselves, cyberlimb Strength/Quickness rules beyond the indicator above,
and any change to the weapon-accessory code itself. **Do not commit, tag, or
push.** Do not hand-edit `packs/` (gitignored, built).
