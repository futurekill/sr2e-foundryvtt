/**
 * Astral movement — the pure decisions (docs/PLAN-astral-barriers.md). No Foundry
 * here: module/astral-walls.mjs feeds these token and wall flags.
 *
 * SR2 p.145: an astral form "can freely pass through" inanimate objects but cannot
 * see through them; living things (and the Earth) are corporeal in astral space and
 * block it. Hermetic circles and medicine lodges are barriers (p.147). Corporate
 * Security Handbook p.37–39 adds living walls and fat-bacteria-filled walls.
 */

/** The astral barrier kinds a wall can carry (flags.sr2e.astralBarrier). */
export const ASTRAL_BARRIER_KINDS = ["living", "fab", "ward"];

/**
 * Is this token ON the astral plane (not merely a body perceiving it)? Only its own
 * flags count — a projecting mage's BODY token stays physical, and the actor's
 * astralState is deliberately not consulted (it is also O(1) for the sweep).
 * @param {object} [sr2eFlags]  the token's flags.sr2e
 */
export function isOnAstralPlane(sr2eFlags) {
  return !!(sr2eFlags?.astralForm || sr2eFlags?.astralOnly);
}

/** A wall's astral barrier kind, or null for an ordinary wall. */
export function astralBarrierKind(sr2eFlags) {
  const k = sr2eFlags?.astralBarrier;
  return ASTRAL_BARRIER_KINDS.includes(k) ? k : null;
}

/**
 * How the move sweep treats one edge for a moving token.
 *   "super"   — Foundry's normal rule (physical blocking, doors, direction…)
 *   "exclude" — the edge does not exist for this mover
 *   "include" — the edge blocks regardless of its physical movement setting
 * @param {{astral:boolean, wallEdge:boolean, kind:string|null}} p
 */
export function astralEdgeDecision({ astral, wallEdge, kind }) {
  if (!astral || !wallEdge) return "super";
  if (!kind) return "exclude";            // inanimate: walk through, closed doors too
  if (kind === "ward") return "include";  // astral-only barrier: blocks even if physical move is NONE
  return "super";                         // living / FAB: a physical wall too; its doors work
}

/** Whether astral walls apply on a scene: its own flag, else the world default. */
export function sceneAstralWalls(sceneFlag, worldDefault = true) {
  return typeof sceneFlag === "boolean" ? sceneFlag : !!worldDefault;
}

/* ── Stage 2: projection leaves the body ──────────────────────────────────── */

/**
 * Is this token a projecting BODY that should have an astral form? Linked actors
 * only (plan item 8); never a form, an astral-only token or a Matrix persona.
 * @param {{actorLink:boolean, projecting:boolean, flags?:object}} t
 */
export function isProjectingBody(t) {
  const f = t?.flags ?? {};
  return !!(t?.actorLink && t.projecting && !f.astralForm && !f.astralOnly && !f.persona);
}

/**
 * What one scene needs so every projecting body has exactly one astral form
 * (plan items 9–10). Pure: the GM's reconcile feeds it the scene's tokens.
 * Among duplicate forms for one body the lowest id survives, so two writers
 * (two tabs of one GM user) always pick the same survivor and converge.
 * @param {{id:string, uuid:string, actorLink:boolean, projecting:boolean, flags?:object}[]} tokens
 * @returns {{create: string[], remove: {id:string, bodyUuid:string, reason:"returned"|"duplicate"}[]}}
 *          create: body UUIDs needing a form; remove: surplus form tokens
 */
export function desiredForms(tokens = []) {
  const bodies = new Set(tokens.filter(isProjectingBody).map(t => t.uuid));
  const formsByBody = new Map();
  for (const t of tokens) {
    const b = t.flags?.astralForm;
    if (!b) continue;
    if (!formsByBody.has(b)) formsByBody.set(b, []);
    formsByBody.get(b).push(t);
  }
  const remove = [];
  for (const [bodyUuid, forms] of formsByBody) {
    forms.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (!bodies.has(bodyUuid)) { for (const f of forms) remove.push({ id: f.id, bodyUuid, reason: "returned" }); continue; }
    for (const f of forms.slice(1)) remove.push({ id: f.id, bodyUuid, reason: "duplicate" });
  }
  const create = [...bodies].filter(b => !formsByBody.has(b));
  return { create, remove };
}

/** Did the body move while its form was out (the p.146 search for a moved body)? */
export function bodyMovedWhileOut(origin, body) {
  if (!origin || !body) return false;
  return origin.x !== body.x || origin.y !== body.y;
}
