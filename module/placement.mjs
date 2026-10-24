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

/**
 * This spirit's tokens on a scene. A token's own (synthetic) actor is exactly
 * its token; a world actor is its linked tokens plus unlinked copies that have
 * not diverged (an empty delta) — an unlinked copy with its own state is an
 * independent instance and is left alone.
 */
export function tokensOf(spirit, scene) {
  if (spirit.isToken) return scene.tokens.filter(t => t.actor?.uuid === spirit.uuid);
  const pristine = (t) => {
    const d = t.delta?._source ?? {};
    return foundry.utils.isEmpty(d.system ?? {}) && foundry.utils.isEmpty(d.flags ?? {}) && !(d.items?.length) && !(d.effects?.length);
  };
  return scene.tokens.filter(t => t.actorId === spirit.id && (t.actorLink || pristine(t)));
}

/** How long click-to-place waits for a click before giving up (ms). */
const PROMPT_TIMEOUT = 60000;

/**
 * @param {Actor} spirit - the created spirit actor
 * @param {Actor} caster - the summoning character
 * @returns {Promise<void>}
 */
export async function placeSummonedToken(spirit, caster) {
  try {
    if (!spirit) return;
    if (!canvas?.ready || !canvas.scene) {
      // A device with no map (the mobile companion): the spirit exists and is
      // bound; only its token waits for someone at the map.
      if (game.settings.get("core", "noCanvas")) ui.notifications.info(`${spirit.name} is summoned. Place its token from a device with the map.`);
      return;
    }
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
    // A spirit that departed (sunrise/sunset, p.139) or was deleted while we
    // waited gets no token. The check and the create aren't atomic, so the
    // token also names its spirit, and the active GM removes it if the spirit
    // is gone by the time it lands (nature-spirits.mjs).
    const live = fromUuidSync(spirit.uuid);
    if (!live || live.getFlag("sr2e", "departed")) return;
    // A bound elemental placed by Call must still be present (a Send away wins).
    if (live.system?.spiritType === "elemental" && live.system.conjurerUuid
        && !Number.isFinite(live.getFlag("sr2e", "presentSince"))) return;
    if (tokensOf(live, scene).length) return;                         // already on the map
    foundry.utils.setProperty(proto, "flags.sr2e.summonedSpirit", spirit.uuid);
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
 * Resolve to the top-left pixel of the clicked cell, or null on cancel.
 */
function _promptForPoint(name) {
  return awaitCanvasClick(`Click the map to place ${name}. (Esc to cancel.)`,
    `Placement for ${name} timed out — drag it onto the map from the sidebar.`,
    (m) => {
      const grid = canvas.grid;
      return grid.type === CONST.GRID_TYPES.GRIDLESS
        ? { x: m.x - grid.sizeX / 2, y: m.y - grid.sizeY / 2 }
        : grid.getTopLeftPoint(grid.getOffset(m));
    });
}

/**
 * Ask the user to click a point on the map — the centre of an area spell.
 * Resolves to the clicked WORLD point {x, y}, or null on Escape, timeout, a
 * canvas teardown, or no canvas at all. Callers must treat null as a cancel.
 * @param {string} label - what is being placed, for the prompt
 * @param {object} [preview] - the area, drawn under the cursor before the click:
 *   `{ radius }` (scene distance units, a circle) or `{ side }` (a square), plus an
 *   optional `note` for the label (e.g. "before scatter") and `include(token)`, which
 *   tokens count as caught (the caller's own targeting rule).
 * @returns {Promise<{x:number, y:number}|null>}
 */
export function promptForCanvasPoint(label, preview = null) {
  if (!canvas?.ready) return Promise.resolve(null);
  return awaitCanvasClick(`Click the map to centre ${label}. (Esc to cancel.)`,
    `${label}: no point chosen — cancelled.`,
    (m) => ({ x: m.x, y: m.y }), preview);
}

/** Tokens on the viewed scene whose centre lies inside the previewed area at `c` (and pass `include`). */
export function tokensInArea(c, { radiusPx = null, sidePx = null, include = null }) {
  return (canvas.tokens?.placeables ?? []).filter(tok => {
    if (!tok.visible || tok.document.hidden && !game.user.isGM) return false;
    if (include && !include(tok)) return false;
    const p = tok.center;
    if (sidePx != null) return Math.abs(p.x - c.x) <= sidePx / 2 && Math.abs(p.y - c.y) <= sidePx / 2;
    return Math.hypot(p.x - c.x, p.y - c.y) <= radiusPx + 1e-6;
  });
}

/**
 * The area under the cursor while a point is being picked: the circle or square at its
 * real size, a ring on every token it would catch, and a label with the size and count.
 * Returns { move(point), destroy() }.
 */
function areaPreview({ radius = null, side = null, note = "", include = null } = {}) {
  const ppu = canvas.dimensions.distancePixels;   // pixels per scene distance unit (metres)
  const units = canvas.scene?.grid?.units || "m";
  const radiusPx = radius != null ? Math.max(0, radius) * ppu : null;
  const sidePx = side != null ? Math.max(0, side) * ppu : null;
  const g = new PIXI.Graphics();
  const text = new PIXI.Text("", { fontFamily: "Signika, sans-serif", fontSize: 18, fill: 0xffffff,
    stroke: 0x000000, strokeThickness: 4 });
  text.anchor.set(0.5, 1);
  const layer = canvas.interface ?? canvas.stage;
  layer.addChild(g);
  layer.addChild(text);
  const colour = 0xff6a00;
  const size = sidePx != null ? `${Math.round(side * 10) / 10} ${units} square` : `${Math.round(radius * 10) / 10} ${units} radius`;
  return {
    move(c) {
      g.clear();
      g.lineStyle(3, colour, 0.95).beginFill(colour, 0.18);
      if (sidePx != null) g.drawRect(c.x - sidePx / 2, c.y - sidePx / 2, sidePx, sidePx);
      else g.drawCircle(c.x, c.y, radiusPx);
      g.endFill();
      g.lineStyle(2, colour, 0.95).moveTo(c.x - 8, c.y).lineTo(c.x + 8, c.y).moveTo(c.x, c.y - 8).lineTo(c.x, c.y + 8);
      const caught = tokensInArea(c, { radiusPx, sidePx, include });
      for (const tok of caught) {
        g.lineStyle(3, 0xffd000, 1).drawCircle(tok.center.x, tok.center.y, Math.max(tok.w, tok.h) / 2 + 4);
      }
      text.text = `${size} · ${caught.length} token${caught.length === 1 ? "" : "s"}${note ? ` · ${note}` : ""}`;
      text.position.set(c.x, c.y - (sidePx != null ? sidePx / 2 : radiusPx) - 6);
    },
    destroy() { g.destroy(); text.destroy(); }
  };
}

/**
 * Wait for one click on the canvas and map it through `toPoint` (world
 * coordinates). Cancels on Escape OR a scene change so the awaiting promise
 * never hangs.
 */
function awaitCanvasClick(prompt, timeoutMsg, toPoint, preview = null) {
  return new Promise((resolve) => {
    const stage = canvas.stage;
    let settled = false;
    const note = ui.notifications.info(prompt, { permanent: true });
    let timer;
    // The area follows the pointer until the click (an area spell, a blast, the Ice Sheet).
    let shown = null;
    try { if (preview && (preview.radius != null || preview.side != null)) shown = areaPreview(preview); }
    catch (err) { console.error("sr2e | area preview", err); }
    const onMove = (event) => {
      const m = event?.getLocalPosition?.(stage) ?? canvas.mousePosition;
      if (m) shown?.move(m);
    };
    if (shown) {
      stage.on("pointermove", onMove);
      if (canvas.mousePosition) shown.move(canvas.mousePosition);
    }
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (shown) { stage.off("pointermove", onMove); shown.destroy(); }
      stage.off("pointerdown", onClick);
      window.removeEventListener("keydown", onKey, true);
      Hooks.off("canvasTearDown", onTearDown);
      try { ui.notifications.remove?.(note); } catch (e) { /* older API */ }
      resolve(value);
    };
    const onClick = (event) => {
      event?.stopPropagation?.();
      // The click's OWN position first: canvas.mousePosition only updates on
      // pointer MOVE, so a tap (touch, pen, or a click with no move before it)
      // would land wherever the pointer last moved.
      const m = event?.getLocalPosition?.(stage) ?? canvas.mousePosition;
      done(m ? toPoint(m) : null);
    };
    // Escape cancels the prompt and goes no further (it would also open Foundry's main menu).
    // stopPropagation, not stopImmediatePropagation: another pending prompt's listener on
    // window must still hear it.
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); } };
    const onTearDown = () => done(null);
    // Never wait forever: an unanswered prompt (nobody at the keyboard, an
    // automated caller) must self-cancel so the awaiting caller always settles.
    timer = setTimeout(() => {
      ui.notifications?.warn(timeoutMsg);
      done(null);
    }, PROMPT_TIMEOUT);
    stage.on("pointerdown", onClick);
    window.addEventListener("keydown", onKey, true);
    Hooks.once("canvasTearDown", onTearDown);
  });
}
