/**
 * Shadowrun 2E Success Test dice.
 *
 * In SR2E, you roll Xd6 against a Target Number (TN). Each die >= TN is a
 * success. With the Rule of Six, any die showing 6 is rerolled and the new
 * result added to the 6 (compounding), allowing TNs above 6 to be reached.
 *
 * Dice are evaluated through real Foundry Roll objects so the system honours
 * Foundry's RNG, triggers Dice So Nice, and attaches genuine rolls to chat
 * messages (message.isRoll === true). Foundry's built-in "x" explode modifier
 * appends new dice instead of compounding onto the same die, so the Rule of
 * Six is resolved here in batches: after each evaluation, every die that
 * showed a 6 is rerolled together as one additional Roll, and the new result
 * is added onto the originating die. This repeats until no 6s remain.
 */

/** Number of faces on a Shadowrun die. */
const DICE_SIDES = 6;

export class SR2ESuccessRoll {

  /**
   * Perform a Shadowrun 2E Success Test.
   * @param {number} dicePool - Number of d6s to roll
   * @param {number} targetNumber - Target number to beat
   * @param {object} [options] - Additional options
   * @param {boolean} [options.ruleOfSix=true] - Use Rule of Six (compounding 6s)
   * @returns {Promise<SR2ESuccessTestResult>}
   */
  static async successTest(dicePool, targetNumber, options = {}) {
    const ruleOfSix = options.ruleOfSix ??
      (game.settings?.get("sr2e", "ruleOfSix") ?? true);

    // Per-die accumulators: total (compounded sum) and the chain of raw rolls
    const dice  = Array.from({ length: dicePool }, () => ({ total: 0, rolls: [] }));
    const rolls = [];   // evaluated Roll objects, attached to the chat message

    // Indexes of dice that still need a (re)roll this batch
    let pending = dice.map((_, i) => i);
    while (pending.length > 0) {
      const roll = await new Roll(`${pending.length}d${DICE_SIDES}`).evaluate();
      rolls.push(roll);
      const next = [];
      roll.dice[0].results.forEach((r, j) => {
        const idx = pending[j];
        dice[idx].total += r.result;
        dice[idx].rolls.push(r.result);
        if (ruleOfSix && r.result === DICE_SIDES) next.push(idx);
      });
      pending = next;
    }

    for (const die of dice) {
      die.success  = die.total >= targetNumber;
      die.exploded = die.rolls.length > 1;
    }

    const results   = dice.map(d => d.total);
    const successes = results.filter(r => r >= targetNumber).length;
    // Critical glitch: every die came up 1 on the initial roll (a 1 cannot explode)
    const allOnes   = dicePool > 0 && dice.every(d => d.rolls[0] === 1);

    return {
      dicePool,
      targetNumber,
      results,
      dice,
      rolls,
      successes,
      allOnes,
      isSuccess: successes > 0,
      isCriticalGlitch: allOnes
    };
  }
}

/**
 * @typedef {object} SR2ESuccessTestResult
 * @property {number} dicePool - Number of dice rolled
 * @property {number} targetNumber - Target number
 * @property {number[]} results - Final (compounded) result of each die
 * @property {object[]} dice - Detailed per-die info ({total, rolls, success, exploded})
 * @property {Roll[]} rolls - The evaluated Foundry Roll objects
 * @property {number} successes - Number of successes
 * @property {boolean} allOnes - Whether all dice showed 1
 * @property {boolean} isSuccess - Whether the test succeeded
 * @property {boolean} isCriticalGlitch - Whether it's a critical glitch
 */
