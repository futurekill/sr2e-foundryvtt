#!/usr/bin/env node
/**
 * Wire vehicle portrait/token art and set token footprints.
 *
 *   npm run vehicle-tokens          # report what would change
 *   npm run vehicle-tokens -- --fix # write it into packs-src/vehicles
 *
 * ART. Portraits are TRIMMED to the vehicle by tools/fit-vehicle-art.mjs — they
 * used to be square 1024x1024 canvases that were half empty air, which made the
 * vehicle render at about half its own footprint. This tool only sets
 * `texture.src`, so the `fit` that tool chooses survives a re-run.
 *
 * Each vehicle gets one WebP (transparent background, strict
 * top-down, nose pointing DOWN — see the orientation note below) used as BOTH
 * the actor portrait and the token
 * texture — the same convention the creature portraits use. Vehicles keep
 * `lockRotation: false`, unlike creatures: a top-down vehicle SHOULD swing to
 * face its direction of travel, which is why the art points south.
 *
 * FOOTPRINT. Everything shipped at 1x1, which on this system's scenes (100 px
 * per cell, 1 m per cell — see the scene convention in the module docs) makes a
 * delivery van one metre long. That is not just cosmetic: vehicle ramming and
 * vehicle combat are implemented, and a token occupying a single square cannot
 * be positioned, blocked or rammed sensibly, besides squashing the art.
 *
 * !! THESE SIZES ARE ESTIMATES, NOT BOOK VALUES. !!
 * SR2 gives vehicles a Body rating but no physical dimensions, so there is no
 * table to transcribe. The numbers below are real-world dimensions for the
 * closest equivalent craft, rounded to whole cells at 1 m per cell — width =
 * cells ACROSS the beam, height = cells ALONG the length (nose-down (south) art). For
 * rotorcraft the rotor disc dominates, so the footprint is square. A GM who
 * disagrees can change any token's size in Foundry; nothing derives from these.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIX = process.argv.includes("--fix");
const DIR = "packs-src/vehicles";
const ART = "assets/vehicle_portraits";

// name → [slug, widthCells, heightCells]  (height = along the vehicle's length)
const VEHICLES = {
  // ── Ground ────────────────────────────────────────────────────────────────
  "Dodge Scoot":                ["dodge-scoot", 1, 2],
  "Yamaha Rapier":              ["yamaha-rapier", 1, 2],
  "Harley Scorpion":            ["harley-scorpion", 1, 3],
  "Chrysler-Nissan Jackrabbit": ["chrysler-nissan-jackrabbit", 2, 4],
  "Mitsubishi Runabout":        ["mitsubishi-runabout", 2, 4],
  "Ford Americar":              ["ford-americar", 2, 5],
  "Toyota Elite":               ["toyota-elite", 2, 5],
  "Eurocar Westwind 2000":      ["eurocar-westwind-2000", 2, 5],
  "Chrysler-Nissan Patrol-1":   ["chrysler-nissan-patrol-1", 2, 5],
  "Mitsubishi Nightsky":        ["mitsubishi-nightsky", 2, 7],
  "Ares Citymaster":            ["ares-citymaster", 3, 7],
  "Chrysler-Nissan G12a":       ["chrysler-nissan-g12a", 3, 7],
  // ── Boats ─────────────────────────────────────────────────────────────────
  "Sendanko Marlin":            ["sendanko-marlin", 3, 7],
  "Aztechnology Nightrunner":   ["aztechnology-nightrunner", 3, 9],
  "GMC Beachcraft Patroller":   ["gmc-beachcraft-patroller", 3, 9],
  "Samuvani Criscraft Otter":   ["samuvani-criscraft-otter", 4, 12],
  "GMC Riverine":               ["gmc-riverine", 4, 12],
  // ── Rotorcraft (rotor disc dominates → square) ────────────────────────────
  "Northrup PRC-42B Wasp":      ["northrup-prc-42b-wasp", 8, 8],
  "FRC-44B Yellowjacket":       ["frc-44b-yellowjacket", 9, 9],
  "Hughes WK-2 Stallion":       ["hughes-wk-2-stallion", 12, 12],
  "Federated-Boeing Commuter":  ["federated-boeing-commuter", 14, 14],
  "Hughes Airstar":             ["hughes-airstar", 14, 14],
  "Ares Dragon":                ["ares-dragon", 20, 20],
  // ── Fixed wing / VTOL (width = wingspan) ──────────────────────────────────
  "Cessna C750":                ["cessna-c750", 11, 9],
  "EFA (Eurofighter)":          ["efa-eurofighter", 11, 16],
  "GMC Banshee":                ["gmc-banshee", 12, 12],
  "Federated-Boeing Eagle":     ["federated-boeing-eagle", 14, 14],
  "Lear-Cessna Platinum I":     ["lear-cessna-platinum-i", 15, 14],
  // ── Drones ────────────────────────────────────────────────────────────────
  "Surveillance Drone":         ["surveillance-drone", 1, 1],
  "Spotter Drone":              ["spotter-drone", 1, 1],
  "Hunter Drone":               ["hunter-drone", 2, 2],
  "Patrol Vehicle Drone":       ["patrol-vehicle-drone", 2, 3]
};

const changes = [], missingArt = [], unknown = [];

for (const file of readdirSync(DIR)) {
  if (!file.endsWith(".json")) continue;
  const path = join(DIR, file);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  if (!doc.system) continue;                       // folder entry

  const entry = VEHICLES[doc.name];
  if (!entry) { unknown.push(doc.name); continue; }
  const [slug, w, h] = entry;

  const rel = `${ART}/${slug}.webp`;
  if (!existsSync(rel)) { missingArt.push(`${doc.name} (${slug}.webp)`); continue; }
  const img = `systems/sr2e/${rel}`;

  const pt = doc.prototypeToken ??= {};
  pt.texture ??= {};
  const was = { img: doc.img, w: pt.width, h: pt.height };
  if (was.img === img && was.w === w && was.h === h) continue;   // already right

  doc.img = img;
  pt.texture.src = img;
  pt.width = w;
  pt.height = h;
  // A vehicle faces where it drives — unlike creatures, which lock rotation.
  pt.lockRotation = false;

  changes.push({ name: doc.name, from: `${was.w}x${was.h}`, to: `${w}x${h}`, slug });
  if (FIX) writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
}

const pad = (s, n) => String(s).padEnd(n);
if (changes.length) {
  console.log(`${FIX ? "WROTE" : "WOULD WRITE"} ${changes.length} vehicle(s):\n`);
  console.log(`  ${pad("VEHICLE", 30)}${pad("SIZE", 12)}ART`);
  for (const c of changes) console.log(`  ${pad(c.name, 30)}${pad(`${c.from} → ${c.to}`, 12)}${c.slug}.webp`);
} else {
  console.log("Every vehicle already has its art and footprint.");
}
if (missingArt.length) console.log(`\nArt not generated yet (${missingArt.length}): ${missingArt.join(", ")}`);
if (unknown.length)    console.log(`\nShipped but not in the size table (${unknown.length}): ${unknown.join(", ")}`);
if (!FIX && changes.length) console.log("\nRe-run with --fix to write.");
