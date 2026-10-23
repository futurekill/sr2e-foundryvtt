/** A localized roll label: SR2E.RollLabel.<key> from lang/, formatted with data. */
export const RL = (key, data = {}) => game.i18n.format(`SR2E.RollLabel.${key}`, data);

/** An attribute's localized name ("willpower" → "Willpower"). */
export const AL = (attr) => game.i18n.localize(`SR2E.Attributes.${attr.capitalize()}`);
