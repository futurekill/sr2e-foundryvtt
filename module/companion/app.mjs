/**
 * The companion screen (docs/PLAN-companion.md, Stage 2): a touch-first view of
 * one character with Status, Skills, Combat, Magic and Chat tabs.
 *
 * It registers the sheets' SHARED_ACTIONS and exposes `document`, so every button
 * runs the SAME handler as the desktop sheet (which read `this.document` and the
 * tapped element's data attributes). Nothing about a roll is re-implemented here;
 * the roll dialogs are the system's own, restyled for touch by the companion CSS.
 */

import { setCompanion, chooseActor } from "./boot.mjs";
import { SHARED_ACTIONS } from "../sheets/sheet-actions.mjs";
import { targetDocs, shareTargets } from "../targeting.mjs";
import { targetChoices } from "../rules/companion-rules.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TABS = [
  { id: "status", label: "Status", icon: "fa-heart-pulse" },
  { id: "skills", label: "Skills", icon: "fa-dice" },
  { id: "combat", label: "Combat", icon: "fa-crosshairs" },
  { id: "magic", label: "Magic", icon: "fa-wand-sparkles", awakened: true },
  { id: "chat", label: "Chat", icon: "fa-comments" }
];
// The sheet's own tab switcher walks sheet markup; the companion has its own tabs.
const ACTIONS = Object.fromEntries(Object.entries(SHARED_ACTIONS).filter(([name]) => name !== "switchTab"));
const CHAT_MESSAGES = 30;
const byName = (a, b) => a.name.localeCompare(b.name);

export class SR2ECompanionApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.actor = options.actor ?? null;
    this.tab = "status";
  }

  static DEFAULT_OPTIONS = {
    id: "sr2e-companion",
    classes: ["sr2e", "sr2e-companion-app"],
    tag: "section",
    window: { frame: false, positioned: false },
    actions: {
      ...ACTIONS,
      companionTab: function (event, target) { this.tab = target.dataset.tab; this.render(); },
      // Tap a token in the list to target or un-target it; shared with the player's map.
      toggleTarget: async function (event, target) {
        const scene = this.targetScene(); if (!scene) return;
        const id = target.dataset.tokenId;
        const now = new Set(targetDocs().filter(d => d.parent === scene).map(d => d.id));
        now.has(id) ? now.delete(id) : now.add(id);
        await shareTargets(scene.id, now);
      },
      clearTargets: async function () { await shareTargets(this.targetScene()?.id ?? null, []); },
      fullFoundry: () => setCompanion(false),
      switchCharacter: async function () {
        const actor = await chooseActor({ ask: true });
        if (actor) { this.actor = actor; this.render(); }
      }
    }
  };

  static PARTS = { main: { template: "systems/sr2e/templates/companion/shell.hbs" } };

  /** The scene the character is on: the active scene if their token is there, else any scene that has it. */
  targetScene() {
    const a = this.actor; if (!a) return null;
    const has = (s) => s?.tokens.some(t => t.actorId === a.id);
    return has(game.scenes.active) ? game.scenes.active : game.scenes.find(has) ?? null;
  }

  /** The target list for the Combat and Magic tabs. */
  targetContext() {
    const scene = this.targetScene();
    if (!scene) return { scene: null, choices: [], picked: [] };
    const own = scene.tokens.find(t => t.actorId === this.actor.id);
    const combat = game.combats.find(c => c.scene?.id === scene.id && c.started);
    const picked = new Set(targetDocs().filter(d => d.parent === scene).map(d => d.id));
    const dist = (t) => { try { return Math.round(scene.grid.measurePath([own.getCenterPoint(own), t.getCenterPoint(t)]).distance); } catch (e) { return null; } };
    const astral = ["perceiving", "projecting"].includes(this.actor.system.astralState);
    const rows = scene.tokens.map(t => ({ id: t.id, name: t.name, hidden: t.hidden, own: t.id === own?.id || t.actorId === this.actor.id,
      astralOnly: !!t.getFlag("sr2e", "astralOnly"), inCombat: !!combat?.combatants.some(c => c.tokenId === t.id),
      distance: own ? dist(t) : null, disposition: ["hostile", "neutral", "friendly", "secret"][t.disposition + 1] ?? "neutral",
      picked: picked.has(t.id) }));
    return { scene: scene.name, choices: targetChoices(rows, { astralActive: astral }), picked: rows.filter(r => r.picked) };
  }

  /** The handlers shared with the sheets read the actor from `document`. */
  get document() { return this.actor; }

  /** @override */
  async _prepareContext() {
    const a = this.actor;
    const ctx = {
      actor: a, user: game.user.name,
      canSwitch: game.actors.filter(x => x.type === "character" && x.isOwner).length > 1
    };
    if (!a) return ctx;
    const s = a.system;
    const awakened = (s.magic?.type ?? "none") !== "none";
    const tabs = TABS.filter(t => !t.awakened || awakened);
    if (!tabs.some(t => t.id === this.tab)) this.tab = "status";
    const items = (type) => a.items.filter(i => i.type === type).sort(byName);
    const skills = items("skill");
    const cat = (c) => skills.filter(k => (k.system.category ?? "active") === c);
    const pool = (key, label) => {
      const p = s.dicePools?.[key];
      return p && p.max > 0 ? { key, label, value: p.value, max: p.max } : null;
    };
    Object.assign(ctx, {
      system: s, tabs: tabs.map(t => ({ ...t, active: t.id === this.tab })), tab: Object.fromEntries(tabs.map(t => [t.id, t.id === this.tab])),
      attributes: Object.entries(CONFIG.SR2E.attributes).map(([key, label]) => ({ key, label: game.i18n.localize(label), value: s[key]?.value ?? 0 })),
      reaction: s.reaction?.value ?? 0, initiative: `${s.initiative?.value ?? s.reaction?.value ?? 0} + ${s.initiative?.dice ?? 1}D6`,
      essence: s.essence?.value, magic: awakened ? s.magic?.value : null,
      monitors: ["physical", "stun"].map(key => ({ key, label: key === "physical" ? "Physical" : "Stun",
        value: s.conditionMonitor?.[key]?.value ?? 0, max: s.conditionMonitor?.[key]?.max ?? 10 })),
      woundPenalty: s.woundPenalty ?? 0,
      pools: [pool("combat", "Combat"), pool("magic", "Magic"), pool("hacking", "Hacking"), pool("control", "Control"), pool("astral", "Astral")].filter(Boolean),
      karmaPool: s.karma?.pool ?? 0, armor: s.armor ?? { ballistic: 0, impact: 0 },
      skillGroups: [["Active", cat("active")], ["Build / Repair", cat("build_repair")], ["Knowledge", cat("knowledge")],
        ["Language", cat("language")], ["Special", cat("special")]].filter(([, list]) => list.length).map(([label, list]) => ({ label, list })),
      weapons: items("weapon").map(w => ({ id: w.id, name: w.name, img: w.img, damage: w.system.damageCode,
        hasAmmo: (w.system.ammo?.max ?? 0) > 0, ammo: w.system.ammo, equipped: w.system.equipped,
        modes: Object.entries(w.system.firingModes ?? {}).filter(([, on]) => on).map(([m]) => m.toUpperCase()).join(" ") })),
      ammo: items("ammo"),
      spells: items("spell").map(sp => ({ id: sp.id, name: sp.name, force: sp.system.force, drain: sp.system.drainCode,
        category: sp.system.category, sustaining: !!sp.system.sustaining })),
      targets: (this.tab === "combat" || this.tab === "magic") ? this.targetContext() : null,
      conjures: awakened && s.magic?.type !== "physical_adept",
      conjureKind: s.magic?.tradition === "hermetic" ? "elemental" : "nature"
    });
    return ctx;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    // The reload-from select: an item field edited in place, as on the sheet.
    for (const sel of root.querySelectorAll("select[data-field]")) {
      sel.addEventListener("change", (ev) => {
        const item = this.actor?.items.get(ev.target.closest("[data-item-id]")?.dataset.itemId);
        item?.update({ [ev.target.dataset.field]: ev.target.value });
      });
    }
    if (this.tab === "chat") this.#renderChat();
    const body = root.querySelector(".companion-body");
    if (body && this._scroll?.tab === this.tab) body.scrollTop = this._scroll.top;
  }

  /** Keep the scroll position across the re-renders that data changes cause. */
  async render(...args) {
    const body = this.element?.querySelector?.(".companion-body");
    if (body) this._scroll = { tab: this.tab, top: body.scrollTop };
    return super.render(...args);
  }

  /** The Chat tab: the latest cards, rendered by Foundry so the system's card buttons work. */
  async #renderChat() {
    const log = this.element.querySelector(".companion-chat");
    if (!log) return;
    const messages = game.messages.contents.filter(m => m.visible).slice(-CHAT_MESSAGES);
    const nodes = [];
    for (const m of messages) { try { nodes.push(await m.renderHTML()); } catch (e) { /* skip a card that won't render */ } }
    if (this.tab !== "chat" || !log.isConnected) return;
    log.replaceChildren(...nodes);
    log.parentElement.scrollTop = log.parentElement.scrollHeight;
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    let timer = null;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => this.render(), 80); };
    const mine = (doc) => doc === this.actor || doc?.parent === this.actor || doc?.parent?.parent === this.actor;
    const on = (name, fn) => [name, Hooks.on(name, fn)];
    this._hooks = [
      on("updateActor", (d) => { if (mine(d)) refresh(); }),
      ...["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]
        .map(h => on(h, (d) => { if (mine(d)) refresh(); })),
      on("updateCombat", refresh),
      // Targets picked on the player's other device, and tokens moving (distances).
      on("updateUser", (u, ch) => { if (u === game.user && foundry.utils.hasProperty(ch, "flags.sr2e.targets")) refresh(); }),
      ...["createToken", "updateToken", "deleteToken"].map(h => on(h, () => { if (this.tab === "combat" || this.tab === "magic") refresh(); })),
      ...["createChatMessage", "updateChatMessage", "deleteChatMessage"].map(h => on(h, () => { if (this.tab === "chat") refresh(); }))
    ];
  }

  /** @override */
  _onClose(options) {
    for (const [name, id] of this._hooks ?? []) Hooks.off(name, id);
    super._onClose?.(options);
  }
}
