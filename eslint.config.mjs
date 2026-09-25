import js from "@eslint/js";
import globals from "globals";

// Foundry VTT's runtime globals (and the optional modules we integrate with).
// Declared so `no-undef` flags only genuinely undefined names — the class of
// bug that broke spellcasting from 0.90.0 to 0.92.1 (`item` used where the
// parameter was `spell`).
const foundryGlobals = Object.fromEntries([
  "game", "CONFIG", "CONST", "foundry", "ui", "Hooks", "canvas", "PIXI", "Handlebars",
  "Actor", "Item", "ChatMessage", "Roll", "Combat", "Combatant", "ActiveEffect", "Scene",
  "Token", "TokenDocument", "Macro", "User", "Folder", "JournalEntry", "MeasuredTemplate",
  "Dialog", "FilePicker", "TextEditor",
  "fromUuid", "fromUuidSync", "loadTemplates",
  "quench", "TokenMagic"
].map(k => [k, "readonly"]));

export default [
  { ignores: ["node_modules/**", "packs/**", "**/_work/**", "dist/**"] },
  js.configs.recommended,
  {
    // System code runs in the browser inside Foundry.
    files: ["module/**/*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module",
      globals: { ...globals.browser, ...foundryGlobals } }
  },
  {
    // Tests (Vitest) and build tools run under Node.
    files: ["test/**/*.mjs", "tools/**/*.mjs", "*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node } }
  },
  {
    rules: {
      // A deliberately swallowed error is written `catch (e) {}` all over the
      // Quench suite and best-effort UI code.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Unused names are tidiness, not bugs: warn, and ignore unused
      // parameters and caught errors (Foundry's callback signatures).
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }]
    }
  }
];
