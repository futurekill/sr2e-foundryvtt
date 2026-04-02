/**
 * Shadowrun 2nd Edition Game System for Foundry Virtual Tabletop (V13)
 * Based on Shadowrun Second Edition (FASA 7901)
 *
 * @module sr2e
 */

// Configuration
import { SR2E } from "./config.mjs";

// Data Models
import * as dataModels from "./data/_index.mjs";

// Document Classes
import * as documents from "./documents/_index.mjs";
import { SR2ECombatant } from "./documents/combatant.mjs";

// Sheets
import {
  SR2ECharacterSheet,
  SR2ENPCSheet,
  SR2EVehicleSheet,
  SR2ESpiritSheet,
  SR2EICSheet
} from "./sheets/actor-sheet.mjs";
import { SR2EItemSheet } from "./sheets/item-sheet.mjs";

// Helpers
import { preloadTemplates } from "./helpers/templates.mjs";
import { registerHandlebarsHelpers } from "./helpers/handlebars.mjs";

// Dice
import { SR2ESuccessRoll } from "./dice/sr2e-roll.mjs";

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", async () => {

  // Store configuration on the global CONFIG object
  CONFIG.SR2E = SR2E;

  // Register custom Document classes
  CONFIG.Actor.documentClass = documents.SR2EActor;
  CONFIG.Item.documentClass = documents.SR2EItem;
  // SR2ECombatant ensures getInitiativeRoll() on the Actor is always called
  // from the combat tracker, so GM-side initiative rolls produce Reaction + Nd6.
  CONFIG.Combatant.documentClass = SR2ECombatant;

  // Register TypeDataModels for Actor types
  CONFIG.Actor.dataModels = {
    character: dataModels.CharacterData,
    npc: dataModels.NPCData,
    vehicle: dataModels.VehicleData,
    spirit: dataModels.SpiritData,
    ic: dataModels.ICData
  };

  // Register TypeDataModels for Item types
  CONFIG.Item.dataModels = {
    skill: dataModels.SkillData,
    weapon: dataModels.WeaponData,
    armor: dataModels.ArmorData,
    spell: dataModels.SpellData,
    cyberware: dataModels.CyberwareData,
    gear: dataModels.GearData,
    program: dataModels.ProgramData,
    adept_power: dataModels.AdeptPowerData,
    contact: dataModels.ContactData,
    lifestyle: dataModels.LifestyleData,
    ammo: dataModels.AmmoData,
    focus: dataModels.FocusData,
    vehicle_mod: dataModels.VehicleModData,
    race:      dataModels.RaceData,
    tradition: dataModels.TraditionData
  };

  // Register custom Roll class
  CONFIG.Dice.rolls.push(SR2ESuccessRoll);

  // ---------------------------------------------------------------------------
  // Register Actor Sheets
  // V13: DocumentSheetConfig moved to foundry.applications.apps namespace.
  // ---------------------------------------------------------------------------

  // Shim: prefer the namespaced V13 location, fall back to legacy global for V12.
  const SheetConfig = foundry.applications?.apps?.DocumentSheetConfig ?? globalThis.DocumentSheetConfig;

  SheetConfig.registerSheet(Actor, "sr2e", SR2ECharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "SR2E.Sheets.Character"
  });

  SheetConfig.registerSheet(Actor, "sr2e", SR2ENPCSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "SR2E.Sheets.NPC"
  });

  SheetConfig.registerSheet(Actor, "sr2e", SR2EVehicleSheet, {
    types: ["vehicle"],
    makeDefault: true,
    label: "SR2E.Sheets.Vehicle"
  });

  SheetConfig.registerSheet(Actor, "sr2e", SR2ESpiritSheet, {
    types: ["spirit"],
    makeDefault: true,
    label: "SR2E.Sheets.Spirit"
  });

  SheetConfig.registerSheet(Actor, "sr2e", SR2EICSheet, {
    types: ["ic"],
    makeDefault: true,
    label: "SR2E.Sheets.IC"
  });

  // ---------------------------------------------------------------------------
  // Register Item Sheets (V13: DocumentSheetConfig avoids deprecated Items global)
  // ---------------------------------------------------------------------------

  SheetConfig.registerSheet(Item, "sr2e", SR2EItemSheet, {
    makeDefault: true,
    label: "SR2E.Sheets.Item"
  });

  // Register Handlebars helpers
  registerHandlebarsHelpers();

  // Preload Handlebars templates
  await preloadTemplates();

  // Register system settings
  _registerSystemSettings();

});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", async () => {

  // Display a welcome message on first load
  if (!game.user.getFlag("sr2e", "welcomeShown")) {
    ChatMessage.create({
      content: `
        <div class="sr2e-welcome">
          <h2>Welcome to Shadowrun 2nd Edition</h2>
          <p>The year is 2053. Magic has returned, the Matrix connects all, and the
          megacorporations rule. Welcome to the shadows, chummer.</p>
          <p><em>System Version: ${game.system.version}</em></p>
        </div>
      `,
      whisper: [game.user.id]
    });
    game.user.setFlag("sr2e", "welcomeShown", true);
  }

  // Auto-create GM utility macros (idempotent — skip if already present)
  if (game.user.isGM) {
    await _ensureSystemMacros();
  }
});

/**
 * Create SR2E system macros for the GM if they don't already exist.
 * @private
 */
async function _ensureSystemMacros() {
  const MACROS = [
    {
      name: "Award Karma",
      img: "icons/svg/aura.svg",
      src: "systems/sr2e/macros/award-karma.js"
    }
  ];

  for (const def of MACROS) {
    // Skip if a macro with this name already exists
    if (game.macros.find(m => m.name === def.name && m.flags?.["sr2e"]?.systemMacro)) continue;
    try {
      const response = await fetch(def.src);
      const command = await response.text();
      await Macro.create({
        name: def.name,
        type: "script",
        img: def.img,
        command,
        flags: { "sr2e": { systemMacro: true } }
      });
    } catch(err) {
      console.warn(`SR2E | Could not create macro "${def.name}":`, err);
    }
  }
}

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

Hooks.once("ready", () => {
  // Allow item macros on the hotbar
  Hooks.on("hotbarDrop", (bar, data, slot) => {
    if (data.type === "Item") {
      _createItemMacro(data, slot);
      return false;
    }
  });
});

/**
 * Create a macro from an Item drop on the hotbar.
 * @param {object} data - The dropped data
 * @param {number} slot - The hotbar slot
 * @returns {Promise}
 * @private
 */
async function _createItemMacro(data, slot) {
  const item = await fromUuid(data.uuid);
  if (!item) return;

  const command = `
    const actor = game.actors.get("${item.parent?.id}");
    if (!actor) return ui.notifications.warn("Cannot find the actor for this macro.");
    const item = actor.items.get("${item.id}");
    if (!item) return ui.notifications.warn("Cannot find the item for this macro.");
    item.roll();
  `;

  let macro = game.macros.find(m => m.name === item.name && m.command === command);
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command,
      flags: { "sr2e.itemMacro": true }
    });
  }

  game.user.assignHotbarMacro(macro, slot);
}

/* -------------------------------------------- */
/*  System Settings                             */
/* -------------------------------------------- */

/**
 * Register system settings.
 * @private
 */
function _registerSystemSettings() {
  // Rule of Six toggle
  game.settings.register("sr2e", "ruleOfSix", {
    name: "SR2E.Settings.RuleOfSix",
    hint: "SR2E.Settings.RuleOfSixHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Optional More Metahumans rule
  game.settings.register("sr2e", "moreMetahumans", {
    name: "SR2E.Settings.MoreMetahumans",
    hint: "SR2E.Settings.MoreMetahumansHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // Initiative style
  game.settings.register("sr2e", "initiativeStyle", {
    name: "SR2E.Settings.InitiativeStyle",
    hint: "SR2E.Settings.InitiativeStyleHint",
    scope: "world",
    config: true,
    type: String,
    default: "standard",
    choices: {
      standard: "SR2E.Settings.InitStandard",
      cinematic: "SR2E.Settings.InitCinematic"
    }
  });

  // Automate Essence from Cyberware
  game.settings.register("sr2e", "autoEssence", {
    name: "SR2E.Settings.AutoEssence",
    hint: "SR2E.Settings.AutoEssenceHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Condition Monitor variant
  game.settings.register("sr2e", "conditionMonitorBoxes", {
    name: "SR2E.Settings.ConditionMonitorBoxes",
    hint: "SR2E.Settings.ConditionMonitorBoxesHint",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
    range: {
      min: 8,
      max: 14,
      step: 1
    }
  });

  game.settings.register("sr2e", "confirmDelete", {
    name: "Confirm Item Deletion",
    hint: "Show a confirmation dialog before deleting items from character sheets. Disable to delete instantly.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register("sr2e", "terminalTheme", {
    name: "Shadownet Terminal Theme",
    hint: "Apply a retro green-phosphor terminal skin to the sidebar and chat. Each player can set this independently.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: value => {
      document.body.classList.toggle("sr2e-terminal-theme", value);
    }
  });
}

/* -------------------------------------------- */
/*  Chat Message Hooks                          */
/* -------------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html, data) => {
  // V13: html is an HTMLElement (renderChatMessageHTML is the V13 hook)
  if (message.isRoll && html instanceof HTMLElement) {
    html.classList.add("sr2e-roll");
  }
});

/* -------------------------------------------- */
/*  No-active-scene background                  */
/* -------------------------------------------- */

/**
 * Toggle the CSS class that shows the Seattle map when no scene is active.
 * Called on initial load and whenever a scene's active state changes.
 */
function _applyNoSceneBackground() {
  const hasActive = !!game.scenes?.active;
  document.body.classList.toggle("sr2e-no-active-scene", !hasActive);
}

// Apply terminal theme class on initial load
Hooks.on("ready", () => {
  const enabled = game.settings.get("sr2e", "terminalTheme");
  document.body.classList.toggle("sr2e-terminal-theme", enabled);
});

// Apply on initial load
Hooks.on("ready", _applyNoSceneBackground);

// Re-apply whenever the canvas finishes drawing (scene activated or first load)
Hooks.on("canvasReady", _applyNoSceneBackground);

// Re-apply when a scene document is updated (active flag toggled on/off)
Hooks.on("updateScene", (_scene, change) => {
  if (Object.hasOwn(change, "active")) _applyNoSceneBackground();
});
