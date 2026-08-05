// Generate the SR2E macro compendium into packs-src/macros.
//
// These are built for a PHYSICAL MACRO PAD driven by VIA, which sends
// KEYSTROKES rather than calling anything. So the chain is:
//
//     VIA key  →  digit 1–0  →  Foundry hotbar slot  →  this macro
//
// Three consequences shape every macro below:
//
//   1. It must work from a KEYPRESS with no click. So each one acts on the
//      current token selection (or the active combat), never on "the thing you
//      just clicked".
//   2. It must be SAFE TO PRESS TWICE. A macro pad invites fat-fingering, so
//      nothing here is destructive without a confirm, and the idempotent ones
//      say so.
//   3. SLOT ORDER IS PART OF THE DESIGN. `slot` below is the hotbar position
//      each macro is meant for — the most-pressed keys get the low digits.
//      docs/MACROS.md has the recommended pad layout.
//
// Foundry only fires hotbar digits when the CANVAS has focus — if the cursor is
// in chat, the digit types a "1". That is a Foundry behaviour, not something the
// macros can work around, and it is called out in the docs.
import { writeFileSync, readdirSync, mkdirSync, rmSync, renameSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const DIR = "packs-src/macros";
const idFor = (s) => createHash("sha1").update("sr2e-macro:" + s).digest("hex").slice(0, 16);
const safeName = (s) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

const STATS = { coreVersion: "13.351", systemId: "sr2e", systemVersion: null,
  createdTime: 1784000000000, modifiedTime: 1784000000000, lastModifiedBy: null,
  compendiumSource: null, duplicateSource: null, exportSource: null };

/** Shared preamble: every macro needs the selection, and says so consistently. */
const SEL = `
const tokens = canvas.tokens?.controlled ?? [];
if (!tokens.length) return ui.notifications.warn("Select one or more tokens first.");
const actors = tokens.map(t => t.actor).filter(Boolean);
`.trim();

const MACROS = [
  {
    slot: 1, name: "Next Initiative Pass", img: "icons/svg/clockwork.svg",
    tip: "The −10 pass. The most-pressed key in SR2 combat.",
    cmd: `// SR2E initiative passes: acting again costs 10 Initiative and play jumps to
// the highest remaining total (SR2E p.85). SR2ECombat#nextTurn implements it.
if (!game.combat) return ui.notifications.warn("No active combat.");
await game.combat.nextTurn();`
  },
  {
    slot: 2, name: "Refresh Dice Pools (selected)", img: "icons/svg/regen.svg",
    tip: "Combat/Magic/Control pools, Spell Defense, Shielding — and spell focus dice.",
    cmd: `${SEL}
// Also resets spell focus dice, which the book refreshes on the same schedule as
// the Magic Pool (p.137). Safe to press repeatedly — refreshing a full pool is a
// no-op.
for (const a of actors) await a.refreshDicePools();
ui.notifications.info(\`Refreshed pools for \${actors.length} actor(s).\`);`
  },
  {
    slot: 3, name: "Refresh Pools — Everyone in Combat", img: "icons/svg/upgrade.svg",
    tip: "Start-of-round sweep. No selection needed.",
    cmd: `if (!game.combat) return ui.notifications.warn("No active combat.");
// Deliberately needs no token selection — this is the start-of-round key, and
// hunting for a select-all first defeats the point of a macro pad.
let n = 0;
for (const c of game.combat.combatants) {
  if (!c.actor) continue;
  await c.actor.refreshDicePools();
  n++;
}
ui.notifications.info(\`Refreshed pools for \${n} combatant(s).\`);`
  },
  {
    slot: 4, name: "Apply Damage (selected)", img: "icons/svg/blood.svg",
    tip: "Prompts for boxes and type. The one macro that must ask.",
    cmd: `${SEL}
// The only hot key that opens a dialog, because guessing an amount is worse than
// a keystroke. Stun overflow converts to Physical automatically (p.110).
const form = \`<div>
  <div class="form-group"><label>Boxes</label>
    <input type="number" name="amount" value="1" min="1" autofocus></div>
  <div class="form-group"><label>Type</label>
    <select name="type"><option value="physical">Physical</option>
    <option value="stun">Stun</option></select></div>
</div>\`;
const data = await foundry.applications.api.DialogV2.prompt({
  window: { title: \`Apply Damage — \${actors.length} target(s)\` },
  content: form, ok: { label: "Apply", callback: (ev, btn) => new FormDataExtended(btn.form).object }
}).catch(() => null);
if (!data) return;
for (const a of actors) await a.applyDamage(data.type, Number(data.amount) || 0);`
  },
  {
    slot: 5, name: "Recover Stun (selected)", img: "icons/svg/sleep.svg",
    tip: "Body or Willpower, whichever is higher, vs TN 2.",
    cmd: `${SEL}
// No-ops cleanly on anyone who is not stunned, so it is safe to fire at a whole
// group without checking first.
for (const a of actors) await a.recoverStun();`
  },
  {
    slot: 6, name: "Heal Physical (selected)", img: "icons/svg/heal.svg",
    tip: "Natural healing. Refuses Deadly wounds — those need First Aid.",
    cmd: `${SEL}
for (const a of actors) await a.healPhysical();`
  },
  {
    slot: 7, name: "Toggle Astral Perception (selected)", img: "icons/svg/eye.svg",
    tip: "none ⇄ perceiving. Projection stays manual — it is not a hot-key decision.",
    cmd: `${SEL}
// Only flips between none and PERCEIVING. Projecting leaves your body behind and
// changes initiative, so it is deliberately not on a key you can hit by accident.
for (const a of actors) {
  if (a.system.astralState === undefined) continue;   // NPCs have no astral state
  const next = a.system.astralState === "perceiving" ? "none" : "perceiving";
  await a.update({ "system.astralState": next });
}`
  },
  {
    slot: 8, name: "Roll Initiative — All Combatants", img: "icons/svg/d20.svg",
    tip: "Re-rolls everyone in the current combat.",
    cmd: `if (!game.combat) return ui.notifications.warn("No active combat.");
await game.combat.rollAll();`
  },
  {
    slot: 9, name: "Clear Templates (this scene)", img: "icons/svg/explosion.svg",
    tip: "Sweeps leftover blast and spell templates.",
    cmd: `// Blast and area-spell templates pile up fast and clutter the map. Scoped to the
// CURRENT scene so a stray press cannot wipe templates you left on another one.
const ids = canvas.scene?.templates?.map(t => t.id) ?? [];
if (!ids.length) return ui.notifications.info("No templates on this scene.");
await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", ids);
ui.notifications.info(\`Cleared \${ids.length} template(s).\`);`
  },
  {
    slot: 10, name: "Award Karma (selected)", img: "icons/svg/upgrade.svg",
    tip: "Adds to spendable and lifetime Karma. Does NOT touch the Karma Pool.",
    cmd: `${SEL}
const data = await foundry.applications.api.DialogV2.prompt({
  window: { title: \`Award Karma — \${actors.length} character(s)\` },
  content: \`<div class="form-group"><label>Karma each</label>
    <input type="number" name="amount" value="1" min="0" autofocus></div>\`,
  ok: { label: "Award", callback: (ev, btn) => new FormDataExtended(btn.form).object }
}).catch(() => null);
if (!data) return;
const amt = Number(data.amount) || 0;
if (!amt) return;
for (const a of actors) {
  const k = a.system.karma;
  if (!k) continue;   // only characters carry Karma
  // current = spendable on improvements, total = lifetime earned.
  //
  // Deliberately NOT karma.pool. That is the Karma POOL — the dice resource that
  // rerolls, buys successes and avoids glitches spend down. Awarding session
  // karma into it would hand out combat currency every time you paid the group,
  // and the pool refreshes on its own schedule.
  await a.update({
    "system.karma.current": (k.current ?? 0) + amt,
    "system.karma.total":   (k.total   ?? 0) + amt
  });
}
ui.notifications.info(\`Awarded \${amt} Karma to \${actors.length} character(s).\`);`
  }
];

// ── emit ────────────────────────────────────────────────────────────────────
const TMP = `${DIR}.tmp-${process.pid}`;
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

for (const m of MACROS) {
  const _id = idFor(m.name);
  const doc = {
    _id, name: m.name, type: "script", scope: "global",
    author: null, img: m.img,
    command: `/* SR2E — hotbar slot ${m.slot}. ${m.tip}\n   See docs/MACROS.md for the VIA macro-pad layout. */\n${m.cmd}\n`,
    folder: null, sort: m.slot * 1000,
    ownership: { default: 2 },
    flags: { sr2e: { suggestedSlot: m.slot } },
    _stats: STATS,
    _key: `!macros!${_id}`
  };
  writeFileSync(`${TMP}/${safeName(m.name)}_${_id}.json`, JSON.stringify(doc, null, 2) + "\n");
}

const written = readdirSync(TMP);
if (written.length !== MACROS.length) throw new Error(`wrote ${written.length} of ${MACROS.length}`);
const slots = MACROS.map(m => m.slot);
if (new Set(slots).size !== slots.length) throw new Error("two macros claim the same hotbar slot");

const BAK = `${DIR}.bak-${process.pid}`;
if (existsSync(DIR)) renameSync(DIR, BAK);
try { renameSync(TMP, DIR); }
catch (e) { if (existsSync(BAK)) renameSync(BAK, DIR); throw e; }
rmSync(BAK, { recursive: true, force: true });

console.log(`wrote ${MACROS.length} macro(s)`);
for (const m of MACROS) console.log(`  slot ${String(m.slot).padStart(2)}  ${m.name}`);
