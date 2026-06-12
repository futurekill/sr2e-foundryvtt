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
import { SR2ECombat } from "./documents/combat.mjs";

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

// Migrations
import { migrateWorld } from "./migrations.mjs";

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
  // SR2ECombat implements multiple actions: each turn costs 10 Initiative,
  // and a new Combat Turn re-rolls everyone (SR2E p.78-79).
  CONFIG.Combat.documentClass = SR2ECombat;

  // Modern ActiveEffect behaviour: effects defined on owned items apply to
  // the actor directly (when transfer = true) without copying at creation.
  CONFIG.ActiveEffect.legacyTransferral = false;

  // Wound-level token markers, auto-applied from the condition monitors
  // (see the updateActor hook below)
  CONFIG.statusEffects.push(
    { id: "sr2e-wound-light",    name: "Light Wound",    img: "icons/svg/blood.svg" },
    { id: "sr2e-wound-moderate", name: "Moderate Wound", img: "icons/svg/downgrade.svg" },
    { id: "sr2e-wound-serious",  name: "Serious Wound",  img: "icons/svg/degen.svg" }
  );

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

  // Run any pending world migrations before anything else can re-save
  // documents (which would discard removed-field source data). GM only.
  if (game.user.isGM) {
    try { await migrateWorld(); }
    catch (err) { console.error("SR2E | World migration failed:", err); }
  }

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

  // Resolve via UUID so the macro also works for items on unlinked token
  // actors and survives the actor being renamed.
  const command = `
    const item = await fromUuid("${item.uuid}");
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
      flags: { sr2e: { itemMacro: true } }
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
  // Last system version this world's data was migrated to (hidden; used by
  // module/migrations.mjs to decide which migrations still need to run)
  game.settings.register("sr2e", "systemMigrationVersion", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  // Rule of Six toggle
  game.settings.register("sr2e", "ruleOfSix", {
    name: "SR2E.Settings.RuleOfSix",
    hint: "SR2E.Settings.RuleOfSixHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Automate Essence from Cyberware (read in CharacterData.prepareDerivedData)
  game.settings.register("sr2e", "autoEssence", {
    name: "SR2E.Settings.AutoEssence",
    hint: "SR2E.Settings.AutoEssenceHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
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
/*  Combat Hooks                                */
/* -------------------------------------------- */

/**
 * Recoil accumulates per combat phase (SR2E p.93). Clear every combatant's
 * recoil counter whenever the tracker advances to a new turn or round, so
 * shots fired in a previous phase no longer penalize the current one.
 * GM-gated: players lack permission to update other combatants' actors.
 */
async function _resetCombatRecoil(combat) {
  if (!game.user.isGM) return;
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (actor?.system?.combatRecoil > 0) {
      await actor.update({ "system.combatRecoil": 0 });
    }
  }
}

Hooks.on("combatTurn",  (combat) => _resetCombatRecoil(combat));
Hooks.on("combatRound", (combat) => _resetCombatRecoil(combat));

/* -------------------------------------------- */
/*  Wound Status Markers                        */
/* -------------------------------------------- */

const WOUND_STATUS_IDS = {
  Light:    "sr2e-wound-light",
  Moderate: "sr2e-wound-moderate",
  Serious:  "sr2e-wound-serious"
};

/**
 * Mirror an actor's wound level onto token status markers.
 * Characters/NPCs: Light/Moderate/Serious markers; "unconscious" when the
 * Stun monitor fills; "dead" overlay when the Physical monitor fills
 * (Deadly = unconscious and near death, SR2E p.112). Vehicles use the same
 * markers for their damage level, with "dead" when Destroyed.
 * Runs on the active GM's client only, so it works regardless of who
 * applied the damage.
 */
async function _syncWoundStatuses(actor) {
  let markerLevel = null;   // which of the three wound markers to show
  let unconscious = false;
  let dead = false;

  if (actor.type === "character" || actor.type === "npc") {
    const level = actor.system.woundLevel;
    markerLevel = WOUND_STATUS_IDS[level] ?? null;
    unconscious = (actor.system.conditionMonitor?.stun?.value ?? 0) >= 10;
    dead        = (actor.system.conditionMonitor?.physical?.value ?? 0) >= 10;
    if (dead) markerLevel = null;
  } else if (actor.type === "vehicle") {
    const level = actor.system.damageLevel;
    markerLevel = WOUND_STATUS_IDS[level] ?? null;
    dead = level === "Destroyed";
  } else {
    return;
  }

  for (const id of Object.values(WOUND_STATUS_IDS)) {
    const active = id === markerLevel;
    if (actor.statuses.has(id) !== active) {
      await actor.toggleStatusEffect(id, { active });
    }
  }
  if (actor.statuses.has("unconscious") !== unconscious) {
    await actor.toggleStatusEffect("unconscious", { active: unconscious });
  }
  if (actor.statuses.has("dead") !== dead) {
    await actor.toggleStatusEffect("dead", { active: dead, overlay: true });
  }
}

Hooks.on("updateActor", (actor, changes) => {
  if (!game.users.activeGM?.isSelf) return;
  if (!changes.system?.conditionMonitor) return;
  _syncWoundStatuses(actor);
});

/* -------------------------------------------- */
/*  Chat Message Hooks                          */
/* -------------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html, data) => {
  // V13: html is an HTMLElement (renderChatMessageHTML is the V13 hook)
  if (message.isRoll && html instanceof HTMLElement) {
    html.classList.add("sr2e-roll");
  }

  // Wire up "Resist Damage" buttons embedded in weapon attack chat cards.
  // The button carries data-power, data-level, data-armor-type, data-damage-type.
  // We resolve the defending actor from the currently controlled token (or assigned character).
  html.querySelectorAll?.(".sr2e-resist-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const power      = parseInt(btn.dataset.power)   || 0;
      const basePower  = parseInt(btn.dataset.basePower) || power;
      const level      = btn.dataset.level             || "M";
      const armorType  = btn.dataset.armorType         || "ballistic";
      const damageType = btn.dataset.damageType        || "physical";
      // Ammunition effects carried on the card (SR2E p.93–94)
      const armorCalc  = btn.dataset.armorCalc         || "standard";
      const armorMod   = parseInt(btn.dataset.armorMod) || 0;
      const ammoName   = btn.dataset.ammoName          || "";

      // Find the defending actor: first controlled token, then the user's assigned character.
      const actor = canvas.tokens?.controlled?.[0]?.actor ?? game.user?.character;
      if (!actor) {
        return ui.notifications.warn(
          "Select a token (or assign a character) to roll damage resistance."
        );
      }

      return actor.rollDamageResistance(power, level, armorType, damageType,
        { armorCalc, armorMod, ammoName, basePower });
    });
  });

  // Wire up Karma Pool buttons on success-test cards (reroll failures,
  // avoid disaster, buy success). The card state lives in flags.sr2e.test;
  // only owners of the rolling actor may spend its Karma.
  html.querySelectorAll?.(".sr2e-karma-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const state = message.getFlag("sr2e", "test");
      if (!state?.actorUuid) return;
      const actor = await fromUuid(state.actorUuid);
      if (!actor) return ui.notifications.warn("The rolling actor no longer exists.");
      if (!actor.isOwner) {
        return ui.notifications.warn("Only this character's owner can spend their Karma Pool.");
      }
      return actor.applyKarmaToTest(message, btn.dataset.karmaAction);
    });
  });
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
