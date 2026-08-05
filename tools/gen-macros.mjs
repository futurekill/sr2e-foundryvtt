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
  },
  // ── Hotbar page 2 (slots 11–20) ─────────────────────────────────────────────
  // The Framework 16 pad has 24 keys, so one page of ten wastes most of it. These
  // are the second tier: still frequent, but not every-round.
  {
    slot: 11, name: "Reset Recoil (selected)", img: "icons/svg/target.svg",
    tip: "Recoil accumulates within a Combat Phase; this zeroes it.",
    cmd: `${SEL}
// Recoil is per-phase and accrues across bursts (p.89). Clearing it by hand on
// every shooter is the sort of bookkeeping a pad key exists for.
for (const a of actors) await a.update({ "system.combatRecoil": 0 });
ui.notifications.info(\`Recoil cleared on \${actors.length} actor(s).\`);`
  },
  {
    slot: 12, name: "Recover Dump Shock (selected)", img: "icons/svg/lightning.svg",
    tip: "Willpower vs TN 4. No-ops on anyone not shocked.",
    cmd: `${SEL}
for (const a of actors) await a.recoverDumpShock();`
  },
  {
    slot: 13, name: "Toggle Matrix Mode (selected)", img: "icons/svg/computer.svg",
    tip: "Flips the decker between meat and Matrix.",
    cmd: `${SEL}
for (const a of actors) {
  if (a.system.matrixMode === undefined) continue;   // not a decker-capable sheet
  await a.update({ "system.matrixMode": !a.system.matrixMode });
}`
  },
  {
    slot: 14, name: "Toggle Astral-Only Token (selected)", img: "icons/svg/aura.svg",
    tip: "Hides the token from anyone not astrally active.",
    cmd: `// Operates on TOKEN documents, not actors — the flag lives on the placed token,
// so two tokens of one actor can differ. Astral-only tokens stay invisible to
// mundane viewers (p.145, p.148).
const tokens = canvas.tokens?.controlled ?? [];
if (!tokens.length) return ui.notifications.warn("Select one or more tokens first.");
for (const t of tokens) {
  const on = t.document.getFlag("sr2e", "astralOnly");
  await t.document.setFlag("sr2e", "astralOnly", !on);
}
ui.notifications.info(\`Astral-only toggled on \${tokens.length} token(s).\`);`
  },
  {
    slot: 15, name: "Consolidate Ammo (selected)", img: "icons/svg/chest.svg",
    tip: "Merges duplicate ammo stacks.",
    cmd: `${SEL}
for (const a of actors) await game.sr2e.consolidateAmmo(a);`
  },
  {
    slot: 16, name: "Quick Success Test", img: "icons/svg/d20.svg",
    tip: "Dice + TN, straight off the selected actor. The GM's workhorse roll.",
    cmd: `${SEL}
const data = await foundry.applications.api.DialogV2.prompt({
  window: { title: "Quick Success Test" },
  content: \`<div>
    <div class="form-group"><label>Dice</label>
      <input type="number" name="dice" value="6" min="1" autofocus></div>
    <div class="form-group"><label>Target Number</label>
      <input type="number" name="tn" value="4" min="2"></div>
  </div>\`,
  ok: { label: "Roll", callback: (ev, btn) => new FormDataExtended(btn.form).object }
}).catch(() => null);
if (!data) return;
// Rolls off the FIRST selected actor so the card is attributed to someone.
await actors[0].rollSuccessTest(Number(data.dice) || 1, Number(data.tn) || 4,
  { label: \`Quick Test (\${data.dice} dice, TN \${data.tn})\` });`
  },
  {
    slot: 17, name: "End Combat", img: "icons/svg/circle.svg",
    tip: "Asks first — this deletes the encounter.",
    cmd: `if (!game.combat) return ui.notifications.warn("No active combat.");
// The one destructive key on the pad, so it is the one that confirms. Ending
// combat also triggers the end-of-combat pool refresh.
const ok = await foundry.applications.api.DialogV2.confirm({
  window: { title: "End Combat" },
  content: "<p>End the current encounter?</p>"
}).catch(() => false);
if (ok) await game.combat.delete();`
  },
  {
    slot: 18, name: "Clear All Targets", img: "icons/svg/cancel.svg",
    tip: "Releases your targeting, not your selection.",
    cmd: `// Targets and selection are different things and diverge constantly; this
// clears TARGETS only, which is the one that silently causes wrong-actor rolls.
const targets = Array.from(game.user.targets);
if (!targets.length) return ui.notifications.info("No targets set.");
game.user.updateTokenTargets([]);
ui.notifications.info(\`Cleared \${targets.length} target(s).\`);`
  },
  {
    slot: 19, name: "Select All Player Tokens", img: "icons/svg/mage-shield.svg",
    tip: "Grabs the party on this scene — pairs with the heal and refresh keys.",
    cmd: `// Pairs with slots 2, 5 and 6: select the party, then act on all of them.
const pcs = canvas.tokens?.placeables.filter(t => t.actor?.hasPlayerOwner) ?? [];
if (!pcs.length) return ui.notifications.warn("No player-owned tokens on this scene.");
canvas.tokens.releaseAll();
for (const t of pcs) t.control({ releaseOthers: false });
ui.notifications.info(\`Selected \${pcs.length} player token(s).\`);`
  },
  {
    slot: 20, name: "Award Nuyen (selected)", img: "icons/svg/coins.svg",
    tip: "Splits a total evenly across the selected characters.",
    cmd: `${SEL}
const data = await foundry.applications.api.DialogV2.prompt({
  window: { title: \`Award Nuyen — split across \${actors.length}\` },
  content: \`<div class="form-group"><label>Total ¥</label>
    <input type="number" name="total" value="1000" min="0" autofocus></div>\`,
  ok: { label: "Split", callback: (ev, btn) => new FormDataExtended(btn.form).object }
}).catch(() => null);
if (!data) return;
const total = Number(data.total) || 0;
const each = Math.floor(total / actors.length);
const leftover = total - (each * actors.length);
for (const a of actors) {
  if (a.system.nuyen === undefined) continue;
  await a.update({ "system.nuyen": (a.system.nuyen ?? 0) + each });
}
ui.notifications.info(\`\${each}¥ each\${leftover ? \` (\${leftover}¥ left over — hand it out yourself)\` : ""}.\`);`
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
