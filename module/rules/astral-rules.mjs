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

/* ── Stage 3: fat bacteria (Corporate Security Handbook p.103) ────────────── */

/**
 * FAB-UV search TN: base 6, +1 per 50 m² (or part) searched, −1 per two
 * searchers; never below 2.
 */
export function fabSearchTN(areaM2, searchers) {
  const area = Math.max(0, Number(areaM2) || 0);
  const n = Math.max(1, Math.floor(Number(searchers) || 1));
  return Math.max(2, 6 + Math.ceil(area / 50) - Math.floor(n / 2));
}

/**
 * One intruder's result: net = searcher successes − its Stealth successes (an
 * aware intruder only). Spotted on net ≥ 1. Attacks against it are at +4, −1 per
 * success beyond the first: "5 total successes eliminates the penalty"; six or
 * more give no bonus.
 */
export function fabSearchResult(searcherSuccesses, stealthSuccesses = 0) {
  const net = Math.max(0, (searcherSuccesses || 0) - (stealthSuccesses || 0));
  return { net, spotted: net >= 1, penalty: net >= 1 ? Math.max(0, 4 - (net - 1)) : null };
}

/**
 * Is a stored reveal still live? Only if its behaviour still exists, is enabled,
 * is FAB-UV with UV lit, its UV epoch is unchanged, the token never left since
 * (exit generation unchanged), and the token is inside now.
 */
export function fabRevealValid({ record, behavior, exitGen = 0, inside }) {
  if (!record || !behavior || !inside) return false;
  if (behavior.disabled || behavior.strain !== "fabuv" || !behavior.uvLit) return false;
  return record.epoch === (behavior.uvEpoch ?? 0) && record.gen === (exitGen ?? 0);
}

/**
 * Astral speed per Combat Phase (SR2 p.146): normal = Astral Quickness × 4 m;
 * fast = Magic km per action (a finite, map-dwarfing Magic × 1000 m).
 */
export function astralCaps({ astralQuickness, magic }) {
  return { normal: Math.max(0, Math.floor(astralQuickness || 0)) * 4, fast: Math.max(0, Math.floor(magic || 0)) * 1000 };
}

/**
 * Charge a move by the mode it was travelled in. Metres inside FAB always count
 * as normal movement (FAB forbids fast, CSH p.103); the rest count as fast only
 * while the fast toggle is on. Additive, so split and unsplit routes cost the same.
 */
export function chargeAstralMove({ metres, fabMetres = 0, fast }) {
  const total = Math.max(0, metres || 0), inFab = Math.min(total, Math.max(0, fabMetres || 0));
  return fast ? { normal: inFab, fast: total - inFab } : { normal: total, fast: 0 };
}

/** Apply a charge to the phase ledger against both caps. */
export function astralMoveDecision(ledger = {}, charge, caps) {
  const EPS = 0.01;
  const normal = (ledger.normal ?? 0) + charge.normal, fast = (ledger.fast ?? 0) + charge.fast;
  const allowed = normal <= caps.normal + EPS && fast <= caps.fast + EPS;
  return { allowed, normal, fast, over: normal > caps.normal + EPS ? "normal" : fast > caps.fast + EPS ? "fast" : null };
}
