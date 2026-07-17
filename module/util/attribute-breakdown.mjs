/**
 * Format an attribute's augmentation breakdown for the sheet tooltip.
 *
 * Pure and Foundry-free so it can be unit-tested. The data model attaches a
 * `sources` array to each attribute (one entry per cyberware / bioware / adept
 * power / Active Effect that moved it); this turns that into a short summary line
 * plus the itemised detail the expanded tooltip shows.
 *
 * @param {object} entry
 * @param {number} [entry.base]   the bought rating
 * @param {number} [entry.value]  the final (augmented) rating
 * @param {{name?:string, value:number}[]} [entry.sources] signed per-source mods
 * @returns {{modTotal:number, up:boolean, count:number, summary:string,
 *            sources:{name:string, value:number}[], base:number, value:number}}
 */
export function attributeBreakdown({ base = 0, value = 0, sources = [] } = {}) {
  // Drop zero/blank contributions and merge same-named sources (two levels of the
  // same implant read as one line).
  const merged = new Map();
  for (const s of sources) {
    const v = Number(s?.value) || 0;
    if (!v) continue;
    const name = (s?.name ?? "").toString().trim() || "—";
    merged.set(name, (merged.get(name) ?? 0) + v);
  }
  const clean = [...merged.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((s) => s.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const modTotal = clean.reduce((t, s) => t + s.value, 0);
  const up = modTotal >= 0;
  const n = clean.length;

  const signed = (v) => `${v > 0 ? "+" : "−"}${Math.abs(v)}`;
  const summary = n === 0
    ? ""
    : n === 1
      ? `${signed(clean[0].value)} ${clean[0].name}`
      : `${signed(modTotal)} from ${n} sources`;

  return { modTotal, up, count: n, summary, sources: clean, base, value };
}
