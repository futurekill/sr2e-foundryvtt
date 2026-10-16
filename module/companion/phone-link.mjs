/**
 * "Open on phone" (docs/PLAN-companion-join.md): Foundry's join page won't offer a
 * user who is already online, so the computer shows a QR code of the system's own
 * join page (companion-join.html), which signs the phone in with the player's
 * password through Foundry's normal /join route. No secret goes into the link.
 * On v14 the page can't load (see phoneJoinMode), so the QR opens Foundry's own join
 * page and the dialog explains the separate phone user.
 */

import qrcode from "../vendor/qrcode.mjs";
import { JOIN_PAGE, joinLink, normalizeAddress, phoneJoinMode } from "../rules/companion-rules.mjs";
import { isCompanion } from "./boot.mjs";

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
  const phoneUser = phoneJoinMode(game.release.generation) === "phoneUser";
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
      <p class="hint">${phoneUser
        ? `Foundry ${game.release.generation} can't sign one user in on two devices at once, so your phone needs its own `
          + `user: ask your GM to create one (for example "${esc(game.user.name)} (phone)") and give it Owner on your `
          + `character. Then scan this with your phone and join as that user. Targets you pick on the phone show for `
          + `that user, not on this computer.`
        : "Scan with your phone's camera. You'll be asked for your Foundry password, if you have one."}</p>
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
    const link = phoneUser ? res.origin + foundry.utils.getRoute("join")
      : joinLink({ origin: res.origin, route: foundry.utils.getRoute(JOIN_PAGE), userId: game.user.id, name: game.user.name });
    out.value = link;
    box.append(qrSvg(link));
  };
  return foundry.applications.api.DialogV2.prompt({
    window: { title: "Open on phone", icon: "fa-solid fa-mobile-screen" },
    position: { width: 420 },
    content,
    ok: { label: "Done" },
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
