/**
 * Drop a freshly-summoned spirit's token onto the active scene, per the
 * `spiritPlacement` world setting:
 *   - "nearest" (default): the nearest open cell to the caster's token
 *   - "prompt": click the map to choose the spot
 *   - "off": do nothing — the spirit actor is in the sidebar, drag it out
 *
 * Runs on the summoner's own client (they created the actor and own the scene-
 * write). Best-effort: any failure is logged and swallowed, because the spirit
 * actor already exists and is bound — a placement hiccup must never break the
 * summon. Only the SQUARE grid gets the ring search; hex/gridless fall back to
 * dropping one cell beside the caster.
 */
import { nearestFreeCell } from "./rules/sr2e-rules.mjs";

/** How long click-to-place waits for a click before giving up (ms). */
const PROMPT_TIMEOUT = 60000;

/**
 * @param {Actor} spirit - the created spirit actor
 * @param {Actor} caster - the summoning character
 * @returns {Promise<void>}
 */
export async function placeSummonedToken(spirit, caster) {
  try {
    if (!spirit || !canvas?.ready || !canvas.scene) return;
    let mode = "nearest";
    try { mode = game.settings.get("sr2e", "spiritPlacement"); } catch (e) { /* default */ }
    if (mode === "off") return;

    // Creating a Token is a separate right from creating an Actor. A player with
    // "Create New Actors" but not token-create can't place — skip cleanly rather
    // than prompt-then-fail.
    if (!game.user.isGM && !game.user.hasPermission?.("TOKEN_CREATE")) return;

    const scene = canvas.scene;

    // Token payload from the spirit's prototype (carries the portrait/size).
    const proto = (await spirit.getTokenDocument()).toObject();
    delete proto._id;
    const fw = Math.max(1, Math.round(proto.width ?? 1));
    const fh = Math.max(1, Math.round(proto.height ?? 1));

    const point = mode === "prompt"
      ? await _promptForPoint(spirit.name)
      : _nearestPoint(caster, fw, fh);
    if (!point) return;                    // cancelled / no anchor / no room

    // Guard against a scene swap mid-prompt.
    if (canvas.scene !== scene) return;

    proto.x = Math.round(point.x);
    proto.y = Math.round(point.y);
    await scene.createEmbeddedDocuments("Token", [proto]);
  } catch (err) {
    console.warn("SR2E | could not place the summoned token (the spirit actor still exists — drag it out):", err);
    ui.notifications?.warn(`Couldn't auto-place ${spirit?.name ?? "the spirit"} — drag it onto the map from the sidebar.`);
  }
}

/** Top-left pixel point for the nearest open cell to the caster, or null. */
function _nearestPoint(caster, fw, fh) {
  const grid = canvas.grid;
  const casterToken = caster?.getActiveTokens?.()?.[0];
  if (!casterToken) return null;         // caster has no token on this scene → no anchor

  // Non-square grids: skip the col/row ring math, just offset one cell over.
  if (grid.type !== CONST.GRID_TYPES.SQUARE) {
    const c = casterToken.center;
    return { x: c.x + grid.sizeX - (fw * grid.sizeX) / 2, y: c.y - (fh * grid.sizeY) / 2 };
  }

  // getOffset's cell origin sits at the padded-canvas corner, so translate every
  // offset relative to the inner SCENE rect's top-left cell before searching, and
  // translate the result back. Otherwise padding throws the bounds off (cells at
  // the right/bottom of the scene get wrongly rejected).
  const dims = canvas.dimensions;
  const base = grid.getOffset({ x: dims.sceneX, y: dims.sceneY });   // {i,j} of scene top-left
  const rel = (o) => ({ col: o.j - base.j, row: o.i - base.i });

  const origin = rel(grid.getOffset(casterToken.center));

  const occupied = new Set();
  for (const t of canvas.scene.tokens) {
    const o = rel(grid.getOffset({ x: t.x, y: t.y }));
    const w = Math.max(1, Math.round(t.width ?? 1));
    const h = Math.max(1, Math.round(t.height ?? 1));
    for (let dc = 0; dc < w; dc++) for (let dr = 0; dr < h; dr++) occupied.add(`${o.col + dc},${o.row + dr}`);
  }

  const bounds = {
    cols: Math.floor(dims.sceneWidth / grid.sizeX),
    rows: Math.floor(dims.sceneHeight / grid.sizeY)
  };
  const cell = nearestFreeCell(origin, occupied, bounds, { footprint: { w: fw, h: fh } });
  if (!cell) return null;
  return grid.getTopLeftPoint({ i: cell.row + base.i, j: cell.col + base.j });
}

/**
 * Resolve to the top-left pixel of the clicked cell, or null on cancel. Uses
 * canvas.mousePosition (world coords) rather than raw event coords, and cancels
 * on Escape OR a scene change so the summon promise never hangs.
 */
function _promptForPoint(name) {
  return new Promise((resolve) => {
    const stage = canvas.stage;
    let settled = false;
    const note = ui.notifications.info(`Click the map to place ${name}. (Esc to cancel.)`, { permanent: true });
    let timer;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stage.off("pointerdown", onClick);
      window.removeEventListener("keydown", onKey, true);
      Hooks.off("canvasTearDown", onTearDown);
      try { ui.notifications.remove?.(note); } catch (e) { /* older API */ }
      resolve(value);
    };
    const onClick = (event) => {
      event?.stopPropagation?.();
      const grid = canvas.grid;
      const m = canvas.mousePosition ?? event?.getLocalPosition?.(stage);
      if (!m) return done(null);
      const tl = grid.type === CONST.GRID_TYPES.GRIDLESS
        ? { x: m.x - grid.sizeX / 2, y: m.y - grid.sizeY / 2 }
        : grid.getTopLeftPoint(grid.getOffset(m));
      done(tl);
    };
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); done(null); } };
    const onTearDown = () => done(null);
    // Never wait forever: an unanswered prompt (nobody at the keyboard, an
    // automated caller) must self-cancel so the awaiting summon always settles.
    timer = setTimeout(() => {
      ui.notifications?.warn(`Placement for ${name} timed out — drag it onto the map from the sidebar.`);
      done(null);
    }, PROMPT_TIMEOUT);
    stage.on("pointerdown", onClick);
    window.addEventListener("keydown", onKey, true);
    Hooks.once("canvasTearDown", onTearDown);
  });
}
