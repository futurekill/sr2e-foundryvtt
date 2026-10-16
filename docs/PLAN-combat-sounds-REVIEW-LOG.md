# Plan Review Log: combat sound effects
Started 2026-10-16. MAX_ROUNDS=5. Plan: docs/PLAN-combat-sounds.md

## Round 1 — Codex
The plan has material gaps in mode classification, playback gating, and blast deduplication. No files were modified.

1. **“Resolved firing mode” is not actually resolved to the rounds fired.** In [item.mjs:947](module/documents/item.mjs:947), `burstFired` updates `rounds` and `isBurst`, but leaves `firingMode` as `bf`/`fa`. A one-round remainder would therefore sound like a burst.
   **Fix:** Pass actual `rounds` and `isBurst` into the classifier; use a single-shot sound when only one round fired.

2. **The class-to-mode rules misclassify supported core weapons.** The [Enfield AS-7](packs-src/weapons/Enfield_AS_7_b8e0ad55b587827b.json) supports BF, but the plan forces every shotgun to `single`; forcing every MG to `auto` also defeats single-round depletion handling.
   **Fix:** Resolve cadence independently of weapon class, with a generic burst/auto fallback where a class-specific recording is unavailable.

3. **The world-off setting does not disable overrides under the proposed precedence.** Step 3 selects an existing override before checking “Combat sounds,” contradicting both the stated master switch and the proposed “setting off → no call” test.
   **Fix:** Check the world switch before resolving either overrides or bundled sounds.

4. **Extending `playCombatFx` naïvely gives reloads, melee, and blasts gunshot overrides and visuals.** [integrations.mjs:141](module/integrations.mjs:141) treats every non-spell kind as gunshot for both settings.
   **Fix:** Explicitly restrict legacy overrides and TMFX presets to their existing kinds; preferably separate sound playback from target visuals.

5. **“Once per blast” is not guaranteed across clients.** [launchFromCard](module/sr2e.mjs:1894) uses a client-local `LAUNCH_IN_FLIGHT` set; two clients can pass the unresolved check before either outcome arrives. Legacy blast buttons also call `resolveBlast` without a marker or repeat guard.
   **Fix:** Define a single authorized resolver and persistent per-launch identity, including legacy-card handling, before promising one broadcast per blast.

6. **The blast hook needs an explicit success boundary and both terminal branches.** [resolveBlast](module/sr2e.mjs:2019) can refuse for missing canvas, wrong scene, or missing target; smoke creates its own outcome and returns early. Playback at entry sounds on refusals; playback only at the final return misses smoke.
   **Fix:** Trigger playback after successful outcome creation in both smoke and damaging-blast branches, under the launch deduplication policy.

7. **The classifier contract cannot express all its promised results.** Its listed inputs omit event kind, spell `category`, and `blastType`, yet it promises spell, blast, reload, and dry-fire keys. `WeaponData.blastType` also has no `gas` value.
   **Fix:** Use explicit event variants with their required fields, and either define gas classification from supported data or remove that promise.

8. **Skill classification disagrees with attack resolution.** The plan requires exact `skill === "unarmed_combat"`, while [item.mjs:678](module/documents/item.mjs:678) normalizes authored skill names, so `"Unarmed Combat"` rolls correctly but sounds like an armed attack.
   **Fix:** Share the attack path’s skill normalization before classifying.

9. **“Reload on success” is ambiguous for an actual existing branch.** [reloadWeapon](module/documents/item.mjs:459) can eject a loaded clip, select an empty reserve, commit updates, and post “reloaded with 0 rounds.”
   **Fix:** Specify whether ejection merits handling audio; for a successful-loading sound, require `take > 0` after the updates succeed.

10. **Missing-file silence requires asynchronous error handling.** Foundry’s `AudioHelper.play` returns `game.audio.play(...)`, which awaits loading; the current helper does not await that promise, so its surrounding `try/catch` cannot catch a rejected load. Broadcast also happens before local loading.
    **Fix:** Validate bundled keys against an asset manifest and catch playback rejection inside the fire-and-forget sound helper.

11. **The tests omit the failure modes that establish the feature’s central guarantee.** A stub asserting only `src` cannot verify broadcast count, channel, receiver behavior, cancellation, or duplicate clients.
    **Fix:** Add refusal/cancellation, depleted bursts, zero-round reload, smoke, failed/repeated/concurrent blast launch, Karma/rerender, and off-with-override cases; verify `channel: "environment"` and broadcast arguments, plus a real two-client playback check.

Foundry’s basic audio choice is correct: [AudioHelper.play](</Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/public/scripts/foundry.mjs:121835>) broadcasts once and plays locally; its socket listener calls playback with `false`, preventing rebroadcast loops. Direct attack/spell call sites also avoid ordinary Karma and rerender duplication—keep playback out of shared roll and render hooks. Grenades require explicit coverage because they follow the ranged branch despite being thrown.

VERDICT: REVISE
### Claude's response
Accepted all 11. Biggest change: playback moves off the acting client's broadcast and onto the chat message each action already creates (flags.sr2e.sfx, played by a createChatMessage hook on every client, locally, environment channel, visible messages only). That settles 5 (one outcome message = one sound per client; a double resolution is the existing bug, not sound's to hide), 6 (stamp only on a successfully created outcome, both smoke and damage branches), and the Karma/rerender duplication. 1-2: cadence from rounds actually fired, independent of class, with a class→family→type fallback chain over a shipped manifest (10). 3: world switch first. 4: overrides only for their old kinds; TMFX separate. 7: per-event classifier functions; no gas type exists, dropped. 8: reuse the attack path's skill normalisation. 9: reload sound only when take > 0 after commit. 11: tests expanded as listed.

## Round 2 — Codex
The revision fixes several earlier issues, but the new chat-message approach needs more precise integration points.

1. **“The attack/spell card” is not a unique message.** Attacks create a success-test message plus melee, blast-launch, spread-launch, barrier, or damage cards. Spells create casting and drain tests, sometimes multiple target cards, and sometimes no successful-effect card. Tagging downstream cards risks missing sounds or playing once per target. See [actor.mjs:505](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:505) and [item.mjs:1303](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1303).  
   **Fix:** Pass `flags.sr2e.sfx` through the existing `rollSuccessTest(options.flags)` on the initial attack/casting test only; leave downstream cards untagged except blast outcomes and reloads.

2. **Foundry’s `message.visible` does not protect whispered rolls.** It explicitly returns `true` for whispered roll messages; `isContentVisible` applies recipient and blind-roll restrictions. The proposed “visible message” check can leak private attack/casting activity. See [foundry.mjs:42933](</Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/public/scripts/foundry.mjs:42933>).  
   **Fix:** Require `message.isContentVisible`, and test whispered rolls and blind rolls, including the blind roll’s author.

3. **The fallback API loses information it later needs.** `weaponClass` returns only a class; `attackSound` receives only class and rounds; `resolveSound` nevertheless promises a fallback using the original `weaponType`. The listed assets also omit an explicit generic `heavy` fallback and generic firearm single shot, leaving unmatched weapons potentially silent.  
   **Fix:** Preserve `weaponType` through resolution and explicitly ship—or map to—generic single/burst/auto keys for both firearm and heavy weapons.

4. **Legacy override eligibility is still too broad.** “Ranged attack” includes bows and grenades in this implementation, whereas the existing gunshot override applies only to `firearm`/`heavy`. A sound key alone does not reliably preserve that eligibility.  
   **Fix:** Store explicit override eligibility with the event, restricted to firearm/heavy attacks and spell casts; apply manifest validation only to bundled assets, not custom override paths.

5. **Cancelled point-aim silence remains contradictory.** Deferred aiming occurs in `launchFromCard` *after* the attack roll and launcher card exist. With attack audio attached to that earlier message, cancelling the later point picker cannot mean “no attack sound.”  
   **Fix:** Specify that cancelling deferred blast placement suppresses only the blast sound; distinguish it from cancellation before the attack roll in the tests and risk statement.

6. **The test matrix still misses the new integration hazards.** It does not explicitly cover barrier-terminal attacks, spread launchers, grenade throws, failed casts, or multi-target spells—the paths most likely to produce zero or multiple tagged messages.  
   **Fix:** Assert exactly one initial attack/cast sound across those branches, no sound from drain/resistance/target cards, and a separate blast sound only after successful resolution.

The local `createChatMessage` playback approach is workable. Deferring the existing concurrent blast-resolution bug is also reasonable, but describe the guarantee as **one sound per created outcome**, not one per action. No files were modified.

VERDICT: REVISE
### Claude's response
Accepted all six: only the initial success test of an action is tagged (via rollSuccessTest flags), downstream cards untagged except blast outcomes and reloads; isContentVisible instead of visible; weaponType kept through the fallback chain with generic firearm/heavy keys shipped; flags carry an explicit legacy-override eligibility; cancelled deferred placement keeps the throw sound and suppresses only the blast; test matrix expanded to barrier, spread, grenade, failed cast, multi-target, drain/resistance silence, blind/whisper. Guarantee restated as one sound per created outcome.

## Round 3 — Codex
The plan is sound enough to implement. Initial-test tagging, `isContentVisible`, local playback, and separate blast outcomes address the material integration problems. The expanded tests cover the important refusal, reroll, and multi-card paths.

Three minor corrections remain:

- **Generic heavy bursts lose cadence:** the manifest promises `heavy-single|auto`, so an unmatched heavy weapon firing 2–3 rounds falls back to a single shot. **Fix:** ship `heavy-burst` or map it to `firearm-burst`.
- **Asset count is understated:** the enumerated families, cadences, spells, and handling sounds exceed “about 20.” **Fix:** derive the count and size estimate from the finalized manifest.
- **Make removal of old playback explicit:** [integrations.mjs:143](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/integrations.mjs:143) still broadcasts override audio; retaining it alongside the new hook would double-play. **Fix:** remove that audio block while retaining TMFX, and test an enabled override produces exactly one local call with broadcast disabled.

Concurrent blast resolution remains an acknowledged existing limitation; the revised per-outcome guarantee accurately describes it. No files were modified.

VERDICT: APPROVED
### Claude's response
APPROVED. Applied the three notes: heavy-burst ships; the manifest is enumerated (34 files, ~1.2 MB); the old broadcast in playCombatFx is removed (TMFX kept) with a test that an override plays exactly once locally.
