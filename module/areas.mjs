/**
 * Map areas: blasts, shotgun spreads, area spells, Poltergeist, Ice Sheet, rituals
 * (docs/PLAN-v16-prep.md §1). v14 merges MeasuredTemplate into Region and v16 removes
 * the template shim, so:
 * - v13 creates MeasuredTemplates (v13 Regions have no cone);
 * - v14+ creates Regions, built by Foundry's own template conversion so the shape,
 *   grid handling and author ownership match exactly what v14 makes of a template.
 * Reads never touch v14's template shim: v13 reads `scene.templates`, v14+ reads
 * `scene.regions` (old templates arrive there already migrated, flags intact).
 * Callers keep passing the MeasuredTemplate data they always built ("spec").
 */

export const usesRegions = () => (game.release?.generation ?? 13) >= 14;

const normDeg = (d) => (((Number(d) || 0) % 360) + 360) % 360;

/**
 * Foundry's v14 template → Region shape (BaseRegion._migrateMeasuredTemplateData) for a
 * gridless shape, ported for when that internal static is missing. Pinned by Vitest
 * against the v14.369 outputs.
 */
export function templateShape(spec, gridSize, gridDistance, { coneTemplateType = "round", gridBased = false } = {}) {
  const px = gridSize / gridDistance;
  const x = Math.round(spec.x || 0), y = Math.round(spec.y || 0);
  const distance = Math.abs(spec.distance || 0);
  const direction = normDeg(spec.direction);
  switch (spec.t || "circle") {
    case "circle": return { type: "circle", x, y, radius: distance * px, gridBased };
    case "cone": {
      const angle = Math.min(360, Math.max(0, spec.angle === null ? 90 : (spec.angle || 0)));
      return { type: "cone", x, y, radius: distance * px, angle, rotation: direction,
        curvature: gridBased || coneTemplateType === "round" ? "round" : "flat", gridBased };
    }
    case "rect": {
      const r = direction * Math.PI / 180;
      let width = Math.abs(Math.cos(r) * distance) * px, height = Math.abs(Math.sin(r) * distance) * px;
      const rotation = Math.floor(direction / 90) * 90;
      if (rotation === 90 || rotation === 270) [width, height] = [height, width];
      return { type: "rectangle", x, y, width, height, anchorX: 0, anchorY: 0, rotation, gridBased };
    }
    default: return null;
  }
}

/** Region data for a template spec: Foundry's own conversion, else the port above. */
function regionData(scene, spec, author) {
  let gridTemplates = false, coneTemplateType = "round";
  try { gridTemplates = !!game.settings.get("core", "gridTemplates"); } catch (e) { /* default */ }
  try { coneTemplateType = game.settings.get("core", "coneTemplateType") || "round"; } catch (e) { /* default */ }
  const Cls = CONFIG.Region.documentClass;
  let data;
  if (typeof Cls._migrateMeasuredTemplateData === "function") {
    data = Cls._migrateMeasuredTemplateData({ ...spec, author: author.id },
      { grid: scene.grid, gridTemplates, coneTemplateType, users: [{ _id: author.id, name: author.name }] });
  } else {
    // Port of the same conversion. A grid-based rectangle is measured on the scene's own
    // grid (its diagonal rules), exactly as Foundry does; everything else is pure maths.
    const shape = templateShape(spec, scene.grid.size, scene.grid.distance, { coneTemplateType, gridBased: gridTemplates });
    if (shape?.type === "rectangle" && gridTemplates) {
      const grid = scene.grid, px = grid.size / grid.distance;
      const { x: x1, y: y1 } = grid.getTranslatedPoint({ x: shape.x, y: shape.y }, normDeg(spec.direction), Math.abs(spec.distance || 0));
      let w = grid.measurePath([{ x: shape.x, y: shape.y }, { x: x1, y: shape.y }]).distance * px;
      let h = grid.measurePath([{ x: shape.x, y: shape.y }, { x: shape.x, y: y1 }]).distance * px;
      if (shape.rotation === 90 || shape.rotation === 270) [w, h] = [h, w];
      Object.assign(shape, { width: w, height: h });
    }
    data = { name: `${shape.type.charAt(0).toUpperCase()}${shape.type.slice(1)} Template [${author.name}]`,
      color: spec.fillColor || "#ff0000", shapes: [shape], elevation: { bottom: 0, top: null },
      visibility: CONST.REGION_VISIBILITY?.ALWAYS ?? 2, displayMeasurements: true,
      ownership: { default: 0, [author.id]: 3 }, flags: foundry.utils.deepClone(spec.flags ?? {}) };
  }
  delete data._id;
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, { sr2e: { area: true } }, { inplace: false });
  return data;
}

/** May this user place an area? */
export function canCreateArea() {
  return !!game.user?.can?.(usesRegions() ? "REGION_CREATE" : "TEMPLATE_CREATE");
}

/** Place an area from MeasuredTemplate data. Returns the created document. */
export async function createArea(scene, spec, { author = game.user } = {}) {
  if (!usesRegions()) return (await scene.createEmbeddedDocuments("MeasuredTemplate", [spec]))[0];
  return (await scene.createEmbeddedDocuments("Region", [regionData(scene, spec, author)]))[0];
}

/** This system's area documents on a scene (no v14 template shim). */
export function areaDocs(scene) {
  if (!scene) return [];
  return usesRegions() ? scene.regions.filter(r => r.flags?.sr2e) : [...(scene.templates ?? [])];
}

/** Every scene's area documents matching `pred(doc)`. */
export const allAreaDocs = (pred = () => true) => game.scenes.contents.flatMap(s => areaDocs(s).filter(pred));

/** A rectangle's true outline: corners offset by its anchor, rotated about (x, y). */
function rectPolygon(x, y, w, h, rotation = 0, anchorX = 0, anchorY = 0) {
  const r = rotation * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const ox = -anchorX * w, oy = -anchorY * h;
  return [[0, 0], [w, 0], [w, h], [0, h]].map(([dx, dy]) => {
    const px = dx + ox, py = dy + oy;
    return { x: x + px * c - py * s, y: y + px * s + py * c };
  });
}
const boxOf = (poly) => {
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

/**
 * An area's geometry, normalized: `{shape, x, y, radius, angle, direction, rect}`.
 * radius is in SCENE DISTANCE UNITS (as `template.distance` always was); a rectangle
 * has its true px outline (`polygon`, for collision) and its bounding `rect`.
 * Unsupported shapes → null.
 */
export function areaShape(doc) {
  const scene = doc.parent;
  const px = scene ? scene.grid.size / scene.grid.distance : 1;
  if (doc.documentName === "MeasuredTemplate") {
    const t = doc.t;
    if (t === "circle") return { shape: "circle", x: doc.x, y: doc.y, radius: doc.distance };
    if (t === "cone") return { shape: "cone", x: doc.x, y: doc.y, radius: doc.distance, angle: doc.angle, direction: doc.direction };
    if (t === "rect") {
      const r = normDeg(doc.direction) * Math.PI / 180;
      const dx = Math.cos(r) * doc.distance * px, dy = Math.sin(r) * doc.distance * px;
      const rect = { x: Math.min(doc.x, doc.x + dx), y: Math.min(doc.y, doc.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
      return { shape: "rect", x: doc.x, y: doc.y, rect, polygon: rectPolygon(rect.x, rect.y, rect.w, rect.h) };
    }
    return null;
  }
  const sh = doc.shapes?.[0];
  if (!sh) return null;
  if (sh.type === "circle") return { shape: "circle", x: sh.x, y: sh.y, radius: sh.radius / px };
  if (sh.type === "cone") return { shape: "cone", x: sh.x, y: sh.y, radius: sh.radius / px, angle: sh.angle, direction: sh.rotation };
  if (sh.type === "rectangle") {
    // A grid-based rectangle follows the grid's own geometry (v14 BaseGrid#getRectangle,
    // sizes in grid units); otherwise plain rotation about the anchor.
    const polygon = sh.gridBased && typeof scene?.grid?.getRectangle === "function"
      ? scene.grid.getRectangle({ x: sh.x, y: sh.y }, sh.width / px, sh.height / px,
          { x: sh.anchorX ?? 0, y: sh.anchorY ?? 0 }, sh.rotation ?? 0)
      : rectPolygon(sh.x, sh.y, sh.width, sh.height, sh.rotation ?? 0, sh.anchorX ?? 0, sh.anchorY ?? 0);
    return { shape: "rect", x: sh.x, y: sh.y, rect: boxOf(polygon), polygon };
  }
  return null;
}

/** Delete area documents, grouped by scene and document type. */
export async function deleteAreas(docs) {
  const groups = new Map();
  for (const d of docs) {
    const k = `${d.parent?.uuid}|${d.documentName}`;
    if (!groups.has(k)) groups.set(k, { scene: d.parent, type: d.documentName, ids: [] });
    groups.get(k).ids.push(d.id);
  }
  for (const g of groups.values()) {
    const ids = g.ids.filter(id => g.scene?.getEmbeddedCollection(g.type)?.has(id));
    if (ids.length) await g.scene.deleteEmbeddedDocuments(g.type, ids);
  }
}

/**
 * What "Clear Templates (this scene)" removes, whatever the shape: v13 every template
 * (its scope so far); v14+ our areas and Regions core marks as former templates.
 */
export function cleanupDocs(scene) {
  if (!scene) return [];
  return usesRegions()
    ? scene.regions.filter(r => r.flags?.sr2e || r.flags?.core?.MeasuredTemplate)
    : [...(scene.templates ?? [])];
}
