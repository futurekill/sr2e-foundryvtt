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

globalThis.Hooks?.once("diceSoNiceReady", async (dice3d) => {
  // Textures must be registered BEFORE the colorsets that name them, or the
  // colorset resolves `texture` against a list that does not contain it yet.
  // addTexture returns a promise (it loads the image), so these are awaited.
  //
  // Shape verified against Dice So Nice 5.3.4 (api.js `addTexture(id, spec)`):
  // `composite` is a canvas globalCompositeOperation applied over the colorset
  // background, `source` a colour map, `bump` a grayscale height map. With no
  // `atlas` key, source/bump are plain file paths.
  //
  // Textures are 512x512 (DSN's own are 256, but those are atlas-packed) and
  // the bumps are derived from the colour maps by tools/make-dice-bumps.mjs.
  const TEX = "systems/sr2e/assets/dice_textures";
  const texture = async (id, name, file, material) => dice3d.addTexture(id, {
    name,
    composite: "multiply",
    source: `${TEX}/${file}.webp`,
    bump: `${TEX}/${file}.bump.webp`,
    ...(material ? { material } : {})
  });

  await Promise.all([
    texture("sr2e-gunmetal",    "SR2E — Riveted Plate",  "sr2e-gunmetal",    "metal"),
    texture("sr2e-orichalcum",  "SR2E — Orichalcum",     "sr2e-orichalcum",  "stone"),
    texture("sr2e-matrixgrid",  "SR2E — Matrix Grid",    "sr2e-matrixgrid",  "metal"),
    texture("sr2e-streetgrime", "SR2E — Street Grime",   "sr2e-streetgrime", "metal"),
    texture("sr2e-datajack",    "SR2E — Datajack",       "sr2e-datajack",    "metal"),
    texture("sr2e-bloodslick",  "SR2E — Blood on Tar",   "sr2e-bloodslick",  "glass")
  ]);

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

  // One colorset per texture. `foreground` is the NUMERAL colour — DSN draws the
  // numbers itself, which is why the textures contain none — so each is picked
  // to survive against its own texture rather than to look good in isolation.
  const set = (name, description, texture, foreground, background, edge, outline, material) =>
    dice3d.addColorset({ name, description, category: "Shadowrun 2E",
                         foreground, background, outline, edge, texture, material }, "default");

  // Pale numerals sit on the bright panel crowns; the seams stay dark.
  set("sr2e-plate", "SR2E — Riveted Plate", "sr2e-gunmetal",
      "#f2f5f8", "#5a6472", "#12161c", "#9aa7b8", "metal");

  // Near-white rather than gold: gold numerals disappear into the veins.
  set("sr2e-orichalcum", "SR2E — Orichalcum", "sr2e-orichalcum",
      "#fff4d6", "#1a1410", "#000000", "#ffb020", "stone");

  // Matches the existing sr2e-matrix palette, now with the grid under it.
  set("sr2e-matrixgrid", "SR2E — Matrix Grid", "sr2e-matrixgrid",
      "#c9ffc0", "#050805", "#0a2a0a", "#39ff14", "metal");

  set("sr2e-streetgrime", "SR2E — Street Grime", "sr2e-streetgrime",
      "#ffffff", "#6b6660", "#1a1512", "#b87333", "metal");

  // Amber numerals read as another indicator on the board.
  set("sr2e-datajack", "SR2E — Datajack", "sr2e-datajack",
      "#ffc046", "#0d0d0f", "#000000", "#b87333", "metal");

  // Bone white against the red; anything warm vanishes into the blood.
  set("sr2e-bloodslick", "SR2E — Blood on Tar", "sr2e-bloodslick",
      "#f0ece4", "#0a0a0a", "#000000", "#8b0f14", "glass");
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
