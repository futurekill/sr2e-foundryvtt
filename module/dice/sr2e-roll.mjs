/**
 * Custom Roll class for Shadowrun 2E Success Tests.
 *
 * In SR2E, you roll Xd6 against a Target Number (TN).
 * Each die >= TN is a success. With the Rule of Six,
 * any die showing 6 is rerolled and the new result added
 * to 6 (allowing TNs > 6 to be reached).
 */
/** Number of faces on a Shadowrun die. */
const DICE_SIDES = 6;

export class SR2ESuccessRoll extends Roll {

  constructor(formula, data = {}, options = {}) {
    super(formula, data, options);
    this.targetNumber = options.targetNumber || 4;
    this.ruleOfSix = options.ruleOfSix ?? true;
  }

  /**
   * Perform a Shadowrun 2E Success Test.
   * @param {number} dicePool - Number of d6s to roll
   * @param {number} targetNumber - Target number to beat
   * @param {object} [options] - Additional options
   * @param {boolean} [options.ruleOfSix=true] - Use Rule of Six (exploding 6s)
   * @returns {Promise<SR2ESuccessTestResult>}
   */
  static async successTest(dicePool, targetNumber, options = {}) {
    const ruleOfSix = options.ruleOfSix ??
      (game.settings?.get("sr2e", "ruleOfSix") ?? true);

    const dice = [];
    const results = [];

    // Roll the initial dice
    for (let i = 0; i < dicePool; i++) {
      let total = 0;
      let currentRoll;
      let rolls = [];

      do {
        currentRoll = Math.ceil(Math.random() * DICE_SIDES);
        total += currentRoll;
        rolls.push(currentRoll);
      } while (ruleOfSix && currentRoll === DICE_SIDES);

      dice.push({
        total,
        rolls,
        success: total >= targetNumber,
        exploded: rolls.length > 1
      });

      results.push(total);
    }

    // Count successes
    const successes = results.filter(r => r >= targetNumber).length;

    // Check for all 1s (critical glitch)
    const allOnes = results.every(r => r === 1);

    return {
      dicePool,
      targetNumber,
      results,
      dice,
      successes,
      allOnes,
      isSuccess: successes > 0,
      isCriticalGlitch: allOnes && dicePool > 0
    };
  }

  /**
   * Create a chat message for a success test result.
   * @param {SR2ESuccessTestResult} result - The test result
   * @param {object} [options] - Message options
   * @param {Actor} [options.actor] - The acting actor
   * @param {string} [options.label] - Test label
   * @param {string} [options.flavor] - Additional flavor text
   * @returns {Promise<ChatMessage>}
   */
  static async toMessage(result, options = {}) {
    const actor = options.actor;
    const label = options.label || "Success Test";

    // Build dice display HTML
    let diceHtml = '<div class="sr2e-dice-results">';
    for (const die of result.dice) {
      const successClass = die.success ? "success" : "failure";
      const explodedClass = die.exploded ? "exploded" : "";
      diceHtml += `<span class="sr2e-die ${successClass} ${explodedClass}" title="${die.rolls.join(" + ")}">${die.total}</span>`;
    }
    diceHtml += "</div>";

    // Build message content
    let content = `
      <div class="sr2e-roll-message">
        <h3 class="sr2e-roll-header">${label}</h3>
        <div class="sr2e-roll-info">
          <span class="sr2e-roll-pool">Dice Pool: ${result.dicePool}</span>
          <span class="sr2e-roll-tn">Target Number: ${result.targetNumber}</span>
        </div>
        ${diceHtml}
        <div class="sr2e-roll-result">
          <strong>Successes: ${result.successes}</strong>
          ${result.isCriticalGlitch ? '<span class="sr2e-critical-glitch">CRITICAL GLITCH!</span>' : ""}
          ${!result.isSuccess && !result.isCriticalGlitch ? '<span class="sr2e-failure">FAILURE</span>' : ""}
        </div>
      </div>
    `;

    const messageData = {
      content,
      speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker()
    };

    if (options.flavor) {
      messageData.flavor = options.flavor;
    }

    return ChatMessage.create(messageData);
  }
}

/**
 * @typedef {object} SR2ESuccessTestResult
 * @property {number} dicePool - Number of dice rolled
 * @property {number} targetNumber - Target number
 * @property {number[]} results - Final result of each die
 * @property {object[]} dice - Detailed dice info
 * @property {number} successes - Number of successes
 * @property {boolean} allOnes - Whether all dice showed 1
 * @property {boolean} isSuccess - Whether the test succeeded
 * @property {boolean} isCriticalGlitch - Whether it's a critical glitch
 */
