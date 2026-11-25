# Plan Review Log: impact projectiles

## Round 1 — Codex (gpt-6-sol, high; 1.34M in / 6.9k out)
- **Firing mode bypass:** [item.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:976) accepts `firingMode: "fa"` from a macro even for a throwing weapon, granting burst damage and recording a full-auto engagement after consuming one item. **Fix:** Validate firing mode by weapon type in `_rollWeaponAttack` and keep burst and full-auto state firearm/heavy only.
- **Range enforcement:** The new Strength brackets would set a dialog warning, but an ordinary thrown attack can still roll beyond Extreme range; [item.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:708) consumes the item without that check. **Fix:** Check measurable target distance against `throwingWeaponRange` before decrementing quantity.
- **Parry target identity:** The [ranged card state](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1518) stores a target actor UUID, but no target token or attack scene; an actor can have tokens on multiple scenes, so the proposed 3 m gate is ambiguous. **Fix:** Store the targeted token UUID and scene ID on the card and validate both live tokens against them.
- **Karma timing:** The proposed parry checks card successes, which can lag the source test while [dependent-card syncing](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:985) runs; a catch could use stale successes. **Fix:** Compare `testTotalSuccesses` from the live attack test with the parry snapshot before rolling and before posting a catch.

The other searched sheet, hotbar, companion, NPC, and chase entry points use the shared interactive roll flow; `(Str)L` resolves on the ranged path, and the card’s `armorType` reaches standard damage resistance.

VERDICT: REVISE
### Response
All 4 folded (Draft 2) without round 2: each is a concrete guard.

## Code review round 1 — Codex (gpt-6-sol, high; 843k in / 8.8k out)
## Findings

- [module/documents/item.mjs:627](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:627): Rigger 2 “area” dispatch runs before the thrown-weapon checks. Selecting it on a throwing knife launches an area attack without spending a knife. **Fix:** Allow that dispatch only for eligible area weapons.

- [module/documents/item.mjs:732](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:732): Quantity falls before later ranged-path refusals. A knife is lost when sensor gunnery then refuses an attack for lack of a lock. **Fix:** Complete validation before decrementing the stack.

- [module/documents/item.mjs:1107](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1107): `recoilPenalty` still counts prior shots when `hasRecoil` is false. After two gunshots in a phase, a thrown knife gets +2 TN; the rule function reproduces this. **Fix:** Set recoil modifier to zero for weapons without recoil.

- [module/documents/item.mjs:717](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:717): The range guard measures from the actor’s first active token, which need not be the token making the throw. With two linked tokens, a nearby first token can allow a throw from a second token beyond Extreme range. **Fix:** Capture and use the attacking token as the measurement origin.

- [module/documents/item.mjs:1431](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1431): Thrown items skip ammo spending but still apply loaded-ammo damage and armor effects; the net and explosive-round branches also inspect their ammo fields. A legacy throwing item with ammo metadata can hit as a net or gain bullet effects. **Fix:** Gate all loaded-ammo, net, and misfire handling on an ammo-using weapon type.

- [module/documents/item.mjs:1022](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:1022): Smartgun and accessory TN bonuses are accepted for throws. A world throwing item retaining `smartgunCompatible` gains its owner’s smartlink bonus. **Fix:** Restrict gun-specific bonuses by weapon type in both roll and dialog calculations.

- [module/adept-powers.mjs:266](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/adept-powers.mjs:266): The final resolution check and catch post are separate operations, while Resist uses no shared claim. On two clients, resistance can apply damage as parry posts “no damage.” **Fix:** Make parry and resistance acquire the same card-level claim before resolving.

- [module/documents/actor.mjs:1947](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/actor.mjs:1947): Existing world throwing knives disappear from melee defence choices. A character whose only knife is a `throwing` item must defend unarmed. **Fix:** Preserve a melee-defence option for existing throwing items or migrate dual-use items.

- [module/documents/item.mjs:997](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:997): Draft 2 says to force single-shot for every weapon without recoil, but the default and explicit `sa` survive. An ordinary thrown attack is labelled SA. **Fix:** Set `firingMode = "ss"` unconditionally for non-firearm and non-heavy weapons.

Syntax checks and `git diff --check` passed. The untracked Vitest file covers the pure range, armor, and parry-TN helpers; it does not exercise these attack and cross-client paths.

VERDICT: REVISE
### Response
7 fixed (area dispatch, no R2 gunnery for bows/thrown, no carried recoil, origin token, no ammo/net/explosive on throws, no smartgun on throws, single shot always). Rejected: the Parry-vs-Resist race (the same as Resist-vs-Resist today; a shared claim would need the target actor's permissions), and keeping throwing items in the melee defence (a thrown weapon is no melee weapon, p.96; changelog notes it).

## Code review round 2 — fix-only (gpt-6-sol, medium; 440k in / 2.6k out)
**Finding:** The throwing range fix uses a controlled token for the out-of-range check in [item.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/documents/item.mjs:718), but the attack dialog still measures from the actor’s first token in [sheet-actions.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/sheets/sheet-actions.mjs:586). If an actor has two tokens and the controlled token is farther from the target, a throw within Extreme range passes the new check yet rolls with the nearer token’s lower range TN. Both paths need the same origin.

I found no concrete failure in the other listed fixes. In particular, bows retain their tracked arrow check and expenditure, while the forced single-shot mode leaves their existing called-shot restriction and aim eligibility intact.

VERDICT: REVISE
### Response
Fixed: the dialog's range origin is the same controlled-first token. Folded without round 3.
