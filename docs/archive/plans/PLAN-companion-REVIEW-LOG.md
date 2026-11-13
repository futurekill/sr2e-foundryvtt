# Plan Review Log: mobile companion mode
Started 2026-10-02. MAX_ROUNDS=5.

## 2026-10-02 — Codex unavailable; assumptions probed by hand
Codex returned nothing: usage limit until Oct 3, 4:34 PM. The review loop has NOT run. Meanwhile,
checked live (local world, sr2e 0.102.1):
- With `core.noCanvas` on, the system reaches `game.ready` with no canvas-related errors.
- `canvas.ready` is false, there are no placeables, and `game.user.targets` is empty.
- An attribute roll works and posts its card.
- `game.user.broadcastActivity({targets})` does not throw without a canvas (not yet checked that
  another client draws the reticle).
- A 375×812 touch client logs in; the resolution check is only a banner.
Not yet checked: every SHARED_ACTIONS handler with a non-sheet `this`; hosting `ui.chat`.

## Code review (stages 1–4), Codex, 2026-10-04
Reviewed **8720ea5..112c514**; all line numbers refer to `112c514`. No files modified. Checked Foundry v13.351 source and reproduced the suppression-window and reload-guard failures with in-memory probes.

1. **P1 — Target records can permanently diverge between devices.**  
   `module/targeting.mjs:58–60,95–98`; `module/rules/companion-rules.mjs:76–80`  
   `Date.now()` is not a shared ordering mechanism. If the desktop clock is ahead, subsequent phone selections update the User flag but are rejected by the desktop’s `lastSeq` check. Even with synchronized clocks, an older request arriving last overwrites the stored flag while the desktop rejects its application. Companion attacks read that flag; desktop attacks read the canvas targets, so they attack different opponents.  
   **Fix:** Make all clients follow authoritative document-update ordering, or enforce revisions at the write authority rather than rejecting records only after persistence.

2. **P2 — A pending desktop debounce can overwrite a newer phone selection.**  
   `module/targeting.mjs:69–74,78–88`  
   A desktop target change schedules a write. Before its timer fires, the phone selects targets on another scene. `applyToCanvas` clears the desktop targets, but neither cancels the pending timer nor prevents its callback from writing. The callback then replaces the phone’s selection with the desktop scene and an empty target list.  
   **Fix:** Cancel pending canvas writes when accepting a remote record, and invalidate callbacks belonging to an earlier target generation.

3. **P2 — Genuine desktop clicks are discarded during the suppression window.**  
   `module/targeting.mjs:67,88`  
   Within 200 ms after a phone update—or `canvasReady` restoration—the player changes a desktop target. The canvas changes, but `applying` suppresses its hook without scheduling reconciliation. The phone retains the previous selection indefinitely. A probe produced canvas targets `[a,b]`, flag targets `[a]`, and zero writes. Foundry’s target hooks are synchronous, so this delayed guard is unnecessary.  
   **Fix:** Restore the guard synchronously in `finally`, preserving any enclosing guard state.

4. **P2 — Shotgun spread attacks spend resources with incorrect geometry and lose their endpoints.**  
   `module/documents/item.mjs:839–845,1004,1210`; `module/sheets/sheet-actions.mjs:1617`  
   A companion user fires shot rounds at a selected target. The canvas-only initialization leaves distance at zero and both spread tokens null. The attack uses the wrong spread modifier, spends ammo, and posts a launcher with empty shooter/target UUIDs. On the GM’s map, resolution falls back to the GM’s controlled and targeted tokens, potentially resolving the wrong participants or refusing after expenditure. The Stage 4 check only covers blast weapons.  
   **Fix:** Derive spread distance and endpoint UUIDs from TokenDocuments, or refuse spread attacks before spending resources when no canvas exists.

5. **P2 — The URL override prevents leaving companion mode.**  
   `module/companion/boot.mjs:32–34,47–50`  
   Enter through `?companion=1`, then select “Open full Foundry on this device.” The button stores `"off"` and reloads the same URL; `decide()` immediately stores `"on"` again. The exit button cannot work.  
   **Fix:** Consume and remove the query parameter before subsequent reloads.

6. **P2 — The reload guard can leave full Foundry permanently without its canvas.**  
   `module/rules/companion-rules.mjs:51`; `module/companion/boot.mjs:94–99`  
   Automatic companion entry sets `noCanvas=true` and the session reload marker. Enlarge the viewport beyond the threshold and reload the same tab, or navigate to `?companion=0`. Desktop mode is selected, but the existing marker makes `canvasPlan` forget the saved value without restoring it. The restoration information is then deleted.  
   **Fix:** Scope the guard to the requested transition and retain the remembered setting until restoration succeeds.

7. **P2 — Rapid target-picker taps lose selections.**  
   `module/companion/app.mjs:45–50`  
   Tap A, then B before A’s User update returns. Both handlers read the same old flag, producing independent replacement lists `[A]` and `[B]`; the final record contains only one selection. Double-tapping A can likewise select it twice instead of toggling it off.  
   **Fix:** Serialize picker mutations and read the latest target state inside the queue.

VERDICT: ISSUES
### Claude's response
All seven accepted and fixed (with the phone-join work):
1. Clock ordering removed. Every map applies the stored record on each updateUser, own echoes included, changing only what differs; the server's delivery order decides. shouldApplyTargets and seq dropped.
2. applyToCanvas cancels a pending map write.
3. The `applying` guard is restored synchronously in finally (setTarget fires targetToken synchronously).
4. Shot spread: the checkbox isn't offered without a canvas, and rollWeaponInteractive refuses it before any ammo is spent.
5. Already fixed today: boot strips ?companion= after applying it.
6. The reload marker records its direction ("on"/"off"); a failed restore keeps the remembered noCanvas value for a fresh tab.
7. Picker taps go through updateSharedTargets, a queue that reads the stored record per step.
Quench "shared targets follow the server's order" covers 1, 2/3 and 7.
