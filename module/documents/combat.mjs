/**
 * Custom Combat class implementing SR2E multiple actions (p.78–79).
 *
 * The SR2E Combat Turn: everyone rolls Initiative, then Combat Phases count
 * down from the highest total. When a character finishes acting, their
 * Initiative total drops by 10; if the result is still above 0 they act
 * again later in the Turn, at their new total. The next actor is always
 * whoever currently holds the highest total above 0 — so Initiative 21 acts
 * at 21 and 11 before Initiative 5 acts at all. When nobody is above 0, a
 * new Combat Turn begins and everyone re-rolls Initiative.
 *
 * Foundry mapping: round = Combat Turn; "next turn" = resolve the current
 * actor (−10) and jump to the highest remaining total. The tracker's
 * descending sort keeps the visible order correct as totals fall.
 */
export class SR2ECombat extends Combat {

  /** @override Roll initiative for anyone who hasn't, then begin. */
  async startCombat() {
    const unrolled = this.combatants.filter(c => c.initiative === null).map(c => c.id);
    if (unrolled.length) await this.rollInitiative(unrolled);
    return super.startCombat();
  }

  /**
   * @override
   * Resolve the current combatant's action: subtract 10 from their
   * Initiative, then hand the spotlight to the highest remaining total
   * above 0. When no one remains, start a new Combat Turn.
   */
  async nextTurn() {
    const current = this.combatant;
    if (current) {
      // Remember the actor for a one-step previousTurn undo
      await this.setFlag("sr2e", "lastActorId", current.id);
      await current.update({ initiative: (current.initiative ?? 0) - 10 });
    }

    // this.turns is re-sorted (descending initiative) after the update;
    // the first combatant above 0 is the next Combat Phase.
    const next = this.turns.findIndex(c => (c.initiative ?? 0) > 0 && !c.isDefeated);
    if (next === -1) return this.nextRound();
    return this.update({ turn: next });
  }

  /**
   * @override
   * One-step undo: give the last actor their 10 points back and return
   * the spotlight to them.
   */
  async previousTurn() {
    const lastId = this.getFlag("sr2e", "lastActorId");
    const last = lastId ? this.combatants.get(lastId) : null;
    if (!last) {
      ui.notifications.warn("SR2E | No action to rewind — adjust Initiative totals manually if needed.");
      return this;
    }
    await last.update({ initiative: (last.initiative ?? 0) + 10 });
    await this.unsetFlag("sr2e", "lastActorId");
    const idx = this.turns.findIndex(c => c.id === last.id);
    return this.update({ turn: Math.max(0, idx) });
  }

  /**
   * @override
   * A new Combat Turn (SR2E p.78): everyone re-rolls Initiative, and the
   * countdown restarts from the new highest total.
   */
  async nextRound() {
    await this.unsetFlag("sr2e", "lastActorId");
    // Clear old totals, advance the round marker, re-roll for everyone
    await this.resetAll();
    await this.update({ round: this.round + 1, turn: 0 });
    await this.rollAll();

    await ChatMessage.create({
      content: `<div class="sr2e-item-card">
        <strong>Combat Turn ${this.round}</strong> — Initiative re-rolled.
        Phases count down from the highest total; each action costs 10 Initiative.
      </div>`
    });

    // Point the tracker at the new highest total
    const first = this.turns.findIndex(c => (c.initiative ?? 0) > 0 && !c.isDefeated);
    return this.update({ turn: Math.max(0, first) });
  }

  /** @override Rewinding a whole Combat Turn cannot restore spent passes. */
  async previousRound() {
    ui.notifications.warn("SR2E | Previous round is not supported — Initiative re-rolls each Combat Turn.");
    return this;
  }
}
