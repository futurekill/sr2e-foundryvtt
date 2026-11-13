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
import { spendInitiative, nextEligibleTurnIndex, livingCombatantIds } from "../rules/sr2e-rules.mjs";
import { processCombatBoundary, postCountCards } from "../elementals.mjs";
import { nextPhaseSeq, enqueueAttack } from "../engagement.mjs";
import { gmCall } from "../vehicle-play.mjs";
import { chaseOf, chaseUnion } from "../chase-state.mjs";
import { chaseCloseStage, chaseOpenStage, requestRefresh, hasChase } from "../chase.mjs";

export class SR2ECombat extends Combat {

  /** @override Roll initiative for the living who haven't rolled, then begin. */
  async startCombat() {
    // Clear stale initiative on the defeated so a corpse can't sort first and
    // capture the opening turn; roll only for the living who haven't rolled.
    await this._clearDefeatedInitiative();
    const unrolled = this.combatants.filter(c => !c.isDefeated && !c.heldOut && c.initiative === null).map(c => c.id);
    if (unrolled.length) await this.rollInitiative(unrolled, { updateTurn: false });
    await super.startCombat();
    // Don't trust super's turn pointer (it can land on a corpse): point at the
    // highest living total, or clear it if nobody can act.
    await this._pointAtFirstLiving();
    // SR2E p.84: all Dice Pools are full at the first step of the first Combat Turn of an encounter (unless
    // auto-refresh is off), plus a chase's drivers, passengers and pedestrians; then the chase opens round 1.
    await this.setFlag("sr2e", "roundTransition", { from: 0, to: 1, seq: this.getFlag("sr2e", "boundarySeq") ?? 0, stage: "refreshing", start: true });
    return this.advanceRound(0);
  }

  /** Configured pool-refresh behaviour: "action" (RAW), "round", or "off". */
  _poolRefreshMode() {
    try { return game.settings.get("sr2e", "combatPoolRefresh"); }
    catch { return "action"; }
  }

  /** Refresh the acting combatant's refreshable pools (SR2E p.84). GM-side. */
  async _refreshActorPools(combatant) {
    if (!game.user.isGM) return;
    await combatant?.actor?.refreshDicePools?.();
  }

  /** Set initiative to null on every defeated combatant that still holds one. */
  async _clearDefeatedInitiative() {
    const updates = this.combatants
      .filter(c => (c.isDefeated || c.heldOut) && c.initiative !== null)
      .map(c => ({ _id: c.id, initiative: null }));
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates);
  }

  /** Point the tracker at the highest living total above 0, or clear it (null). */
  async _pointAtFirstLiving() {
    return this.update({ turn: nextEligibleTurnIndex(this.turns) });
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
      // Floor at 0 — SR2 (p.78) simply stops you acting at ≤0; never show negatives.
      await current.update({ initiative: spendInitiative(current.initiative) });
    }

    // this.turns is re-sorted (descending initiative) after the update;
    // the first combatant above 0 is the next Combat Phase.
    const next = nextEligibleTurnIndex(this.turns);
    if (next === null) return this.nextRound();
    // A new Combat Phase even when the same combatant stays on top and `turn`
    // does not change — the phase counter is what expires recoil and targets.
    const result = await this.update({ turn: next, "flags.sr2e.phaseSeq": nextPhaseSeq(this) });
    // RAW (p.84): pools refresh at the START of each character's action, so the
    // combatant now taking the spotlight gets theirs back.
    if (this._poolRefreshMode() === "action") await this._refreshActorPools(this.combatant);
    return result;
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
    return this.update({ turn: Math.max(0, idx), "flags.sr2e.phaseSeq": nextPhaseSeq(this) });
  }

  /**
   * @override
   * A new Combat Turn (SR2E p.78): everyone re-rolls Initiative, and the countdown restarts from the new highest
   * total. Runs as ONE staged, resumable round change (docs/PLAN-vehicles-phase2.md 3.0) on the active GM.
   */
  async nextRound() {
    if (!game.user.isGM) return gmCall("roundAdvance", { combatId: this.id, from: this.round });
    return this.advanceRound(this.round);
  }

  /**
   * The staged round change from round `from`: closing (chase) → advancing → initiative → pointing → refreshing →
   * opening (chase). Each stage is idempotent and recorded in flags.sr2e.roundTransition, so a resume (GM reload, a
   * writer's ack) continues where it stopped. A no-op unless the combat is on `from` or a change from it is underway.
   */
  advanceRound(from) {
    return enqueueAttack(`round:${this.id}`, () => this._advance(from));
  }

  /** Resume an unfinished round change (the GM's ready pass, a writer's ack). */
  resumeRound() {
    const t = this.getFlag("sr2e", "roundTransition");
    return t ? this.advanceRound(t.from) : null;
  }

  /** @private */
  async _advance(from) {
    if (!game.user.isGM) return this;
    let t = this.getFlag("sr2e", "roundTransition");
    if (t && t.from !== from) return this;
    if (!t) {
      if (this.round !== from) return this;
      t = { from, to: from + 1, seq: (this.getFlag("sr2e", "boundarySeq") ?? 0) + 1,
            stage: hasChase(this) ? "closing" : "advancing" };
      await this.setFlag("sr2e", "roundTransition", t);
    }
    const stage = async (next) => { t = { ...t, stage: next }; await this.setFlag("sr2e", "roundTransition", t); };

    if (t.stage === "closing") {
      const r = await chaseCloseStage(this, t.from);
      if (!r.done) return this;   // waiting on players' rolls or acks; the panel lists them, the GM resumes
      await stage("advancing");
    }
    if (t.stage === "advancing") {
      await this.unsetFlag("sr2e", "lastActorId");
      // Re-roll ONLY the living: the defeated stay out with null initiative.
      await this._clearDefeatedInitiative();
      // Elementals sustaining spells spend Force at the boundary (SR2E p.142), deduplicated by `seq`, which is
      // stored before the call so a resume reuses it.
      const failures = t.from >= 1 ? await processCombatBoundary(this, t.seq, t.from) : [];
      if (this.round !== t.to) {
        await this.update({ round: t.to, turn: null, "flags.sr2e.boundarySeq": t.seq, "flags.sr2e.phaseSeq": nextPhaseSeq(this) });
      }
      if (failures.length) await postCountCards(this, t.seq, t.from, failures);
      await stage("initiative");
    }
    if (t.stage === "initiative") {
      // A resume rolls only the living still missing this round's roll (SR2ECombatant stamps initRound).
      const missing = livingCombatantIds(this.combatants).filter(id => this.combatants.get(id)?.getFlag("sr2e", "initRound") !== t.to);
      if (missing.length) await this.rollInitiative(missing, { updateTurn: false });
      const key = `${this.id}:${t.to}`;
      if (!game.messages.some(m => m.getFlag("sr2e", "roundCard") === key)) {
        await ChatMessage.create({ flags: { sr2e: { roundCard: key } }, content: `<div class="sr2e-item-card">
          <strong>Combat Turn ${t.to}</strong> — Initiative re-rolled.
          Phases count down from the highest total; each action costs 10 Initiative.
        </div>` });
      }
      await stage("pointing");
    }
    if (t.stage === "pointing") {
      await this._pointAtFirstLiving();
      await stage("refreshing");
    }
    if (t.stage === "refreshing") {
      // "round" refreshes everyone; "action" the combatant opening the Turn (the rest get theirs in nextTurn); a
      // chase also refreshes every driver, passenger and pedestrian (R2 p.42), whatever the mode.
      const mode = this._poolRefreshMode();
      const actors = t.start ? (mode === "off" ? [] : this._combatantActors())
        : mode === "round" ? this._combatantActors() : mode === "action" ? [this.combatant?.actor].filter(Boolean) : [];
      if (!await this._refreshWithReceipt(actors, t.to)) return this;   // a player's client is refreshing; it resumes us
      await stage(hasChase(this) ? "opening" : "done");
    }
    if (t.stage === "opening") {
      await chaseOpenStage(this, t.to);
    }
    await this.unsetFlag("sr2e", "roundTransition");
    return this;
  }

  /** Every distinct combatant actor (by uuid: unlinked tokens sharing a base actor keep their own pools). */
  _combatantActors() {
    const seen = new Map();
    for (const c of this.combatants) if (c.actor) seen.set(c.actor.uuid, c.actor);
    return [...seen.values()];
  }

  /**
   * Refresh `actors` plus the chase union exactly once each for round `to` (receipt flags.sr2e.poolRefresh), each
   * through its pool writer. True when every one carries the receipt; false while a player's client still owes one.
   * @private
   */
  async _refreshWithReceipt(actors, to) {
    const receipt = `${this.id}:${to}`;
    const all = new Map(actors.map(a => [a.uuid, a]));
    for (const uuid of chaseUnion(chaseOf(this))) {
      const a = fromUuidSync(uuid);
      if (a) all.set(a.uuid, a);
    }
    let done = true;
    for (const actor of all.values()) {
      if (!await requestRefresh(actor, receipt, this.id)) done = false;
    }
    return done;
  }

  /**
   * @override Snapshot the combatant actors before deletion so combat-end can
   * refresh their pools — `this.combatants` is empty by the time _onDelete runs.
   */
  async _preDelete(options, user) {
    const seen = new Map();
    // Key by uuid, not actor.id: distinct UNLINKED tokens can share a base Actor
    // id yet hold independent pools (ActorDelta), so id-dedup would drop all but one.
    for (const c of this.combatants) if (c.actor) seen.set(c.actor.uuid, c.actor);
    this._sr2eActorsAtDelete = [...seen.values()];
    return super._preDelete(options, user);
  }

  /** @override Combat ended — refresh everyone's pools for the next encounter. */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    const actors = this._sr2eActorsAtDelete;
    this._sr2eActorsAtDelete = null;
    // Only the client that ran _preDelete has the snapshot; deleting a combat
    // requires GM, so that client can update the actors.
    if (!actors || !game.user.isGM || this._poolRefreshMode() === "off") return;
    for (const actor of actors) actor.refreshDicePools?.();
  }

  /** @override Rewinding a whole Combat Turn cannot restore spent passes. */
  async previousRound() {
    ui.notifications.warn("SR2E | Previous round is not supported — Initiative re-rolls each Combat Turn.");
    return this;
  }
}
