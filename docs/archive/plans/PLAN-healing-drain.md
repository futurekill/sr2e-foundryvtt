# PLAN — Treat / Heal wound-level drain (SR2 core p.155)

The **Treat** and **Heal** spells ship with a placeholder drain code. Replace it
with the book's rule, which needs a small extension to the drain model.

Read `CLAUDE.md` first — its rules-accuracy policy governs this task.

## The rule (verified against the corrected 11th printing, book p.155)

Both spells are curative twins. Values read off the **rendered page** — see the
OCR warning below:

| | Type | Range | Target (TN) | Duration | Drain |
|---|---|---|---|---|---|
| **Treat** | Mana | Touch | **8 − subject's Essence** | Permanent | **(F÷2)(Wound Level)** |
| **Heal**  | Mana | Touch | **10 − subject's Essence** | Permanent | **(F÷2)(Wound Level)** |

- **Drain Level = the TARGET's current Wound Level** (Light/Moderate/Serious/
  Deadly) at the moment of casting — drain is variable per cast, driven by how
  badly hurt the patient is. Drain TN is Force ÷ 2, i.e. modifier 0.
- Treat must be applied **within one hour** of the injury; Heal has no limit.
- A character may be magically treated **or** healed only **once per set of
  injuries**.
- Boxes healed = successes. Successes may also be split into reducing the base
  healing time (Healing Table) — **out of scope here**, do not implement it.

> **⚠ OCR HAZARD — this bit the last two tasks.** This PDF's text layer renders
> the division glyph `÷` as `+` and the level letter `S` as `5`. `pdftotext` on
> p.155 yields `Drain:(F + 2)(Wound Level)`, which is WRONG. The rendered page
> clearly shows `(F ÷ 2)`. Never read a drain code or formula from this PDF's
> text layer — render the page (`pdftoppm -r 220`) and read the image.
> (Confirmed on the same page: Increase Reflexes reads `(F ÷ 2)M / S / D`.)

## Current state (the bug)

Both spells carry `drainCode: "-1(S)"` — a fixed legacy-format placeholder. That
is wrong in BOTH components: the modifier should be 0, and the level is not
fixed at all. `packs-src/spells/Treat_*.json` and `Heal_*.json`.

## The model to extend

`parseDrainCode(s)` in `module/data/item-data.mjs` (~line 25) returns
`{ modifier, level }` with `level` one of `L|M|S|D`. It cannot express "the
level depends on the target". Its callers:

- `module/documents/item.mjs` ~line 1091
- `module/sheets/sheet-actions.mjs` ~line 1279 (the cast dialog; already
  resolves `game.user.targets.first()` for combat spells — reuse that idea)

`woundLevel(boxes)` already exists in `module/rules/sr2e-rules.mjs` (~line 130)
and returns `"Undamaged"|"Light"|"Moderate"|"Serious"|"Deadly"` on the 1/3/6/10
thresholds. **Reuse it — do not write a second wound-level function.**

## Design (frozen — build this, do not redesign)

### 1. A wound-level token in the drain code

Extend `parseDrainCode` to accept a level token `W` meaning "the target's current
Wound Level", in both the canonical and legacy shapes:

```
"(F / 2)W"   → { modifier: 0, level: "W", levelFromWound: true }
"0(W)"       → { modifier: 0, level: "W", levelFromWound: true }
```

- Add `levelFromWound: false` to every other return path so the shape is uniform.
- **Do not break the existing formats** — all current drain codes must parse
  exactly as they do today. This function is used by every spell in the game.

### 2. Resolving the level at cast time

Add a pure helper to `module/rules/sr2e-rules.mjs`:

```js
export function healingDrainLevel(physicalBoxes, stunBoxes) // → "L"|"M"|"S"|"D"
```

It maps the target's wound level to a drain level letter via `woundLevel()`.
Decide and DOCUMENT in a comment which monitor drives it: these spells heal
**physical** damage, so use the physical boxes. **An undamaged target has no
wound level** — return `"L"` (the floor) and note that the book gives no drain
for healing an uninjured target because there is nothing to heal.

### 3. Wiring

Where a spell with `levelFromWound` is cast, resolve the level from the
**targeted** actor (`game.user.targets.first()?.actor`), exactly as the combat
branch already pulls a target. If no target is selected, fall back to the
caster's own wound level (self-healing is the common case) and say which was used
in the dialog/card text. The displayed drain formula must show the RESOLVED level
(e.g. "(F÷2)S — target is Serious"), not a bare "W".

### 4. Content

Update both spell JSONs in `packs-src/spells/`:
- `drainCode: "(F / 2)W"` for both
- correct the `notes` to cite **p.155** (the existing notes say p.157 and p.184 —
  both wrong) and state the TN (8 − Essence for Treat, 10 − Essence for Heal),
  the one-hour limit on Treat, and the once-per-set-of-injuries limit.

Do not change any other spell.

## Proof

```
npm test && npm run build-packs
```

`npm test` is 458 tests today and must stay green. Add tests that:
- pin the four wound-level→drain-level mappings, citing p.155;
- assert every EXISTING drain code format still parses identically (regression
  guard — this is the risky part of the change);
- cover the undamaged-target floor.

Report the resolved drain for a Force-6 Treat on targets at Light / Moderate /
Serious / Deadly.

## Out of scope

The Healing Table time-reduction split, the once-per-injury-set bookkeeping, the
one-hour Treat window (all GM-adjudicated for now), first aid, and any other
spell's drain. **Do not commit, tag, or push.** Do not hand-edit `packs/`.
