#!/usr/bin/env node
/**
 * The wiki's How-To Guides, shipped inside Foundry: ../sr2e-foundryvtt.wiki/How-To-Guides.md → one
 * "How-To Guides" journal in the SR2E Player Guides pack (packs-src/guides), a page per "## " section, with the
 * screenshots and GIFs copied to assets/guides/. The wiki is the single source: edit it there, then run this and
 * `npm run build-packs guides`.
 *   node tools/gen-guides.mjs [path/to/wiki]
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WIKI = path.resolve(process.argv[2] ?? path.join(ROOT, "../sr2e-foundryvtt.wiki"));
const WIKI_URL = "https://github.com/futurekill/sr2e-foundryvtt/wiki/";
const ASSETS = "assets/guides", ID = "sr2eHowToGuides1";
const id16 = (s) => createHash("sha1").update(s).digest("hex").slice(0, 16);

const md = readFileSync(path.join(WIKI, "How-To-Guides.md"), "utf8")
  .replace(/\[\[([^\]]+)\]\]/g, (_, page) => `[${page}](${page.replaceAll(" ", "-")})`);   // GitHub-wiki links
const [, ...sections] = md.split(/^## /m);   // the intro is only a contents list of these same sections
if (!sections.length) throw new Error(`No "## " sections in ${WIKI}/How-To-Guides.md`);

mkdirSync(path.join(ROOT, ASSETS), { recursive: true });
/** Wiki-relative images → shipped copies; wiki-relative links → the wiki on GitHub (the pages are separate here). */
function localize(html) {
  return html
    .replace(/src="images\/([^"]+)"/g, (_, f) => {
      const from = path.join(WIKI, "images", f);
      if (!existsSync(from)) throw new Error(`Missing image ${from}`);
      copyFileSync(from, path.join(ROOT, ASSETS, f));
      return `src="systems/sr2e/${ASSETS}/${f}"`;
    })
    .replace(/href="(?!https?:|mailto:)([^"]*)"/g, (_, h) => `href="${WIKI_URL}${h.startsWith("#") ? "How-To-Guides" + h : h}"`);
}

const pages = sections.map((s, i) => {
  const name = s.slice(0, s.indexOf("\n")).trim();
  const body = s.slice(s.indexOf("\n") + 1).replace(/\n---\s*$/, "");
  return { _id: id16(`howto:${name}`), name, type: "text", title: { show: true, level: 1 }, image: {},
    video: { controls: true, volume: 0.5 }, src: null, system: {}, sort: (i + 1) * 100000, ownership: { default: -1 },
    flags: {}, text: { format: 1, content: localize(marked.parse(body)) } };
});
const entry = { _id: ID, name: "How-To Guides", folder: null, sort: 50000, ownership: { default: 0 }, flags: {},
  _stats: { coreVersion: "13.351", systemId: "sr2e", systemVersion: "0.0.1", createdTime: 1782000000000,
    modifiedTime: 1782000000000, lastModifiedBy: null, compendiumSource: null, duplicateSource: null, exportSource: null },
  pages, _key: `!journal!${ID}` };
writeFileSync(path.join(ROOT, "packs-src/guides", `How_To_Guides_${ID}.json`), JSON.stringify(entry, null, 2) + "\n");
console.log(`How-To Guides: ${pages.length} pages (${pages.map(p => p.name).join("; ")})`);
