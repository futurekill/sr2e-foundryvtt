#!/usr/bin/env node
/**
 * Build the core rulebook's CONTACTS chapter (pp.200-213) into TWO forms.
 *
 * The book prints 22 archetypes as full NPC stat blocks — Attributes, Skills,
 * Cyberware, Professional Rating. The `contact` ITEM type holds only
 * archetype/loyalty/influence/notes, so importing them as items alone would
 * silently drop every number the chapter exists to provide. So:
 *
 *   - packs-src/contacts/      one `contact` item each, for a player's
 *                              Contacts list on the character sheet.
 *   - packs-src/contact-npcs/  one `npc` actor each, carrying the real stat
 *                              block with its skills as embedded skill items,
 *                              so a GM can drop one on the map and roll it.
 *
 * Every value comes from tools/data/core-contacts.json, which was transcribed
 * from 220 dpi PAGE RENDERS. The text layer mangles digits and must never be
 * the source for a number.
 *
 * Professional Rating is printed as a RANGE ("3-4") but the schema field is a
 * single integer, so the low end is stored and the printed range goes in the
 * bio — the same convention QE used for the Hive Queen's Essence.
 */
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const DATA = JSON.parse(readFileSync("tools/data/core-contacts.json", "utf8"));
const id = (s) => createHash("sha1").update("sr2e-core-contact:" + s).digest("hex").slice(0, 16);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const safe = (s) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

const stats = (systemVersion = "0.92.1") => ({
  coreVersion: "13.351", systemId: "sr2e", systemVersion,
  createdTime: 1784000000000, modifiedTime: 1784000000000,
  lastModifiedBy: null, compendiumSource: null, duplicateSource: null, exportSource: null
});

const FOLDER_BOOK = "0c495a9fa7ca2224";          // existing "Contacts" folder
const FOLDER_CUSTOM = id("folder:custom");        // new "Custom (GM)" folder

// Four contacts that already existed keep their ORIGINAL ids. They were the same
// archetype with a wrong citation ("SR2E p.41", a full-page illustration), so the
// book's version replaces their content in place and every stored link to them
// keeps resolving. Minting fresh ids and deleting the old records broke journal
// links, macros and anything else holding their compendium UUID.
//
// Bounty Hunter is deliberately NOT here. The record that shared its name was a
// Shadowrun Companion ENEMY — a different entity, in the Enemies folder — and it
// is kept untouched as its own document. The core book's Bounty Hunter CONTACT
// gets a fresh id beside it.
const LEGACY_IDS = {
  "Fixer":       "a1398af165d79f0a",
  "Mr. Johnson": "0cd74aba1490fdf9",
  "Street Doc":  "d9a0b74f1ee862fc",
  "Talismonger": "c18cc3ad00e29066",
};
const itemId = (name) => LEGACY_IDS[name] ?? id("item:" + name);

// Skill category. The book prints every skill in one SKILLS list, so the class
// has to be decided here. Mirrors CONFIG.SR2E.activeSkills (module/config.mjs),
// plus the few names these pages print differently: "Demolition" (the skill is
// Demolitions), "Negotiate", and the vehicle skills Hovercraft and the Company
// Man's unnamed "Vehicle".
const ACTIVE = new Set([
  "armed combat","athletics","bike","biotech","car","computer","conjuring",
  "demolitions","electronics","etiquette","firearms","gunnery","interrogation",
  "launch weapons","leadership","negotiation","pilot","projectile weapons",
  "sorcery","stealth","throwing weapons","unarmed combat",
  "demolition","negotiate","hovercraft","vehicle",
]);
function skillCategory(name, isSpecial) {
  if (isSpecial) return "special";                 // the book's own "Special Skills" (p.74)
  if (/\(b\/r\)/i.test(name)) return "build_repair";
  const base = name.replace(/\s*\(.*$/, "").trim().toLowerCase();
  return ACTIVE.has(base) ? "active" : "knowledge"; // Computer Theory, Psychology, History...
}
const wiredLevel = (c) => {
  for (const x of c.cyber ?? []) { const m = /wired reflexes\s*\((\d)\)/i.exec(x); if (m) return +m[1]; }
  return 0;
};

// ── contact items ──────────────────────────────────────────────────────────
function contactItem(c) {
  const notes = [
    `SR2E p.${c.page}.`,
    c.blurb,
    c.note ? `NOTE: ${c.note}` : "",
    `Full stat block: see the "${c.name}" actor in the SR2E Contacts (NPCs) compendium.`
  ].filter(Boolean).join(" ");
  return {
    _id: itemId(c.name), name: c.name, type: "contact",
    img: "icons/svg/mystery-man.svg",
    system: {
      contactType: "contact", archetype: c.name,
      // Loyalty and Influence are PLAYER-side relationship values the book does
      // not assign to an archetype, so they start neutral rather than invented.
      loyalty: 1, influence: 1,
      description: "", notes
    },
    effects: [], flags: {}, _stats: stats(), folder: FOLDER_BOOK, sort: 0,
    ownership: { default: 0 }, _key: `!items!${itemId(c.name)}`
  };
}

// ── npc actors ─────────────────────────────────────────────────────────────
const attr = (v) => ({ base: v, mod: 0, value: v, racial: 0 });

function skillItem(actorName, name, rating, category) {
  const sid = id(`skill:${actorName}:${name}`);
  return {
    _id: sid, name, type: "skill", img: "icons/svg/book.svg",
    effects: [], flags: {}, _stats: stats(), folder: null, sort: 0,
    ownership: { default: 0 },
    system: {
      category, rating, linkedAttribute: "intelligence",
      // Authored data, not a chargen allocation (SR2E p.70 / p.191).
      allocated: null, ratingsFinalized: true,
      concentration: { name: "", rating: 0 }, specialization: { name: "", rating: 0 },
      description: ""
    }
  };
}

function npcActor(c) {
  const aid = id("actor:" + c.name);
  const a = c.attrs;
  const boost = c.boosted ?? {};
  const aug = (k) => ({ base: a[k], mod: (boost[k] ?? a[k]) - a[k], value: boost[k] ?? a[k], racial: 0 });
  const bioBits = [
    `<p>${esc(c.blurb)}</p>`,
    c.note ? `<p><strong>Note:</strong> ${esc(c.note)}</p>` : "",
    c.cyber?.length ? `<p><strong>Cyberware:</strong> ${esc(c.cyber.join(", "))}</p>` : "",
    // Only claim the book PRINTS a figure when it does. The Yakuza Boss's is
    // inferred from his listed Wired Reflexes; say so on the sheet, not just in
    // the data file, or the bio asserts a transcription that never happened.
    Object.keys(boost).length
      ? `<p><strong>Augmented:</strong> ${esc(Object.entries(boost)
          .map(([k, v]) => `${k} ${v}`).join(", "))} — ${c.$boostedNote
            ? esc(c.$boostedNote)
            : "the figure the book prints in parentheses."}</p>`
      : "",
    `<p><strong>Professional Rating:</strong> ${esc(c.ratingPrinted)}` +
      (c.ratingPrinted.includes("-")
        ? ` (the sheet stores ${c.pr}; the book prints a range)` : "") +
      `</p>`,
    `<p><em>Shadowrun, Second Edition, p.${c.page}.</em></p>`
  ].filter(Boolean).join("\n");

  const items = [];
  for (const [n, r] of Object.entries(c.skills ?? {})) items.push(skillItem(c.name, n, r, skillCategory(n, false)));
  // The book prints "Special Skills" as their own category (p.74), and the schema
  // has one. An earlier draft filed them all as Knowledge — Sympathetic Listening
  // and Woodworking are not.
  for (const [n, r] of Object.entries(c.special ?? {})) items.push(skillItem(c.name, n, r, skillCategory(n, true)));

  return {
    _id: aid, name: c.name, type: "npc", img: "icons/svg/mystery-man.svg",
    system: {
      biography: bioBits, race: c.race, professionalRating: c.pr,
      // The book's figure in parentheses is applied as a MOD on the printed base, for
      // every attribute that has one — not just Reaction. The Bounty Hunter's
      // cyberarm Strength 5 (6) used to be recorded in prose and never applied.
      body: aug("body"), quickness: aug("quickness"), strength: aug("strength"),
      charisma: aug("charisma"), intelligence: aug("intelligence"), willpower: aug("willpower"),
      essence: { value: a.essence, max: 6 },
      // Reaction is DERIVED from Quickness + Intelligence; `mod` carries the
      // cyberware delta so the derived value lands on the book's number rather
      // than overwriting the formula with a literal.
      reaction: { mod: (boost.reaction ?? a.reaction) - Math.floor((a.quickness + a.intelligence) / 2) },
      // Wired Reflexes: +2 Reaction and +1D6 Initiative per level (SR2E p.247,
      // table p.261 — the system's own cyberware compendium encodes the same).
      // The Reaction half is already in the book's augmented figure above; the
      // dice were missing entirely, so every wired contact rolled 1D6. Follows the
      // pattern the Queen Euphoria NPCs already use: dice = 1 + level.
      initiative: { base: 0, dice: 1 + wiredLevel(c), mod: 0 },
      ...(c.magic ? { magic: attr(c.magic) } : {})
    },
    items, effects: [], flags: {}, _stats: stats(), folder: null, sort: 0,
    prototypeToken: { name: c.name, actorLink: false, disposition: 0,
                      texture: { src: "icons/svg/mystery-man.svg" }, lockRotation: true },
    ownership: { default: 0 }, _key: `!actors!${aid}`
  };
}

// ── write ──────────────────────────────────────────────────────────────────
const NPCDIR = "packs-src/contact-npcs";
if (existsSync(NPCDIR)) rmSync(NPCDIR, { recursive: true });
mkdirSync(NPCDIR, { recursive: true });

// the Custom folder that the invented archetypes move into
writeFileSync(`packs-src/contacts/_folder_custom_${FOLDER_CUSTOM}.json`,
  JSON.stringify({ _id: FOLDER_CUSTOM, name: "Custom (not in the core book)", type: "Item",
    description: "Archetypes invented for this system, not printed in the SR2E core rulebook. " +
      "They previously cited p.41, which is a full-page illustration.",
    folder: null, sorting: "a", sort: 0, color: null, flags: {}, _stats: stats(),
    _key: `!folders!${FOLDER_CUSTOM}` }, null, 2) + "\n");

let nItems = 0, nActors = 0;
for (const c of DATA.contacts) {
  // A contact that has moved to its legacy id leaves behind the file an earlier
  // run wrote under its derived id. Remove exactly that file and nothing else:
  // matching on the derived id means the restored Companion ENEMY that shares
  // the Bounty Hunter's name can never be caught by this.
  if (LEGACY_IDS[c.name]) {
    const stale = `packs-src/contacts/${safe(c.name)}_${id("item:" + c.name)}.json`;
    if (existsSync(stale)) rmSync(stale);
  }
  const it = contactItem(c);
  writeFileSync(`packs-src/contacts/${safe(c.name)}_${it._id}.json`, JSON.stringify(it, null, 2) + "\n");
  nItems++;
  const ac = npcActor(c);
  writeFileSync(`${NPCDIR}/${safe(c.name)}_${ac._id}.json`, JSON.stringify(ac, null, 2) + "\n");
  nActors++;
}
console.log(`core contacts: ${nItems} item(s), ${nActors} npc actor(s)`);
console.log(`custom folder: ${FOLDER_CUSTOM}`);
