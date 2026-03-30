/**
 * build-powers.mjs
 *
 * Rebuilds the adept-powers compendium pack from the canonical data defined
 * in this script.  Powers are sourced exclusively from the SR2E core rulebook
 * (FASA7901), pp. 124-126.
 *
 * Usage:  node build-powers.mjs
 */

import { ClassicLevel } from "classic-level";
import { randomBytes }  from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath }   from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACK_PATH = resolve(__dirname, "packs/adept-powers");

function newId() {
  return randomBytes(8).toString("hex");
}

function makePower(name, system) {
  return {
    _id: newId(),
    name,
    type: "adeptPower",
    img: "icons/svg/aura.svg",
    system: {
      pointCost: 1,
      level: 1,
      maxLevel: 1,
      description: "",
      attributeMods: { body: 0, quickness: 0, strength: 0, reaction: 0 },
      notes: "",
      ...system,
    },
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    _stats: { systemId: "sr2e", systemVersion: "0.3.79", coreVersion: "13.0.0" },
  };
}

// ── Canonical SR2E core-book adept powers (pp. 124-126, FASA7901) ─────────

const POWERS = [

  // ── Astral Perception ─────────────────────────────────────────────────────
  // Flat cost of 2 Magic Points. Allows the adept to see the astral plane
  // but not project. Enables Sorcery for astral combat only; no spell casting.
  makePower("Astral Perception", {
    pointCost: 2,
    maxLevel: 1,
    notes: "SR2E p.124. Flat cost 2 pts. See astral plane; no projection. Can use Sorcery for astral combat but cannot cast spells.",
  }),

  // ── Combat Sense ─────────────────────────────────────────────────────────
  // Three discrete levels. Each level purchased adds Combat Pool dice and
  // allows spending Combat Pool dice on Reaction Tests for surprise.
  // Table (SR2E p.125): Level 1 = 1 die/1 pt, Level 2 = 2 dice/2 pts,
  // Level 3 = 3 dice/3 pts.
  makePower("Combat Sense 1", {
    pointCost: 1,
    maxLevel: 1,
    notes: "SR2E p.124. +1 Combat Pool die. Can spend Combat Pool dice to assist Reaction Tests in surprise situations.",
  }),
  makePower("Combat Sense 2", {
    pointCost: 2,
    maxLevel: 1,
    notes: "SR2E p.124. +2 Combat Pool dice. Can spend Combat Pool dice to assist Reaction Tests in surprise situations.",
  }),
  makePower("Combat Sense 3", {
    pointCost: 3,
    maxLevel: 1,
    notes: "SR2E p.124. +3 Combat Pool dice. Can spend Combat Pool dice to assist Reaction Tests in surprise situations.",
  }),

  // ── Improved Ability ─────────────────────────────────────────────────────
  // Adds extra dice to a specific general skill (per-die cost varies by skill).
  // Dice carry over to Concentrations/Specializations but are reduced by 1
  // per skill web circle crossed. Combat skills capped at current skill rating.
  // Costs (SR2E p.125): Athletic/Stealth .25/die; Armed/Unarmed/Throwing/
  // Projectile .5/die; Firearms/Gunnery 1/die.
  makePower("Improved Ability", {
    pointCost: 0.5,
    maxLevel: 6,
    notes: "SR2E p.125. Extra dice for a specific skill. Cost/die: Athletic/Stealth .25, Armed/Unarmed/Throwing/Projectile .5, Firearms/Gunnery 1. Combat skills: max extra dice ≤ current skill rating.",
  }),

  // ── Improved Physical Attributes ─────────────────────────────────────────
  // Raises Body, Strength, or Quickness (not mental attributes, not Reaction).
  // Cost is tiered by final rating vs racial maximum (SR2E p.125):
  //   ≤ ½ racial max: 0.5/pt
  //   up to racial max: 1/pt
  //   up to 1.5× racial max: 1.5/pt
  // Karma costs for later raises are based on total (base + magic) rating.
  // Separate purchase required for each attribute.
  makePower("Improved Physical Attributes (Body)", {
    pointCost: 1,
    maxLevel: 6,
    attributeMods: { body: 1, quickness: 0, strength: 0, reaction: 0 },
    notes: "SR2E p.125. +level to Body (max 1.5× racial max). Cost/pt: ≤½ racial max 0.5, ≤racial max 1, ≤1.5× racial max 1.5. Level = total bonus pts purchased.",
  }),
  makePower("Improved Physical Attributes (Strength)", {
    pointCost: 1,
    maxLevel: 6,
    attributeMods: { body: 0, quickness: 0, strength: 1, reaction: 0 },
    notes: "SR2E p.125. +level to Strength (max 1.5× racial max). Cost/pt: ≤½ racial max 0.5, ≤racial max 1, ≤1.5× racial max 1.5. Level = total bonus pts purchased.",
  }),
  makePower("Improved Physical Attributes (Quickness)", {
    pointCost: 1,
    maxLevel: 6,
    attributeMods: { body: 0, quickness: 1, strength: 0, reaction: 0 },
    notes: "SR2E p.125. +level to Quickness (max 1.5× racial max). Cost/pt: ≤½ racial max 0.5, ≤racial max 1, ≤1.5× racial max 1.5. Level = total bonus pts purchased.",
  }),

  // ── Improved Physical Senses ─────────────────────────────────────────────
  // Each improvement costs 0.25 pts. Covers: low-light vision, thermographic
  // vision, high/low-freq hearing, enhanced smell/taste, etc. Anything that
  // can be improved by cyberware (except radio). No package deals.
  makePower("Improved Physical Senses", {
    pointCost: 0.25,
    maxLevel: 6,
    notes: "SR2E p.125. 0.25 pts per improvement. Options: low-light vision, thermographic vision, high/low-freq hearing, enhanced smell/taste, etc. (anything cybernetic except radio). No package deals.",
  }),

  // ── Increased Reaction ────────────────────────────────────────────────────
  // Adds bonus Reaction points (no extra Initiative dice).
  // Cost tiers (SR2E p.126): ≤½ racial max 0.5/pt, ≤racial max 1/pt,
  // ≤1.5× racial max 2/pt.
  makePower("Increased Reaction", {
    pointCost: 1,
    maxLevel: 6,
    attributeMods: { body: 0, quickness: 0, strength: 0, reaction: 1 },
    notes: "SR2E p.126. +level Reaction (no extra Initiative dice). Cost/pt: ≤½ racial max 0.5, ≤racial max 1, ≤1.5× racial max 2. Level = total bonus pts purchased.",
  }),

  // ── Increased Reflexes ────────────────────────────────────────────────────
  // Adds Initiative dice. Three discrete levels, non-cumulative (buy the level
  // you want). Costs: +1d6 = 1 pt, +2d6 = 2.5 pts, +3d6 = 4.5 pts.
  makePower("Increased Reflexes 1", {
    pointCost: 1,
    maxLevel: 1,
    notes: "SR2E p.126. +1d6 Initiative. Cost: 1 pt.",
  }),
  makePower("Increased Reflexes 2", {
    pointCost: 2.5,
    maxLevel: 1,
    notes: "SR2E p.126. +2d6 Initiative. Cost: 2.5 pts.",
  }),
  makePower("Increased Reflexes 3", {
    pointCost: 4.5,
    maxLevel: 1,
    notes: "SR2E p.126. +3d6 Initiative. Cost: 4.5 pts.",
  }),

  // ── Killing Hands ─────────────────────────────────────────────────────────
  // Unarmed attacks deal Physical damage instead of Stun. Level determines
  // the damage code. Effective against critters with Immunity to normal weapons.
  // Cannot be augmented by weapons or magic (except Improved Ability).
  // Costs (SR2E p.126): (STR)L = 0.5, (STR)M = 1, (STR)S = 2, (STR)D = 3.
  // Multiple levels may be purchased independently.
  makePower("Killing Hands (L)", {
    pointCost: 0.5,
    maxLevel: 1,
    notes: "SR2E p.126. Unarmed attacks deal (STR)L Physical damage. Effective vs. critters with weapon immunity. Cost: 0.5 pts.",
  }),
  makePower("Killing Hands (M)", {
    pointCost: 1,
    maxLevel: 1,
    notes: "SR2E p.126. Unarmed attacks deal (STR)M Physical damage. Effective vs. critters with weapon immunity. Cost: 1 pt.",
  }),
  makePower("Killing Hands (S)", {
    pointCost: 2,
    maxLevel: 1,
    notes: "SR2E p.126. Unarmed attacks deal (STR)S Physical damage. Effective vs. critters with weapon immunity. Cost: 2 pts.",
  }),
  makePower("Killing Hands (D)", {
    pointCost: 3,
    maxLevel: 1,
    notes: "SR2E p.126. Unarmed attacks deal (STR)D Physical damage. Effective vs. critters with weapon immunity. Cost: 3 pts.",
  }),

  // ── Pain Resistance ───────────────────────────────────────────────────────
  // Each point ignores wound penalties from that many boxes of damage.
  // Also adds to target numbers for inflicting pain on the adept and subtracts
  // from target numbers to resist pain effects. Does NOT prevent actual damage
  // or affect Damage Resistance Tests.
  // Cost: 0.25 per point (SR2E p.126).
  makePower("Pain Resistance", {
    pointCost: 0.25,
    maxLevel: 6,
    notes: "SR2E p.126. Each point ignores wound penalties from that many damage boxes. Adds pts to TN to inflict pain on adept; subtracts from TN to resist pain. Does not help Damage Resistance Tests. Cost: 0.25/pt.",
  }),

];

// ── Main ───────────────────────────────────────────────────────────────────

const db = new ClassicLevel(PACK_PATH, { valueEncoding: "json" });

// Wipe all existing entries
const existingKeys = [];
for await (const key of db.keys()) {
  existingKeys.push(key);
}
if (existingKeys.length > 0) {
  await db.batch(existingKeys.map(k => ({ type: "del", key: k })));
  console.log(`Deleted ${existingKeys.length} existing entries.`);
}

// Insert all new powers
const ops = POWERS.map(p => ({ type: "put", key: `!items!${p._id}`, value: p }));
await db.batch(ops);
console.log(`Inserted ${POWERS.length} powers.`);

// List names for confirmation
for (const p of POWERS) {
  console.log(`  • ${p.name} (${p.system.pointCost} pts, maxLevel ${p.system.maxLevel})`);
}

await db.compactRange("!", "~");
await db.close();
console.log("\nDone.");
