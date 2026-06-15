/**
 * Minimal Foundry globals for running SR2E rules tests in plain Node.
 *
 * We deliberately do NOT emulate the full DataModel / fields pipeline — the
 * rules math is tested through pure helpers in `module/rules/`. This shim only
 * covers what the dice engine (`module/dice/sr2e-roll.mjs`) touches at runtime:
 * a deterministic `Roll` and `game.settings`.
 *
 * The mock Roll consumes results from a queue set by `queueDice([...])`; each
 * `new Roll("Nd6").evaluate()` shifts N values off the queue. If the queue is
 * empty it throws, so a test that mis-counts its dice fails loudly instead of
 * silently using zeros.
 */

let DICE_QUEUE = [];

/** Seed the deterministic die results consumed by the next Roll(s). */
export function queueDice(results) {
  DICE_QUEUE = [...results];
}

/** Remaining queued results (for assertions / sanity checks). */
export function remainingDice() {
  return [...DICE_QUEUE];
}

class MockRoll {
  constructor(formula) {
    this.formula = formula;
    const m = /^(\d+)d(\d+)$/.exec(formula.trim());
    if (!m) throw new Error(`MockRoll: unsupported formula "${formula}"`);
    this._n = parseInt(m[1], 10);
  }

  async evaluate() {
    const results = [];
    for (let i = 0; i < this._n; i++) {
      if (DICE_QUEUE.length === 0) {
        throw new Error(`MockRoll: die queue exhausted (formula ${this.formula} wanted ${this._n})`);
      }
      results.push(DICE_QUEUE.shift());
    }
    this.dice = [{ results: results.map(result => ({ result, active: true })) }];
    this.total = results.reduce((a, b) => a + b, 0);
    return this;
  }
}

globalThis.Roll = MockRoll;

globalThis.game = {
  settings: {
    // Default Rule of Six on; individual tests override by passing options.
    get: (_scope, key) => (key === "ruleOfSix" ? true : undefined)
  }
};

// Minimal stand-ins so the document/data-model modules import in Node. These
// are only base classes / namespaces referenced at module load — the pure
// functions exported alongside them (evaluateDamageCode, parseDrainCode) don't
// touch them.
globalThis.Item = class {};
globalThis.Actor = class {};
globalThis.foundry = {
  abstract: { TypeDataModel: class {} },
  utils: { escapeHTML: (s) => String(s ?? "") }
};
