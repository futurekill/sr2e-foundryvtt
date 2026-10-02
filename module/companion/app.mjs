/**
 * The companion screen (docs/PLAN-companion.md). Stage 1 is the shell: the
 * character's header and the device menu. Stage 2 adds the Status, Skills, Combat,
 * Magic and Chat tabs.
 */

import { setCompanion, chooseActor } from "./boot.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SR2ECompanionApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.actor = options.actor ?? null;
  }

  static DEFAULT_OPTIONS = {
    id: "sr2e-companion",
    classes: ["sr2e", "sr2e-companion-app"],
    tag: "section",
    window: { frame: false, positioned: false },
    actions: {
      fullFoundry: () => setCompanion(false),
      switchCharacter: async function () {
        const actor = await chooseActor({ ask: true });
        if (actor) { this.actor = actor; this.render(); }
      }
    }
  };

  static PARTS = { main: { template: "systems/sr2e/templates/companion/shell.hbs" } };

  /** The handlers shared with the sheets read the actor from `document`. */
  get document() { return this.actor; }

  /** @override */
  async _prepareContext() {
    const a = this.actor;
    return {
      actor: a, system: a?.system ?? null, user: game.user.name,
      canSwitch: game.actors.filter(x => x.type === "character" && x.isOwner).length > 1
    };
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    this._hooks = [
      ["updateActor", Hooks.on("updateActor", (actor) => { if (actor === this.actor) this.render(); })]
    ];
  }

  /** @override */
  _onClose(options) {
    for (const [name, id] of this._hooks ?? []) Hooks.off(name, id);
    super._onClose?.(options);
  }
}
