/**
 * Astral movement through walls (docs/PLAN-astral-barriers.md, Stage 1).
 *
 * SR2 p.145: something ON the astral plane "can freely pass through" inanimate
 * objects — but cannot see through them, and living things block it. So for a
 * token on the astral plane (isOnAstralPlane: an astral form or astral-only token,
 * never a projecting mage's body), the MOVE sweep drops ordinary walls, keeps walls
 * flagged as an astral barrier (living wall, fat-bacteria cavity — physical walls
 * whose doors still work), and always keeps wards (astral-only barriers). Sight,
 * light and sound use their own backends, so walls still block astral vision.
 *
 * One override covers every tactical path: Token#checkCollision and the movement
 * path helper both hand the backend a PointMovementSource whose `object` is the
 * moving token. Teleport and `displace` (walls: null) bypass, as in core.
 */

import { isOnAstralPlane, astralBarrierKind, astralEdgeDecision, sceneAstralWalls, ASTRAL_BARRIER_KINDS }
  from "./rules/astral-rules.mjs";

const WORLD_DEFAULT = "astralWallsDefault";

/** Whether astral walls apply on this scene (its flag "on"/"off", else the world default). */
export function astralWallsOn(scene) {
  const f = scene?.getFlag?.("sr2e", "astralWalls");
  let def = true;
  try { def = game.settings.get("sr2e", WORLD_DEFAULT); } catch (e) { /* default */ }
  const v = f === "on" || f === true ? true : f === "off" || f === false ? false : undefined;
  return sceneAstralWalls(v, def);
}

export function registerAstralWalls() {
  game.settings.register("sr2e", WORLD_DEFAULT, {
    name: "Astral forms pass walls",
    hint: "Tokens on the astral plane (astral forms, unmanifested spirits) walk through ordinary walls but are stopped by walls flagged as an astral barrier (SR2E p.145). Each scene can override this.",
    scope: "world", config: true, type: Boolean, default: true
  });

  // Subclass whatever move backend is registered (another module's included).
  const Base = CONFIG.Canvas.polygonBackends.move;
  CONFIG.Canvas.polygonBackends.move = class SR2EMovePolygon extends Base {
    /** @override */
    initialize(origin, config) {
      this._sr2eAstral = undefined;   // per-mover cache, reset on every (re)initialization
      return super.initialize(origin, config);
    }

    /** @override */
    _testEdgeInclusion(edge, edgeTypes) {
      // Decided once per polygon (the hot path runs this for every edge).
      this._sr2eAstral ??= (() => {
        const token = this.config?.source?.object;
        return this.config?.type === "move" && !!token?.document
          && isOnAstralPlane(token.document.flags?.sr2e) && astralWallsOn(token.document.parent);
      })();
      const astral = this._sr2eAstral;
      const decision = astralEdgeDecision({
        astral, wallEdge: edge.type === "wall",
        kind: astral ? astralBarrierKind(edge.object?.document?.flags?.sr2e) : null
      });
      if (decision === "exclude") return false;
      if (decision === "include") {
        // A ward ignores its PHYSICAL move setting, but still honours the polygon's
        // eligibility filters, exactly as core checks them first.
        const edgeType = edgeTypes[edge.type], m = edgeType?.mode;
        if (!m) return false;
        if (m === 2) return true;
        if (edge.priority < edgeType.priority) return false;
        for (const shape of this.config.boundaryShapes ?? []) {
          if (shape._includeEdge && !shape._includeEdge(edge.a, edge.b)) return false;
        }
        return !!edge.orientPoint(this.origin);   // not collinear with the mover
      }
      return super._testEdgeInclusion(edge, edgeTypes);
    }
  };
}

const LABELS = { "": "None", living: "Living wall", fab: "Fat bacteria (filled cavity)", ward: "Ward / circle (astral only)" };
const BARRIER_COLOR = 0x3fbf5f;

function formGroup(label, control, hint) {
  const g = document.createElement("div");
  g.className = "form-group";
  g.innerHTML = `<label>${label}</label><div class="form-fields">${control}</div>${hint ? `<p class="hint">${hint}</p>` : ""}`;
  return g;
}

export function registerAstralWallHooks() {
  // Wall config: the astral barrier kind.
  Hooks.on("renderWallConfig", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector('[name="flags.sr2e.astralBarrier"]')) return;
    const cur = astralBarrierKind(app.document?.flags?.sr2e) ?? "";
    const opts = ["", ...ASTRAL_BARRIER_KINDS]
      .map(k => `<option value="${k}" ${k === cur ? "selected" : ""}>${LABELS[k]}</option>`).join("");
    const group = formGroup("Astral barrier", `<select name="flags.sr2e.astralBarrier">${opts}</select>`,
      "What stops a token on the astral plane (SR2E p.145). Ordinary walls don't. Living walls and fat-bacteria walls block everyone. Draw a ward or circle with movement, sight and sound set to None, so it stops only astral forms.");
    const anchor = root.querySelector('[name="move"]')?.closest(".form-group");
    if (anchor) anchor.after(group); else root.querySelector("form, .window-content")?.append(group);
    app.setPosition?.({ height: "auto" });
  });

  // Scene config: per-scene override.
  Hooks.on("renderSceneConfig", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector('[name="flags.sr2e.astralWalls"]')) return;
    const raw = app.document?.getFlag("sr2e", "astralWalls");
    const cur = raw === true || raw === "on" ? "on" : raw === false || raw === "off" ? "off" : "";
    const opt = (v, l) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`;
    const group = formGroup("Astral forms pass walls",
      `<select name="flags.sr2e.astralWalls">${opt("", "World default")}${opt("on", "On")}${opt("off", "Off")}</select>`,
      "Astral forms and unmanifested spirits walk through ordinary walls here (SR2E p.145).");
    const tab = root.querySelector('.tab[data-tab="basics"]') ?? root.querySelector(".tab");
    tab?.append(group);
  });

  // GM cue: astral barrier walls draw green.
  Hooks.on("refreshWall", (wall) => {
    if (!game.user.isGM || !wall.line) return;
    // Assign both ways, or clearing the flag leaves the wall green.
    wall.line.tint = astralBarrierKind(wall.document.flags?.sr2e) ? BARRIER_COLOR : 0xFFFFFF;
  });
  Hooks.on("updateWall", (doc, changes) => {
    // Set, changed, or removed (unsetFlag sends "flags.sr2e.-=astralBarrier"; a whole-scope unset "flags.-=sr2e").
    const keys = Object.keys(foundry.utils.flattenObject(changes.flags ?? {}));
    if (keys.some(k => k.includes("astralBarrier") || k === "-=sr2e"))
      doc.object?.renderFlags.set({ refreshLine: true });
  });
}
