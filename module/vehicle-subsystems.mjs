/**
 * Rigger 2 vehicle subsystem damage (R2 p.85–87, optional `r2Subsystems`; docs/PLAN-vehicles-phase2.md 6a.4).
 *   - A damage commit of Moderate or worse from one source records a `vfollow.<fid>.subsystem` follow-up in the SAME
 *     update (vehicle-play.mjs GM_OPS.damage); the GM's delivery posts its card; the controlling player (or the GM)
 *     clicks it and the GM op `subsystemRoll` rolls the count and the tables ONCE (the follow-up's state).
 *   - Each hit is a record bound to an INSTANCE: `flags.sr2e.subsystems.<id> = { target: { kind: item|builtin, id,
 *     gen }, key, label, level, attack, origin, state: active|repaired|retired }`; an item replaced (a new id) or a
 *     built-in target whose generation bumped (`flags.sr2e.subsysGen.<target>`) no longer matches — its record is inert.
 *   - Effects are DERIVED each preparation (VehicleData): items get `subsysLevel` (applyModEffects), built-ins change
 *     Handling, Acceleration/Speed/Load, Body, Armor. Secondary consequences (crashes, tests) run once per record.
 */
import { gmOp, gmCall, controllerOf } from "./vehicle-play.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { r2Option } from "./vehicle-mode.mjs";
import { subsystemCount, resolveSubsystemHit, genOf, subsystemState, applySubsystemEffects, recordLive, subsystemsOf } from "./rules/vehicle-subsystem-rules.mjs";
export { subsystemState, applySubsystemEffects, recordLive, subsystemsOf };

const vq = (uuid, fn) => enqueueAttack(`vdmg:${uuid}`, fn);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const WORKING = ["", "done", "factory"];
const BUILTIN = new Set(["handling", "engine", "fuelTank", "compartment", "body", "armor", "controlBox", "autonav"]);
const MODKEYS = { ecm: ["ecm"], eccm: ["eccm"], ecd: ["ecd"], ed: ["ed"], sensors: ["sensors"], driveByWire: ["drive-by-wire"],
  turbo: ["turbocharging", "superconductive-drive"], nitrous: ["nitrous-injector"], engineCustom: ["engine-customization"] };
/** Name hints for items the catalogs give no modKey (the rest: the GM's call on the card). */
const NAMES = { apps: /\bAPPS\b|Advanced Passenger Protection/i, amphibious: /amphibious/i, antiTheft: /anti-?theft/i,
  comms: /radio|communication|satellite|commlink/i, droneRack: /drone rack/i, enviroSeal: /enviroseal|enviro-seal/i,
  cargoMount: /cargo mount|roof rack/i, lifeSupport: /life support/i, spotlight: /spotlight|searchlight/i, turret: /turret/i,
  gridlink: /gridlink/i, sunCell: /suncell|sun cell/i, rcLinkup: /remote.control|rc deck|linkup/i, targetAcquisition: /target acquisition|fire control/i };

/** Where a table result lands on THIS vehicle: a working item, a built-in target, or null ("no subsystem hit"). */
export function subsystemTarget(v, key) {
  if (BUILTIN.has(key)) {
    if (key === "autonav" && !((v.system.effective?.autonav ?? v.system.autonav ?? 0) > 0)) return null;
    if (key === "controlBox" && !v.items.some(i => i.type === "vehicle_mod" && /rigger adaptation/i.test(i.name))) return null;
    return { kind: "builtin", id: key, gen: genOf(v, key) };
  }
  if (key === "weapon") { const w = v.items.find(i => i.type === "weapon"); return w ? { kind: "item", id: w.id } : null; }
  const items = v.items.filter(i => i.type === "vehicle_mod" && WORKING.includes(i.system.custom?.state ?? ""));
  const hit = items.find(i => (MODKEYS[key] ?? []).includes(i.system.modKey)) ?? (NAMES[key] ? items.find(i => NAMES[key].test(i.name)) : null);
  return hit ? { kind: "item", id: hit.id } : null;
}

export function registerSubsystems() {
  // The follow-up's roll (p.85): count, tables, severity — ONCE; each hit becomes a record bound to its instance.
  gmOp("subsystemRoll", async ({ vehicleUuid, fid }, user) => {
    const v = fromUuidSync(vehicleUuid);
    if (v?.type !== "vehicle" || !r2Option("r2Subsystems")) throw new Error("not available");
    const drv = controllerOf(v);
    if (!user.isGM && !(drv ?? v).testUserPermission(user, "OWNER")) throw new Error("the controlling player or the GM rolls this");
    const res = await vq(v.uuid, async () => {
      const f = v.getFlag("sr2e", "vfollow")?.[fid]?.subsystem;
      if (!f || f.rolled) return null;
      const d6 = async (n = 1) => (await new Roll(`${n}d6`).evaluate()).total;
      const countRoll = await d6();
      const n = subsystemCount(f.level, countRoll);
      const rolls = [];
      for (let i = 0; i < n; i++) {
        const seq = []; for (let k = 0; k < 40; k++) seq.push(await d6(1));
        let j = 0; const roll = (dice) => { if (dice === 2) { const a = seq[j++], b = seq[j++]; return a + b; } return seq[j++]; };
        rolls.push(...resolveSubsystemHit(roll));
      }
      const upd = { [`flags.sr2e.vfollow.${fid}.subsystem.rolled`]: { countRoll, n, hits: rolls } };
      const made = [];
      for (const h of rolls) {
        const target = h.gm ? null : subsystemTarget(v, h.key);
        if (!target) { made.push({ ...h, none: true }); continue; }
        const id = foundry.utils.randomID(16);
        upd[`flags.sr2e.subsystems.${id}`] = { target, key: h.key, label: h.label, level: h.level, attack: f.attack ?? null, origin: fid,
          state: "active", at: Date.now() };
        made.push({ ...h, id, target });
      }
      await v.update(upd);
      return { countRoll, n, made };
    });
    if (!res) return null;
    const lines = res.made.map(h => `<li>${esc(h.label)}: <strong>${h.level}</strong>${h.none ? h.gm ? " — the GM's choice of device (or roll again)" : " — no subsystem hit (the vehicle lacks it)" : ""}</li>`);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: v }), content: `<div class="sr2e-damage-result">
      <strong>${esc(v.name)}: subsystem damage</strong> (Rigger 2 p.85–87) — 1D6 = ${res.countRoll}: ${res.n} subsystem${res.n === 1 ? "" : "s"} hit.
      ${lines.length ? `<ul>${lines.join("")}</ul>` : ""}</div>` });
    await consequences(v, res.made.filter(h => h.id), fid);
    return res;
  });

  Hooks.on("renderChatMessageHTML", (message, html) => {
    const s = message.getFlag("sr2e", "subsystemCard");
    if (!s) return;
    html.querySelector(".sr2e-subsys-roll")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      gmCall("subsystemRoll", s).catch(err => ui.notifications.warn(`SR2E | ${err.message}`));
    });
  });
}

/** The follow-up card (vehicle-damage.mjs delivery). */
export function postSubsystemCard(v, fid, x, tag) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: v }), flags: { sr2e: { vfollowId: tag, subsystemCard: { vehicleUuid: v.uuid, fid } } },
    content: `<div class="sr2e-damage-result"><strong>${esc(v.name)} took ${x.level === "D" ? "Deadly" : x.level === "S" ? "Serious" : "Moderate"} damage</strong>:
      subsystems may be hit (Rigger 2 p.85). The controlling player rolls.
      <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-subsys-roll">🔧 Roll subsystem damage</button></div></div>` });
}

/**
 * Secondary consequences, once per record (6a.4): a Deadly Handling hit or a destroyed Body crashes the vehicle; a
 * ruptured fuel tank or a Deadly engine hit needs a Crash Test — all merged into ONE origin-keyed crash (automatic
 * crash beats a pending test). The rigger's ASIST backlash and passengers' shrapnel are noted on the card for the GM.
 */
async function consequences(v, hits, origin) {
  const { escalateCrash } = await import("./vehicle-damage.mjs");
  const auto = hits.some(h => (h.key === "handling" || h.key === "body") && h.level === "D");
  const test = hits.some(h => (h.key === "fuelTank" || h.key === "engine") && h.level === "D");
  // ONE crash per originating event (the damage writer's own follow-up id), an automatic crash taking precedence.
  if (auto) await escalateCrash(v, origin, "auto", "a Deadly subsystem hit (Rigger 2 p.86–87)");
  else if (test) await escalateCrash(v, origin, "test", "a Deadly engine or fuel-tank hit (Rigger 2 p.87)");
  const notes = [];
  for (const h of hits) {
    const pa = h.attack?.powerAfterArmor;
    if (h.key === "controlBox") notes.push(`Rigger Control Box ${h.level}: the rigger resists ${pa ?? "the attack's Power after armour"}${h.level} PHYSICAL (ASIST backlash, p.86).`);
    if (h.key === "compartment") notes.push(`Passenger Compartment ${h.level}: passengers resist ${pa != null ? Math.ceil(pa / 2) : "½ the attack's Power after armour"}${h.level} physical shrapnel (p.87).`);
  }
  if (notes.length) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: v }), content: `<div class="sr2e-damage-result">${notes.map(esc).join("<br>")}</div>` });
}

/**
 * A leaking fuel tank (p.87): each Combat Turn loses fuel remaining × .01 / .05 / .1 (Light / Moderate / Serious),
 * through the fuel op with a receipt per vehicle and Turn. GM, inside the staged round change (resumable).
 */
export async function subsystemLeakStage(combat, r) {
  if (!r2Option("r2Subsystems")) return;
  const { chaseOf } = await import("./chase-state.mjs");
  const { fuelLeft } = await import("./vehicle-fuel.mjs");
  const { LEAK_RATE } = await import("./rules/vehicle-subsystem-rules.mjs");
  const vs = new Map();
  for (const e of Object.values(chaseOf(combat)?.entries ?? {})) { const v = e?.kind === "vehicle" ? fromUuidSync(e.uuid) : null; if (v) vs.set(v.uuid, v); }
  for (const c of combat.combatants) if (c.actor?.type === "vehicle") vs.set(c.actor.uuid, c.actor);
  for (const v of vs.values()) {
    const lvl = subsystemState(v).fuelTank, rate = LEAK_RATE[lvl];
    const left = fuelLeft(v);
    if (!rate || !(left > 0)) continue;
    await gmCall("fuel", { vehicleUuid: v.uuid, origin: "leak", amount: Math.round(left * rate * 1000) / 1000,
      eventId: `leak-${combat.id}-${r}-${v.id}`, card: false }).catch(err => console.error("SR2E | leak", err));
  }
}

