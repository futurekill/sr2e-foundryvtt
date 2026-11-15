#!/usr/bin/env node
/**
 * Citation backfill (chargen M1b, docs/PLAN-citations.md §3). Run per content repo:
 *   node tools/citations/backfill.mjs <repoDir> [--write] [--report <file.tsv>] [--accept <reviewed.tsv>]
 * Reads <repo>/packs-src: catalog items, items embedded in actors, and top-level vehicle actors. Picks each entry's
 * citation from its notes (a source parenthetical first — its description page over a `table` page — else the first
 * page reference whose clause names no other book); EVERY entry with more than one candidate page is reported, never
 * written, until a human confirms it (`--accept` turns reviewed report rows into override rows). Override rows
 * (<repo>/tools/data/citations/<repo>.tsv: name, _id, book, page, checked, status) win and may replace an existing
 * citation (the diff is printed); `unresolved` rows are never written. Without --write nothing changes.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, appendFileSync } from "node:fs";
import { join, basename } from "node:path";
import { BOOKS, NO_BOOK, bookOf, normalizePage, isValidPage } from "../../module/rules/books.mjs";

const PG = /\b(table\s+)?pp?\.\s?(\d+(?:\s?[–-]\s?\d+)?)/gi;
const ITEM_TYPES = new Set(Object.keys(JSON.parse(readFileSync(new URL("../../system.json", import.meta.url))).documentTypes.Item));

/** The repo's own book id (module.json / system.json id → BOOKS[].module). */
export function ownBook(repoDir) {
  const manifest = existsSync(join(repoDir, "module.json")) ? "module.json" : "system.json";
  const id = JSON.parse(readFileSync(join(repoDir, manifest), "utf8")).id;
  return Object.entries(BOOKS).find(([, b]) => b.module === id)?.[0] ?? null;
}

/** All text a citation may come from. */
function textOf(doc) {
  const s = doc.system ?? {};
  const desc = typeof s.description === "string" ? s.description : s.description?.value ?? "";
  return [s.notes, s.source, desc].filter(Boolean).map(t => String(t).replace(/<[^>]+>/g, " ")).join(" ");
}

/**
 * Candidates and a proposal for one entry: { pick: {book, page}|null, candidates: [{book,page}], why, uncertain }.
 * Pure — exported for the tests.
 */
export function proposeCitation(text, own) {
  const cands = [];
  // 0. A closing source line naming the own book ("… Grimoire (2nd ed.) p.128.") is the entry's own citation.
  const all = [...text.matchAll(PG)], last = all.at(-1);
  if (last && /^[\s.)]*$/.test(text.slice(last.index + last[0].length))) {
    const clause = text.slice(0, last.index).split(/[.;]\s(?![^(]*\))/).at(-1);
    const before = text.slice(0, last.index), open = (before.match(/\(/g) ?? []).length - (before.match(/\)/g) ?? []).length;
    if (open === 0 && bookOf(clause) === own) {   // outside any parenthetical (those are step 1's)
      for (const m of all) cands.push({ book: own, page: normalizePage(m[2]), table: !!m[1] });
      return { pick: { book: own, page: normalizePage(last[2]) }, candidates: cands, why: "closing", uncertain: false, multi: false };
    }
  }
  // 1. Source parentheticals: only book names, "table", pages and punctuation inside.
  const sources = [];
  for (const m of text.matchAll(/\(([^()]{0,100})\)/g)) {
    const inner = m[1];
    if (!PG.test(inner)) { PG.lastIndex = 0; continue; }
    PG.lastIndex = 0;
    let rest = inner.replace(PG, "");
    PG.lastIndex = 0;
    const book = bookOf(inner);
    rest = rest.replace(/[\s,;.:]|\bsee\b|\band\b|2nd ed\.?/gi, "");
    for (const [re] of BOOK_RES) rest = rest.replace(re, "");
    if (rest.length <= 3) {
      const pages = [...inner.matchAll(PG)].map(x => ({ table: !!x[1], page: normalizePage(x[2]) }));
      sources.push({ book: book ?? own, pages });
    }
  }
  for (const s of sources) for (const p of s.pages) cands.push({ book: s.book, page: p.page, table: p.table });
  const ownSources = sources.filter(s => s.book === own);
  // A page reference whose clause NAMES the own book ("… Grimoire (2nd ed.) p.131") beats another book's parenthetical
  // cross-reference ("Like physical barrier (SR2 p.158)").
  if (!ownSources.length && sources.length) {
    for (const m of text.matchAll(PG)) {
      const clause = text.slice(0, m.index).split(/[.;]\s(?![^(]*\))/).at(-1);
      if (bookOf(clause.replace(/\([^()]*\)/g, " ")) === own || bookOf(clause.slice(-40)) === own && !/\(\s*$/.test(clause)) {
        cands.push({ book: own, page: normalizePage(m[2]), table: !!m[1] });
        return finish({ book: own, page: normalizePage(m[2]) }, cands, "named");
      }
    }
  }
  if (ownSources.length || sources.length) {
    const s = (ownSources.length ? ownSources : sources).at(-1);
    const desc = s.pages.filter(p => !p.table);
    const pick = { book: s.book, page: (desc[0] ?? s.pages[0]).page };
    return finish(pick, cands, "source");
  }
  // 2. The first page reference whose clause names no other book; the clause's named book wins (round 1 #1).
  let pick = null, uncertain = false;
  for (const m of text.matchAll(PG)) {
    const before = text.slice(0, m.index);
    const clause = before.split(/[.;]\s/).at(-1);
    const named = bookOf(clause);
    const crossRef = /\bsee\b[^.;]*$/i.test(clause.slice(-40)) || /\(\s*$/.test(before.slice(-3));
    const book = named ?? own;
    cands.push({ book, page: normalizePage(m[2]), table: !!m[1] });
    if (!pick && !crossRef) {
      pick = { book, page: normalizePage(m[2]) };
      // A capitalized multi-word phrase right before the page that names no known book: can't be sure (report it).
      if (!named && /[A-Z][a-z]+(?: [A-Z][a-z]+)+\s*,?\s*$/.test(clause.replace(PG, "").slice(-40)) && !/Design specifications/i.test(clause)) uncertain = true;
    }
  }
  return finish(pick, cands, "first", uncertain);
}
const BOOK_RES = [[/\b(SR2E|SR2|SRII|SSC|SRComp|R2|RBB|FoF|CSH|NAGRL|VR2(?:\.0)?)\b/g], [/\b(Street Samurai Catalog|Shadowrun Companion|SR Companion|Grimoire(?: II)?|Rigger 2|Rigger Black Book|Shadowtech|Cybertechnology|Fields of Fire|Corporate Security Handbook|Cyberpirates|Virtual Realities|core (?:book|rules|rulebook)|basic rules|Shadowrun,? Second Edition)\b/gi]];
function finish(pick, cands, why, uncertain = false) {
  // A table page beside its description page isn't a rival: the rule already picks the description (plan §3).
  // Nor is a page inside another candidate's range ("Rigger 2 p.140–141. (Design specifications p.140.)").
  const span = (pg) => { const [a, b = a] = String(pg).split("–").map(Number); return [a, b]; };
  const pages = [...new Set(cands.filter(c => (!pick || c.book === pick.book) && !c.table).map(c => c.page))];
  const distinct = pages.filter(pg => { const [a, b] = span(pg);
    return !pages.some(o => o !== pg && span(o)[0] <= a && b <= span(o)[1]); });
  return { pick, candidates: cands, why, uncertain, multi: distinct.length > 1 };
}

/** Read an override TSV → Map(_id → row). */
export function readOverrides(file) {
  if (!existsSync(file)) return new Map();
  const [head, ...rows] = readFileSync(file, "utf8").trimEnd().split("\n");
  const cols = head.split("\t");
  return new Map(rows.filter(Boolean).map(l => { const v = l.split("\t"); const r = Object.fromEntries(cols.map((c, i) => [c, v[i] ?? ""])); return [r._id, r]; }));
}

function* entries(repoDir) {
  const root = join(repoDir, "packs-src");
  for (const pack of readdirSync(root)) {
    const dir = join(root, pack);
    let files; try { files = readdirSync(dir).filter(f => f.endsWith(".json")); } catch { continue; }
    for (const f of files) {
      const path = join(dir, f);
      const doc = JSON.parse(readFileSync(path, "utf8"));
      if (doc.system && ITEM_TYPES.has(doc.type)) yield { path, doc, at: [] };
      else if (doc.type === "vehicle" && doc.system) yield { path, doc, at: [], vehicle: true };
      for (const [i, it] of (doc.items ?? []).entries()) if (it?.system && ITEM_TYPES.has(it.type)) yield { path, doc, at: ["items", i], embedded: true };
    }
  }
}

export function run(repoDir, { write = false, report = null, accept = null } = {}) {
  const own = ownBook(repoDir);
  if (!own) throw new Error(`no book in the table for ${basename(repoDir)}`);
  const tsv = join(repoDir, "tools", "data", "citations", `${basename(repoDir)}.tsv`);
  if (accept) acceptReport(accept, tsv);
  const overrides = readOverrides(tsv);
  const out = { written: 0, replaced: [], cited: 0, overridden: 0, ambiguous: [], missing: [], missingEmbedded: [], uncertain: [], unresolved: [] };
  // An embedded copy (a pregen's or NPC's item) without a catalog source: reported apart — validation covers catalog
  // entries and vehicles only (docs/PLAN-citations.md, risks).
  const miss = (e, row) => (e.embedded ? out.missingEmbedded : out.missing).push(row);
  const catalog = new Map();   // compendium id → citation, for embedded copies
  const byFile = new Map();
  const items = [...entries(repoDir)];
  // Catalog entries first, so embedded copies can inherit.
  items.sort((a, b) => (a.embedded ? 1 : 0) - (b.embedded ? 1 : 0));
  for (const e of items) {
    const target = e.at.length ? e.doc.items[e.at[1]] : e.doc;
    const cur = target.system.citation ?? {};
    const ov = overrides.get(target._id);
    let next = null;
    if (ov) {
      out.overridden++;
      if (ov.status === "unresolved") { out.unresolved.push(target.name); continue; }
      next = ov.status === "none" || ov.book === NO_BOOK ? { book: NO_BOOK, page: "" } : { book: ov.book, page: normalizePage(ov.page) };
    } else if (e.embedded && catalog.has(target._stats?.compendiumSource?.split(".").at(-1) ?? "")) {
      next = catalog.get(target._stats.compendiumSource.split(".").at(-1));
    } else {
      const p = proposeCitation(textOf(target), own);
      if (!p.pick) { if (!cur.book) miss(e, [target.name, target._id, e.path]); continue; }
      if (p.multi) { out.ambiguous.push([target.name, target._id, `${p.pick.book} ${p.pick.page}`, p.candidates.map(c => `${c.book}:${c.table ? "table " : ""}${c.page}`).join(" ")]); continue; }
      if (p.uncertain) { out.uncertain.push([target.name, target._id, `${p.pick.book} ${p.pick.page}`]); continue; }
      next = p.pick;
    }
    if (!next || (next.book !== NO_BOOK && !isValidPage(next.page))) { miss(e, [target.name, target._id, e.path]); continue; }
    if (!e.embedded) catalog.set(target._id, next);
    out.cited++;
    if (cur.book === next.book && cur.page === next.page) continue;
    if (cur.book && !ov) continue;   // never overwrite without an override row
    if (cur.book) out.replaced.push([target.name, `${cur.book} ${cur.page}`, `${next.book} ${next.page}`]);
    target.system.citation = { book: next.book, page: next.page };
    byFile.set(e.path, e.doc);
    out.written++;
  }
  if (write) for (const [path, doc] of byFile) writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  if (report) writeFileSync(report, ["kind\tname\t_id\tproposal\tcandidates",
    ...out.ambiguous.map(r => `ambiguous\t${r.join("\t")}`), ...out.uncertain.map(r => `uncertain\t${r.join("\t")}\t`),
    ...out.missing.map(r => `missing\t${r[0]}\t${r[1]}\t\t`), ...out.missingEmbedded.map(r => `missing-embedded\t${r[0]}\t${r[1]}\t\t`)].join("\n") + "\n");
  return out;
}

/** Reviewed report rows (kind, name, _id, proposal "book page") → override rows. */
function acceptReport(file, tsv) {
  const [, ...rows] = readFileSync(file, "utf8").trimEnd().split("\n");
  const have = readOverrides(tsv);
  const add = [];
  for (const l of rows) {
    const [kind, name, id, proposal] = l.split("\t");
    if (!["ambiguous", "uncertain"].includes(kind) || !proposal || have.has(id)) continue;
    const [book, page] = proposal.split(" ");
    add.push([name, id, book, page, "reviewed proposal", "cited"].join("\t"));
  }
  if (!existsSync(tsv)) writeFileSync(tsv, "name\t_id\tbook\tpage\tchecked\tstatus\n");
  if (add.length) appendFileSync(tsv, add.join("\n") + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [repo, ...rest] = process.argv.slice(2);
  if (!repo) { console.error("usage: backfill.mjs <repoDir> [--write] [--report file] [--accept reviewed.tsv]"); process.exit(2); }
  const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
  const r = run(repo, { write: rest.includes("--write"), report: opt("--report"), accept: opt("--accept") });
  console.log(`${basename(repo)}: cited ${r.cited} (overrides ${r.overridden}), ${rest.includes("--write") ? "written" : "would write"} ${r.written}; ` +
    `ambiguous ${r.ambiguous.length}, uncertain ${r.uncertain.length}, missing ${r.missing.length} (+ ${r.missingEmbedded.length} embedded copies), unresolved ${r.unresolved.length}`);
  for (const x of r.replaced) console.log(`  replaced: ${x[0]}: ${x[1]} → ${x[2]}`);
  if (!rest.includes("--write")) console.log("  (dry run: pass --write to change packs-src)");
}
