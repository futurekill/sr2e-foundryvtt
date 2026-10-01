/**
 * Fat bacteria zones (docs/PLAN-astral-barriers.md, Stage 3; Corporate Security
 * Handbook p.103). A `fatBacteria` Region Behaviour marks a FAB-filled space:
 *   - astral movement inside is held to normal speed (module/movement.mjs);
 *   - astral perception made from inside is at +4 (rollAssense);
 *   - FAB-UV with the UV lights on can be searched: one Perception test, TN 6
 *     +1/50 m² −1/two searchers; a spotted intruder becomes visible to everyone
 *     while it stays in the lit zone, and attacks on it are at +4 − extra.
 * Spellcasting and astral combat are unaffected (the book).
 *
 * Reveal records live on the intruder token (flags.sr2e.fabReveal.<behaviourId>
 * = {extra, epoch, gen}). They only count while fabRevealValid holds: the
 * behaviour's uvEpoch rises on every UV-on / re-enable (in the same update), and
 * the token's exit generation rises every time it leaves — so neither UV cycling
 * nor leaving and coming back can revive an old reveal. The GM writes them,
 * serialized per token+behaviour.
 */

import { isOnAstralPlane, fabSearchTN, fabSearchResult, fabRevealValid } from "./rules/astral-rules.mjs";

export class FatBacteriaBehaviorData extends foundry.data.regionBehaviors.RegionBehaviorType {
  static defineSchema() {
    const f = foundry.data.fields;
    return {
      strain: new f.StringField({ initial: "fab1", choices: { fab1: "FAB-1", fabuv: "FAB-UV (glows under UV)" },
        label: "Strain", hint: "FAB-1 restricts astral movement; FAB-UV also shows astral intruders under UV light (CSH p.103)." }),
      uvLit: new f.BooleanField({ initial: false, label: "UV lights on", hint: "FAB-UV only: lets the GM search the zone for astral intruders." }),
      uvEpoch: new f.NumberField({ initial: 0, integer: true, min: 0, nullable: false })
    };
  }

  /** Leaving the zone (moving out, or the region reshaped around the token) ends a reveal. */
  static events = {
    [CONST.REGION_EVENTS.TOKEN_EXIT]: async function (event) {
      if (!game.user.isActiveGM) return;
      const token = event.data?.token, bid = this.parent?.id;
      if (!token || !bid) return;
      await serial(`fab:${token.uuid}:${bid}`, async () => {
        const gen = token.getFlag("sr2e", `fabExitGen.${bid}`) ?? 0;
        await token.update({ [`flags.sr2e.fabExitGen.${bid}`]: gen + 1, [`flags.sr2e.fabReveal.-=${bid}`]: null });
      });
    }
  };

  /** UV switched on, or the behaviour re-enabled: a new epoch in the SAME update. */
  async _preUpdate(changes, options, user) {
    const uvOn = changes.system?.uvLit === true && !this.uvLit;
    const reEnabled = changes.disabled === false && this.parent?.disabled;
    if (uvOn || reEnabled) foundry.utils.setProperty(changes, "system.uvEpoch", (this.uvEpoch ?? 0) + 1);
    return super._preUpdate?.(changes, options, user);
  }
}

export function registerFabBehavior() {
  CONFIG.RegionBehavior.dataModels.fatBacteria = FatBacteriaBehaviorData;
  CONFIG.RegionBehavior.typeIcons.fatBacteria = "fa-solid fa-bacteria";
}

// One promise chain per key: exit invalidation and search commits for the same
// token+behaviour run in order (Foundry doesn't await region event handlers).
const chains = new Map();
function serial(key, fn) {
  const next = (chains.get(key) ?? Promise.resolve()).then(fn).catch(e => console.error("SR2E | FAB", e));
  chains.set(key, next);
  return next;
}

/** The enabled fat-bacteria behaviours of a region. */
function fabBehaviors(region) {
  return region?.behaviors?.filter(b => b.type === "fatBacteria" && !b.disabled) ?? [];
}

/** Is this token inside an enabled FAB zone right now? */
export function tokenInFab(tokenDoc) {
  for (const r of tokenDoc?.regions ?? []) if (fabBehaviors(r).length) return true;
  return false;
}

/** The scene's regions that hold an enabled FAB zone. */
export function fabRegions(scene) {
  return scene?.regions?.filter(r => fabBehaviors(r).length) ?? [];
}

/** A region's area in m²: its polygon tree, holes subtracted (not its bounding box). */
export function regionAreaM2(region) {
  const grid = region.parent?.grid;
  const pxPerUnit = (grid?.size ?? 100) / (grid?.distance ?? 1);
  let px2 = 0;
  for (const node of region.polygonTree ?? []) {
    const pts = node.polygon?.points ?? [];
    let a = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
    }
    px2 += (node.isHole ? -1 : 1) * Math.abs(a) / 2;
  }
  return Math.max(0, px2) / (pxPerUnit * pxPerUnit);
}

/** Is this astral token revealed by a still-valid FAB-UV search? (Evaluated live.) */
export function fabRevealed(tokenDoc) {
  const records = tokenDoc?.flags?.sr2e?.fabReveal;
  if (!records) return false;
  for (const [bid, record] of Object.entries(records)) {
    for (const region of tokenDoc.regions ?? []) {
      const b = region.behaviors?.get(bid);
      if (!b || b.type !== "fatBacteria") continue;
      if (fabRevealValid({ record, inside: true, exitGen: tokenDoc.flags.sr2e.fabExitGen?.[bid] ?? 0,
        behavior: { disabled: b.disabled, strain: b.system.strain, uvLit: b.system.uvLit, uvEpoch: b.system.uvEpoch } })) return true;
    }
  }
  return false;
}

/* ── The FAB-UV search (GM) ──────────────────────────────────────────────── */

async function promptSearch(behavior, searchers, intruders) {
  const roll = searchers.map((t, i) => `<option value="${i}">${foundry.utils.escapeHTML(t.name)}</option>`).join("");
  const rows = intruders.map((t, i) => `<label class="checkbox"><input type="checkbox" name="aware${i}"> ${foundry.utils.escapeHTML(t.name)} is aware of the search</label>`).join("<br>");
  return foundry.applications.api.DialogV2.prompt({
    window: { title: "Search for astral intruders (FAB-UV)" },
    content: `<p>${searchers.length} searcher(s); one rolls Perception, the others lower the TN (CSH p.103).</p>
      <div class="form-group"><label>Rolls</label><select name="roller">${roll}</select></div>
      <p>${rows || "<em>No astral intruders are in the zone.</em>"}</p>`,
    ok: { label: "Search", callback: (ev, btn) => {
      const f = btn.form.elements;
      return { roller: Number(f.roller.value), aware: intruders.map((_, i) => !!f[`aware${i}`]?.checked) };
    } },
    rejectClose: false
  });
}

/** Run a FAB-UV search of one behaviour's region: GM only. */
export async function fabSearch(behavior) {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can run a FAB-UV search.");
  if (behavior?.type !== "fatBacteria" || behavior.disabled || behavior.system.strain !== "fabuv" || !behavior.system.uvLit)
    return ui.notifications.warn("Searching needs an enabled FAB-UV zone with the UV lights on.");
  const region = behavior.region, scene = region.parent;
  const searchers = canvas.tokens.controlled.map(t => t.document).filter(t => t.parent === scene && !isOnAstralPlane(t.flags?.sr2e) && t.actor);
  if (!searchers.length) return ui.notifications.warn("Select the searching tokens first.");
  const intruders = scene.tokens.filter(t => isOnAstralPlane(t.flags?.sr2e) && t.regions?.has(region));
  const choice = await promptSearch(behavior, searchers, intruders);
  if (!choice) return;

  // What the roll assumes, captured before any await (the stale-search guard).
  const epoch = behavior.system.uvEpoch ?? 0;
  const gens = new Map(intruders.map(t => [t.id, t.getFlag("sr2e", `fabExitGen.${behavior.id}`) ?? 0]));
  const roller = searchers[choice.roller] ?? searchers[0];
  const tn = fabSearchTN(regionAreaM2(region), searchers.length);
  const perception = await roller.actor.rollAttributeTest("intelligence", tn, { whisperGM: true });
  const hits = perception?.successes ?? 0;
  const searcherInt = roller.actor.system.intelligence?.value ?? 0;

  const lines = [];
  for (const [i, intruder] of intruders.entries()) {
    let stealth = 0;
    if (choice.aware[i] && intruder.actor) {
      const r = await intruder.actor.rollNamedSkill("Stealth", Math.max(2, searcherInt), { whisperGM: true });
      stealth = r?.successes ?? 0;
    }
    const res = fabSearchResult(hits, stealth);
    let note = res.spotted ? `spotted — attacks against it at +${res.penalty}` : "not found";
    if (res.spotted) {
      const written = await serial(`fab:${intruder.uuid}:${behavior.id}`, async () => {
        const b = scene.regions.get(region.id)?.behaviors.get(behavior.id);
        const tok = scene.tokens.get(intruder.id);
        const gen = tok?.getFlag("sr2e", `fabExitGen.${behavior.id}`) ?? 0;
        if (!b || b.disabled || !b.system.uvLit || (b.system.uvEpoch ?? 0) !== epoch || !tok
          || gen !== gens.get(intruder.id) || !tok.regions?.has(scene.regions.get(region.id))) return false;
        await tok.update({ [`flags.sr2e.fabReveal.${behavior.id}`]: { extra: res.net - 1, epoch, gen } });
        return true;
      });
      if (!written) note = "void — the zone or the intruder changed while searching";
    }
    lines.push(`<li><strong>${foundry.utils.escapeHTML(intruder.name)}</strong>${choice.aware[i] ? ` (Stealth ${stealth})` : ""}: ${note}</li>`);
  }
  await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<h3>FAB-UV search</h3><p>${foundry.utils.escapeHTML(roller.name)} — Perception TN ${tn}, ${hits} success(es) (CSH p.103).</p><ul>${lines.join("") || "<li>No astral intruders in the zone.</li>"}</ul>` });
}

/* ── Assensing (SR2 p.146), so the FAB +4 has a real test to land on ───────── */

/**
 * Astral examination: Sorcery (spells, foci) or Conjuring (spirits) against the
 * creator's skill / Force / Magic — or 5 when nothing easily fits (p.146).
 * +4 when the observing token is in a FAB zone (CSH p.103).
 */
export async function rollAssense(tokenDoc) {
  const actor = tokenDoc?.actor;
  if (!actor) return;
  const inFab = tokenInFab(tokenDoc);
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: { title: `Assense — ${actor.name}` },
    content: `<div class="form-group"><label>Skill</label><select name="skill"><option>Sorcery</option><option>Conjuring</option></select></div>
      <div class="form-group"><label>Target number</label><input type="number" name="tn" value="5" min="2"></div>
      <p class="hint">Sorcery for spells and foci, Conjuring for spirits; TN is the creator's skill, the Force, the Magic, or 5 (SR2E p.146).${inFab ? " <strong>+4: in a fat-bacteria zone (CSH p.103).</strong>" : ""}</p>`,
    ok: { label: "Assense", callback: (ev, btn) => ({ skill: btn.form.elements.skill.value, tn: Number(btn.form.elements.tn.value) || 5 }) },
    rejectClose: false
  });
  if (!choice) return;
  return actor.rollNamedSkill(choice.skill, choice.tn, inFab ? { extraTN: 4, extraTNLabel: "fat bacteria (CSH p.103)" } : {});
}

/* ── Hooks ─────────────────────────────────────────────────────────────────── */

function refreshVisibility() {
  if (!canvas?.ready) return;
  for (const t of canvas.tokens.placeables) t.renderFlags?.set({ refreshVisibility: true });
}

export function registerFabHooks() {
  // Anything that can change a reveal's validity re-evaluates visibility.
  for (const hook of ["updateRegion", "updateRegionBehavior", "deleteRegionBehavior", "deleteRegion"]) Hooks.on(hook, refreshVisibility);
  Hooks.on("updateToken", (doc, changes) => {
    const f = changes.flags?.sr2e;
    if (f?.fabReveal !== undefined || f?.fabExitGen !== undefined || Object.keys(f ?? {}).some(k => k.startsWith("-=fab"))
      || "x" in changes || "y" in changes) refreshVisibility();
  });

  // UV off or the behaviour disabled: drop its reveal records (the epoch already voids them).
  Hooks.on("updateRegionBehavior", async (b, changes) => {
    if (b.type !== "fatBacteria" || !game.user.isActiveGM) return;
    if (!(changes.system?.uvLit === false || changes.disabled === true)) return;
    for (const t of b.scene?.tokens ?? []) {
      if (t.flags?.sr2e?.fabReveal?.[b.id] === undefined) continue;
      await serial(`fab:${t.uuid}:${b.id}`, () => t.update({ [`flags.sr2e.fabReveal.-=${b.id}`]: null }));
    }
  });

  // The GM's search button, in the behaviour's own config sheet.
  Hooks.on("renderRegionBehaviorConfig", (app, html) => {
    const b = app.document;
    if (b?.type !== "fatBacteria") return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    // The UV epoch is bookkeeping, not a setting.
    root?.querySelector('[name="system.uvEpoch"]')?.closest(".form-group")?.remove();
    if (!game.user.isGM || !root || root.querySelector("[data-sr2e-fab-search]")) return;
    const btn = document.createElement("button");
    btn.type = "button"; btn.dataset.sr2eFabSearch = "1";
    btn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Search for astral intruders (selected tokens search)`;
    btn.disabled = !(b.system.strain === "fabuv" && b.system.uvLit && !b.disabled);
    btn.addEventListener("click", () => fabSearch(b));
    (root.querySelector("form") ?? root).append(btn);
  });

  // Assense: a HUD button for an astrally active token.
  Hooks.on("renderTokenHUD", (hud, html) => {
    const doc = hud.object?.document, actor = doc?.actor;
    if (!actor?.isOwner) return;
    const active = isOnAstralPlane(doc.flags?.sr2e) || ["perceiving", "projecting"].includes(actor.system?.astralState);
    if (!active) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const col = root?.querySelector(".col.right");
    if (!col) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "control-icon"; b.dataset.action = "sr2eAssense";
    b.title = "Assense (SR2E p.146)";
    b.innerHTML = `<i class="fa-solid fa-eye"></i>`;
    b.addEventListener("click", () => rollAssense(doc));
    col.appendChild(b);

    // Fast astral movement (p.146): projection forms only — the book gives no fast rate for spirits.
    if (!doc.flags?.sr2e?.astralForm) return;
    const on = !!doc.getFlag("sr2e", "astralFast");
    const f = document.createElement("button");
    f.type = "button"; f.className = "control-icon" + (on ? " active" : ""); f.dataset.action = "sr2eAstralFast";
    f.title = "Fast astral movement: Magic km per action. Can't assense or see detail, and fights only other fast movers; fat bacteria still hold it to normal speed (SR2E p.146, CSH p.103).";
    f.innerHTML = `<i class="fa-solid fa-forward-fast"></i>`;
    f.addEventListener("click", async () => {
      await doc.setFlag("sr2e", "astralFast", !on);
      if (!on) ui.notifications.info(`${doc.name} moves fast: can't assense or see detail, and can fight only other fast movers (SR2E p.146).`);
      hud.render();
    });
    col.appendChild(f);
  });
}
