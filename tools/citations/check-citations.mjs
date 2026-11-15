#!/usr/bin/env node
/**
 * The citation gate (docs/PLAN-citations.md §5). SELF-CONTAINED: copied verbatim into each content repo's tools/ (their CI
 * has no system checkout); the system's Vitest checks the copy's book list against module/rules/books.mjs.
 *   node tools/check-citations.mjs [repoDir]
 * Fails on a catalog item or vehicle (top-level packs-src documents) with a blank book or page, an unknown book, a page
 * that isn't N / N–M, a citation that disagrees with its override row, or an `unresolved` override row. A generator
 * re-run that drops citations fails here: re-run the backfill (`node ../sr2e-foundryvtt/tools/citations/backfill.mjs
 * "$PWD" --write`), which restores them from the notes and the override table.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename, resolve } from "node:path";

export const BOOK_IDS = ["sr2", "ssc", "sc", "grim", "r2", "rbb", "st", "ct", "ff", "csh", "cp", "naw", "vr2", "pae", "de", "mis", "qe", "none"];
const SKIP_TYPES = new Set(["character", "npc", "spirit", "ic", "host", "frame"]);   // catalog = items + vehicles

export function check(repoDir) {
  const repo = resolve(repoDir), problems = [];
  const tsv = join(repo, "tools", "data", "citations", `${basename(repo)}.tsv`);
  const ov = new Map();
  if (existsSync(tsv)) {
    const [head, ...rows] = readFileSync(tsv, "utf8").trimEnd().split("\n");
    const cols = head.split("\t");
    for (const l of rows.filter(Boolean)) { const v = l.split("\t"); const r = Object.fromEntries(cols.map((c, i) => [c, v[i] ?? ""])); ov.set(r._id, r); }
  }
  for (const r of ov.values()) if (r.status === "unresolved") problems.push(`${r.name} (${r._id}): override row is unresolved`);
  const root = join(repo, "packs-src");
  for (const pack of readdirSync(root)) {
    const dir = join(root, pack);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).filter(f => f.endsWith(".json"))) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
      if (!d.system || SKIP_TYPES.has(d.type) || d.type === undefined || d.pages) continue;
      const c = d.system.citation ?? {}, where = `${pack}/${f}`;
      if (!c.book) { problems.push(`${where}: no citation`); continue; }
      if (!BOOK_IDS.includes(c.book)) problems.push(`${where}: unknown book "${c.book}"`);
      if (c.book !== "none" && !/^\d+(?:–\d+)?$/.test(String(c.page ?? ""))) problems.push(`${where}: page "${c.page}" isn't N or N–M`);
      const o = ov.get(d._id);
      if (o && o.status !== "unresolved") {
        const want = o.status === "none" || o.book === "none" ? { book: "none", page: "" } : { book: o.book, page: o.page.replace(/\s*[-–]\s*/, "–") };
        if (c.book !== want.book || (want.book !== "none" && c.page !== want.page)) problems.push(`${where}: citation ${c.book} ${c.page} disagrees with its override (${want.book} ${want.page})`);
      }
    }
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const p = check(process.argv[2] ?? ".");
  for (const x of p.slice(0, 40)) console.error(`  ✗ ${x}`);
  if (p.length) { console.error(`citations: ${p.length} problem(s). Restore with the backfill (see this file's header).`); process.exit(1); }
  console.log("citations: every catalog entry cites its page.");
}
