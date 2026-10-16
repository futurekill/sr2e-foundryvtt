/**
 * Combat sounds (docs/PLAN-combat-sounds.md). An action's sound rides on the ONE chat
 * message it creates (`flags.sr2e.sfx = {key, legacy}`), and every client plays it
 * once, locally, when that message is created. One message, one sound per client:
 * a Karma reroll updates the card instead of creating one, re-renders never fire the
 * hook, and a whispered or blind roll stays silent for anyone who can't see it.
 */
import { SFX_KEYS } from "./sfx-manifest.mjs";

globalThis.Hooks?.once("init", () => {
  game.settings.register("sr2e", "combatSounds", {
    name: "Combat sounds",
    hint: "Play a short sound for attacks, spells, blasts, reloads and empty guns (each player's Environment volume controls how loud).",
    scope: "world", config: true, type: Boolean, default: true
  });
});

/** The message flag that makes a message play `key`. `legacy` ("gunshot" | "spell") lets the old override settings apply. */
export function sfxFlags(key, legacy = null) {
  return key ? { sr2e: { sfx: { key, legacy } } } : {};
}

/** Play a sound on THIS client only. Never throws; a missing or failed file is silent. */
export function playSfx({ key, legacy = null } = {}) {
  try {
    if (!game.settings.get("sr2e", "combatSounds")) return;
    const override = legacy === "gunshot" ? game.settings.get("sr2e", "fxSoundGunshot")
      : legacy === "spell" ? game.settings.get("sr2e", "fxSoundSpell") : "";
    const src = override || (SFX_KEYS.has(key) ? `systems/sr2e/assets/sfx/${key}.mp3` : null);
    if (!src) return;
    Promise.resolve(foundry.audio.AudioHelper.play({ src, volume: 0.8, channel: "environment" }, false))
      .catch(err => console.warn("SR2E | combat sound failed (non-fatal):", err));
  } catch (err) {
    console.warn("SR2E | combat sound failed (non-fatal):", err);
  }
}

globalThis.Hooks?.on("createChatMessage", (message) => {
  const sfx = message.getFlag?.("sr2e", "sfx");
  if (sfx?.key && message.isContentVisible) playSfx(sfx);
});
