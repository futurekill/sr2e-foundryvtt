/**
 * Drop a freshly-summoned spirit's token onto the active scene, per the
 * `spiritPlacement` world setting:
 *   - "nearest" (default): the nearest open cell to the caster's token
 *   - "prompt": click the map to choose the spot
 *   - "off": do nothing — the spirit actor is in the sidebar, drag it out
 *
 * Runs on the summoner's own client (they created the actor + own the scene-
 * write). Best-effort: any failure is logged and swallowed, because the spirit
 * actor already exists and is bound — a placement hiccup must never break the
 * summon. Only the SQUARE grid gets the ring search; hex/gridless fall back to
 * dropping one cell beside the caster.
 */
import { nearestFreeCell } from "./rules/sr2e-rules.mjs";

/**
 * @param {Actor} spirit - the created spirit actor
 * @param {Actor} caster - the summoning character
 * @returns {Promise<void>}
 */
export async function placeSummonedToken(spirit, caster) {
  try {
    if (!spirit || !canvas?.ready) return;
    let mode = "nearest";
    try { mode = game.settings.get("sr2e", "spiritPlacement"); } catch (e) { /* default */ }
    if (mode === "off") return;

    const scene = canvas.scene;
    if (!scene) return;

    // Token payload from the spirit's prototype (carries the portrait/size).
    const proto = (await spirit.getTokenDocument()).toObject();
    delete proto._id;
    const fw = Math.max(1, Math.round(proto.width ?? 1));
    const fh = Math.max(1, Math.round(proto.height ?? 1));

    let point = mode === "prompt"
      ? await _promptForPoint(spirit.name)
      : _nearestPoint(caster, fw, fh);
    if (!point) return;                    // cancelled / no anchor / no room

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

  const anchor = grid.getOffset(casterToken.center);     // {i: row, j: col}
  const origin = { col: anchor.j, row: anchor.i };

  // Occupancy = every cell covered by every token already on the scene.
  const occupied = new Set();
  for (const t of canvas.scene.tokens) {
    const o = grid.getOffset({ x: t.x, y: t.y });
    const w = Math.max(1, Math.round(t.width ?? 1));
    const h = Math.max(1, Math.round(t.height ?? 1));
    for (let dc = 0; dc < w; dc++) for (let dr = 0; dr < h; dr++) occupied.add(`${o.j + dc},${o.i + dr}`);
  }

  const dims = canvas.dimensions;
  const bounds = {
    cols: Math.floor(dims.sceneWidth / grid.sizeX),
    rows: Math.floor(dims.sceneHeight / grid.sizeY)
  };
  const cell = nearestFreeCell(origin, occupied, bounds, { footprint: { w: fw, h: fh } });
  if (!cell) return null;
  return grid.getTopLeftPoint({ i: cell.row, j: cell.col });
}

/** Resolve to a world {x,y} when the user clicks the canvas, or null on Escape. */
function _promptForPoint(name) {
  return new Promise((resolve) => {
    ui.notifications.info(`Click the map to place ${name}. (Esc to cancel.)`);
    const stage = canvas.stage;
    const done = (value) => {
      stage.off("pointerdown", onClick);
      window.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const onClick = (event) => {
      const p = event.getLocalPosition(stage);
      // Snap to the grid so the token lands on a cell.
      const snapped = canvas.grid.getSnappedPoint(p, { mode: CONST.GRID_SNAPPING_MODES?.TOP_LEFT_VERTEX ?? 0 }) ?? p;
      done(snapped);
    };
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); done(null); } };
    stage.on("pointerdown", onClick);
    window.addEventListener("keydown", onKey, true);
  });
}
