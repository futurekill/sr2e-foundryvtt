# SR2E macros & the macro pad

The system ships a **SR2E Macros** compendium — ten macros built specifically for
driving a session from a physical macro pad.

## Import

Compendiums → **SR2E Macros** → select all → right-click → **Import All**, then
drag each onto the hotbar. Slot order matters; see below.

## How a VIA macro pad actually reaches Foundry

VIA sends **keystrokes**. It cannot call Foundry functions. So the chain is:

```
VIA key  →  digit 1–0  →  Foundry hotbar slot  →  macro
```

Foundry binds hotbar slots 1–10 on the **current page** to the number-row digits,
with `0` firing slot 10. So configure each pad key to send a plain digit — no
modifiers needed for the first ten.

**The one gotcha: hotbar digits only fire when the CANVAS has focus.** If your
cursor is in the chat box, pressing `3` types a "3". Click the map first. That is
Foundry's behaviour, not something a macro can defend against, and it is the most
likely reason a key "does nothing".

If your pad has more than ten keys, Foundry v13 lets you rebind hotbar pages
under **Configure Controls**; page-switch keys are the simplest way to reach
slots 11+ without modifiers.

## The layout, and why it is in this order

Slot order is part of the design — the keys you hit constantly get the low
digits, and the ones with consequences sit further out.

| Slot | Macro | Dialog? | Notes |
|---|---|---|---|
| **1** | Next Initiative Pass | no | **The most-pressed key in SR2.** Costs the current actor 10 Initiative and jumps to the highest remaining total (p.85). |
| **2** | Refresh Dice Pools (selected) | no | Combat/Magic/Control, Spell Defense, Shielding — **and spell focus dice**, which refresh on the same schedule (p.137). |
| **3** | Refresh Pools — Everyone in Combat | no | Start-of-round sweep. Needs **no selection**, deliberately. |
| **4** | Apply Damage (selected) | **yes** | Boxes + type. Stun overflow converts to Physical automatically (p.110). |
| **5** | Recover Stun (selected) | no | Body or Willpower, whichever is higher, vs TN 2. |
| **6** | Heal Physical (selected) | no | Natural healing. Refuses Deadly wounds — those need First Aid. |
| **7** | Toggle Astral Perception | no | `none ⇄ perceiving` only. |
| **8** | Roll Initiative — All Combatants | no | Re-rolls the whole combat. |
| **9** | Clear Templates (this scene) | no | Sweeps leftover blast/spell templates. |
| **10** (`0`) | Award Karma (selected) | **yes** | Adds to spendable and lifetime Karma. |

## Three rules every macro here follows

1. **Works from a keypress, with no click.** Each acts on the current token
   selection or the active combat — never on "the thing you just clicked",
   because a pad key cannot click anything first.
2. **Safe to press twice.** A pad invites fat-fingering. Refreshing a full pool
   is a no-op; recovering stun on someone unstunned does nothing; nothing here
   deletes without being scoped.
3. **Only two ask a question.** Damage and Karma need a number, and guessing is
   worse than a keystroke. The other eight fire immediately.

## Deliberate omissions

- **Astral *projection*** is not on a key. Projecting leaves your body behind and
  changes initiative — not something to trigger by accident. Perception toggles;
  projection stays on the sheet.
- **Award Karma does not touch the Karma Pool.** `karma.pool` is the *dice*
  resource that rerolls, buys successes and avoids glitches spend down. Session
  karma goes to `current` and `total`; putting it in the pool would hand out
  combat currency every time you paid the group.
- **No "damage the targeted token" macro.** Targeting and selection diverge
  constantly in play, and a pad key that damages the wrong actor is worse than
  no key at all.

## Customising

They are ordinary script macros — edit freely after importing. If you want them
regenerated or extended, `tools/gen-macros.mjs` is the source; it asserts that no
two macros claim the same slot.
