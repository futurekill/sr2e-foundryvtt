/**
 * Preload Handlebars template partials.
 * @returns {Promise}
 */
export async function preloadTemplates() {
  const templatePaths = [
    // Actor partials
    "systems/sr2e/templates/actor/parts/actor-header.hbs",
    "systems/sr2e/templates/actor/parts/actor-tabs.hbs",
    "systems/sr2e/templates/actor/parts/actor-attributes.hbs",
    "systems/sr2e/templates/actor/parts/actor-skills.hbs",
    "systems/sr2e/templates/actor/parts/actor-combat.hbs",
    "systems/sr2e/templates/actor/parts/actor-magic.hbs",
    "systems/sr2e/templates/actor/parts/actor-matrix.hbs",
    "systems/sr2e/templates/actor/parts/actor-gear.hbs",
    "systems/sr2e/templates/actor/parts/actor-bio.hbs",

    // Item partials
    "systems/sr2e/templates/item/parts/item-header.hbs",
    "systems/sr2e/templates/item/item-body.hbs",

    // Chat
    "systems/sr2e/templates/chat/roll-result.hbs"
  ];

  // V13: loadTemplates is now foundry.applications.handlebars.loadTemplates
  const loader = foundry.applications?.handlebars?.loadTemplates ?? loadTemplates;
  return loader(templatePaths);
}
