# Plan: mobile companion mode
_Round 0 — initial draft by Claude (revised 2026-10-02 for shared targets)_

## Goal
Let a player drive their character from a phone or tablet while the map stays on
another screen. A small-screen device that logs into the normal Foundry address gets
a touch-first character screen instead of the desktop interface. Every action runs
the system's existing code, so rolls, Karma, drugs, ammo and chat cards behave
exactly as from the desktop sheet.

## Decisions already made (user, 2026-10-02)
- It lives **in the system**, not a separate module.
- **Phones and tablets**: one responsive layout.
- **Automatic on small screens**, with a per-device switch back to full Foundry.
- **First version:** skill and attribute rolls, weapon attacks, spellcasting and
  conjuring. Stats, condition monitors and dice pools are always shown.
- **Not in the first version:** responding to cards (damage resistance, melee
  defence, spell resistance) as a designed flow. See "Chat" below.

## Verified facts (V13.351, local world, 375×812 emulated Android)
- Foundry's minimum-resolution check (`client/helpers/client-issues.mjs`) only shows
  an error notification. The client logs in and reaches `game.ready` with all
  documents; the desktop interface simply doesn't fit.
- `core.noCanvas` is a client-scope setting (`requiresReload: true`): with it on,
  `canvas.ready` is false and no placeables exist.
- The sheet's roll handlers (`onRollAttribute`, `onRollSkill`, `onRollWeapon`,
  `onCastSpell`, `onConjure`, `onReloadWeapon`, … in `module/sheets/sheet-actions.mjs`)
  are plain functions called with `this` = the sheet; they use `this.document` /
  `this.actor` and the clicked element's `data-*`. `SHARED_ACTIONS` maps action names
  to them.
- Attacks and spells read their target from `game.user.targets` (a Set of Token
  PLACEABLES) and measure with `canvas.grid` (item.mjs ~13 sites, sheet-actions.mjs
  ~16). With no canvas there are no placeables, so nothing can be targeted today.
- The same user can be logged in on two devices at once (Foundry allows it): the
  phone as the sheet, the computer showing the map.
- **Foundry does not share targets between one user's own devices.** Its
  `userActivity` handler drops messages from the same user (`if (user.isSelf)
  return`, `documents/collections/users.mjs`). Tested: a target broadcast from one
  login of a user never reached that user's other login. Other users (the GM) do
  receive it.

## Approach

### Stage 1 — the shell
1. **Decision (pure, `module/rules/companion-rules.mjs`):**
   `companionMode({override, width, height, coarse})` → boolean. `override` is the
   device's stored choice (`"on" | "off" | null`); when null, companion mode is on
   if the viewport is below Foundry's own 1024×768 minimum AND the primary pointer
   is coarse (touch). A desktop window dragged narrow stays desktop.
2. **Storage:** `localStorage["sr2e.companion"]` (per device, readable before
   `game.settings` exists). `?companion=1` / `?companion=0` in the URL sets it.
3. **Boot** (`module/companion/boot.mjs`, run at `init`): if companion mode is on,
   add `sr2e-companion` to `<body>`; and if `core.noCanvas` is false, set it true
   and reload once (guarded by a sessionStorage flag so it can never loop). Leaving
   companion mode restores the device's previous `noCanvas` value (remembered in
   localStorage) and reloads.
4. **Chrome:** under `body.sr2e-companion`, CSS hides `#interface`, the board and
   the hotbar, and the resolution notification is dismissed (matched by its
   localized text key, so other errors still show). Foundry's notifications and
   dialogs stay available.
5. **Which character:** `game.user.character`; if unset, a picker of the actors the
   user owns (type `character`), remembered per device. GMs get the picker too.

### Stage 2 — the companion screen
6. `SR2ECompanionApp` (`module/companion/app.mjs`), an `ApplicationV2` +
   `HandlebarsApplicationMixin`, frameless and full-viewport, opened at `ready` in
   companion mode. It exposes `document` and `actor` getters for the chosen actor
   and registers `actions: SHARED_ACTIONS`, so the existing handlers run unchanged
   with `this` = the companion app. Its template uses the same `data-action` and
   `data-*` attributes as the sheet partials.
7. **Tabs** (bottom tab bar, thumb reach):
   - **Status:** attributes, Reaction, Initiative (roll button), both condition
     monitors (tap a box to set damage, as on the sheet), dice pools with spent /
     available, Karma Pool, armour.
   - **Skills:** every skill with rating; tap to roll (the existing roll-options
     dialog), plus attribute rolls.
   - **Combat:** the target bar (Stage 3), equipped weapons with ammo and fire mode,
     Attack and Reload.
   - **Magic** (Awakened only): spells with Force, Cast, sustained spells with drop;
     Conjure.
   - **Chat:** see item 12.
8. **Live updates:** re-render (debounced) on `updateActor`, and on item/effect
   create/update/delete for that actor; `updateCombat` for the initiative line.
9. **Layout:** mobile-first CSS in `styles/companion.css`: one column on phones, two
   on tablets (`min-width: 700px`), 44 px minimum tap targets, `env(safe-area-inset-*)`
   padding, no hover-only affordances, `touch-action: manipulation`.
10. **Dialogs:** the roll dialogs are the system's existing `DialogV2`s, so every
    rule option stays identical. Under `body.sr2e-companion`, CSS makes any dialog
    full-width, scrollable and touch-sized. No dialog is re-implemented.
11. **Leaving:** a menu on the Status tab: "Open full Foundry on this device"
    (sets the override to `"off"`, restores `noCanvas`, reloads) and "Switch
    character".
12. **Chat:** the Chat tab hosts Foundry's own chat log element (`ui.chat`),
    restyled, so roll cards appear exactly as on the desktop, including their
    buttons (Karma rerolls, and the Resist/Defend buttons other cards carry). Those
    buttons are the system's existing handlers. The first version tests the Karma
    buttons on the player's own rolls; the response buttons are not redesigned for
    touch and are listed as untested.

### Stage 3 — targeting and range without a canvas
13. **Shared targets across a player's devices.** The player's current targets live
    on their own User document: `flags.sr2e.targets = {sceneId, tokenIds, seq}`
    (players may update their own User). This is the single source of truth, and it
    syncs both ways:
    - **Computer → phone:** a `targetToken` hook on a canvas client writes the
      user's current `game.user.targets` to the flag (debounced; skipped when the
      change came from applying the flag, see below).
    - **Phone → computer:** the companion writes the flag when the player picks;
      every canvas client of that user, on `updateUser`, applies it with
      `Token#setTarget` (which also broadcasts the reticle to the GM as usual).
    - **No ping-pong:** each write carries a `seq` and the writing client's id
      (`game.socket.id`); a client ignores its own writes, and applying the flag
      sets a guard so the resulting `targetToken` hooks don't write it back.
    - Ordinary document updates, not a socket relay: the system's `system.*`
      relay is known to drop messages behind some hosts (system CLAUDE.md).
    `module/targeting.mjs` then answers "who is this user targeting" as
    **TokenDocuments**: `currentTargetDocs()` = the flag's tokens on its scene (both
    devices read the same list), falling back to `game.user.targets` if the flag is
    unset. Tokens that no longer exist are dropped.
14. **Refactor the call sites** in `item.mjs` and `sheet-actions.mjs` from Token
    placeables to TokenDocuments through that helper. Geometry moves from
    `canvas.grid` to the token's own scene: `scene.grid.measurePath([centerA,
    centerB])` with `TokenDocument#getCenterPoint()`, which needs no canvas. Where
    code needs things only a canvas has (visibility along templates, darkness from
    the rendered scene, FX on placeables), it keeps today's behaviour when
    `canvas.ready` and degrades when not: the range pre-fills from document
    geometry, the visibility modifier is left for the player to enter (the dialog
    already has the field), and FX are skipped.
15. **Target picker (Combat and Magic tabs):** lists the tokens on the scene where
    the character's token stands. Pure filter and order in `companion-rules.mjs`:
    excludes the character's own token, tokens with `hidden: true`, and astral-only
    tokens unless the character is astrally active (the existing
    `astralAllowsView` rule); current combatants first, then by distance. Each row
    shows name, disposition colour and distance. Tap toggles; multi-target for
    weapons that allow it.
16. **Telling the table:** the player's computer applies the shared targets with
    `Token#setTarget`, which shows the reticle there and broadcasts it to the GM and
    other players. If the player has no canvas client open, the companion also
    calls `game.user.broadcastActivity({targets})` so the GM still sees it.
17. **What the picker can't know:** line of sight. It lists every non-hidden token
    on the scene. That's stated in the UI ("the GM adjudicates line of sight") and
    in the docs.

### Stage 4 — things that need a canvas
18. **Blast and area placement** (`promptForCanvasPoint`: grenades, area spells,
    ritual areas) and **spirit token placement** after conjuring need a map click.
    In companion mode these are refused before any irreversible step (ammo, drain)
    with a clear message: "place this from a device with the map". Conjuring still
    creates and binds the spirit; only the token placement is left to a map device.

## Key decisions & tradeoffs
- **A mode inside the Foundry client, not an app or a separate page.** It's the only
  option where the rules code is not duplicated: every handler, dialog and card is
  the one the desktop uses.
- **Reuse `SHARED_ACTIONS` by giving the app a `document`.** The alternative,
  refactoring 80+ handler bodies to take an actor argument, is a large, risky diff
  for no behaviour change.
- **Targets become TokenDocuments system-wide**, not a companion-only shim. One code
  path, and document geometry is also correct for the desktop.
- **Reuse the dialogs with CSS** rather than building touch dialogs. Costs some
  polish; guarantees rule parity.
- **`noCanvas` rather than a hidden canvas.** A phone shouldn't load map textures or
  run the render loop.

## Risks / open questions
- **Handlers that assume a sheet**: some may call `this.render()`, `this.element`,
  `this.isEditable` or sheet-only helpers. The app implements the small surface they
  use; a Quench test calls every exposed action.
- **Code that assumes `canvas.ready`** elsewhere at startup (astral, movement,
  jackpoints, spell effects, placement): each must already tolerate no canvas or be
  guarded. Audit every `canvas.` use (≈85 sites).
- **Jackpoints** switch the tab's viewed scene; with no canvas, `Scene#view()` has
  nothing to draw. Jack-in from the companion is out of scope and the button is not
  shown.
- **Two devices, one user:** per-tab state (jackpoint view record, dose driver) is
  already per tab; the "one driver per actor" queues are per client. Two devices
  acting on one actor at the same moment is the same as two tabs today.
- **`ui.chat` relocation:** moving the sidebar's chat element into the app may fight
  Foundry's sidebar rendering; fallback is `ChatLog`'s popout rendered inside the tab.
- **iOS Safari quirks:** 100vh, the on-screen keyboard resizing the viewport, and
  double-tap zoom. Use `dvh` units and test on a real iPhone and iPad (the user has
  to do this; the emulator can't).
- **The reload on first entry** (to apply `noCanvas`) costs a few seconds once per
  device.

## Tests
- Vitest: the shared-target merge (own writes ignored, stale `seq` ignored, unknown
  tokens dropped); `companionMode` (override wins; narrow + fine pointer stays desktop);
  target filter and order (hidden, self, astral-only, combatants first); document
  distance.
- Quench `sr2e.companion` (desktop client, canvas present): the app opens for a test
  actor; every exposed action runs without a sheet; `currentTargetDocs` returns the
  shared flag's tokens; two logins of one user — targeting on one updates the
  other's target set, with no write loop; a ranged
  attack against a document target pre-fills the same range as against the
  placeable; blast placement is refused cleanly.
- Manual (QA-PLAN): a real phone and tablet; the first-entry reload; leaving and
  re-entering; rolling each of the four action kinds; the target reticle appearing on
  the GM's map.

## Out of scope (first version)
Designed touch flows for responding to cards; Matrix actions and jackpoints; vehicles
and rigging; inventory management, purchases and character editing; astral
projection controls; drag-and-drop; anything for the GM.
