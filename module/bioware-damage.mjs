/**
 * Bioware damage and repair (Shadowtech p.6; docs/PLAN-bioware-damage.md, approved by Codex).
 * Optional (`biowareDamage`). A single physical hit of Deadly severity (one commit landing 10+
 * boxes) posts ONE GM card per commit; its roll is claimed per attempt and persisted before
 * anything is applied; each hit is applied with a receipt on the item, from the LIVE item, and
 * resumes after an interruption. Damaged bioware heals individually in half the time; with the
 * healing clock it is a course on the ITEM, fenced by `damageRev`, `implantGen` and the owner uuid.
 */
import { once, markersOf } from "./claims.mjs";
import { STUCK_MS } from "./rules/claim-rules.mjs";
import { enqueueAttack } from "./engagement.mjs";
import { wareRule } from "./rules/ware-rules.mjs";
import { HEALING_TABLE, doctoringMod, healingTimeText } from "./rules/sr2e-rules.mjs";
import { bioDamageLevel, pickTargets, addBioDamage, bioFunctions, bioLevel, bioHealFloor, bioHealHours }
  from "./rules/bioware-damage-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const LEVEL = { L: "Light", M: "Moderate", S: "Serious", D: "Deadly", X: "destroyed (secondhand)" };
export const biowareDamageOn = () => { try { return game.settings.get("sr2e", "biowareDamage"); } catch (e) { return false; } };
const d6 = async () => (await new Roll("1d6").evaluate()).total;
const queue = (actor, fn) => enqueueAttack(`bio:${actor.uuid}`, fn);
const srcOf = (i) => i._stats?.compendiumSource ?? i.flags?.core?.sourceId ?? null;
const eligible = (actor) => actor.items.filter(i => i.type === "bioware" && i.system.installed && !i.system.destroyed
  && wareRule(i.flags, srcOf(i)) !== "orthoskin");

// ── The card ───────────────────────────────────────────────────────────────

/** On the committing client: a physical commit landing 10+ boxes (Phase 5's per-hit reading). */
async function onDamage(actor, out, { type, receipt } = {}) {
  if (!biowareDamageOn() || actor?.type !== "character" || type !== "physical" || (out?.landedBoxes ?? 0) < 10) return;
  const items = eligible(actor);
  if (!items.length || !await once(actor, `biodmg-card:${receipt}`)) return;
  const st = { actorUuid: actor.uuid, actorName: actor.name, receipt, rollAttempt: 0,
    snapshot: items.map(i => ({ itemId: i.id, name: i.name, grade: i.system.grade ?? "standard", implantGen: i.system.implantGen ?? 0 })),
    results: null };
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: ChatMessage.getWhisperRecipients("GM"),
    content: renderCard(st), flags: { sr2e: { biodmg: st } } });
}

const btn = (op, label, title = "") => `<button type="button" class="sr2e-resist-btn sr2e-bio-btn" data-op="${op}" title="${esc(title)}">${esc(label)}</button>`;

export function renderCard(st) {
  let body;
  if (!st.results) body = btn("roll", "Roll bioware damage", "1D6 − 3 implants; each 1D6 (−1 cultured) for its damage (Shadowtech p.6)")
    + " " + btn("again", "Roll again", "Only if a roll was started and never finished");
  else {
    const r = st.results;
    const lines = r.hits.map((h, n) => h.index == null ? `<li>Pick ${n + 1}: no implant hit.</li>`
      : `<li>${esc(st.snapshot[h.index].name)}: 1D6 ${h.roll} → ${h.level ? LEVEL[h.level] : "no damage"}${h.applied ? "" : h.stale ? " — <em>changed since the card: the GM edits it by hand</em>" : " — <em>not applied yet</em>"}</li>`);
    body = `1D6 ${r.count} − 3 = ${Math.max(0, r.count - 3)} potential hit${r.count - 3 === 1 ? "" : "s"}.<ul>${lines.join("")}</ul>`
      + (r.hits.some(h => h.index != null && !h.applied && !h.stale) ? btn("apply", "Apply remaining") : "");
  }
  return `<div class="sr2e-damage-result sr2e-bio-card"><strong>${esc(st.actorName)}: a Deadly hit — bioware damage</strong>
    <em>(Shadowtech p.6; dermal bioware can't be damaged)</em><br>${body}</div>`;
}

/** The card's buttons (GM). */
export async function cardOp(message, op) {
  if (!game.user.isGM) return ui.notifications.warn("Bioware damage is the GM's.");
  const actor = await fromUuid(message.flags.sr2e.biodmg.actorUuid);
  if (!actor) return ui.notifications.warn("That character is gone.");
  const live = () => foundry.utils.deepClone(game.messages.get(message.id).flags.sr2e.biodmg);
  const save = (st) => game.messages.get(message.id).update({ content: renderCard(st), "flags.sr2e.biodmg": st });

  if (op === "again") {
    const st = live();
    const m = markersOf(actor).find(x => x.key === `biodmg-roll:${st.receipt}:${st.rollAttempt}`);
    if (st.results || !m || game.time.serverTime - (Number(m.at) || 0) < STUCK_MS) {
      return ui.notifications.info("Nothing is stuck: use Roll (or wait — a roll started under 2 minutes ago).");
    }
    st.rollAttempt += 1;                     // supersedes the stuck attempt
    await save(st);
    op = "roll";
  }
  if (op === "roll") {
    const st = live();
    if (st.results) return applyHits(actor, message);
    const attempt = st.rollAttempt;
    if (!await once(actor, `biodmg-roll:${st.receipt}:${attempt}`)) return ui.notifications.warn("That card is being rolled.");
    const count = await d6();
    const n = Math.max(0, count - 3);
    const picks = [];
    for (let k = 0; k < n; k++) picks.push(Math.ceil(Math.random() * st.snapshot.length) || 1);
    const idx = pickTargets(picks, st.snapshot.length);
    const hits = [];
    for (const index of idx) {
      if (index == null) { hits.push({ index: null }); continue; }
      const roll = await d6();
      hits.push({ index, roll, level: bioDamageLevel(roll, st.snapshot[index].grade ?? (st.snapshot[index].cultured ? "cultured" : "standard")), applied: false });
    }
    const now = live();
    if (now.results || now.rollAttempt !== attempt) return;            // superseded: publish nothing
    now.results = { count, hits };
    await save(now);
  }
  return applyHits(actor, message);
}

/** Apply every unapplied hit from the stored results — live values, one receipted update each. */
async function applyHits(actor, message) {
  const st = foundry.utils.deepClone(game.messages.get(message.id).flags.sr2e.biodmg);
  if (!st.results) return;
  for (const [n, h] of st.results.hits.entries()) {
    if (h.index == null || h.applied || h.stale) continue;
    const snap = st.snapshot[h.index];
    const rkey = `${message.id}:${n}`;
    const res = await queue(actor, async () => {
      const item = actor.items.get(snap.itemId);
      if (item?.flags?.sr2e?.bioHits?.[rkey] != null) return "applied";          // the receipt landed already
      if (!item || !item.system.installed || item.system.destroyed || (item.system.implantGen ?? 0) !== snap.implantGen) return "stale";
      const upd = { [`flags.sr2e.bioHits.${rkey}`]: h.level ?? "none" };
      if (h.level) {
        const d = addBioDamage(item.system.damage, h.level, item.system.destroyed);
        Object.assign(upd, { "system.damage": d.damage, "system.destroyed": d.destroyed, "system.damageRev": (item.system.damageRev ?? 0) + 1 });
      }
      await item.update(upd, { sr2eBio: true });
      return "applied";
    });
    h.applied = res === "applied"; h.stale = res === "stale";
  }
  await game.messages.get(message.id).update({ content: renderCard(st), "flags.sr2e.biodmg": st });
}

// ── Healing (individually, half the time) ──────────────────────────────────

const courseOf = (item) => item.flags?.sr2e?.bioHeal ?? null;
const courseValid = (item, c = courseOf(item)) => !!c && c.owner === item.uuid && c.rev === (item.system.damageRev ?? 0)
  && c.implantGen === (item.system.implantGen ?? 0);

/** Clear an invalid course (wrong owner, wound or implant changed). */
async function clearInvalid(item) {
  const c = courseOf(item);
  if (c && !courseValid(item, c)) await item.update({ "flags.sr2e.-=bioHeal": null }, { sr2eBio: true });
}

/**
 * Heal one level of a damaged bioware implant: the natural-healing procedure for its level, with the
 * character's natural Body, at half the time (Shadowtech p.6, core p.113).
 * @param {{doctor?:boolean, condition?:string, intensiveCare?:boolean, magicalCare?:boolean}} opts
 */
export async function healBioware(actor, item, opts = {}) {
  const sys = item?.system;
  if (!sys || item.type !== "bioware") return;
  if (sys.destroyed) return ui.notifications.warn(`${item.name} is destroyed — it can't be healed, only removed and replaced (Shadowtech p.6).`);
  // ONE snapshot: the level is healed from, and the revisions that prove it hasn't changed.
  const level = bioLevel(sys.damage ?? 0), rev = sys.damageRev ?? 0, igen = sys.implantGen ?? 0;
  if (!level) return ui.notifications.info(`${item.name} isn't damaged.`);
  const doctor = !!opts.doctor;
  if (level === "D" && !doctor) return ui.notifications.warn(`${item.name} has Deadly damage — healing needs a doctor (core p.113).`);
  const { healingClockOn } = await import("./healing-clock.mjs");
  await clearInvalid(item);
  if (courseValid(item)) return ui.notifications.warn(`${item.name} is already healing.`);
  const gen = item.flags?.sr2e?.bioHealGen ?? 0;
  if (!await once(actor, `bioheal:${item.uuid}:${gen}`)) return ui.notifications.warn(`${item.name}'s healing is being started on another device.`);
  const it0 = actor.items.get(item.id);
  if (!it0 || (it0.system.damageRev ?? 0) !== rev || (it0.system.implantGen ?? 0) !== igen || it0.system.destroyed) {
    await queue(actor, async () => { const it = actor.items.get(item.id); if (it && (it.flags?.sr2e?.bioHealGen ?? 0) === gen) await it.update({ "flags.sr2e.bioHealGen": gen + 1 }, { sr2eBio: true }); });
    return ui.notifications.warn(`${item.name} changed — heal again.`);
  }
  const nat = actor._naturalAttrs?.() ?? { body: actor.system.body?.value ?? 1, willpower: actor.system.willpower?.value ?? 1 };
  const LN = LEVEL[level];
  let ok = true, successes = 0;
  if (!doctor) {
    const tn = CONFIG.SR2E.naturalHealTN[LN] ?? 4;
    const w = await actor.rollSuccessTest(nat.body, tn, { label: `${item.name}: heal without medical attention? (Body vs ${tn}, p.113)`, isResistance: true, ...(actor._bodyTestOpts?.() ?? {}) });
    ok = (w?.successes ?? 0) > 0;
  }
  if (ok) {
    const mod = doctor ? doctoringMod({ ...opts, magician: actor._medicalMagician?.() ?? false, naturalBody: nat.body, naturalWillpower: nat.willpower }) : { total: 0, parts: [] };
    const tn = Math.max(2, HEALING_TABLE[level].tn + mod.total);
    const r = await actor.rollSuccessTest(nat.body, tn, { label: `${item.name}: healing time (Body vs ${tn}${mod.parts.length ? ` — ${mod.parts.join(", ")}` : ""})`, isResistance: true, ...(actor._bodyTestOpts?.() ?? {}) });
    successes = r?.successes ?? 0;
  }
  const hours = bioHealHours(level, successes);
  const clock = healingClockOn();
  const outcome = await queue(actor, async () => {
    const it = actor.items.get(item.id);
    if (!it || (it.flags?.sr2e?.bioHealGen ?? 0) !== gen) return "superseded";            // writes nothing
    const upd = { "flags.sr2e.bioHealGen": gen + 1 };
    const fresh = (it.system.damageRev ?? 0) === rev && (it.system.implantGen ?? 0) === igen && !it.system.destroyed && !courseValid(it);
    if (!fresh || !ok) { await it.update(upd, { sr2eBio: true }); return fresh ? "failed" : "stale"; }
    if (clock) {
      const now = game.time.worldTime;
      upd["flags.sr2e.bioHeal"] = { owner: it.uuid, id: foundry.utils.randomID(), level, rev, implantGen: igen, dueAt: now + hours * 3600 };
    } else {
      Object.assign(upd, { "system.damage": bioHealFloor(level), "system.damageRev": rev + 1 });
    }
    await it.update(upd, { sr2eBio: true });
    return clock ? "course" : "healed";
  });
  const speaker = ChatMessage.getSpeaker({ actor });
  const say = (html) => ChatMessage.create({ speaker, content: `<div class="sr2e-damage-result">${html}</div>` });
  if (outcome === "superseded") return;
  if (outcome === "stale") return say(`<strong>${esc(item.name)}</strong>: it changed while you rolled — heal again.`);
  if (outcome === "failed") return say(`<strong>${esc(item.name)}</strong>: no healing without medical attention (core p.113).`);
  return say(`<strong>${esc(item.name)}</strong>: ${LN} → ${bioLevel(bioHealFloor(level)) ? LEVEL[bioLevel(bioHealFloor(level))] : "healed"}
    ${outcome === "course" ? `in ${healingTimeText(hours)}` : `— it takes ${healingTimeText(hours)}`} (half the usual time, Shadowtech p.6).`);
}

/** The healing clock's reconcile completes due item courses (absolute writes, same queue). */
export async function reconcileBioware(actor, now = game.time.worldTime) {
  for (const item of actor.items) {
    const c = item.type === "bioware" ? courseOf(item) : null;
    if (!c) continue;
    await queue(actor, async () => {
      const it = actor.items.get(item.id);
      const cc = it && courseOf(it);
      if (!cc) return;
      if (!courseValid(it, cc)) return it.update({ "flags.sr2e.-=bioHeal": null }, { sr2eBio: true });
      if (cc.dueAt > now) return;
      await it.update({ "system.damage": bioHealFloor(cc.level), "system.damageRev": (it.system.damageRev ?? 0) + 1,
        "flags.sr2e.-=bioHeal": null }, { sr2eBio: true });
      if (await once(actor, `bioheal-card:${cc.id}`)) {
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="sr2e-damage-result">
          <strong>${esc(it.name)}</strong> healed a level (${LEVEL[cc.level]} → ${bioLevel(bioHealFloor(cc.level)) ? LEVEL[bioLevel(bioHealFloor(cc.level))] : "healed"}, Shadowtech p.6).</div>` });
      }
    });
  }
}

/** GM: clear a stuck heal start (a device that claimed and never finished). */
export async function clearStuckBioHeal(actor, item) {
  if (!game.user.isGM) return;
  await queue(actor, () => item.update({ "flags.sr2e.bioHealGen": (item.flags?.sr2e?.bioHealGen ?? 0) + 1 }, { sr2eBio: true }));
}

/** The row's view (sheet). */
export function bioView(actor, item) {
  const sys = item.system, c = courseOf(item);
  const gen = item.flags?.sr2e?.bioHealGen ?? 0;
  const m = markersOf(actor).find(x => x.key === `bioheal:${item.uuid}:${gen}`);
  return { damage: sys.damage ?? 0, level: bioLevel(sys.damage ?? 0) ? LEVEL[bioLevel(sys.damage ?? 0)] : null,
    off: !bioFunctions(sys), destroyed: !!sys.destroyed, healing: c && courseValid(item, c) ? c : null,
    stuck: !!m && game.time.serverTime - (Number(m.at) || 0) > STUCK_MS };
}

export function registerBiowareDamage() {
  game.settings.register("sr2e", "biowareDamage", {
    name: "Bioware damage (Shadowtech p.6)",
    hint: "A single Deadly physical hit can damage a character's bioware: Serious or worse switches it off until healed; past Deadly it is destroyed. Damaged bioware heals on its own, in half the time.",
    scope: "world", config: true, type: Boolean, default: false
  });
  Hooks.on("sr2e.damageCommitted", (actor, out, opts) => { onDamage(actor, out, opts).catch(err => console.error("SR2E | bioware damage card", err)); });
  // Lifecycle: installing/removing, or the GM editing the damage by hand, changes the implant's
  // generation (and its damage revision) so stale hits and courses never land on it.
  Hooks.on("preUpdateItem", (item, changes, options) => {
    if (item.type !== "bioware" || options?.sr2eBio) return;
    const s = changes.system ?? {};
    const life = "installed" in s && s.installed !== item.system.installed;
    const hand = ("damage" in s && s.damage !== item.system.damage) || ("destroyed" in s && s.destroyed !== item.system.destroyed);
    if (life || hand) foundry.utils.setProperty(changes, "system.implantGen", (item.system.implantGen ?? 0) + 1);
    if (hand) foundry.utils.setProperty(changes, "system.damageRev", (item.system.damageRev ?? 0) + 1);
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    html.querySelectorAll?.(".sr2e-bio-btn").forEach(b => b.addEventListener("click", (ev) => {
      ev.preventDefault();
      return cardOp(message, b.dataset.op);
    }));
  });
}
