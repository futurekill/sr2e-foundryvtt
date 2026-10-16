# Plan Review Log: resist once
Started 2026-10-16. MAX_ROUNDS=5.

## Round 1 — Codex

Concrete gaps requiring revision:

- **Vehicle resistance loses the marker.** `actor.mjs:2187–2192` reconstructs the delegated options explicitly, so adding `resolvesRow` to both result builders alone leaves every vehicle outcome unmarked. **Fix:** Forward `options.resolvesRow` through `rollDamageResistance`’s vehicle branch and test both damaging and immune vehicle outcomes.

- **Undefended bypasses the melee lock.** `sr2e.mjs:2623–2633` checks resolution before awaiting `fromUuid`, then calls unguarded `_resolveMeleeHit`; double-clicking can produce two hit cards, each with its own independently usable resistance key, and can race an executing defense on the same client. **Fix:** Share one message-keyed guard across Defend and Undefended, held through outcome creation.

- **The wrong actor can permanently consume a hit.** Melee-hit (`actor.mjs:1740`) and manifested-spirit (`actor.mjs:2611`) buttons omit `data-target-uuid`; the generic handler accepts the selected/assigned actor, and ownership proves only that the clicker owns that actor. **Fix:** Encode the intended victim UUID on new cards, including counterstrikes, and explicitly define actor selection for legacy untargeted cards.

- **Melee resolution still lacks authorization checks.** Neither `rollMeleeDefense` nor Undefended verifies authority to resolve the exchange; Undefended can create the closing marker without updating any actor. **Fix:** Require defender ownership for Defend and an explicit attacker/defender-owner-or-GM policy for Undefended before acquiring the guard.

- **Vehicle immunity bypasses `beforeRoll`.** `actor.mjs:2055` posts its terminal no-effect outcome before the callback at `2123`, contrary to the plan’s assumption that terminal posts follow that check. **Fix:** Invoke the callback before the no-effect post as well.

- **Chat-marker deletion reopens completed damage.** Unlike ranged/melee attack closure, the proposed row marker never persists resolution on the source card; deleting the result makes the same button damage again. **Fix:** Extend author/GM closure to persist resolved row keys on the source card and check those alongside outcome markers.

Verification notes: I found no system path that reorders the generic blast, spread, melee-hit, or spirit-attack buttons after creation. The closure hook rerenders their originating attack/launcher cards, not these result cards. Ranged/manipulation buttons have separate dispatch paths; other shared-class actions lack `data-power`. Keep those dispatches outside the new guard.

The terminal resistance posts already spread `resolves`; intermediate `rollSuccessTest` messages do not, and should not prematurely mark damage complete. The explicitly accepted cross-client race remains real; these findings do not require expanding scope to eliminate it.

VERDICT: REVISE

### Claude's response
Accepted: vehicle forwarding, beforeRoll before the immune post, a shared Defend/Undefended guard, the card persisting resolved rows (author/GM hook), and naming the target on new melee hit cards. Rejected: an authorization policy for Undefended (pre-existing, outside these findings).

## Round 2 — Codex

The revision addresses vehicle marker forwarding, immunity checks, and the shared melee guard. Three gaps remain:

- **`resolvedRows` array updates can lose completed rows.** Two different blast rows resolving concurrently can both read `[]` and write `[0]` and `[1]`; the last update erases the other completion, reopening it when its result is deleted. This can happen on one client and is separate from the accepted same-row cross-client race. **Fix:** Store independent dotted flags such as `flags.sr2e.resolvedRows.<i> = true`, and test concurrent completion of two rows followed by result deletion.

- **The target fix omits manifested-spirit attacks.** `actor.mjs:2611` still emits an untargeted generic button, so another player resisting with their own character consumes the single shared key before the intended victim can resist. **Fix:** Capture the intended target UUID in `rollSpiritAttack`; explicitly document the first-selected-actor behavior for legacy or deliberately untargeted cards.

- **Pending dialogs can resolve deleted source cards.** The proposed callback checks markers and stored row state but does not require the source to remain in `game.messages`; similarly, `isCardResolved(message, "melee")` accepts a retained document reference after deletion. **Fix:** Fetch `game.messages.get(message.id)` inside both post-dialog checks and refuse if missing, matching `resistRangedDamage`.

One integration detail must be explicit: the existing closure hook at `sr2e.mjs:2004` returns immediately without `flags.sr2e.resolves`; row-only outcomes therefore need processing **before that early return**, independently of whole-card closure.

I found no button-reordering path for the generic result cards. The authorization policy is explicitly deferred, and the accepted cross-client race is unchanged.

VERDICT: REVISE

### Claude's response
Accepted all: per-row dotted flags, the spirit attack captures the current target, live re-fetch of the source card in both post-dialog checks, and the row branch placed before the hook's early return.
