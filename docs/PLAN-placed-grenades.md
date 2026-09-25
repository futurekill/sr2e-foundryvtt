# Plan: Grenades and rockets aimed at a point, not a token (SR2E p.96–97)
_Round 2 — revised after Codex round 2_

## Goal
p.96: "To determine the grenade's final location, first choose the intended
target" — a location, not necessarily a character. Today an area weapon needs a
**targeted token** as ground zero, so you can't lob a grenade at a doorway,
behind cover, or into an empty room. Area spells solved the same problem with a
map click (`promptForCanvasPoint`).

## Approach
1. **Aim mode, snapshotted before the attack is queued.** `_rollWeaponAttack`
   already captures `_engage` synchronously before enqueueing. For a blast weapon
   it also captures `aim`:
   - `{ mode: "point", x, y, sceneId }` when `options.blastPoint` is given;
   - `{ mode: "token", tokenUuid }` when a token is targeted and no point was
     given;
   - `{ mode: "deferred" }` otherwise.
   The blast branch resolves **only** from that snapshot. It no longer falls back
   to live targeting, so an unrelated later target cannot hijack a point or a
   deferred throw.
2. **Validation before any mutation** (the thrown-quantity decrement and ammo):
   a point must have finite numeric `x`/`y` and a `sceneId` that is an existing
   scene. Otherwise the throw is refused and nothing is spent.
3. **Range in the shared path.** When the aim is a point or token on the
   **current** scene and the thrower has a token there, `_rollWeaponAttack`
   measures thrower → aim with `canvas.grid.measurePath`. It classifies the
   **raw** distance against the Grenade Range Table brackets (`thrownRange` for
   thrown; the launcher table for launchers) and rounds only for display. The
   existing accessory `rangeShift` is applied to that bracket. Beyond extreme
   range the throw is refused before spending. When the aim **cannot be
   measured** (no thrower token, or another scene), the throw needs an
   **explicit** range: `options.rangeExplicit` is set only when the user picked
   the range in the dialog themselves (or a macro passed `range`). A
   token-derived preset does not count, so a point throw never inherits a stale
   token range. Without an explicit range the throw is refused before spending.
   The dialog's pre-fill uses the same function.
4. **Attack dialog (blast weapons)**: an "Aim at" choice, either *the targeted
   token* or *a point on the map*. Choosing a point runs `promptForCanvasPoint`
   after the dialog confirms and before `item.roll`. Cancelling spends nothing.
   The point goes to `options.blastPoint`.
5. **Launcher flags**: `flags.sr2e.blastLaunch` gains `aim` (the snapshot).
   `launchFromCard` forwards it to `resolveBlast`, which accepts `centerPoint` or
   `centerTokenUuid`:
   - A point on a scene that is not the viewed scene is refused (retryable).
   - `aim.mode === "deferred"` makes the launcher **prompt for the point at launch
     time** (`promptForCanvasPoint`). Cancelling leaves the launcher unresolved
     and retryable, as a failed launch already does.
   - Scatter stays relative to thrower → centre (`scatterBearing`); the thrower
     token was already recorded.
   - **Existing launcher cards** without `aim` are normalised at launch:
     `{ mode: "token", tokenUuid: centerTokenUuid }` when one is stored, else
     `deferred`.
   - **A token aim never consults live targets.** `resolveBlast`'s fallback to
     `game.user.targets` is removed for flag-backed launches. A stored token that
     no longer resolves on the viewed scene is refused (retryable). The legacy
     dataset path keeps its behaviour.
   - **Deferred placement re-reads after the click.** Once the point is chosen,
     `launchFromCard` re-checks that the launcher is unresolved and re-reads the
     attack test's live total before rolling scatter and building the marker.
     Karma spent while the picker was open is used.
6. **Tests** (Quench, deterministic dice):
   - A grenade aimed at an empty point drops its template at that point
     (scatter 0).
   - Non-zero scatter lands correctly from two differently placed throwers:
     diagram 1 goes past the point, away from each thrower.
   - The range bracket comes from the raw measured distance (a point just past
     Str×3 is medium).
   - A malformed point is refused with the grenade's quantity unchanged.
   - A queued throw keeps its point even if the user targets a token before it
     runs.
   - A deferred launcher prompts at launch; cancelling leaves it retryable.
   - A point on another scene is refused at launch.
   - An old launcher without `aim` still launches at its stored token.
   - A token aim whose token is gone is refused rather than hitting the live target.
   - Karma spent while the deferred picker is open is used by the launch.
   - A point throw with no measurable range and no explicit range is refused.

## Key decisions & tradeoffs
- Reuse the area-spell picker.
- The snapshot is taken at invocation, which is the same rule `_engage` already
  follows.

## Out of scope
Blast against barriers and confined-space channelling (p.97): still refused.
