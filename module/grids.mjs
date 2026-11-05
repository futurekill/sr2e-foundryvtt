/**
 * VR2.0 part 7a, grid topology: the GM's tools and the hooks (docs/PLAN-vr2-part7-grids.md, "7a in detail").
 * The decisions are pure (module/rules/vr2-grids.mjs); where a decker is and the tally ledger live with the
 * sessions in module/vr2.mjs. Grids are Host actors with a `kind`.
 */
import { RTG_TABLE, easyGridRatings, variableShift, reachable, wiringFits, LOGON_OPS, GRID_KINDS } from "./rules/vr2-grids.mjs";
import { topologyOn, variableLTGOn } from "./vr2-mode.mjs";
import { topoSnapshot, settleLogon, knownPlaces, settleMapping } from "./vr2.mjs";
import { systemTestVerdict } from "./rules/sr2e-rules.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sync = (uuid) => { try { return uuid ? fromUuidSync(uuid) : null; } catch (e) { return null; } };
const KIND_LABEL = { host: "Host", ltg: "LTG", rtg: "RTG", pltg: "PLTG" };
const OP_LABEL = { logonLTG: "Logon to LTG", logonRTG: "Logon to RTG", logonHost: "Logon to Host" };
const places = () => game.actors.filter(a => a.type === "host");

// ── Creating places ──────────────────────────────────────────────────────────

const ratingsData = (code, sv, subsystems) => ({ securityCode: code, systemRating: sv, securityValueOverride: sv, subsystems });

/** "New grid…" (Actors directory, GM): a printed RTG/LTG from p.26–27, an unlisted grid (Easy less 2), or a PLTG. */
export async function newGridDialog() {
  if (!game.user.isGM) return;
  const opts = RTG_TABLE.map((t, i) => `<option value="${i}">${esc(t.kind === "ltg" ? `${t.parent} › ${t.name} (LTG)` : t.group === "North America" || t.group === "Overseas" ? t.name : `${t.group}: ${t.name}`)}
    — ${esc(t.code)}-${t.sv}${t.pltgEntry ? " · PLTG entry" : ""}</option>`).join("");
  const codes = Object.keys(CONFIG.SR2E.securityCodes).map(k => `<option value="${k}" ${k === "green" ? "selected" : ""}>${esc(game.i18n.localize(CONFIG.SR2E.securityCodes[k].label))}</option>`).join("");
  const pick = await foundry.applications.api.DialogV2.wait({ window: { title: "New grid (VR2.0)" }, rejectClose: false,
    content: `<p>Grids are Host actors with a kind (VR2.0 p.26–28). A printed RTG or German LTG takes the table's ratings;
      an LTG under an RTG is created under it (the RTG too, if it doesn't exist yet).</p>
      <div class="form-group"><label>From the table:</label><select name="row">${opts}</select></div>
      <hr><div class="form-group"><label>Or an unlisted public grid (Easy less 2, p.26):</label><input type="text" name="name" placeholder="Grid name"></div>
      <div class="form-group"><label>Its kind:</label><select name="kind"><option value="rtg">RTG</option><option value="ltg">LTG</option><option value="pltg">PLTG (private grid)</option></select></div>
      <div class="form-group"><label>Security Code:</label><select name="code">${codes}</select></div>`,
    buttons: [{ action: "table", label: "Create from the table", default: true, callback: (e, b) => ({ row: Number(b.form.elements.row.value) }) },
      { action: "custom", label: "Create unlisted (roll ratings)", callback: (e, b) => ({ name: b.form.elements.name.value.trim(), kind: b.form.elements.kind.value, code: b.form.elements.code.value }) },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }] });
  if (!pick || pick === "cancel") return;
  if (pick.row != null) return createFromTable(RTG_TABLE[pick.row]);
  if (!pick.name) return ui.notifications.warn("Give the grid a name.");
  const roll = await new Roll("6d3").evaluate();
  const r = easyGridRatings(roll.dice[0].results.map(d => d.result));
  await roll.toMessage({ flavor: `${esc(pick.name)}: an unlisted grid's ratings (Easy less 2, VR2.0 p.26, p.31): Security Value ${r.sv},
    Access ${r.subsystems.access}, Control ${r.subsystems.control}, Index ${r.subsystems.index}, Files ${r.subsystems.files}, Slave ${r.subsystems.slave}.`,
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) });
  const a = await Actor.create({ name: pick.name, type: "host", system: { kind: pick.kind, ...ratingsData(pick.code, r.sv, r.subsystems) } });
  a?.sheet.render(true);
  return a;
}

async function createFromTable(row) {
  let grid = null;
  if (row.kind === "ltg") {
    grid = places().find(a => a.system.kind === "rtg" && a.name === row.parent)
      ?? await createFromTable(RTG_TABLE.find(t => t.kind === "rtg" && t.name === row.parent));
  }
  const a = await Actor.create({ name: row.name, type: "host", system: { kind: row.kind, grid: grid?.uuid ?? null, ...ratingsData(row.code, row.sv, row.subsystems),
    notes: row.pltgEntry ? "<p>An entry point to a PLTG (VR2.0 p.27).</p>" : "" } });
  if (row.kind === "ltg") a?.sheet.render(true);
  return a;
}

/** On an RTG's sheet: an LTG under it with the RTG's ratings (p.28: "usually equal"). */
export async function createLTG(rtg) {
  const s = rtg.system;
  const a = await Actor.create({ name: `${rtg.name} LTG`, type: "host", system: { kind: "ltg", grid: rtg.uuid,
    ...ratingsData(s.securityCode, s.securityValueOverride || s.systemRating, foundry.utils.deepClone(s.subsystems)) } });
  a?.sheet.render(true);
}

/** Optional Variable LTG Ratings (p.28): a visible 1D6 sets the shift. */
export async function rollVariableRatings(ltg) {
  if (!variableLTGOn()) return ui.notifications.warn("Turn on the VR2.0 variable LTG ratings setting first (p.28).");
  const roll = await new Roll("1d6").evaluate();
  const shift = variableShift(roll.total);
  await roll.toMessage({ flavor: `${esc(ltg.name)}: system load fluctuates (VR2.0 p.28): every System Rating ${shift > 0 ? "+1" : shift < 0 ? "−1" : "unchanged"}.` });
  await ltg.update({ "system.ratingShift": shift });
}

// ── The host sheet's Grid section ───────────────────────────────────────────

/** Sheet context: the place's links, and what a decker standing on it could log on to (the GM's check). */
export function gridSheetContext(host) {
  const topo = topoSnapshot(), me = host.uuid, s = host.system;
  const name = (u) => sync(u)?.name ?? "(deleted)";
  const others = places().filter(a => a.uuid !== me);
  const reach = [];
  for (const op of LOGON_OPS) for (const t of others) {
    if (reachable({ at: me, op, target: t.uuid, topo, jack: { kind: "illegal", wired: null }, gm: true }).ok)
      reach.push({ op: OP_LABEL[op], name: t.name, unlisted: !!t.system.unlisted });
  }
  const isHost = !GRID_KINDS.has(s.kind);
  return {
    kinds: KIND_LABEL,
    gridChoices: others.filter(a => (s.kind === "ltg" ? a.system.kind === "rtg" : isHost ? ["ltg", "pltg"].includes(a.system.kind) : false))
      .map(a => ({ uuid: a.uuid, name: a.name })),
    hasGrid: s.kind === "ltg" || isHost,
    isHost, isPltg: s.kind === "pltg", isRtg: s.kind === "rtg", isLtg: s.kind === "ltg",
    // A first-tier host with hosts behind it: where the connections are hidden (p.36).
    isHub: isHost && !!s.grid && others.some(a => !a.system.grid && !GRID_KINDS.has(a.system.kind) && ((s.links ?? []).includes(a.uuid) || (a.system.links ?? []).includes(me))),
    subsystems: CONFIG.SR2E.vr2Subsystems,
    links: (s.links ?? []).map(u => ({ uuid: u, name: name(u) })),
    linkChoices: others.filter(a => !GRID_KINDS.has(a.system.kind) && !(s.links ?? []).includes(a.uuid) && !(a.system.links ?? []).includes(me))
      .map(a => ({ uuid: a.uuid, name: a.name })),
    // Links stored on the far end count too (undirected).
    backLinks: others.filter(a => (a.system.links ?? []).includes(me) && !(s.links ?? []).includes(a.uuid)).map(a => a.name),
    entries: (s.entryPoints ?? []).map(u => ({ uuid: u, name: name(u) })),
    entryChoices: others.filter(a => a.system.kind === "ltg" && !(s.entryPoints ?? []).includes(a.uuid)).map(a => ({ uuid: a.uuid, name: a.name })),
    variable: variableLTGOn() && s.kind === "ltg",
    reach
  };
}

/** Sheet actions on a place: links and entry points (arrays, so not plain form fields). */
export async function gridEdit(host, op, arg) {
  const s = host.system;
  if (op === "addLink" && arg) return host.update({ "system.links": [...new Set([...(s.links ?? []), arg])] });
  if (op === "removeLink") {
    // A link stored on the far end is removed there.
    const far = sync(arg);
    if ((s.links ?? []).includes(arg)) await host.update({ "system.links": s.links.filter(u => u !== arg) });
    if (far?.system?.links?.includes(host.uuid)) await far.update({ "system.links": far.system.links.filter(u => u !== host.uuid) });
    return;
  }
  if (op === "addEntry" && arg) return host.update({ "system.entryPoints": [...new Set([...(s.entryPoints ?? []), arg])] });
  if (op === "removeEntry") return host.update({ "system.entryPoints": (s.entryPoints ?? []).filter(u => u !== arg) });
  if (op === "createLTG") return createLTG(host);
  if (op === "rollVariable") return rollVariableRatings(host);
}

// ── Addresses (p.114) ───────────────────────────────────────────────────────

/** Locate Access Node's success: the GM tells the decker an address (or on the sheet: "he got it from a fixer"). */
export async function revealAddress(actor) {
  if (!game.user.isGM || !actor) return ui.notifications.warn("The GM reveals addresses.");
  const known = knownPlaces(actor);
  const hidden = places().filter(a => a.system.unlisted && !known.has(a.uuid));
  if (!hidden.length) return ui.notifications.info(`${actor.name} already knows every unlisted address.`);
  const id = await foundry.applications.api.DialogV2.wait({ window: { title: `Reveal an address to ${actor.name}` }, rejectClose: false,
    content: `<p>Locate Access Node finds the LTG codes of the hosts the decker is after; once found, they're known for good (VR2.0 p.114).</p>
      <div class="form-group"><label>Address:</label><select name="place">${hidden.map(a => `<option value="${a.id}">${esc(a.name)} (${KIND_LABEL[a.system.kind] ?? "Host"})</option>`).join("")}</select></div>`,
    buttons: [{ action: "ok", label: "Reveal", default: true, callback: (e, b) => b.form.elements.place.value }, { action: "cancel", label: "SR2E.Dialog.Cancel" }] });
  if (!id || id === "cancel") return;
  await actor.update({ [`flags.sr2e.vr2Known.${id}`]: true });
  await ChatMessage.create({ whisper: [...ChatMessage.getWhisperRecipients("GM").map(u => u.id), ...game.users.filter(u => actor.testUserPermission(u, "OWNER")).map(u => u.id)],
    content: `<div class="sr2e-item-card">${esc(actor.name)} now knows the address of <strong>${esc(game.actors.get(id)?.name)}</strong> (VR2.0 p.114).</div>` });
}

// ── Jackpoint wiring (R1 #11) ──────────────────────────────────────────────

/** Every jackpoint whose wiring doesn't fit its kind, as a GM-only chat list (posted when topology is turned on). */
export async function reportJackpointWiring() {
  const topo = topoSnapshot();
  const bad = [];
  for (const scene of game.scenes) for (const region of scene.regions) for (const b of region.behaviors) {
    if (b.type !== "jackpoint" || wiringFits({ kind: b.system.kind, wired: b.system.host }, topo)) continue;
    bad.push(`<li>@UUID[${b.uuid}]{${esc(scene.name)} › ${esc(region.name)}}: ${esc(b.system.kind)} wired to ${esc(sync(b.system.host)?.name ?? "a missing actor")}</li>`);
  }
  if (!bad.length) return;
  await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id), content: `<div class="sr2e-item-card">
    <strong>Grid topology is on.</strong> These jackpoints' wiring doesn't fit their kind: a trid jackpoint (legal, illegal) is wired to an LTG,
    a workstation, remote device or console to a host (VR2.0 p.29). Until fixed, a trid jackpoint wired to a host reaches that host's LTG,
    or any LTG.<ul>${bad.join("")}</ul></div>` });
}

// ── Hooks ──────────────────────────────────────────────────────────────────

export function registerGridHooks() {
  // A Karma reroll that changes a logon card's verdict moves the decker (R1 #3); the client that changed it writes.
  Hooks.on("updateChatMessage", (msg, changes, options, userId) => {
    const st = msg.flags?.sr2e?.vr2SystemTest;
    if (!st || userId !== game.user.id || !foundry.utils.hasProperty(changes, "flags.sr2e.vr2SystemTest")) return;
    const actor = sync(st.actorUuid);
    if (!actor?.isOwner) return;
    if (st.logon) settleLogon(actor, { sessionId: st.sessionId, logonId: st.logon.id, card: msg.id, ok: systemTestVerdict(st.successes, st.hostSuccesses).success });
    // 7b: a Karma reroll can turn a hub's Analyze Subsystem into a success (p.36).
    settleMapping(actor, st);
  });
  Hooks.on("renderActorDirectory", (app, html) => {
    if (!game.user.isGM || !topologyOn()) return;
    const root = html instanceof HTMLElement ? html : html[0];
    const bar = root?.querySelector(".header-actions");
    if (!bar || bar.querySelector(".sr2e-new-grid")) return;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "sr2e-new-grid";
    btn.innerHTML = `<i class="fa-solid fa-network-wired"></i> New grid`;
    btn.addEventListener("click", () => newGridDialog());
    bar.append(btn);
  });
}
