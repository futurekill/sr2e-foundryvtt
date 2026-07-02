/**
 * Optional third-party module integrations (all no-ops when the module is
 * absent or disabled):
 *
 *  - Dice So Nice: registers SR2E dice colorsets (chrome + matrix neon).
 *  - Token Magic FX: plays a brief visual effect on attack / spellcast,
 *    plus an optional sound (asset paths are world settings — the system
 *    ships no audio).
 */

/* ── Dice So Nice ─────────────────────────────────────────────────────────── */

globalThis.Hooks?.once("diceSoNiceReady", (dice3d) => {
  dice3d.addColorset({
    name: "sr2e-matrix",
    description: "SR2E — Matrix Neon",
    category: "Shadowrun 2E",
    foreground: "#39ff14",
    background: "#050805",
    outline: "#0a2a0a",
    edge: "#1c7c1c",
    material: "metal",
    fontScale: { d6: 1.1 }
  }, "default");

  dice3d.addColorset({
    name: "sr2e-chrome",
    description: "SR2E — Street Chrome",
    category: "Shadowrun 2E",
    foreground: "#e8e8f0",
    background: "#3a3a44",
    outline: "#101014",
    edge: "#8888a0",
    material: "chrome"
  }, "default");
});

/* ── Token Magic FX ───────────────────────────────────────────────────────── */

globalThis.Hooks?.once("init", () => {
  game.settings.register("sr2e", "combatFx", {
    name: "Combat FX (Token Magic FX)",
    hint: "Play a brief Token Magic FX visual on the target when attacks and spells are rolled. Requires the Token Magic FX module.",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register("sr2e", "fxPresetGunshot", {
    name: "FX preset: ranged attack",
    hint: "Token Magic FX preset applied to the target of a ranged attack.",
    scope: "world", config: true, type: String, default: "shockwave"
  });
  game.settings.register("sr2e", "fxPresetSpell", {
    name: "FX preset: spellcast",
    hint: "Token Magic FX preset applied to the targets of a combat spell.",
    scope: "world", config: true, type: String, default: "electric"
  });
  game.settings.register("sr2e", "fxSoundGunshot", {
    name: "Sound: ranged attack",
    hint: "Audio file path played on ranged attacks (empty = none).",
    scope: "world", config: true, type: String, default: "", filePicker: "audio"
  });
  game.settings.register("sr2e", "fxSoundSpell", {
    name: "Sound: spellcast",
    hint: "Audio file path played on spellcasts (empty = none).",
    scope: "world", config: true, type: String, default: "", filePicker: "audio"
  });
});

/**
 * Play combat FX for an attack or spell: a short-lived Token Magic FX preset
 * on each target token, plus the configured sound. Silently does nothing
 * when TMFX is missing, the preset name is unknown, or the client toggle is
 * off. Fire-and-forget — never blocks the roll.
 *
 * @param {"gunshot"|"spell"} kind
 * @param {Token[]} targets - Target tokens (canvas placeables).
 */
export async function playCombatFx(kind, targets = []) {
  try {
    if (!game.settings.get("sr2e", "combatFx")) return;

    // Sound (independent of TMFX)
    const soundKey = kind === "spell" ? "fxSoundSpell" : "fxSoundGunshot";
    const src = game.settings.get("sr2e", soundKey);
    if (src) foundry.audio.AudioHelper.play({ src, volume: 0.6 }, true);

    // Visual (needs Token Magic FX)
    if (!game.modules.get("tokenmagic")?.active || !globalThis.TokenMagic) return;
    const presetKey = kind === "spell" ? "fxPresetSpell" : "fxPresetGunshot";
    const presetName = game.settings.get("sr2e", presetKey);
    if (!presetName) return;
    const preset = TokenMagic.getPreset(presetName);
    if (!preset) return;

    for (const token of targets) {
      if (!token?.document) continue;
      await TokenMagic.addUpdateFilters(token, preset);
      // Remove just this preset's filters after a short flash
      setTimeout(() => TokenMagic.deleteFilters(token, presetName).catch(() => {}), 1500);
    }
  } catch (err) {
    console.warn("SR2E | combat FX failed (non-fatal):", err);
  }
}
