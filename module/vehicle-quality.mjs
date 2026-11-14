/**
 * Prototype Model / Used Vehicle hidden Stress (R2 p.84; docs/PLAN-vehicles-phase2.md 6a.3). 1D6 hidden Stress Points
 * rolled ONCE by the GM into GM-only storage (the world setting `r2HiddenStress`, keyed by vehicle uuid — never an
 * actor flag); the vehicle carries only a creation receipt (`flags.sr2e.hiddenStressRolled`). Every read–modify–write
 * of the store runs in ONE world-wide queue `hidden-stress`. A reveal is a recoverable transaction: (1) record
 * `reveals.<id> = { n, state: pending }` and lower the balance; (2) outside the store's queue, apply n Stress through
 * the vehicle `stress` op with eventId = the reveal id (idempotent); (3) mark it done. Pending reveals are re-applied
 * on the GM's ready. Revealable when the vehicle "comes into play": pushed with Stress dice or a Stress Rule of One —
 * those post a GM prompt; the GM may also reveal at any time (game.sr2e.hiddenStress).
 */
import { enqueueAttack } from "./engagement.mjs";
import { r2Option } from "./vehicle-mode.mjs";
import { adjustStress } from "./vehicle-play.mjs";

const KEY = "r2HiddenStress";
const isActiveGM = () => !!game.users.activeGM?.isSelf;
const sq = (fn) => enqueueAttack("hidden-stress", fn);
const store = () => foundry.utils.deepClone(game.settings.get("sr2e", KEY) ?? {});
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const isPrototype = (v) => v?.type === "vehicle" && (Number(v.system?.design?.choices?.quality?.prototype) || 0) > 0;

/** Points still hidden on this vehicle (GM only; 0 for anyone else). */
export const hiddenStressLeft = (v) => (game.user.isGM ? store()[v?.uuid]?.available ?? 0 : 0);

/** Roll the 1D6 once (the GM, when a prototype design exists and the option is on). */
async function ensureRolled(v) {
  if (!isActiveGM() || !r2Option("r2QualityFactors") || !isPrototype(v) || v.getFlag("sr2e", "hiddenStressRolled")) return;
  await sq(async () => {
    const s = store();
    if (!s[v.uuid]) {
      const n = (await new Roll("1d6").evaluate()).total;
      s[v.uuid] = { available: n, reveals: {} };
      await game.settings.set("sr2e", KEY, s);
      await ChatMessage.create({ whisper: game.users.filter(u => u.isGM).map(u => u.id), speaker: ChatMessage.getSpeaker({ actor: v }),
        content: `<div class="sr2e-damage-result"><strong>${esc(v.name)}: ${n} hidden Stress</strong> (Prototype Model / Used Vehicle, Rigger 2 p.84).
          Revealed when the vehicle comes into play.</div>` });
    }
  });
  await v.update({ "flags.sr2e.hiddenStressRolled": true });
}

/** Reveal `n` hidden Stress Points (GM): reserve in the store, apply through the Stress op, mark done. */
export async function revealHiddenStress(v, n = null) {
  if (!game.user.isGM || !r2Option("r2QualityFactors")) return 0;
  const id = await sq(async () => {
    const s = store(), rec = s[v.uuid];
    const k = Math.min(rec?.available ?? 0, n == null ? Infinity : Math.max(0, Math.floor(n)));
    if (!k) return null;
    const rid = `hidden-${foundry.utils.randomID(12)}`;
    rec.available -= k;
    rec.reveals[rid] = { n: k, state: "pending" };
    await game.settings.set("sr2e", KEY, s);
    return rid;
  });
  if (!id) return 0;
  return finishReveal(v, id);
}

async function finishReveal(v, rid) {
  const r = store()[v.uuid]?.reveals?.[rid];
  if (!r || r.state === "done") return 0;
  await adjustStress(v, r.n, { eventId: rid, reason: "hidden Stress revealed (Rigger 2 p.84)" });
  await sq(async () => {
    const s = store();
    if (s[v.uuid]?.reveals?.[rid]) { s[v.uuid].reveals[rid].state = "done"; await game.settings.set("sr2e", KEY, s); }
  });
  return r.n;
}

/** The vehicle came into play (pushed with Stress dice, a Stress Rule of One): ask the GM whether to reveal. */
export async function hiddenStressPrompt(v, why) {
  if (!r2Option("r2QualityFactors") || !isPrototype(v)) return;
  const gm = game.users.activeGM;
  if (!gm) return;
  await ChatMessage.create({ whisper: game.users.filter(u => u.isGM).map(u => u.id), speaker: ChatMessage.getSpeaker({ actor: v }),
    flags: { sr2e: { hiddenStressPrompt: { vehicleUuid: v.uuid } } },
    content: `<div class="sr2e-damage-result"><strong>${esc(v.name)} comes into play</strong> (${esc(why)}): reveal its hidden Stress?
      (Rigger 2 p.84: all now, or a few over the adventure)
      <div class="sr2e-karma-actions"><button type="button" class="sr2e-resist-btn sr2e-hidden-all">Reveal all</button>
      <button type="button" class="sr2e-resist-btn sr2e-hidden-one">Reveal 1</button></div></div>` });
}

export function registerHiddenStress() {
  game.settings.register("sr2e", KEY, { scope: "world", config: false, type: Object, default: {} });
  Hooks.on("createActor", (a) => ensureRolled(a).catch(err => console.error("SR2E | hidden stress", err)));
  Hooks.on("updateActor", (a, ch) => { if (foundry.utils.hasProperty(ch, "system.design")) ensureRolled(a).catch(err => console.error("SR2E | hidden stress", err)); });
  Hooks.once("ready", async () => {
    if (!isActiveGM()) return;
    for (const [uuid, rec] of Object.entries(store())) for (const [rid, r] of Object.entries(rec.reveals ?? {}))
      if (r.state === "pending") { const v = fromUuidSync(uuid); if (v) finishReveal(v, rid).catch(err => console.error("SR2E | hidden stress", err)); }
    for (const v of game.actors.filter(isPrototype)) ensureRolled(v).catch(() => {});
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const p = message.getFlag("sr2e", "hiddenStressPrompt");
    if (!p) return;
    const go = (n) => { const v = fromUuidSync(p.vehicleUuid); if (v) revealHiddenStress(v, n).then(k => ui.notifications.info(`SR2E | ${k} hidden Stress revealed.`)); };
    html.querySelector(".sr2e-hidden-all")?.addEventListener("click", (e) => { e.preventDefault(); go(null); });
    html.querySelector(".sr2e-hidden-one")?.addEventListener("click", (e) => { e.preventDefault(); go(1); });
  });
}
