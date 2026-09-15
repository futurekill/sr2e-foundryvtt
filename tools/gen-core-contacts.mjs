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

// ── contact items ──────────────────────────────────────────────────────────
function contactItem(c) {
  const notes = [
    `SR2E p.${c.page}.`,
    c.blurb,
    c.note ? `NOTE: ${c.note}` : "",
    `Full stat block: see the "${c.name}" actor in the SR2E Contacts (NPCs) compendium.`
  ].filter(Boolean).join(" ");
  return {
    _id: id("item:" + c.name), name: c.name, type: "contact",
    img: "icons/svg/mystery-man.svg",
    system: {
      contactType: "contact", archetype: c.name,
      // Loyalty and Influence are PLAYER-side relationship values the book does
      // not assign to an archetype, so they start neutral rather than invented.
      loyalty: 1, influence: 1,
      description: "", notes
    },
    effects: [], flags: {}, _stats: stats(), folder: FOLDER_BOOK, sort: 0,
    ownership: { default: 0 }, _key: `!items!${id("item:" + c.name)}`
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
  const bioBits = [
    `<p>${esc(c.blurb)}</p>`,
    c.note ? `<p><strong>Note:</strong> ${esc(c.note)}</p>` : "",
    c.cyber?.length ? `<p><strong>Cyberware:</strong> ${esc(c.cyber.join(", "))}</p>` : "",
    Object.keys(boost).length
      ? `<p><strong>Augmented:</strong> ${esc(Object.entries(boost)
          .map(([k, v]) => `${k} ${v}`).join(", "))} — the figure the book prints in parentheses.</p>`
      : "",
    `<p><strong>Professional Rating:</strong> ${esc(c.ratingPrinted)}` +
      (c.ratingPrinted.includes("-")
        ? ` (the sheet stores ${c.pr}; the book prints a range)` : "") +
      `</p>`,
    `<p><em>Shadowrun, Second Edition, p.${c.page}.</em></p>`
  ].filter(Boolean).join("\n");

  const items = [];
  for (const [n, r] of Object.entries(c.skills ?? {})) items.push(skillItem(c.name, n, r, "active"));
  // The book's "Special Skills" are Knowledge skills in SR2E terms.
  for (const [n, r] of Object.entries(c.special ?? {})) items.push(skillItem(c.name, n, r, "knowledge"));

  return {
    _id: aid, name: c.name, type: "npc", img: "icons/svg/mystery-man.svg",
    system: {
      biography: bioBits, race: c.race, professionalRating: c.pr,
      body: attr(a.body), quickness: attr(a.quickness), strength: attr(a.strength),
      charisma: attr(a.charisma), intelligence: attr(a.intelligence), willpower: attr(a.willpower),
      essence: { value: a.essence, max: 6 },
      // Reaction is DERIVED from Quickness + Intelligence; `mod` carries the
      // cyberware delta so the derived value lands on the book's number rather
      // than overwriting the formula with a literal.
      reaction: { mod: (boost.reaction ?? a.reaction) - Math.floor((a.quickness + a.intelligence) / 2) },
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
  const it = contactItem(c);
  writeFileSync(`packs-src/contacts/${safe(c.name)}_${it._id}.json`, JSON.stringify(it, null, 2) + "\n");
  nItems++;
  const ac = npcActor(c);
  writeFileSync(`${NPCDIR}/${safe(c.name)}_${ac._id}.json`, JSON.stringify(ac, null, 2) + "\n");
  nActors++;
}
console.log(`core contacts: ${nItems} item(s), ${nActors} npc actor(s)`);
console.log(`custom folder: ${FOLDER_CUSTOM}`);
