/**
 * Register custom Handlebars helpers for the SR2E system.
 */
export function registerHandlebarsHelpers() {

  /**
   * Repeat a block N times.
   * Usage: {{#times 10}}...{{/times}}
   */
  Handlebars.registerHelper("times", function (n, block) {
    let result = "";
    for (let i = 0; i < n; i++) {
      result += block.fn({ index: i });
    }
    return result;
  });

  /**
   * Check if a value equals another.
   * Usage: {{#ifEquals value "test"}}...{{/ifEquals}}
   */
  Handlebars.registerHelper("ifEquals", function (a, b, options) {
    return a === b ? options.fn(this) : options.inverse(this);
  });

  /**
   * Check if a value is greater than another.
   */
  Handlebars.registerHelper("ifGt", function (a, b, options) {
    return Number(a) > Number(b) ? options.fn(this) : options.inverse(this);
  });

  /**
   * Check if a value is less than or equal to another.
   */
  Handlebars.registerHelper("ifLte", function (a, b, options) {
    return Number(a) <= Number(b) ? options.fn(this) : options.inverse(this);
  });

  /**
   * Math operations.
   */
  Handlebars.registerHelper("add", function (a, b) {
    return Number(a) + Number(b);
  });

  Handlebars.registerHelper("subtract", function (a, b) {
    return Number(a) - Number(b);
  });

  Handlebars.registerHelper("multiply", function (a, b) {
    return Number(a) * Number(b);
  });

  Handlebars.registerHelper("divide", function (a, b) {
    return b !== 0 ? Number(a) / Number(b) : 0;
  });

  /**
   * Return the maximum of two numbers.
   * Usage: {{max a b}}
   */
  Handlebars.registerHelper("max", function (a, b) {
    return Math.max(Number(a) || 0, Number(b) || 0);
  });

  /**
   * Return the minimum of two numbers.
   * Usage: {{min a b}}
   */
  Handlebars.registerHelper("min", function (a, b) {
    return Math.min(Number(a) || 0, Number(b) || 0);
  });

  /**
   * Deep lookup — access nested properties by multiple keys.
   * Usage: {{deepLookup ../system attr "base"}}
   *   resolves to system[attr].base
   * Supports 1-3 levels of nesting.
   */
  Handlebars.registerHelper("deepLookup", function (...args) {
    // Last argument is the Handlebars options object
    args.pop();
    if (args.length < 2) return undefined;
    let obj = args[0];
    for (let i = 1; i < args.length; i++) {
      if (obj == null) return undefined;
      obj = obj[args[i]];
    }
    return obj;
  });

  /**
   * Render a condition monitor as a series of boxes.
   * Returns HTML for condition monitor boxes.
   * @param {number} current - Current damage
   * @param {number} max - Maximum boxes
   */
  Handlebars.registerHelper("conditionMonitor", function (current, max) {
    let html = '<div class="condition-monitor">';
    for (let i = 1; i <= max; i++) {
      const filled = i <= current ? "filled" : "";
      const levelClass =
        i <= 3 ? "light" :
        i <= 6 ? "moderate" :
        i <= 9 ? "serious" : "deadly";

      // Add separator every 3 boxes
      if (i > 1 && (i - 1) % 3 === 0) {
        html += '<span class="condition-separator">|</span>';
      }
      const glyph = filled ? "&#9632;" : "&#9633;";
      html += `<span class="condition-box ${filled} ${levelClass}" data-index="${i}">${glyph}</span>`;
    }
    html += "</div>";
    return new Handlebars.SafeString(html);
  });

  /**
   * Return a CSS class based on wound level (proportion of damage taken).
   * Used to colour the monitor value: green → yellow → orange → red.
   */
  Handlebars.registerHelper("woundClass", function (current, max) {
    if (!max || current === 0) return "wound-none";
    const ratio = current / max;
    if (ratio <= 0.25) return "wound-light";
    if (ratio <= 0.5)  return "wound-moderate";
    if (ratio <= 0.75) return "wound-serious";
    return "wound-deadly";
  });

  /**
   * Localize a config value.
   * Usage: {{sr2eLocalize config.key}}
   */
  Handlebars.registerHelper("sr2eLocalize", function (key) {
    return game.i18n.localize(key) || key;
  });

  /**
   * Select helper - marks an option as selected if it matches.
   * Usage: {{selected currentValue optionValue}}
   */
  Handlebars.registerHelper("selected", function (value, option) {
    return value === option ? "selected" : "";
  });

  /**
   * Checked helper for checkboxes.
   */
  Handlebars.registerHelper("checked", function (value) {
    return value ? "checked" : "";
  });

  /**
   * Concat strings.
   */
  Handlebars.registerHelper("concat", function (...args) {
    args.pop(); // Remove the Handlebars options object
    return args.join("");
  });

  /**
   * JSON stringify for debugging.
   */
  Handlebars.registerHelper("json", function (context) {
    return JSON.stringify(context, null, 2);
  });

  /**
   * Get wound level label from damage value.
   */
  Handlebars.registerHelper("woundLevel", function (damage) {
    if (damage <= 0) return "Undamaged";
    if (damage <= 3) return "Light (+1)";
    if (damage <= 6) return "Moderate (+2)";
    if (damage <= 9) return "Serious (+3)";
    return "Deadly (+4)";
  });

  /**
   * Format essence as decimal.
   */
  Handlebars.registerHelper("formatEssence", function (value) {
    return Number(value).toFixed(2);
  });
}
