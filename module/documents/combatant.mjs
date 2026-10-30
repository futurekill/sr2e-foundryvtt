/**
 * Custom Combatant class for Shadowrun 2E.
 *
 * Foundry V13's default Combatant#getInitiativeRoll builds a Roll directly
 * from the system.json initiative formula string without delegating to the
 * Actor. We override it here so that rolling initiative from the encounter
 * tracker (as GM or player) always uses the SR2E formula:
 *
 *   Initiative = Adjusted Reaction + Initiative Dice (wound penalty removes dice)
 */
export class SR2ECombatant extends Combatant {
  /** Out of the turn order without being defeated: an IC held down by a Slow suppression (VR2.0 p.99, part 5a §5). */
  get heldOut() {
    return this.actor?.type === "ic" && !!game.sr2e?.vr2SlowSuppressed?.(this.actor);
  }

  /**
   * Build the initiative Roll for this combatant.
   * Called by Combat.rollInitiative() when the GM rolls from the tracker UI.
   * @override
   */
  getInitiativeRoll(formula) {
    const actor = this.actor;

    // Delegate to the actor's own implementation if available
    if (actor?.getInitiativeRoll) {
      return actor.getInitiativeRoll(formula);
    }

    // Fallback for combatants with no actor (e.g. manually-added tokens)
    return super.getInitiativeRoll(formula);
  }
}
