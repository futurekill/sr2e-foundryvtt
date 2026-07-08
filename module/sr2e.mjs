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
  SR2EICSheet,
  SR2EHostSheet
} from "./sheets/actor-sheet.mjs";
import { SR2EItemSheet } from "./sheets/item-sheet.mjs";

// Helpers
import { preloadTemplates } from "./helpers/templates.mjs";
import { registerHandlebarsHelpers } from "./helpers/handlebars.mjs";

// Migrations
import { migrateWorld, UNARMED_STRIKE_DATA } from "./migrations.mjs";
import "./integrations.mjs";  // Dice So Nice + Token Magic FX (optional)
import "./banter.mjs";        // Shadowtalk banter on chat cards + sheet header
import { blastFalloffRate, blastPowerAtRange, blastRadius, netToSteps, scatterProfile, scatterDistance, shotgunSpread } from "./rules/sr2e-rules.mjs";
import { registerSR2EQuenchTests } from "./quench/sr2e-quench.mjs";

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", async () => {

  // Register in-Foundry integration tests (no-op unless the Quench module is on).
  registerSR2EQuenchTests();

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
    ic: dataModels.ICData,
    host: dataModels.HostData
  };

  // Token resource bars: curate the bar-attribute dropdown to the condition
  // monitors so a GM can pick Physical/Stun cleanly in token config. (The
  // DEFAULT bars are already set by system.json primaryTokenAttribute/
  // secondaryTokenAttribute.) The monitor stores damage taken (value rises 0→max
  // as the SR "boxes" fill in), so a bar fills toward incapacitation — matching
  // the paper sheet — and is draggable to apply damage.
  const monitorBars = { bar: ["conditionMonitor.physical", "conditionMonitor.stun"], value: [] };
  CONFIG.Actor.trackableAttributes = {
    character: monitorBars,
    npc: monitorBars,
    spirit: monitorBars
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
    tradition: dataModels.TraditionData,
    quality:   dataModels.QualityData
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

  SheetConfig.registerSheet(Actor, "sr2e", SR2EHostSheet, {
    types: ["host"],
    makeDefault: true,
    label: "SR2E.Sheets.Host"
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

  // Team Karma Pool: players can't write world settings, so they emit a socket
  // request and the active GM applies the change to the shared total. (p.246)
  game.socket.on("system.sr2e", _onSocketMessage);

  // Run any pending world migrations before anything else can re-save
  // documents (which would discard removed-field source data). GM only.
  if (game.user.isGM) {
    try { await migrateWorld(); }
    catch (err) { console.error("SR2E | World migration failed:", err); }
  }

  // IC that defend a Host derive their Security Code + alert live from it, but
  // at world load the IC may be prepared before its host exists in the
  // collection (so the live lookup returned nothing). Re-prepare linked IC now
  // that every actor is constructed and resolvable.
  for (const ic of game.actors) {
    if (ic.type === "ic" && ic.system.hostUuid) {
      ic.prepareData();
      ic.sheet?.rendered && ic.sheet.render(false);
    }
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
 * Apply a change to the shared Team Karma Pool world setting, clamped at 0.
 * Only the active GM may write a world setting, so non-GM callers route through
 * the socket (see SR2E.changeTeamKarma).
 * @param {number} delta - points to add (negative to draw)
 * @private
 */
async function _applyTeamKarmaDelta(delta) {
  const current = game.settings.get("sr2e", "teamKarma") ?? 0;
  await game.settings.set("sr2e", "teamKarma", Math.max(0, current + delta));
}

/**
 * Socket listener. The active GM applies Team Karma changes requested by players.
 * @private
 */
function _onSocketMessage(data) {
  if (data?.type !== "teamKarmaDelta") return;
  // Exactly one client (the designated active GM) performs the write.
  if (game.user !== game.users.activeGM) return;
  _applyTeamKarmaDelta(data.delta);
}

/**
 * Request a Team Karma Pool change. GMs apply it directly; players emit a socket
 * request for the active GM to apply. Returns false if no GM is available.
 * @param {number} delta
 * @returns {boolean} whether the request was applied/dispatched
 */
SR2E.changeTeamKarma = function changeTeamKarma(delta) {
  if (game.user.isGM) {
    _applyTeamKarmaDelta(delta);
    return true;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn("No GM is connected to update the Team Karma Pool.");
    return false;
  }
  game.socket.emit("system.sr2e", { type: "teamKarmaDelta", delta, userId: game.user.id });
  return true;
};

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
    },
    {
      name: "Award Nuyen",
      img: "icons/svg/coins.svg",
      src: "systems/sr2e/macros/award-nuyen.js"
    },
    {
      name: "Refresh Karma Pool",
      img: "icons/svg/regen.svg",
      src: "systems/sr2e/macros/refresh-karma-pool.js"
    },
    {
      name: "Reset Condition Monitors",
      img: "icons/svg/heal.svg",
      src: "systems/sr2e/macros/reset-condition.js"
    },
    {
      name: "Request a Skill Roll",
      img: "icons/svg/d20.svg",
      src: "systems/sr2e/macros/request-roll.js"
    }
  ];

  for (const def of MACROS) {
    try {
      const response = await fetch(def.src);
      const command = await response.text();
      const existing = game.macros.find(m => m.name === def.name && m.flags?.["sr2e"]?.systemMacro);
      if (existing) {
        // Re-sync a system macro whose shipped file changed, so macro fixes
        // actually reach existing worlds. (Only touches system-flagged macros;
        // a GM who wants a custom version should duplicate under a new name.)
        if (existing.command !== command) await existing.update({ command, img: def.img });
        continue;
      }
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

  // Team Karma Pool (SR2E p.246): a shared pool of Karma Pool points the team
  // contributes to and draws from. World-scoped so it's shared; players change
  // it via socket (see _onSocketMessage). onChange re-renders open character
  // sheets so everyone sees the current total live.
  game.settings.register("sr2e", "teamKarma", {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: () => {
      // Re-render any open character sheets so everyone sees the new total.
      for (const actor of game.actors) {
        if (actor.type === "character" && actor.sheet?.rendered) actor.sheet.render(false);
      }
    }
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
  game.settings.register("sr2e", "smokeDarkness", {
    name: "Smoke drops a darkness light",
    hint: "When a smoke grenade/round resolves, also place a Foundry negative-light (darkness) source over the cloud so it dims vision in the lighting engine. The Visibility Table TN modifier is applied regardless. Off by default — verify it looks right on your scenes first. Cleared by 'Clear Blast Areas'.",
    scope: "world", config: true, type: Boolean, default: false
  });

  game.settings.register("sr2e", "syncPortraitToToken", {
    name: "Token image sets the portrait",
    hint: "When you set a character's prototype-token image, copy it to the sheet portrait too (unless you change the portrait in the same edit). Turn off to keep token and portrait art independent.",
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register("sr2e", "communalNuyen", {
    name: "Communal nuyen pot",
    hint: "Undivided remainder from Award Nuyen payouts. Paid back out by ticking 'include communal pot' on a future award.",
    scope: "world",
    config: true,
    type: Number,
    default: 0
  });

  game.settings.register("sr2e", "autoChargePurchases", {
    name: "Auto-charge purchases",
    hint: "When an item with a cost is dragged onto a character sheet, deduct its street price (cost × Street Index) from the character's nuyen. The gear tab's sell button refunds what was paid.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("sr2e", "autoEssence", {
    name: "SR2E.Settings.AutoEssence",
    hint: "SR2E.Settings.AutoEssenceHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  // Which Matrix ruleset the world uses. "core" = the SR2 core rulebook Matrix
  // (default, unchanged). "vr2" = Virtual Realities 2.0 Matrix 2.0 (ACIFS
  // subsystems, Detection Factor, Cybercombat TN table, staged dump shock,
  // tiered program prices). The VR2.0 path is built incrementally behind this
  // flag; see docs/AUDIT-VR2.md. Consumers read it with a try/catch, since data
  // prep can run before settings are registered (cf. autoEssence above).
  game.settings.register("sr2e", "matrixRuleset", {
    name: "Matrix ruleset",
    hint: "Which Matrix rules the table uses. Core Rulebook is the default. Virtual Realities 2.0 swaps in the VR2.0 Matrix 2.0 ruleset (in progress — see the changelog for what's wired up).",
    scope: "world",
    config: true,
    type: String,
    choices: { core: "Core Rulebook", vr2: "Virtual Realities 2.0" },
    default: "core"
  });

  // Play-area background shown when no scene is active
  game.settings.register("sr2e", "sceneBackground", {
    name: "Play Area Background",
    hint: "Image shown behind the interface when no scene is active. Scaled to cover the window — 1920×1080 or larger recommended (webp/jpg/png).",
    scope: "world",
    config: true,
    type: String,
    filePicker: "image",
    default: "systems/sr2e/assets/background.webp",
    onChange: () => _applyNoSceneBackground()
  });

  game.settings.register("sr2e", "confirmDelete", {
    name: "Confirm Item Deletion",
    hint: "Show a confirmation dialog before deleting items from character sheets. Disable to delete instantly.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register("sr2e", "theme", {
    name: "Interface Theme",
    hint: "Re-skin the SR2E sheets and chat. Default is the standard purple/cyan look; the others are flavour palettes. Each player sets this independently.",
    scope: "client",
    config: true,
    type: String,
    choices: {
      default:  "Default (Neon Noir)",
      terminal: "Shadownet Terminal (green phosphor)",
      chrome:   "Street Samurai (chrome & blood)",
      matrix:   "Decker (Matrix teal)",
      arcane:   "Mage (arcane violet)",
      rigger:   "Rigger (industrial amber)"
    },
    default: "default",
    onChange: value => applyTheme(value)
  });

  // Migrate the old boolean terminal-theme toggle: a client that had it on keeps
  // the green skin under the new dropdown. Registered hidden so the read works.
  game.settings.register("sr2e", "terminalTheme", {
    scope: "client", config: false, type: Boolean, default: false
  });
}

/** Theme body classes this system may apply (cleared before each switch). */
const SR2E_THEME_CLASSES = [
  "sr2e-theme-terminal", "sr2e-theme-chrome", "sr2e-theme-matrix",
  "sr2e-theme-arcane", "sr2e-theme-rigger", "sr2e-terminal-theme"
];

/**
 * Apply an interface theme by swapping a body class. Each theme (except the
 * default) is a CSS block that overrides the --sr2e-* palette variables; the
 * "terminal" theme also re-uses the existing full-UI green skin class.
 * @param {string} name
 */
function applyTheme(name) {
  const body = document.body;
  body.classList.remove(...SR2E_THEME_CLASSES);
  if (!name || name === "default") return;
  body.classList.add(`sr2e-theme-${name}`);
  if (name === "terminal") body.classList.add("sr2e-terminal-theme");
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

// Defaults for the singleton-style Matrix entities (IC, Host):
//  - Linked prototype tokens, so a token IS the sidebar actor (not a divergent
//    copy — avoids the "edited the token, sidebar actor unchanged" confusion).
//  - A themed default icon (server for a Host, chip for IC) in place of the
//    generic mystery-man, used for both the sheet image and the token.
const MATRIX_DEFAULT_ICONS = {
  host: "systems/sr2e/assets/icons/host-server.svg",
  ic:   "systems/sr2e/assets/icons/ic-chip.svg"
};

// Actor types that should use a LINKED prototype token by default, so a token
// dragged to the canvas IS the sidebar actor — editing it (spending karma,
// taking damage) updates the directory actor instead of a divergent copy.
// PCs are unique; IC/Host are singletons. NPCs/critters/spirits stay unlinked
// (you often want several independent copies).
const LINKED_PROTOTYPE_TYPES = new Set(["character", "ic", "host"]);

Hooks.on("preCreateActor", (actor, data) => {
  const updates = {};

  if (LINKED_PROTOTYPE_TYPES.has(actor.type) && data.prototypeToken?.actorLink === undefined) {
    updates["prototypeToken.actorLink"] = true;
  }

  // Default unarmed attack for characters (skip imports that already carry one)
  if (actor.type === "character" &&
      !(data.items ?? []).some(i => i.name === UNARMED_STRIKE_DATA.name)) {
    updates["items"] = [...(data.items ?? []), UNARMED_STRIKE_DATA];
  }

  // Themed default icon for the Matrix singletons (Host server / IC chip).
  if (actor.type in MATRIX_DEFAULT_ICONS) {
    const defaultImg = "icons/svg/mystery-man.svg";
    if (!data.img || data.img === defaultImg) {
      const icon = MATRIX_DEFAULT_ICONS[actor.type];
      updates["img"] = icon;
      if (!data.prototypeToken?.texture?.src || data.prototypeToken.texture.src === defaultImg) {
        updates["prototypeToken.texture.src"] = icon;
      }
    }
  }

  if (Object.keys(updates).length) actor.updateSource(updates);
});

// Setting a character's prototype-token image also sets the sheet portrait,
// so art only has to be picked once (unless the same update sets img itself).
Hooks.on("preUpdateActor", (actor, changes) => {
  if (actor.type !== "character") return;
  if (!game.settings.get("sr2e", "syncPortraitToToken")) return;
  const tokenSrc = changes.prototypeToken?.texture?.src;
  if (tokenSrc && changes.img === undefined) changes.img = tokenSrc;
});

Hooks.on("updateActor", (actor, changes) => {
  if (game.users.activeGM?.isSelf && changes.system?.conditionMonitor) _syncWoundStatuses(actor);

  // IC defending this host derive their Security Code + alert live from it
  // (ICData.prepareDerivedData). On any host change, re-prepare and re-render
  // linked IC so open sheets/tokens reflect it immediately. (Re-preparing a few
  // IC is cheap, and avoids depending on the change diff's key format.)
  if (actor.type === "host") {
    for (const ic of game.actors) {
      if (ic.type !== "ic" || ic.system.hostUuid !== actor.uuid) continue;
      ic.prepareData();
      if (ic.sheet?.rendered) ic.sheet.render(false);
    }
    // When the host escalates to an ACTIVE alert, deploy its IC (SR2E p.168):
    // notify the GM and drop any of the IC's scene tokens into the live combat.
    const flat = foundry.utils.flattenObject(changes);
    if (game.users.activeGM?.isSelf && flat["system.alert"] === "active") {
      _deployICOnActiveAlert(actor);
    }
  }
});

/**
 * On a host's active alert, alert the GM with the list of defending IC and add
 * any IC tokens on the active scene to the current combat (SR2E p.168). @private
 */
async function _deployICOnActiveAlert(host) {
  const ic = game.actors.filter(a => a.type === "ic" && a.system.hostUuid === host.uuid);
  if (!ic.length) return;

  // Add linked IC tokens on the viewed scene to the active combat, if any.
  let added = 0;
  const combat = game.combat;
  if (combat && canvas?.scene) {
    const toAdd = canvas.tokens.placeables
      .filter(t => t.actor && ic.includes(t.actor) && !combat.getCombatantByToken(t.id))
      .map(t => ({ tokenId: t.id, sceneId: canvas.scene.id, actorId: t.actor.id }));
    if (toAdd.length) { await combat.createEmbeddedDocuments("Combatant", toAdd); added = toAdd.length; }
  }

  const names = ic.map(a => foundry.utils.escapeHTML(a.name)).join(", ");
  await ChatMessage.create({
    speaker: { alias: foundry.utils.escapeHTML(host.name) },
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<div class="sr2e-damage-result">
      <strong><i class="fas fa-bell"></i> ACTIVE ALERT — ${foundry.utils.escapeHTML(host.name)}</strong>
      <br>Deploy the defending IC: ${names}.
      ${added ? `<br><em>${added} IC token${added === 1 ? "" : "s"} added to combat.</em>`
              : `<br><em>Drop the IC tokens onto the scene and add them to the tracker.</em>`}
    </div>`
  });
}

/* -------------------------------------------- */
/*  Chat Message Hooks                          */
/* -------------------------------------------- */

/**
 * Resolve who resists/defends on an attacker-driven card: the attacker's stored
 * target first (so the *target* resists even though the attacker has a token
 * selected), then the clicker's controlled token / assigned character.
 * @param {string} [targetUuid] - The defending actor's UUID baked into the card.
 */
async function resolveCardDefender(targetUuid) {
  if (targetUuid) {
    const t = await fromUuid(targetUuid);
    const actor = t?.documentName === "Actor" ? t : t?.actor;
    if (actor) return actor;
  }
  return canvas.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
}

/**
 * Resolve a blast (grenade / rocket / missile / area spell) on the battle map
 * (core p.96). Places a circular MeasuredTemplate at the blast point, gathers
 * every token whose centre falls inside it, and posts a card giving each token
 * its own Impact resist with the blast's Power reduced for distance from ground
 * zero. Per-target staging from the attacker's successes is baked into the
 * resist button's level, so the existing resist handler finishes the job.
 *
 * @param {object} o
 * @param {string} o.centerTokenUuid - TokenDocument UUID at ground zero.
 * @param {number} o.basePower       - Blast Power at ground zero.
 * @param {string} o.baseLevel       - Damage Level (L/M/S/D) before staging.
 * @param {string} o.damageType      - "physical" | "stun".
 * @param {string} o.blastType       - offensive | defensive | concussion.
 * @param {number} o.attackerSuccesses - Successes from the attack Success Test.
 * @param {string} o.blastName        - Display name.
 */
async function resolveBlast({ centerTokenUuid, basePower, baseLevel, damageType, blastType, attackerSuccesses, delivery, blastName }) {
  if (!canvas?.ready) return ui.notifications.warn("No active scene for the blast.");
  const centerDoc = centerTokenUuid ? await fromUuid(centerTokenUuid) : null;
  const centerTok = centerDoc?.object ?? game.user?.targets?.first?.();
  if (!centerTok) {
    return ui.notifications.warn("Target a token (the blast's ground zero) before resolving the blast.");
  }
  const falloff = blastFalloffRate(blastType);
  const radiusM = blastRadius(basePower, falloff);

  // Scatter (core p.96): all grenades drift; the attack's successes pull it back
  // toward the target (2 m/success for thrown, 4 m for launchers). A miss (0
  // successes) drifts the full roll in a random direction.
  const prof = scatterProfile(delivery || "standard");
  const rolledScatter = (await new Roll(`${prof.dice}d6`).evaluate()).total;
  const scatterM = scatterDistance(rolledScatter, attackerSuccesses || 0, prof.perSuccess);
  let center = centerTok.center;
  let scatterNote = "lands on target";
  if (scatterM > 0) {
    const angle = Math.random() * 2 * Math.PI;
    const ppm = canvas.grid.size / canvas.grid.distance; // canvas pixels per metre
    center = { x: center.x + Math.cos(angle) * scatterM * ppm, y: center.y + Math.sin(angle) * scatterM * ppm };
    scatterNote = `scatters <strong>${scatterM} m</strong> off-target`;
  }

  // Drop a template at the (possibly scattered) blast point.
  try {
    // Smoke rounds leave a visibility-impairing cloud: the attack dialog
    // auto-detects targets inside it (Visibility Table p.89). Heavy smoke +6,
    // regular/thermal smoke +4 (thermal also defeats thermographic vision).
    const isSmoke  = blastType === "smoke" || /smoke/i.test(blastName ?? "");
    const smokeVis = !isSmoke ? 0
                   : /heavy\s*smoke/i.test(blastName ?? "") ? 6 : 4;
    await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
      t: "circle", x: center.x, y: center.y, distance: radiusM,
      fillColor: smokeVis ? "#9a9a9a" : "#ff6a00",
      borderColor: smokeVis ? "#555555" : "#aa2200",
      texture: smokeVis ? "icons/magic/air/fog-gas-smoke-swirling-gray.webp" : "",
      flags: { sr2e: { blast: true, ...(smokeVis ? { visibility: smokeVis } : {}) } }
    }]);

    // Optional built-in Foundry effect: a negative (darkness) light source over
    // a smoke cloud actually dims vision in the lighting engine. Opt-in — vision
    // effects vary by scene setup, so it's off by default (Clear Blast removes
    // it). Heavier smoke → dimmer.
    if (smokeVis && game.settings.get("sr2e", "smokeDarkness")) {
      try {
        const rPx = radiusM * (canvas.grid.size / canvas.grid.distance);
        await canvas.scene.createEmbeddedDocuments("AmbientLight", [{
          x: center.x, y: center.y, rotation: 0,
          config: {
            negative: true, dim: radiusM, bright: 0,
            luminosity: smokeVis >= 6 ? -0.75 : -0.5,
            color: "#1a1a1a", alpha: 0.35, angle: 360
          },
          flags: { sr2e: { smoke: true } }
        }]);
      } catch (e) { /* lighting optional; TN modifier still applies */ }
    }
  } catch (e) { /* template optional; resolution still proceeds */ }

  // Smoke does no damage — the cloud (template + auto-applied visibility TN, and
  // the optional darkness light) is the whole effect. Post a note and stop.
  if (blastType === "smoke") {
    return ChatMessage.create({
      content: `<div class="sr2e-damage-result">
        <strong>${foundry.utils.escapeHTML(blastName)}</strong> — smoke cloud deployed
        (radius ${radiusM} m). Attacks to/through it take the Visibility Table
        modifier automatically (SR2E p.89). "Clear Blast Areas" removes it.
      </div>`
    });
  }

  const stages = ["L", "M", "S", "D"];
  const baseIdx = Math.max(0, stages.indexOf(baseLevel || "M"));
  const stagedLevel = stages[Math.min(baseIdx + netToSteps(attackerSuccesses || 0), 3)];
  const stun = damageType === "stun";

  const rows = [];
  for (const tok of canvas.tokens.placeables) {
    const actor = tok.actor;
    if (!actor) continue;
    let dist;
    // Round to whole metres — SR2 distances are integers, and a fractional grid
    // measurement would otherwise leak into the blast Power (10 − 2.99 = 7.0023D).
    try { dist = Math.round(canvas.grid.measurePath([center, tok.center]).distance); }
    catch (e) { continue; }
    const power = blastPowerAtRange(basePower, dist, falloff);
    if (power <= 0) continue; // outside the blast
    rows.push(`<div class="sr2e-blast-row">
      <button class="sr2e-resist-btn"
              data-power="${power}" data-base-power="${basePower}"
              data-level="${stagedLevel}" data-armor-type="impact"
              data-damage-type="${damageType}" data-target-uuid="${actor.uuid}"
              title="Body vs. TN = ${power} − Impact armour (core p.96)">
        ${foundry.utils.escapeHTML(tok.name)} — ${power}${stagedLevel}${stun ? " Stun" : ""} <em>(${dist} m)</em>
      </button>
    </div>`);
  }

  const body = rows.length
    ? rows.join("")
    : `<em>No tokens caught in the ${radiusM} m radius.</em>`;
  await ChatMessage.create({
    content: `<div class="sr2e-damage-result sr2e-blast-card">
      <strong>💥 ${foundry.utils.escapeHTML(blastName || "Blast")}</strong> — ${basePower}${stagedLevel}${stun ? " Stun" : ""} at ground zero,
      −${falloff}/m falloff (radius ${radiusM} m).
      <br><em>Scatter:</em> ${scatterNote}.
      <br><em>Each target resists with Body vs. (Power − Impact armour):</em>
      ${body}
      <br><button class="sr2e-clear-blast-btn" title="Remove all blast templates from the scene">🧹 Clear blast areas</button>
    </div>`
  });
}

/**
 * Resolve a shotgun shot-round spread (SR2E p.95). Places a cone MeasuredTemplate
 * from the shooter toward the target, gathers every token inside the cone, and
 * posts a per-target Impact (flechette) resist whose Power is reduced by the
 * spread steps at that token's distance, with +1 resistance die for every other
 * target standing in front of it (closer to the muzzle). The attacker's single
 * Success Test (already rolled, with its own −steps TN benefit) is the bar each
 * target resists against; per-target staging from those successes is baked into
 * the level. Power 0 = out of effective range.
 *
 * @param {object} o
 * @param {string} o.shooterTokenUuid
 * @param {string} o.targetTokenUuid
 * @param {number} o.basePower   - shot Power at the muzzle (weapon damage, flechette).
 * @param {string} o.baseLevel   - L/M/S/D before staging.
 * @param {string} o.damageType  - physical | stun.
 * @param {number} o.choke       - 2–10.
 * @param {number} o.attackerSuccesses
 * @param {string} o.weaponName
 */
async function resolveShotgunSpread({ shooterTokenUuid, targetTokenUuid, basePower, baseLevel, damageType, choke, attackerSuccesses, weaponName }) {
  if (!canvas?.ready) return ui.notifications.warn("No active scene for the shot spread.");
  const shooterTok = shooterTokenUuid ? (await fromUuid(shooterTokenUuid))?.object : canvas.tokens.controlled[0];
  const targetTok  = (targetTokenUuid ? (await fromUuid(targetTokenUuid))?.object : null) ?? game.user?.targets?.first?.();
  if (!shooterTok || !targetTok) {
    return ui.notifications.warn("Need both the shooter's token and a target token to resolve the spread.");
  }
  const c = Math.min(10, Math.max(2, choke || 3));
  const origin = shooterTok.center;
  const aim    = targetTok.center;
  const direction = Math.toDegrees(Math.atan2(aim.y - origin.y, aim.x - origin.x));
  // Cone half-angle ≈ atan(1/choke): the shot widens ~1 m per choke metres, the
  // same rate as the spread steps. Effective length = where Power reaches 0
  // (steps = basePower → distance = choke × basePower).
  const coneAngle = 2 * Math.toDegrees(Math.atan(1 / c));
  const maxRangeM = c * Math.max(1, basePower);
  const measure = (a, b) => { try { return Math.round(canvas.grid.measurePath([a, b]).distance); } catch (e) { return Infinity; } };

  try {
    await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
      t: "cone", x: origin.x, y: origin.y, direction, angle: coneAngle, distance: maxRangeM,
      fillColor: "#b08020", borderColor: "#6a4a10", flags: { sr2e: { blast: true, shotgun: true } }
    }]);
  } catch (e) { /* template optional */ }

  const stages = ["L", "M", "S", "D"];
  const baseIdx = Math.max(0, stages.indexOf(baseLevel || "M"));
  const stagedLevel = stages[Math.min(baseIdx + netToSteps(attackerSuccesses || 0), 3)];
  const stun = damageType === "stun";
  const norm = (deg) => ((deg % 360) + 540) % 360 - 180; // → [-180,180]

  // Everyone in the cone, nearest first (so "intervening targets" = those before).
  const inCone = [];
  for (const tok of canvas.tokens.placeables) {
    if (tok === shooterTok || !tok.actor) continue;
    const dist = measure(origin, tok.center);
    if (dist > maxRangeM) continue;
    const bearing = Math.toDegrees(Math.atan2(tok.center.y - origin.y, tok.center.x - origin.x));
    if (Math.abs(norm(bearing - direction)) > coneAngle / 2) continue;
    inCone.push({ tok, dist });
  }
  inCone.sort((a, b) => a.dist - b.dist);

  const rows = [];
  inCone.forEach(({ tok, dist }, idx) => {
    const steps = shotgunSpread(c, dist).steps;
    const power = basePower - steps;
    if (power <= 0) return; // out of effective range
    const intervening = idx; // targets nearer the muzzle take the brunt: +1 die each
    rows.push(`<div class="sr2e-blast-row">
      <button class="sr2e-resist-btn"
              data-power="${power}" data-base-power="${basePower}"
              data-level="${stagedLevel}" data-armor-type="impact" data-armor-calc="flechette"
              data-bonus-dice="${intervening}" data-damage-type="${damageType}" data-target-uuid="${tok.actor.uuid}"
              title="Body vs. TN = ${power} − flechette armour${intervening ? `, +${intervening} resistance die(s) from intervening targets` : ""}">
        ${foundry.utils.escapeHTML(tok.name)} — ${power}${stagedLevel}${stun ? " Stun" : ""} <em>(${dist} m${intervening ? `, +${intervening}d` : ""})</em>
      </button>
    </div>`);
  });

  const body = rows.length ? rows.join("") : `<em>No targets in the spread cone.</em>`;
  await ChatMessage.create({
    content: `<div class="sr2e-damage-result sr2e-blast-card">
      <strong>🔫 ${foundry.utils.escapeHTML(weaponName || "Shotgun")} — shot spread</strong> (choke ${c}), muzzle ${basePower}${stagedLevel}${stun ? " Stun" : ""}.
      <br><em>Each target resists Body vs. (Power − flechette armour); +1 die per target in front of them:</em>
      ${body}
      <br><button class="sr2e-clear-blast-btn" title="Remove all templates this system dropped">🧹 Clear spread cones</button>
    </div>`
  });
}

Hooks.on("renderChatMessageHTML", (message, html, data) => {
  // V13: html is an HTMLElement (renderChatMessageHTML is the V13 hook)
  if (message.isRoll && html instanceof HTMLElement) {
    html.classList.add("sr2e-roll");
  }

  // Wire up "Resist Damage" buttons embedded in weapon attack chat cards.
  // The button carries data-power, data-level, data-armor-type, data-damage-type.
  // We resolve the defending actor from the currently controlled token (or assigned character).
  // GM "Request a Roll" cards: each player rolls the named skill with their own
  // character (assigned character, else controlled token, else a character they
  // own), defaulting through the Skill Web when untrained.
  html.querySelectorAll?.(".sr2e-skill-request-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const skill = btn.dataset.skill;
      const tn = parseInt(btn.dataset.tn) || 4;
      // A targeted request names its actor; only that actor's owner (or the GM)
      // may roll it. An untargeted card falls back to the clicker's own character.
      let actor = null;
      if (btn.dataset.actorUuid) {
        actor = await fromUuid(btn.dataset.actorUuid);
        if (actor && !(actor.isOwner || game.user.isGM)) {
          return ui.notifications.warn(`${actor.name} isn't yours to roll.`);
        }
      } else {
        actor = game.user.character
          ?? canvas.tokens?.controlled?.[0]?.actor
          ?? game.actors?.find(a => a.type === "character" && a.isOwner);
      }
      if (!actor) {
        return ui.notifications.warn("Assign a character (User Configuration) or select your token to answer a roll request.");
      }
      return actor.rollNamedSkill(skill, tn);
    });
  });

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

      // The defender is whoever the attacker targeted (baked into the card), so
      // the target resists even though the attacker has a token selected. Falls
      // back to the controlled token / assigned character for un-targeted attacks.
      const actor = await resolveCardDefender(btn.dataset.targetUuid);
      if (!actor) {
        return ui.notifications.warn(
          "Select a token (or assign a character) to roll damage resistance."
        );
      }

      const bonusDice  = parseInt(btn.dataset.bonusDice) || 0;
      return actor.rollDamageResistance(power, level, armorType, damageType,
        { armorCalc, armorMod, ammoName, basePower, bonusDice });
    });
  });

  // Wire up "Knockdown Test" buttons on damage-taken cards (SR2E p.91).
  html.querySelectorAll?.(".sr2e-knockdown-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const actor = await resolveCardDefender(btn.dataset.actorUuid);
      if (!actor) return ui.notifications.warn("Can't find the actor for this knockdown test.");
      return actor.rollKnockdown(
        parseInt(btn.dataset.power) || 0,
        btn.dataset.level || "M",
        btn.dataset.gel === "1"
      );
    });
  });

  // Wire up "Resolve Spread" buttons on shotgun shot-round cards (SR2E p.95).
  html.querySelectorAll?.(".sr2e-spread-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      await resolveShotgunSpread({
        shooterTokenUuid:  btn.dataset.shooterTokenUuid || "",
        targetTokenUuid:   btn.dataset.targetTokenUuid || "",
        basePower:         parseInt(btn.dataset.basePower) || 0,
        baseLevel:         btn.dataset.baseLevel || "M",
        damageType:        btn.dataset.damageType || "physical",
        choke:             parseInt(btn.dataset.choke) || 3,
        attackerSuccesses: parseInt(btn.dataset.attackerSuccesses) || 0,
        weaponName:        btn.dataset.weaponName || "Shotgun"
      });
    });
  });

  // Wire up "Resolve Blast" buttons on area-weapon (grenade/rocket/missile) cards.
  // Places the template, gathers tokens, and posts a per-target Impact resist.
  html.querySelectorAll?.(".sr2e-blast-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      await resolveBlast({
        centerTokenUuid:   btn.dataset.centerTokenUuid || "",
        basePower:         parseInt(btn.dataset.basePower) || 0,
        baseLevel:         btn.dataset.baseLevel || "M",
        damageType:        btn.dataset.damageType || "physical",
        blastType:         btn.dataset.blastType || "offensive",
        attackerSuccesses: parseInt(btn.dataset.attackerSuccesses) || 0,
        delivery:          btn.dataset.delivery || "standard",
        blastName:         btn.dataset.blastName || "Blast"
      });
    });
  });

  // "Clear blast areas": delete every MeasuredTemplate this system dropped,
  // plus any smoke darkness-light sources tied to them.
  html.querySelectorAll?.(".sr2e-clear-blast-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      if (!canvas?.scene) return;
      const ids = canvas.scene.templates.filter(t => t.getFlag("sr2e", "blast")).map(t => t.id);
      const lightIds = canvas.scene.lights.filter(l => l.getFlag("sr2e", "smoke")).map(l => l.id);
      if (!ids.length && !lightIds.length) return ui.notifications.info("No blast areas to clear.");
      if (ids.length) await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", ids);
      if (lightIds.length) await canvas.scene.deleteEmbeddedDocuments("AmbientLight", lightIds);
    });
  });

  // Opposed melee: Defend rolls the defender's Combat Skill test and
  // resolves the exchange; Undefended concedes (0 defense successes).
  // The defender comes from the controlled token or assigned character.
  html.querySelectorAll?.(".sr2e-defend-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const defender = canvas.tokens?.controlled?.[0]?.actor ?? game.user?.character;
      if (!defender) {
        return ui.notifications.warn("Select the defending token (or assign a character) first.");
      }
      return defender.rollMeleeDefense(message);
    });
  });

  // Resist Astral: the defending token's actor rolls Astral Body (Willpower).
  html.querySelectorAll?.(".sr2e-astralresist-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const defender = await resolveCardDefender(message.getFlag("sr2e", "astral")?.targetUuid);
      if (!defender) return ui.notifications.warn("Select the defending token first.");
      return defender.rollAstralResistance(message);
    });
  });

  // Resist Spell: the defending token's actor rolls Willpower/Body + Spell Defense.
  html.querySelectorAll?.(".sr2e-spellresist-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const defender = await resolveCardDefender(message.getFlag("sr2e", "spell")?.targetUuid);
      if (!defender) {
        return ui.notifications.warn("Select the defending token (or assign a character) first.");
      }
      return defender.rollSpellResistance(message);
    });
  });

  // Resist Matrix attack: the defending token's actor (IC or decker persona)
  // rolls its resistance and takes net damage on the Matrix condition track.
  html.querySelectorAll?.(".sr2e-matrixresist-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const defender = await resolveCardDefender(message.getFlag("sr2e", "matrix")?.targetUuid);
      if (!defender) return ui.notifications.warn("Select the defending token (IC or decker) first.");
      return defender.rollMatrixResistance(message);
    });
  });

  html.querySelectorAll?.(".sr2e-undefended-btn").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const state = message.getFlag("sr2e", "melee");
      if (!state || state.resolved) return;
      const attacker = await fromUuid(state.attackerUuid);
      if (!attacker) return;
      return attacker._resolveMeleeHit(message, state, {
        winnerName: state.attackerName, loserName: "the undefended target",
        weaponName: state.weaponName, net: state.successes,
        power: state.power, level: state.level, damageType: state.damageType,
        riposte: false
      });
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
 * Toggle the CSS class that shows the play-area background when no scene is
 * active, applying the image chosen in the sceneBackground world setting.
 * Inline styles with the "important" priority override the stylesheet's
 * default (the Seattle map), so the setting wins without CSS edits.
 * Called on initial load and whenever a scene's active state changes.
 */
function _applyNoSceneBackground() {
  const hasActive = !!game.scenes?.active;
  document.body.classList.toggle("sr2e-no-active-scene", !hasActive);

  let img = "";
  try { img = game.settings.get("sr2e", "sceneBackground"); } catch (e) { /* pre-init */ }
  for (const el of [document.body, document.getElementById("board")]) {
    if (!el) continue;
    if (!hasActive && img) {
      el.style.setProperty("background-image", `url("${img}")`, "important");
    } else {
      el.style.removeProperty("background-image");
    }
  }
}

// Apply the chosen interface theme on initial load (migrating the old
// boolean terminal-theme toggle to the "terminal" option for clients who had it).
Hooks.on("ready", () => {
  let theme = game.settings.get("sr2e", "theme");
  if (theme === "default" && game.settings.get("sr2e", "terminalTheme")) {
    theme = "terminal";
    game.settings.set("sr2e", "theme", "terminal").catch(() => {});
  }
  applyTheme(theme);
});

// Apply on initial load
Hooks.on("ready", _applyNoSceneBackground);

// Re-apply whenever the canvas finishes drawing (scene activated or first load)
Hooks.on("canvasReady", _applyNoSceneBackground);

// Re-apply when a scene document is updated (active flag toggled on/off)
Hooks.on("updateScene", (_scene, change) => {
  if (Object.hasOwn(change, "active")) _applyNoSceneBackground();
});
