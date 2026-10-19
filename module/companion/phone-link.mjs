/**
 * "Open on phone" (docs/PLAN-companion-join.md, docs/PLAN-v14-phone-join.md). Foundry's
 * join page won't offer a user who is already online.
 * - v13: the QR opens the system's own join page (companion-join.html), which signs
 *   the phone in through Foundry's normal /join route.
 * - v14+ (players): the QR opens Foundry's own join page. "Let my phone in" takes this
 *   computer offline for a moment, so the name lights up there; the phone signs in with
 *   the password, and this computer then RELOADS (never resumes the socket: a manual
 *   reconnect doesn't re-fetch world data).
 * - v14+ GMs: a separate phone user (two GM clients would both run GM automation).
 * No secret ever goes into the link.
 */

import qrcode from "../vendor/qrcode.mjs";
import { JOIN_PAGE, joinLink, normalizeAddress, phoneJoinMode, windowState } from "../rules/companion-rules.mjs";
import { drainTargets } from "../targeting.mjs";
import { isCompanion } from "./boot.mjs";

let windowOpen = false;

/**
 * Take this client offline so the phone can join as the same user; ends ONLY by
 * `reload()` (on `end()`, or the absolute deadline). Injectable for tests.
 * @returns {Promise<{ok:true, deadline:number, end:Function}|{ok:false, reason:string}>}
 */
export async function startPhoneWindow({ seconds = 90, socket = game.socket, reload = () => location.reload(),
  onTick = () => {}, drainTimeoutMs = 3000 } = {}) {
  if (windowOpen) return { ok: false, reason: "open" };
  if (!socket?.connected) return { ok: false, reason: "offline" };
  windowOpen = true;
  // Quiesce: every target write lands first, and sharing stops in the same step, or nothing happens.
  if (!(await drainTargets({ timeoutMs: drainTimeoutMs, suspend: true }))) { windowOpen = false; return { ok: false, reason: "busy" }; }
  socket.disconnect();
  const deadline = Date.now() + seconds * 1000;
  let ended = false, timer = null;
  const check = () => { const st = windowState(Date.now(), deadline); onTick(st); if (st.done) end(); };
  const end = () => {
    if (ended) return;
    ended = true; windowOpen = false;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", check);
    globalThis.removeEventListener?.("focus", check);
    reload();
  };
  timer = setInterval(check, 1000);
  document.addEventListener("visibilitychange", check);   // a laptop waking past the deadline
  globalThis.addEventListener?.("focus", check);
  onTick(windowState(Date.now(), deadline));
  return { ok: true, deadline, end };
}

/** The modal offline window: a countdown, then a reload whatever happens. */
async function letPhoneIn() {
  let root = null;
  const ctl = await startPhoneWindow({ onTick: (st) => {
    const el = root?.querySelector(".sr2e-phone-countdown");
    if (el) el.textContent = `${st.secondsLeft} s`;
  } });
  if (!ctl.ok) {
    return ui.notifications.warn(ctl.reason === "busy" ? "Still saving your targets: try again in a moment."
      : ctl.reason === "offline" ? "This computer isn't connected." : "Already letting your phone in.");
  }
  await foundry.applications.api.DialogV2.wait({
    window: { title: "Letting your phone in", icon: "fa-solid fa-mobile-screen" },
    modal: true, rejectClose: false,
    content: `<div class="sr2e-phone-link">
      <p><strong>This computer is offline for <span class="sr2e-phone-countdown"></span>.</strong></p>
      <p>On your phone, pick your name, enter your password and Join. Then click <strong>I'm in</strong>:
        this page reloads.</p>
      <p class="hint">Anything done on this computer while it's offline is discarded. If time runs out, the page
        reloads anyway; open "Open on phone" again and repeat.</p></div>`,
    buttons: [
      { action: "in", label: "I'm in", default: true },
      { action: "cancel", label: "SR2E.Dialog.Cancel" }
    ],
    render: (event, dialog) => { root = dialog.element; }
  });
  ctl.end();
}

/** The QR code for `text`, as an SVG element. */
function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const tpl = document.createElement("template");
  tpl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });   // generated markup only
  return tpl.content.firstElementChild;
}

/** Open the dialog for the current user. */
export async function openPhoneLink() {
  const esc = foundry.utils.escapeHTML;
  const mode = phoneJoinMode(game.release.generation, game.user.isGM);
  const phoneUser = mode === "phoneUser", sameUser = mode === "sameUser";
  const content = `
    <div class="sr2e-phone-link">
      <div class="form-group">
        <label for="sr2e-phone-address">Address your phone uses</label>
        <input type="url" id="sr2e-phone-address" name="address" value="${esc(location.origin)}">
      </div>
      <p class="sr2e-phone-note" aria-live="polite"></p>
      <div class="sr2e-phone-qr"></div>
      <div class="form-group">
        <input type="text" class="sr2e-phone-url" readonly aria-label="Link">
        <button type="button" class="sr2e-phone-copy"><i class="fa-solid fa-copy" inert></i> Copy</button>
      </div>
      ${sameUser ? `<ol class="sr2e-phone-steps">
        <li>Scan this with your phone and leave the join page open.</li>
        <li>Click <strong>Let my phone in</strong>: this computer goes offline for a moment and your name lights up on the phone.</li>
        <li>On the phone, pick your name, enter your password and Join.</li>
        <li>Click <strong>I'm in</strong>: this computer reloads.</li></ol>
      <p class="hint">If your phone is already signed in to this game as someone else, it opens that account: sign out
        there and scan again. If your name stays grey, Foundry is still open for you somewhere else (another tab or device):
        close it and try again. This page reloads when you're done, so finish anything unsaved first.</p>`
      : `<p class="hint">${phoneUser
        ? `As GM, use a separate user on your phone (for example "${esc(game.user.name)} (phone)", with Owner on what you
          run there): two devices signed in as one GM would both run the GM's automation. Scan this and join as that user.`
        : "Scan with your phone's camera. You'll be asked for your Foundry password, if you have one."}</p>`}
    </div>`;
  const update = (root) => {
    const res = normalizeAddress(root.querySelector('[name="address"]').value);
    const note = root.querySelector(".sr2e-phone-note"), box = root.querySelector(".sr2e-phone-qr");
    const out = root.querySelector(".sr2e-phone-url");
    note.textContent = res.error ?? res.warning ?? "";
    note.classList.toggle("warning", !!(res.error || res.warning));
    box.replaceChildren();
    out.value = "";
    if (res.error) return;
    const link = sameUser ? `${res.origin}${foundry.utils.getRoute("game")}?companion=1`
      : phoneUser ? res.origin + foundry.utils.getRoute("join")
      : joinLink({ origin: res.origin, route: foundry.utils.getRoute(JOIN_PAGE), userId: game.user.id, name: game.user.name });
    out.value = link;
    box.append(qrSvg(link));
  };
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: "Open on phone", icon: "fa-solid fa-mobile-screen" },
    position: { width: 420 },
    content,
    buttons: sameUser
      ? [{ action: "letIn", label: "Let my phone in", default: true }, { action: "done", label: "Close" }]
      : [{ action: "done", label: "Done", default: true }],
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog.element;
      root.querySelector('[name="address"]').addEventListener("input", () => update(root));
      root.querySelector(".sr2e-phone-copy").addEventListener("click", () => {
        const v = root.querySelector(".sr2e-phone-url").value;
        if (v) game.clipboard.copyPlainText(v).then(() => ui.notifications.info("Link copied."));
      });
      update(root);
    }
  });
  if (action === "letIn") return letPhoneIn();
}

/** Add the button to the Settings sidebar on every computer (not on the phone itself). */
export function registerPhoneLink() {
  if (isCompanion) return;
  Hooks.on("renderSettings", (app, html) => {
    const root = html instanceof HTMLElement ? html : html[0];
    const section = root?.querySelector("section.settings");
    if (!section || section.querySelector(".sr2e-open-on-phone")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sr2e-open-on-phone";
    btn.innerHTML = `<i class="fa-solid fa-mobile-screen" inert></i> Open on phone`;
    btn.addEventListener("click", () => openPhoneLink());
    section.append(btn);
  });
}
