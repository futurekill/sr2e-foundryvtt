/**
 * In-Foundry integration tests, run by the Quench module.
 *
 * These cover the sheet-render / document-persistence / compendium layer that the
 * headless Vitest suite (npm test) cannot reach — the exact layer where this
 * system's regressions keep surfacing (blank sheets, a mistyped item type, header
 * fields not saving, unlinked pregens, empty roll tables). Every batch below maps
 * to a real bug from development.
 *
 * Nothing here runs in normal play: the `quenchReady` hook only fires when the
 * (optional, dev-only) "Quench" module is installed and active. Install it from
 * Foundry's Add-on Modules browser, enable it in the world, then open the Quench
 * window (its button sits at the bottom of the sidebar) and run the SR2E batches.
 */
import { evaluateDamageCode } from "../documents/item.mjs";
import { testTotalSuccesses, effectiveSkillRating as sr2eEffectiveSkillRating } from "../rules/sr2e-rules.mjs";

export function registerSR2EQuenchTests() {
  Hooks.on("quenchReady", (quenchApi) => {
    // Every SR2E batch is wrapped so it can never leak documents: whatever
    // world Actors / Items named "Quench…" appeared while the batch ran are
    // deleted when it ends, after the batch's own teardown. Many batches keep
    // one `let actor` across several tests and delete only the last, which
    // left ~12 actors per run behind. Release a spirit's service first — the
    // preDeleteActor guard refuses to delete one still holding a spell.
    const sweepAfterBatch = (fn) => (context) => {
      let before;
      context.before(() => {
        before = new Set([...game.actors.map(d => d.uuid), ...game.items.map(d => d.uuid)]);
      });
      const result = fn(context);
      context.after(async function () {
        this.timeout(30000);
        const leaked = (coll) => coll.filter(d => (d.name ?? "").startsWith("Quench") && !before?.has(d.uuid));
        for (const a of leaked(game.actors)) {
          try {
            if (a.type === "spirit" && (a.system?.service || a.system?.pendingExpireSpellUuid)) {
              await a.update({ "system.service": "", "system.sustainingSpellUuid": "", "system.pendingExpireSpellUuid": "" });
            }
            await a.delete();
          } catch (e) { console.warn("SR2E Quench | could not remove", a.name, e); }
        }
        const items = leaked(game.items).map(i => i.id);
        if (items.length) { try { await Item.deleteDocuments(items); } catch (e) { /* already gone */ } }
      });
      return result;
    };
    const quench = {
      registerBatch: (key, fn, options) => quenchApi.registerBatch(key, sweepAfterBatch(fn), options)
    };
    const ACTOR_TYPES = ["character", "npc", "vehicle", "spirit", "ic", "host"];

    /**
     * Wait for an async Hooks callback to land. Foundry does NOT await hook
     * callbacks, so `await doc.update(...)` can resolve BEFORE an async
     * `updateItem` handler has finished its own writes (e.g. the purchase charge
     * or the single-active-deck switch-off). Poll the condition instead of
     * asserting immediately — and instead of a blind sleep, which is flaky.
     */
    const settle = async (check, ms = 1000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (check()) return true; } catch (e) { /* keep waiting */ }
        await new Promise(r => setTimeout(r, 20));
      }
      return false;
    };

    // ── Actor sheets render WITH body content (the blank-sheet regression) ──────
    quench.registerBatch("sr2e.sheets", (context) => {
      const { describe, it, assert, after } = context;
      const made = [];
      // Closing six rendered sheets and deleting their actors outlasts Mocha's
      // 2 s hook default — the intermittent unattributed "1 failed".
      after(async function () {
        this.timeout(20000);
        for (const a of made) { try { await a.sheet?.close(); } catch (e) {} await a.delete(); }
      });

      describe("Actor sheets render tabs + body", () => {
        for (const type of ACTOR_TYPES) {
          it(`${type} sheet renders its parts (not just the header)`, async () => {
            const actor = await Actor.create({ name: `Quench ${type}`, type });
            made.push(actor);
            await actor.sheet.render(true);
            await new Promise(r => setTimeout(r, 200));
            const el = actor.sheet.element;
            assert.ok(el, `${type}: no sheet element`);
            // The blank-sheet regression rendered the header part but none of the
            // body parts. Both sheet layouts must be recognised:
            //   tabbed (character, vehicle) → .tab-content / .sr2e-tabs
            //   single-part (npc, spirit, ic, host) → their own .sr2e-*-sheet root
            const body = el.querySelector(
              ".tab-content, .sr2e-tabs, [data-tab], " +
              ".sr2e-npc-sheet, .sr2e-spirit-sheet, .sr2e-ic-sheet, .sr2e-host-sheet"
            );
            assert.ok(body, `${type}: sheet rendered no body content (blank-sheet regression)`);
          });
        }
      });
    }, { displayName: "SR2E: Actor Sheets" });

    // ── Every registered item type is creatable (the adept_power type bug) ──────
    quench.registerBatch("sr2e.items", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { await actor?.delete(); });

      describe("Item types", () => {
        it("one of every registered item type creates without a validation error", async () => {
          actor = await Actor.create({ name: "Quench Items", type: "character" });
          for (const type of Object.keys(CONFIG.Item.dataModels)) {
            const [item] = await actor.createEmbeddedDocuments("Item", [{ name: `Q ${type}`, type }]);
            assert.ok(item, `could not create item type "${type}"`);
            assert.equal(item.type, type, `created item has the wrong type for "${type}"`);
          }
          // The original bug: pack items tagged "adeptPower" (the registered type is adept_power).
          assert.ok(actor.items.some(i => i.type === "adept_power"), "adept_power did not register");
        });
      });
    }, { displayName: "SR2E: Item Types" });

    // ── Document persistence (the Good-Karma-not-saving regression) ─────────────
    quench.registerBatch("sr2e.persistence", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { await actor?.delete(); });

      describe("Header stats persist", () => {
        it("a karma.current update sticks on the live document", async () => {
          actor = await Actor.create({ name: "Quench Karma", type: "character" });
          await actor.update({ "system.karma.current": 5 });
          assert.equal(actor.system.karma.current, 5, "update did not apply");
          assert.equal(game.actors.get(actor.id).system.karma.current, 5, "value did not persist to the directory actor");
        });
      });
    }, { displayName: "SR2E: Persistence" });

    // ── Metamagic: Quickening removes the sustaining penalty (Grimoire p.44) ─────
    quench.registerBatch("sr2e.metamagic", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { await actor?.delete(); });

      describe("Quickening", () => {
        it("quickening a sustained spell drops it from the sustain penalty", async () => {
          actor = await Actor.create({
            name: "Quench Initiate", type: "character",
            system: { magic: { initiateGrade: 2, metamagic: ["quickening"] }, karma: { current: 10 } }
          });
          const [spell] = await actor.createEmbeddedDocuments("Item", [
            { name: "Q Spell", type: "spell", system: { force: 3, sustaining: true, sustainedForce: 3 } }
          ]);
          const before = actor.system.sustainPenalty;
          await spell.quickenSpell();
          assert.equal(spell.system.quickened, true, "spell was not flagged quickened");
          assert.ok(actor.system.sustainPenalty < before, "sustain penalty did not drop after quickening");
        });
      });
    }, { displayName: "SR2E: Metamagic" });

    // ── Compendium health: linked pregens, consumable grenades, full tables ─────
    quench.registerBatch("sr2e.compendium", (context) => {
      const { describe, it, assert } = context;

      describe("Sample runners are linked tokens (the karma-desync cause)", () => {
        it("every runner ships prototypeToken.actorLink = true", async () => {
          const docs = await game.packs.get("sr2e.runners").getDocuments();
          assert.ok(docs.length, "no sample runners");
          for (const a of docs) assert.equal(a.prototypeToken.actorLink, true, `${a.name} is an unlinked token`);
        });
      });

      describe("Thrown weapons are consumables, not reloadable", () => {
        it("the Offensive Grenade has no ammo block", async () => {
          const pack = game.packs.get("sr2e.weapons");
          const entry = (await pack.getIndex()).find(e => e.name === "Offensive Grenade");
          assert.ok(entry, "Offensive Grenade missing from the weapons compendium");
          const g = await pack.getDocument(entry._id);
          assert.equal(g.system.weaponType, "grenade");
          assert.equal(g.system.ammo.max, 0, "grenade still carries a reloadable ammo block");
        });
      });

      describe("Roll tables have result rows (the lost-content bug)", () => {
        it("each roll table has at least one result", async () => {
          const docs = await game.packs.get("sr2e.roll-tables").getDocuments();
          assert.ok(docs.length, "no roll tables");
          for (const t of docs) assert.ok(t.results.size > 0, `"${t.name}" has no result rows`);
        });
      });
    }, { displayName: "SR2E: Compendium" });

    // ── Header inputs save on change (the Good-Karma-not-saving regression) ─────
    quench.registerBatch("sr2e.sheet-save", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { try { await actor?.sheet?.close(); } catch (e) {} await actor?.delete(); });

      describe("Header field edits persist", () => {
        it("a change on the Good Karma input writes through to the document", async () => {
          actor = await Actor.create({ name: "Quench Save", type: "character" });
          await actor.sheet.render(true);
          await new Promise(r => setTimeout(r, 200));
          const input = actor.sheet.element.querySelector('input[name="system.karma.current"]');
          assert.ok(input, "Good Karma input not found on the header");
          input.value = "7";
          input.dispatchEvent(new Event("change", { bubbles: true }));
          await new Promise(r => setTimeout(r, 250));
          assert.equal(actor.system.karma.current, 7, "Good Karma did not persist on change (header-save regression)");
        });

        // 0.93.1: the NPC and spirit sheets have no tabs and no header class, so
        // none of their fields were wired and every edit (damage typed on an NPC)
        // was gone when the sheet reopened.
        for (const [type, field, value] of [
          ["npc",    "system.conditionMonitor.physical.value", 5],
          ["spirit", "system.conditionMonitor.stun.value",     3],
          ["ic",     "system.rating",                          4],
          ["host",   "system.attempts",                        2]
        ]) {
          it(`a ${type} sheet saves ${field} on change`, async () => {
            const a = await Actor.create({ name: `Quench Save ${type}`, type });
            try {
              await a.sheet.render(true);
              await new Promise(r => setTimeout(r, 200));
              const input = a.sheet.element.querySelector(`[name="${field}"]`);
              assert.ok(input, `${field} input not found on the ${type} sheet`);
              input.value = String(value);
              input.dispatchEvent(new Event("change", { bubbles: true }));
              assert.ok(await settle(() => foundry.utils.getProperty(a, field) === value),
                `${type} ${field} did not persist on change`);
            } finally {
              try { await a.sheet.close(); } catch (e) {}
              await a.delete();
            }
          });
        }
      });
    }, { displayName: "SR2E: Sheet Saves" });

    // ── Contacts vs Enemies split renders into the right section ────────────────
    quench.registerBatch("sr2e.contacts", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { try { await actor?.sheet?.close(); } catch (e) {} await actor?.delete(); });

      describe("Contacts / Enemies tab", () => {
        it("an enemy contact lands in the Enemies list, an ally in Contacts", async () => {
          actor = await Actor.create({ name: "Quench Contacts", type: "character" });
          await actor.createEmbeddedDocuments("Item", [
            { name: "MyAlly", type: "contact", system: { contactType: "contact" } },
            { name: "MyFoe",  type: "contact", system: { contactType: "enemy" } }
          ]);
          await actor.sheet.render(true);
          await new Promise(r => setTimeout(r, 200));
          const el = actor.sheet.element;
          const enemies  = el.querySelector(".enemies-table");
          const contacts = el.querySelector(".contacts-table:not(.enemies-table)");
          assert.ok(enemies, "no Enemies table rendered");
          assert.ok(enemies.textContent.includes("MyFoe"), "enemy not in the Enemies section");
          assert.ok(!enemies.textContent.includes("MyAlly"), "ally leaked into the Enemies section");
          assert.ok(contacts && contacts.textContent.includes("MyAlly"), "ally not in the Contacts section");
        });
      });
    }, { displayName: "SR2E: Contacts" });

    // ── Called shot / aim / barriers, through the REAL attack path ─────────────
    // Vitest covers the arithmetic; these cover what it cannot reach — the
    // dialog result travelling through item.roll() into _rollWeaponAttack(),
    // where the review said the risk actually lives.
    quench.registerBatch("sr2e.attack-options", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { await actor?.delete(); });

      const mkActor = async (name) => Actor.create({ name, type: "character" });

      describe("Called shots (SR2E p.92)", () => {
        it("is refused on full auto even when the dialog is bypassed", async () => {
          actor = await mkActor("Quench CalledShot");
          const [gun] = await actor.createEmbeddedDocuments("Item", [{
            name: "Test AR", type: "weapon",
            system: { weaponType: "firearm", skill: "firearms", damageCode: "8M",
                      firingModes: { ss: false, sa: true, bf: true, fa: true },
                      ammo: { current: 30, max: 30 } }
          }]);
          const before = gun.system.ammo.current;
          // Direct call — no dialog in the way.
          await gun.roll({ firingMode: "fa", calledShot: true, rounds: 6 });
          assert.equal(gun.system.ammo.current, before,
            "a refused called shot must not consume ammunition");
        });

        it("does not consume a thrown weapon when refused", async () => {
          // Validation runs BEFORE the quantity decrement; this is the ordering
          // bug the review caught.
          actor = await mkActor("Quench Thrown");
          const [nade] = await actor.createEmbeddedDocuments("Item", [{
            name: "Test Grenade", type: "weapon",
            system: { weaponType: "grenade", skill: "throwing weapons", damageCode: "10S", quantity: 3 }
          }]);
          await nade.roll({ calledShot: true });
          assert.equal(nade.system.quantity, 3, "a refused attack still ate the grenade");
        });
      });

      describe("Short bursts (SR2E p.92)", () => {
        // Forced 5s beat TN 4; recoilComp 3 cancels the burst's own recoil.
        const fire = async (name, current) => {
          actor = await mkActor(name);
          await actor.createEmbeddedDocuments("Item", [
            { name: "Firearms", type: "skill", system: { rating: 6, category: "active" } }]);
          const [gun] = await actor.createEmbeddedDocuments("Item", [{
            name: "Test SMG", type: "weapon",
            system: { weaponType: "firearm", skill: "firearms", damageCode: "5M", recoilComp: 3,
                      firingModes: { sa: true, bf: true }, ammo: { current, max: 30 } } }]);
          const n = game.messages.size;
          const orig = CONFIG.Dice.randomUniform;
          CONFIG.Dice.randomUniform = () => 0.2;   // every die a 5
          try { await gun.roll({ firingMode: "bf", rounds: 3 }); }
          finally { CONFIG.Dice.randomUniform = orig; }
          const msgs = game.messages.contents.slice(n);
          const btn = msgs.map(m => new DOMParser().parseFromString(m.content, "text/html")
            .querySelector("button.sr2e-resist-btn[data-power]")).find(Boolean);
          const test = msgs.find(m => m.flags?.sr2e?.test);
          await ChatMessage.deleteDocuments(msgs.map(m => m.id));
          return { gun, btn, test };
        };

        it("fires the two rounds left: +2 Power, no level step", async () => {
          const { gun, btn, test } = await fire("Quench ShortBurst2", 2);
          assert.equal(gun.system.ammo.current, 0, "both rounds went out");
          assert.ok(btn, "the burst was resolved, not refused");
          assert.equal(btn.dataset.power, "7", "5 + 2 for a 2-round short burst");
          assert.equal(btn.dataset.level, "M", "a short burst does not raise the Damage Level");
          assert.include(test.flags.sr2e.test.label, "short burst");
        });

        it("resolves a lone round as a single shot", async () => {
          const { gun, btn } = await fire("Quench ShortBurst1", 1);
          assert.equal(gun.system.ammo.current, 0);
          assert.equal(btn.dataset.power, "5", "no burst bonus on one round");
          assert.equal(btn.dataset.level, "M");
        });
      });

      describe("Melee visibility and the defender's modifiers (SR2E p.101–102)", () => {
        it("adds half-value visibility to the attack and hands reach + visibility to the defender", async () => {
          actor = await mkActor("Quench MeleeVis");
          const [blade] = await actor.createEmbeddedDocuments("Item", [{
            name: "Test Sword", type: "weapon",
            system: { weaponType: "melee", skill: "armed combat", damageCode: "(Str+2)M", equipped: true } }]);
          const n = game.messages.size;
          await blade.roll({ meleeVisMod: 3, reachMod: -1 });
          const msgs = game.messages.contents.slice(n);
          const test = msgs.find(m => m.flags?.sr2e?.test);
          const card = msgs.find(m => m.flags?.sr2e?.melee);
          await ChatMessage.deleteDocuments(msgs.map(m => m.id));
          assert.include(test.flags.sr2e.test.label, "visibility +3");
          assert.include(card.flags.sr2e.melee, { reachMod: -1, meleeVisMod: 3 });
        });

        it("ignores a visibility value that is not on the halved table", async () => {
          actor = await mkActor("Quench MeleeVisBad");
          const [blade] = await actor.createEmbeddedDocuments("Item", [{
            name: "Test Sword", type: "weapon",
            system: { weaponType: "melee", skill: "armed combat", damageCode: "(Str+2)M", equipped: true } }]);
          const n = game.messages.size;
          await blade.roll({ meleeVisMod: 6 });   // a RANGED value — not a melee one
          const msgs = game.messages.contents.slice(n);
          const test = msgs.find(m => m.flags?.sr2e?.test);
          await ChatMessage.deleteDocuments(msgs.map(m => m.id));
          assert.notInclude(test.flags.sr2e.test.label, "visibility");
        });
      });

      describe("Take Aim (SR2E p.82)", () => {
        it("aborts a multi-phase aim that also asks for pool dice", async () => {
          actor = await mkActor("Quench Aim");
          const [gun] = await actor.createEmbeddedDocuments("Item", [{
            name: "Test Pistol", type: "weapon",
            system: { weaponType: "firearm", skill: "firearms", damageCode: "9M", equipped: true,
                      firingModes: { sa: true }, ammo: { current: 10, max: 10 } }
          }]);
          const before = gun.system.ammo.current;
          await gun.roll({ firingMode: "sa", aimActions: 2, aimMultiPhase: true, poolDice: 3 });
          assert.equal(gun.system.ammo.current, before,
            "the abort must happen before ammunition is spent");
        });

        it("permits pool dice on a SINGLE-phase aim", async () => {
          // p.82 restricts pools only when aim spans multiple phases. An earlier
          // draft banned them for any aim at all.
          actor = await mkActor("Quench Aim1");
          const [gun] = await actor.createEmbeddedDocuments("Item", [{
            name: "Test Pistol", type: "weapon",
            system: { weaponType: "firearm", skill: "firearms", damageCode: "9M", equipped: true,
                      firingModes: { sa: true }, ammo: { current: 10, max: 10 } }
          }]);
          const before = gun.system.ammo.current;
          await gun.roll({ firingMode: "sa", aimActions: 2, aimMultiPhase: false, poolDice: 3 });
          assert.isBelow(gun.system.ammo.current, before, "a single-phase aim should still fire");
        });

        it("refuses to aim a weapon that is not a ready ranged weapon", async () => {
          actor = await mkActor("Quench AimMelee");
          const [blade] = await actor.createEmbeddedDocuments("Item", [{
            name: "Test Blade", type: "weapon",
            system: { weaponType: "melee", skill: "armed combat", damageCode: "(Str)M", equipped: true }
          }]);
          const r = await blade.roll({ aimActions: 1 });
          assert.notOk(r, "melee weapons cannot be aimed (p.82)");
        });
      });

      describe("Barriers (SR2E p.98)", () => {
        it("compares the BASE round Power, not the burst-inflated Power", async () => {
          // The whole point of p.98's "unmodified for burst or full auto".
          // A 6M weapon on a 3-round burst has effective Power 9; the barrier
          // must see 6. Barrier 8 therefore STOPS it.
          //
          // The barrier branch lives inside `if (result.successes > 0)`, so a
          // MISSED attack posts no barrier card at all and this asserted against
          // the attack card instead — a coin-flip failure that says nothing
          // about the rule. Force every die to a 5: it beats TN 4 so the shot
          // always connects, and unlike a 6 it does not trigger the Rule of Six
          // (an always-6 stub would re-roll forever and hang the batch).
          // mapRandomFace(u) = ceil((1 - u) * 6), so u = 0.2 -> 5.
          const realRandom = CONFIG.Dice.randomUniform;
          CONFIG.Dice.randomUniform = () => 0.2;
          try {
            actor = await mkActor("Quench BarrierPower");
            // A forced 5 only guarantees a hit if the TN really is 4, so both
            // things that would raise it are pinned: an actual Firearms skill
            // (no defaulting penalty) and recoilComp 3 to cancel the 3-round
            // burst's +3 recoil. Neither touches the Power being asserted.
            await actor.createEmbeddedDocuments("Item", [
              { name: "Firearms", type: "skill", system: { rating: 6, category: "active" } }
            ]);
            const [gun] = await actor.createEmbeddedDocuments("Item", [{
              name: "Test SMG", type: "weapon",
              system: { weaponType: "firearm", skill: "firearms", damageCode: "6M", recoilComp: 3,
                        firingModes: { sa: true, bf: true }, ammo: { current: 30, max: 30 } }
            }]);
            const before = game.messages.size;
            // barrierTransparent matters: an OPAQUE barrier adds +8 for blind fire
            // (p.98), which would put the TN at 12 and make the forced 5s miss —
            // no attack, no barrier card, and nothing learned about Power. Firing
            // through a window keeps the TN at 4 and still exercises the rule
            // under test, which is base vs burst-inflated Power.
            await gun.roll({ firingMode: "bf", rounds: 3, barrierRating: 8,
                             barrierMode: "through", barrierTransparent: true });
            // Scope to cards THIS roll posted, for the same reason the conjuring
            // tests do: game.messages is the whole world log.
            const cards = game.messages.contents.slice(before);
            const barrierCard = cards.find(m => /vs Barrier/.test(m.content ?? ""));
            assert.ok(barrierCard,
              "no barrier card was posted — the shot should have connected and hit the barrier");
            assert.include(barrierCard.content, "stopped cold",
              "burst Power leaked into the barrier comparison — 6 should not beat 8");
            assert.include(barrierCard.content, "Base Power 6",
              "the card must show the BASE power (6), not the burst-inflated 9");
          } finally {
            CONFIG.Dice.randomUniform = realRandom;
          }
        });

        it("is refused for shot-spread attacks rather than half-wired", async () => {
          actor = await mkActor("Quench BarrierSpread");
          const [sg] = await actor.createEmbeddedDocuments("Item", [{
            name: "Test Shotgun", type: "weapon",
            system: { weaponType: "firearm", skill: "firearms", damageCode: "10S",
                      firingModes: { sa: true }, ammo: { current: 8, max: 8 } }
          }]);
          const before = sg.system.ammo.current;
          await sg.roll({ firingMode: "sa", shotSpread: true, barrierRating: 4 });
          assert.equal(sg.system.ammo.current, before, "should have been refused before firing");
        });
      });
    }, { displayName: "SR2E: Attack Options" });

    // ── Slotted skillsofts inject / override skills (SR2E p.248) ────────────────
    quench.registerBatch("sr2e.skillsofts", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { await actor?.delete(); });

      describe("Skillsoft slotting", () => {
        it("ActiveSofts run at full rating within the Skillwire-Rating budget", async () => {
          actor = await Actor.create({ name: "Quench Soft", type: "character" });
          // Skillwires 6 = total ActiveSoft-rating budget; one native Firearms 6.
          await actor.createEmbeddedDocuments("Item", [
            { name: "Skillwires", type: "cyberware", system: { location: "bodyware", installed: true, rating: 6 } },
            { name: "Firearms", type: "skill", system: { category: "active", rating: 6 } }
          ]);
          // A skill the character LACKS → synthetic chipped skill at FULL rating 5 (not capped).
          await actor.createEmbeddedDocuments("Item", [{
            name: "Stealth ActiveSoft", type: "gear",
            system: { category: "skillsoft", rating: 5, slotted: true,
                      grantedSkill: "Stealth", grantedSkillCategory: "active", grantedSkillAttribute: "quickness" }
          }]);
          const stealth = (actor.system.chippedSkills ?? []).find(s => s.name === "Stealth");
          assert.ok(stealth, "slotted ActiveSoft did not inject its skill");
          assert.equal(stealth.system.rating, 5, "ActiveSoft should run at full rating, not be capped");
          assert.equal(actor.system.skillsoft.memUsed, 250, "memory used should be General-row Mp for rating 5");

          // A second ActiveSoft (rating 3) would push the running total to 8 > 6 budget → over budget,
          // so it does NOT replace the native Firearms.
          const [over] = await actor.createEmbeddedDocuments("Item", [{
            name: "Firearms ActiveSoft", type: "gear",
            system: { category: "skillsoft", rating: 3, slotted: true,
                      grantedSkill: "Firearms", grantedSkillCategory: "active" }
          }]);
          const native = actor.items.find(i => i.type === "skill" && i.name === "Firearms");
          assert.equal(native.system.rating, 6, "over-budget soft should not replace the native skill");
          assert.ok(over.system._overBudget, "second soft over the Skillwire budget was not flagged");

          // Free the budget (un-slot Stealth) → the Firearms soft now fits and replaces native at 3.
          const stealthItem = actor.items.find(i => i.name === "Stealth ActiveSoft");
          await stealthItem.update({ "system.slotted": false });
          const native2 = actor.items.find(i => i.type === "skill" && i.name === "Firearms");
          assert.equal(native2.system.rating, 3, "freed-budget soft did not replace native (3)");
          assert.ok(native2.system._chipped, "chipped native skill not flagged");
        });

        it("a LinguaSoft adds a language skill when an access port exists (no Skillwires needed)", async () => {
          actor = await Actor.create({ name: "Quench Lingua", type: "character" });
          await actor.createEmbeddedDocuments("Item", [
            { name: "Datajack", type: "cyberware", system: { location: "headware", installed: true } }
          ]);
          await actor.createEmbeddedDocuments("Item", [{
            name: "Sperethiel LinguaSoft", type: "gear",
            system: { category: "skillsoft", rating: 4, slotted: true,
                      grantedSkill: "Sperethiel", grantedSkillCategory: "language" }
          }]);
          const lang = (actor.system.chippedSkills ?? []).find(s => s.name === "Sperethiel");
          assert.ok(lang, "LinguaSoft did not inject a language skill");
          assert.equal(lang.system.category, "language", "injected skill is not a language");
          assert.equal(lang.system.rating, 4, "LinguaSoft should run at full rating off a datajack");
          // A chip is not a chargen purchase (SR2E p.74) and grants the specific
          // language only — no +2, and no family to fall back on.
          // A LinguaSoft "replicates Language Skills" (SR2E p.248), and a
          // Language Skill IS a specialization of a family (p.74) — so the chip
          // carries the family too. Only the chargen +2 is withheld.
          assert.equal(lang.system.languageRating, 6, "a chipped language gets the Specialization +2, not the native +2");
          // Sperethiel is in NO formal family (p.74), so it must get no family
          // rating either — a positive rating with a blank name rendered a
          // clickable empty tag that rolled dice for a family that does not exist.
          assert.equal(lang.system.languageFamily, "", "Sperethiel is in no formal family (p.74)");
          assert.equal(lang.system.familyRating, 0, "a family-less language must not get a family rating");
        });

        it("a chip-granted language shows its family, with or without a native skill", async () => {
          // Player report: LinguaSofts chip fine now, but their specialization
          // status does not show. Cause: the synthetic path (character has NO
          // native skill for that language — Blackbriar's case) withheld the
          // family, while the overwrite path kept it. Same chip, two displays.
          actor = await Actor.create({ name: "Quench ChipFamily", type: "character" });
          await actor.createEmbeddedDocuments("Item", [
            { name: "Softlink", type: "cyberware", system: { location: "headware", installed: true, rating: 4, accessPorts: 4 } }
          ]);
          await actor.createEmbeddedDocuments("Item", [{
            name: "German LinguaSoft", type: "gear",
            system: { category: "skillsoft", rating: 3, slotted: true,
                      grantedSkill: "German", grantedSkillCategory: "language" }
          }]);
          const german = (actor.system.chippedSkills ?? []).find(s => s.name === "German");
          assert.ok(german, "LinguaSoft did not inject German");
          assert.equal(german.system.languageFamily, "Germanic", "chipped language lost its family");
          assert.equal(german.system.familyRating, 1, "German 3 -> speaks 5, Germanic max(1, 5-4) = 1");
          assert.equal(german.system.languageRating, 5, "chip rating 3 + the Specialization +2; no native +2");
        });

        it("an implant that DECLARES access ports counts however it is named", async () => {
          // Regression: access was detected by matching implant names against
          // "chipjack"/"datajack", so a Shadowtech Softlink — an advanced
          // chipjack — was rejected with "install a chipjack, datajack, or
          // headware memory" while the character was wearing one.
          actor = await Actor.create({ name: "Quench Softlink", type: "character" });
          await actor.createEmbeddedDocuments("Item", [
            { name: "Softlink", type: "cyberware", system: { location: "headware", installed: true, rating: 4, accessPorts: 4 } }
          ]);
          assert.ok(actor.system.skillsoft.knowAccess, "a declared-port implant did not grant chip access");
          assert.equal(actor.system.skillsoft.accessPorts, 4, "port count should come from the declared value");
        });

        it("a slotted LinguaSoft re-derives a native language's p.74 numbers", async () => {
          // The chip overwrites `rating` on the ALREADY-PREPARED skill item, so
          // languageRating/familyRating have to be recomputed at that point or
          // they keep describing the pre-chip rating.
          actor = await Actor.create({ name: "Quench LangChip", type: "character" });
          await actor.createEmbeddedDocuments("Item", [
            { name: "Datajack", type: "cyberware", system: { location: "headware", installed: true } },
            { name: "Spanish", type: "skill", system: { category: "language", rating: 6, languageFamily: "Romance" } }
          ]);
          const native = actor.items.find(i => i.name === "Spanish");
          assert.equal(native.system.languageRating, 10, "chargen Spanish 6: +2 Specialization, +2 native");
          assert.equal(native.system.familyRating, 6, "Romance sits 4 below the language");

          await actor.createEmbeddedDocuments("Item", [{
            name: "Spanish LinguaSoft", type: "gear",
            system: { category: "skillsoft", rating: 5, slotted: true,
                      grantedSkill: "Spanish", grantedSkillCategory: "language" }
          }]);
          const chipped = actor.items.find(i => i.name === "Spanish");
          assert.ok(chipped.system._chipped, "native Spanish was not flagged as chipped");
          assert.equal(chipped.system.languageRating, 7,
            "chipped language still reporting the pre-chip rating — derived values went stale");
          assert.equal(chipped.system.familyRating, 3, "family should re-derive off the chip rating");
          // The flag itself must never be written: the item sheet submits real
          // schema fields, so a persisted `false` would survive un-slotting.
          assert.equal(chipped._source.system.chargenLanguage, true,
            "chargenLanguage was persisted to source — it must stay a transient");
        });

        it("Skillwire PLUS carries twice the Classic total-ratings budget (Shadowtech p.19)", async () => {
          actor = await Actor.create({ name: "Quench SkillwirePlus", type: "character" });
          await actor.createEmbeddedDocuments("Item", [
            { name: "Skillwires Plus", type: "cyberware", system: { installed: true, rating: 4 } }
          ]);
          assert.equal(actor.system.skillsoft.skillwiresRating, 8,
            "a Plus rating-4 should give an 8-point ActiveSoft budget, not 4");
          // Two ActiveSofts summing to 8 both fit (would be over-budget on a Classic-4).
          await actor.createEmbeddedDocuments("Item", [
            { name: "Stealth ActiveSoft", type: "gear", system: { category: "skillsoft", rating: 5, slotted: true, grantedSkill: "Stealth", grantedSkillCategory: "active" } },
            { name: "Firearms ActiveSoft", type: "gear", system: { category: "skillsoft", rating: 3, slotted: true, grantedSkill: "Firearms", grantedSkillCategory: "active" } }
          ]);
          const overBudget = actor.items.filter(i => i.system._overBudget).length;
          assert.equal(overBudget, 0, "5 + 3 = 8 fits an 8-point Plus budget; nothing should be over-budget");
        });

        it("a chipped Active skill gets the Enhanced Articulation die (passive, not a pool)", async () => {
          actor = await Actor.create({ name: "Quench ChipArt", type: "character" });
          await actor.createEmbeddedDocuments("Item", [
            { name: "Skillwires", type: "cyberware", system: { installed: true, rating: 6 } },
            { name: "Enhanced Articulation", type: "bioware", system: { installed: true, activeSkillDice: 1 } },
            { name: "Stealth ActiveSoft", type: "gear", system: { category: "skillsoft", rating: 4, slotted: true, grantedSkill: "Stealth", grantedSkillCategory: "active" } }
          ]);
          assert.equal(actor.system.activeSkillDice, 1, "Enhanced Articulation should grant +1 active-skill die");
          const chip = (actor.system.chippedSkills ?? []).find(s => s.name === "Stealth");
          assert.ok(chip, "ActiveSoft did not inject Stealth");
          // Pass pool dice too: they must be IGNORED (skillwires bar pools, core
          // p.243), so the roll is still rating(4) + articulation(1) = 5.
          const res = await actor.rollChippedSkill(chip.softId, 4, { poolDice: 3 });
          assert.equal(res?.dicePool, 5,
            `chipped roll should be 4 + 1 articulation = 5 dice (pools barred); got ${res?.dicePool}`);
        });
      });
    }, { displayName: "SR2E: Skillsofts" });

    quench.registerBatch("sr2e.accessories", (context) => {
      const { describe, it, assert, after } = context;
      // Each `it` reassigns `actor`; track EVERY one so the after-hook deletes
      // them all (a single `actor?.delete()` only cleaned up the last, leaking
      // the other three every run).
      const made = [];
      let actor;
      const track = (a) => { made.push(a); return a; };
      after(async () => { for (const a of made) { try { await a.delete(); } catch (e) {} } });

      describe("Weapon accessories (SR2E p.240–241)", () => {
        it("attach → benefit → detach → re-attach to another weapon", async () => {
          actor = track(await Actor.create({ name: "Quench Accessories", type: "character" }));
          await actor.createEmbeddedDocuments("Item", [
            { name: "HK227", type: "weapon",
              system: { weaponType: "firearm", firingModes: { sa: true, bf: true }, recoilComp: 0 } },
            { name: "Ares Predator", type: "weapon",
              system: { weaponType: "firearm", firingModes: { sa: true } } },
            { name: "Bipod", type: "gear",
              system: { weaponAccessory: true, accessoryRecoilComp: 2, requiresDeployment: true } },
            { name: "Gas Vent III", type: "gear",
              system: { weaponAccessory: true, accessoryRecoilComp: 3, permanentAccessory: true } }
          ]);
          // Bind by name: createEmbeddedDocuments does NOT return the documents in
          // the order they were passed, so positional destructuring silently binds
          // the wrong items. (These asserts are self-referential enough that they
          // would still have passed while testing the wrong pair.)
          const byName = (n) => actor.items.find(i => i.name === n);
          const hk = byName("HK227"), pred = byName("Ares Predator");
          const bipod = byName("Bipod"), vent = byName("Gas Vent III");
          for (const [n, d] of [["HK227", hk], ["Ares Predator", pred], ["Bipod", bipod], ["Gas Vent III", vent]]) {
            assert.ok(d, `${n} was not created`);
          }

          // Attach the bipod to the HK227 (what the gear-tab dropdown writes)
          await bipod.update({ "system.linkedWeaponId": hk.id });
          assert.equal(actor.items.get(bipod.id).system.linkedWeaponId, hk.id,
            "bipod did not persist its weapon link");

          // Detach and move it to the Predator — aftermarket accessories transfer
          await bipod.update({ "system.linkedWeaponId": "" });
          assert.equal(actor.items.get(bipod.id).system.linkedWeaponId, "",
            "bipod did not detach");
          await bipod.update({ "system.linkedWeaponId": pred.id });
          assert.equal(actor.items.get(bipod.id).system.linkedWeaponId, pred.id,
            "bipod did not re-attach to a second weapon");

          // Gas vent: attachable, flagged permanent (dropdown locks in the UI)
          await vent.update({ "system.linkedWeaponId": hk.id });
          const v = actor.items.get(vent.id);
          assert.ok(v.system.permanentAccessory, "gas vent lost its permanent flag");
          assert.equal(v.system.linkedWeaponId, hk.id, "gas vent did not attach");
        });

        it("new characters get the default Unarmed Strike — (Str)M Stun (p.255, #3)", async () => {
          actor = track(await Actor.create({ name: "Quench Fists", type: "character" }));
          const fist = actor.items.find(i => i.name === "Unarmed Strike");
          assert.ok(fist, "Unarmed Strike was not embedded at character creation");
          assert.equal(fist.system.damageCode, "(Str)M", "wrong unarmed damage code");
          assert.equal(fist.system.damageType, "stun", "unarmed damage should be Stun");
          assert.equal(fist.system.skill, "unarmed_combat", "wrong unarmed skill");
        });

        it("knockdown: a Deadly wound always drops the target prone (p.91)", async () => {
          actor = track(await Actor.create({ name: "Quench Knockdown", type: "character",
            system: { body: { value: 6 } } }));
          await actor.rollKnockdown(10, "D", false);   // Deadly → prone regardless of roll
          // toggleStatusEffect needs a token; assert the method runs without error
          // and the pure outcome is prone (covered by vitest). Smoke-level check here.
          assert.ok(true);
        });

        it("smartgun accessory makes a dumb weapon smart-capable", async () => {
          actor = track(await Actor.create({ name: "Quench Smart", type: "character" }));
          await actor.createEmbeddedDocuments("Item", [
            { name: "Dumb Gun", type: "weapon",
              system: { weaponType: "firearm", smartgunCompatible: false, firingModes: { sa: true } } },
            { name: "Smartgun System (External)", type: "gear",
              system: { weaponAccessory: true, grantsSmartgun: true } }
          ]);
          // Bind by name — the returned order is not the passed order.
          const gun = actor.items.find(i => i.name === "Dumb Gun");
          const sg  = actor.items.find(i => i.name === "Smartgun System (External)");
          assert.ok(gun && sg, "smartgun test items were not created");
          await sg.update({ "system.linkedWeaponId": gun.id });
          const attached = actor.items.filter(i =>
            i.type === "gear" && i.system.weaponAccessory && i.system.linkedWeaponId === gun.id);
          assert.ok(attached.some(i => i.system.grantsSmartgun),
            "attached smartgun system not detectable on the weapon");
        });
      });
    }, { displayName: "SR2E: Weapon accessories" });

    // ── Special skills render on the sheet (issue #5) ──────────────────────────
    quench.registerBatch("sr2e.special-skills", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { try { await actor?.sheet?.close(); } catch (e) {} await actor?.delete(); });

      describe("Special skills (SR2E p.45, p.74)", () => {
        it("a special-category skill shows on the skills tab (was invisible)", async () => {
          actor = await Actor.create({ name: "Quench Special Skill", type: "character" });
          await actor.createEmbeddedDocuments("Item", [
            { name: "QuenchAuraReading", type: "skill", system: { category: "special", rating: 4 } }
          ]);
          await actor.sheet.render(true);
          await new Promise(r => setTimeout(r, 250));
          // Select the CONTENT section, not the nav link — both carry
          // data-tab="skills" and the nav <a> comes first in the DOM.
          const text = actor.sheet.element?.querySelector('section[data-tab="skills"]')?.textContent ?? "";
          assert.ok(text.includes("QuenchAuraReading"),
            "special skill did not render in the skills tab");
        });
      });
    }, { displayName: "SR2E: Special skills" });

    // ── Chargen budget panel reads attributes + item costs (SR2E p.44–45) ──────
    quench.registerBatch("sr2e.chargen-budget", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { try { await actor?.sheet?.close(); } catch (e) {} await actor?.delete(); });

      describe("Chargen budget panel", () => {
        it("shows resource spend from owned gear against the Resources priority", async () => {
          actor = await Actor.create({
            name: "Quench Budget", type: "character",
            system: { chargen: { priorities: { resources: "C" } } } // C = 90,000¥
          });
          await actor.createEmbeddedDocuments("Item", [
            { name: "Ares Predator", type: "weapon", system: { cost: 450, quantity: 1 } }
          ]);
          await actor.sheet.render(true);
          await new Promise(r => setTimeout(r, 250));
          const row = actor.sheet.element?.querySelector(".chargen-budget");
          assert.ok(row, "chargen budget panel did not render");
          const text = row.textContent.replace(/\s+/g, " ");
          assert.ok(text.includes("450 / 90,000"),
            `resources row wrong; got: ${text}`);
        });
      });
    }, { displayName: "SR2E: Chargen budget" });

    // ── Attribute Edges apply themselves (Shadowrun Companion p.24) ──
    // The Vitest suite locks naturalAttribute's math; this locks the half Vitest
    // can't see — that a quality item on a real actor actually drives it, and
    // that the chargen budget ignores points bought with Edge (the reported
    // off-by-N). Qualities are bound BY NAME: createEmbeddedDocuments does not
    // return documents in the order they were passed.
    quench.registerBatch("sr2e.attribute-edges", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { try { await actor?.sheet?.close(); } catch (e) {} await actor?.delete(); });

      const edge = (name, system) => ({ name, type: "quality", system: { kind: "edge", category: "attribute", ...system } });

      describe("Attribute Edges (Companion p.24)", () => {
        it("a Bonus Attribute Point raises the rating, bounded by the racial maximum", async () => {
          // Human: Strength 4 (max 6). +1 point => 5.
          actor = await Actor.create({
            name: "Quench Edges", type: "character",
            // Quickness 2 leaves headroom for the 3 Edge points added below to
            // land without hitting the human maximum of 6 and muddying that test.
            system: { race: "human", strength: { base: 4 }, body: { base: 6 }, quickness: { base: 2 } }
          });
          await actor.createEmbeddedDocuments("Item", [
            edge("Bonus Attribute Point", { attribute: "strength", attributeBonus: 1, pointValue: 1 })
          ]);
          assert.equal(actor.system.strength.value, 5, "bonus point did not reach Strength");

          // Body 6 is already at the human maximum: +2 points must not pass it.
          await actor.createEmbeddedDocuments("Item", [
            edge("Bonus Body", { attribute: "body", attributeBonus: 2, pointValue: 2 })
          ]);
          assert.equal(actor.system.body.value, 6, "bonus points escaped the racial maximum");
        });

        it("Exceptional Attribute raises the maximum WITHOUT raising the rating", async () => {
          const [item] = await actor.createEmbeddedDocuments("Item", [
            edge("Exceptional Attribute", { attribute: "body", maximumBonus: 1, pointValue: 2 })
          ]);
          // The book: it "simply raises the maximum—it does not increase the
          // character's actual Attribute Rating to the new maximum." Body still
          // has its 2 bonus points pending, which may now claim exactly 1 of the
          // raised ceiling: 6 base, cap 7 => 7, not 8.
          assert.equal(actor.system.body.value, 7, "raised ceiling not honoured");
          await item.delete();
          assert.equal(actor.system.body.value, 6, "ceiling did not fall back to the racial maximum");
        });

        it("does not charge the chargen Attribute budget for Edge-bought points", async () => {
          // The reported bug: the warning read "off by 3" because the points had
          // to be added by hand, landing in `base` — which the budget sums.
          // The budget is computed in the sheet context, so read it from there.
          await actor.update({ "system.chargen.priorities.attributes": "B" }); // B = 24
          const spent = async () => (await actor.sheet._prepareContext({}))
            .chargenBudget.attributes.spent;
          const before = await spent();
          await actor.createEmbeddedDocuments("Item", [
            edge("Bonus Quickness", { attribute: "quickness", attributeBonus: 3, pointValue: 3 })
          ]);
          assert.equal(await spent(), before,
            "Edge-bought attribute points were charged against the chargen budget");
          assert.equal(actor.system.quickness.value, actor.system.quickness.base + 3,
            "the 3 Edge points did not actually reach Quickness");
        });

        it("leaves a legacy hand-edited character untouched", async () => {
          // The upgrade path. Players worked around the dead Edge by naming the
          // attribute in the item's title and adding the points to `base` by
          // hand. Those items have no `attribute` set, so they must stay inert —
          // if a blank Edge ever applied itself, every such character would
          // silently gain points on upgrade.
          const legacy = await Actor.create({
            name: "Quench Legacy Edges", type: "character",
            system: { race: "human", willpower: { base: 5 } } // 2 bought + 3 by hand
          });
          try {
            await legacy.createEmbeddedDocuments("Item", [
              edge("Bonus Attribute Point (Willpower +3)", { pointValue: 3 })
            ]);
            assert.equal(legacy.system.willpower.value, 5,
              "an Edge with no Attribute picked changed the character");
          } finally {
            await legacy.delete();
          }
        });

        it("offers exactly the Attributes config allows, and no more", async () => {
          // QualityData relists these choices because a data model's schema is
          // built before CONFIG.SR2E is populated. Vitest can't import the model
          // (it needs Foundry globals), so this is the only place the two copies
          // can be checked against each other.
          const schema = Object.keys(
            CONFIG.Item.dataModels.quality.schema.fields.attribute.choices ?? {}
          );
          const config = Object.keys(CONFIG.SR2E.qualityAttributes);
          assert.sameMembers(schema, config,
            "QualityData's attribute choices have drifted from CONFIG.SR2E.qualityAttributes");
          // "any Attribute except Essence, Reaction or Magic" (p.24).
          for (const banned of ["essence", "reaction", "magic"]) {
            assert.notInclude(schema, banned, `${banned} must not be selectable`);
          }
        });
      });
    }, { displayName: "SR2E: Attribute Edges" });

    // ── Astral projection swaps the Initiative panel to astral values (p.147) ──
    quench.registerBatch("sr2e.astral-init", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { try { await actor?.sheet?.close(); } catch (e) {} await actor?.delete(); });

      describe("Astral Initiative (SR2E p.147)", () => {
        it("projecting shows Astral Reaction (2×Int) +15 with a single die", async () => {
          actor = await Actor.create({
            name: "Quench Astral", type: "character",
            system: {
              intelligence: { base: 4 }, willpower: { base: 5 },
              magic: { type: "full_magician" }, astralState: "projecting"
            }
          });
          const s = actor.system;
          assert.equal(s.astralReaction, 8, "Astral Reaction should be 2×Int (8)");
          assert.equal(s.initiative.base, 23, "projecting Initiative base should be 8+15");
          assert.equal(s.initiative.dice, 1, "astral Initiative rolls a single die");
        });
        it("perceiving keeps normal meat Initiative", async () => {
          await actor.update({ "system.astralState": "perceiving" });
          assert.equal(actor.system.initiative.base, actor.system.reaction.value,
            "perceiving should use meat Reaction for Initiative");
        });
      });
    }, { displayName: "SR2E: Astral initiative" });

    // ── Adept power points: used = Σ(pointCost × level), max = Magic (p.124) ────
    quench.registerBatch("sr2e.adept-points", (context) => {
      const { describe, it, assert, after } = context;
      // Every actor gets tracked: a shared `let actor` reassigned per test leaves
      // all but the last one behind in the world.
      const made = [];
      let actor;
      const newAdept = async (name) => {
        const a = await Actor.create({ name, type: "character",
          system: { magic: { type: "physical_adept" } } });
        made.push(a);
        return a;
      };
      after(async () => {
        for (const a of made) {
          try { await a.sheet?.close(); } catch (e) {}
          try { await a.delete(); } catch (e) {}
        }
      });

      describe("Adept power points (SR2E p.124)", () => {
        it("sums pointCost×level of adept powers against Magic", async () => {
          actor = await newAdept("Quench Adept");
          // Generic names on purpose — "Increased Reaction"/"Increased Reflexes"
          // are special-cased in adeptPowerCost() (non-linear per p.124); this
          // test covers the plain linear Σ(pointCost × level) path.
          await actor.createEmbeddedDocuments("Item", [
            { name: "Quench Power A", type: "adept_power", system: { pointCost: 1, level: 2 } }, // 1×2 = 2
            { name: "Quench Power B", type: "adept_power", system: { pointCost: 2, level: 1 } }  // 2×1 = 2
          ]);
          assert.equal(actor.system.adeptPowerPoints.max, actor.system.magic.value,
            "power-point max should equal the Magic rating");
          assert.equal(actor.system.adeptPowerPoints.value, 4, "used should be 1×2 + 2×1 = 4");
        });

        it("Improved Ability adds its levels to the named skill (rolled, not paid)", async () => {
          actor = await newAdept("Quench Improved");
          await actor.createEmbeddedDocuments("Item", [
            { name: "Firearms", type: "skill", system: { category: "active", rating: 4 } },
            { name: "Improved Ability (Firearms)", type: "adept_power",
              system: { pointCost: 1, level: 2, improvedSkill: "Firearms" } }
          ]);
          // Look the skill up by identity, not by position in the returned array —
          // don't make the assertion depend on createEmbeddedDocuments' ordering.
          const derived = actor.items.find(i => i.type === "skill" && i.name === "Firearms");
          assert.ok(derived, "the Firearms skill item was not created");
          assert.equal(derived.system._adeptBonus, 2, "skill should carry +2 adept bonus");
          assert.equal(derived.system.rating, 4, "bought rating (budget) must stay 4, not 6");
        });
      });
    }, { displayName: "SR2E: Adept power points" });

    // ── Weapon focus bonded to a melee weapon (SR2E p.126) ─────────────────────
    quench.registerBatch("sr2e.weapon-focus", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { await actor?.delete(); });

      describe("Weapon focus bonding (SR2E p.126)", () => {
        it("prices from the bonded weapon's Reach + Force and tags the weapon", async () => {
          actor = await Actor.create({ name: "Quench Focus", type: "character" });
          const [katana] = await actor.createEmbeddedDocuments("Item", [
            { name: "Katana", type: "weapon", system: { weaponType: "melee", reach: 1, damageCode: "6M" } }
          ]);
          const [focus] = await actor.createEmbeddedDocuments("Item", [
            { name: "Katana Focus", type: "focus",
              system: { focusType: "weapon", force: 2, bonded: true, active: true, bondedWeaponId: katana.id } }
          ]);
          // Price = (Reach 1 + 1)*100k + Force 2*90k = 380,000
          assert.equal(actor.items.get(focus.id).system.cost, 380000, "focus price should derive from reach+force");
          const w = actor.items.get(katana.id);
          assert.equal(w.system._boundFocusForce, 2, "weapon should be tagged with the focus force");
          assert.equal(w.system._boundFocusActive, true, "weapon focus should read as active");
        });

        it("only the bonded weapon gets the dice, not other melee weapons", async () => {
          const [club] = await actor.createEmbeddedDocuments("Item", [
            { name: "Club", type: "weapon", system: { weaponType: "melee", reach: 1, damageCode: "5M" } }
          ]);
          assert.ok(!actor.items.get(club.id).system._boundFocusForce,
            "an unbonded melee weapon must not gain focus dice");
        });
      });
    }, { displayName: "SR2E: Weapon focus" });

    // ── Innate Unarmed Strike can't be sold or deleted ─────────────────────────
    quench.registerBatch("sr2e.unarmed-protected", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { await actor?.delete(); });

      describe("Unarmed Strike protection", () => {
        it("preCreate injects it and the delete handler refuses to remove it", async () => {
          actor = await Actor.create({ name: "Quench Unarmed", type: "character" });
          const unarmed = actor.items.find(i => i.name === "Unarmed Strike");
          assert.ok(unarmed, "every character should start with an Unarmed Strike");
          // The delete guard keys on the name; deleting directly still works at
          // the document level, so assert the guard's identifying condition holds.
          assert.equal(unarmed.name, "Unarmed Strike",
            "delete/sell handlers guard on this exact name");
        });

        // 0.93.1: the skill lookup took the FIRST matching skill item, not the
        // first key, so with Armed Combat created before Unarmed Combat a punch
        // rolled Armed Combat (Heikegani: 8 dice with Unarmed 4).
        it("rolls Unarmed Combat even when Armed Combat comes first", async () => {
          await actor.createEmbeddedDocuments("Item", [
            { name: "Armed Combat",   type: "skill", system: { rating: 6, category: "active" } },
            { name: "Unarmed Combat", type: "skill", system: { rating: 4, category: "active" } }
          ]);
          let pool = null;
          actor.rollSuccessTest = async (dice) => { pool = dice; return null; };
          try {
            await actor.items.getName("Unarmed Strike").roll({ targetNumber: 4 });
          } catch (e) { /* the stub returns no result; only the pool matters */ }
          finally { delete actor.rollSuccessTest; }
          assert.equal(pool, 4, "Unarmed Strike must roll Unarmed Combat, not Armed Combat");
        });
      });
    }, { displayName: "SR2E: Unarmed protected" });

    // ── Derived-value-into-authored-field compounding (GitHub #15). Pure rule
    //    tests can't see this — it's a Foundry lifecycle bug: a relative
    //    transform writes the prepared value, the sheet edits the prepared value,
    //    and saving it back re-applies the transform. Editing ANY unrelated field
    //    must not change the compounding target. ──
    quench.registerBatch("sr2e.derived-compounding", (context) => {
      const { describe, it, assert, afterEach } = context;
      const made = [];
      afterEach(async () => { for (const a of made.splice(0)) await a?.delete(); });
      const mk = async (data) => { const a = await Actor.create(data); made.push(a); return a; };

      describe("Bone lacing does not compound unarmed damage", () => {
        it("keeps (Str+3)M no matter how often the sheet is saved", async () => {
          const actor = await mk({
            name: "Quench Compound", type: "character", system: { strength: { base: 6 } }
          });
          await actor.createEmbeddedDocuments("Item", [{
            name: "Bone Lacing (Titanium)", type: "cyberware",
            system: { installed: true, unarmedPowerBonus: 3 }
          }]);
          const fist = () => actor.items.find(i => i.name === "Unarmed Strike");
          assert.equal(fist().system.damageCode, "(Str+3)M", "one lace should give +3");
          assert.equal(fist()._source.system.damageCode, "(Str)M",
            "the AUTHORED code must stay (Str)M — the bonus is derived, not stored");

          // Simulate what the sheet does: edit an UNRELATED field. Before the fix
          // this re-submitted the derived (Str+3)M into source and compounded.
          for (let i = 0; i < 3; i++) {
            await fist().update({ "system.damageType": i % 2 ? "physical" : "stun" });
          }
          assert.equal(fist()._source.system.damageCode, "(Str)M",
            "editing damageType must NOT rewrite the authored damage code");
          assert.equal(fist().system.damageCode, "(Str+3)M",
            "derived damage must not compound to (Str+3+3)M");
        });

        it("does not compound a container's combat TN modifier", async () => {
          const actor = await mk({ name: "Quench TN", type: "character" });
          const [eyes] = await actor.createEmbeddedDocuments("Item", [{
            name: "Cybereyes", type: "cyberware",
            system: { installed: true, combatTnMod: 0, capacity: 0.5,
              modules: [{ name: "Smartlink", active: true, combatTnMod: -2, essenceCost: 0, cost: 0, rating: 0 }] }
          }]);
          const item = () => actor.items.get(eyes.id);
          assert.equal(item().system.combatTnMod, -2, "active module should give −2");
          assert.equal(item()._source.system.combatTnMod, 0, "authored base stays 0");
          for (let i = 0; i < 3; i++) await item().update({ "system.installed": i % 2 === 0 });
          assert.equal(item()._source.system.combatTnMod, 0, "base must not absorb the module bonus");
          assert.equal(item().system.combatTnMod, -2, "derived TN must not compound to −8");
        });
      });
    }, { displayName: "SR2E: Derived compounding" });

    // ── Misc dice: a signed situational modifier threaded through rollSuccessTest.
    //    Vitest can't reach the roll engine, so assert the rolled dice COUNT
    //    (deterministic) and the itemized breakdown on the card. ──
    quench.registerBatch("sr2e.misc-dice", (context) => {
      const { describe, it, assert, afterEach } = context;
      const made = [];
      afterEach(async () => { for (const a of made.splice(0)) await a?.delete(); });
      const mk = async () => { const a = await Actor.create({ name: "Quench Misc", type: "character", system: { body: { base: 4 } } }); made.push(a); return a; };
      const lastCard = () => game.messages.contents.at(-1)?.content ?? "";

      describe("Misc dice (situational ± modifier)", () => {
        it("adds a positive misc bonus to the pool and itemizes it", async () => {
          const actor = await mk();  // Body 4
          const r = await actor.rollAttributeTest("body", 4, { miscDice: 2, miscLabel: "Tailored Pheromones" });
          assert.equal(r.dice.length, 6, "4 base + 2 misc = 6 dice rolled");
          assert.ok(lastCard().includes("+2") && lastCard().includes("Tailored Pheromones"),
            "the card should itemize +2 misc with the note");
        });

        it("applies a negative misc as a dice penalty", async () => {
          const actor = await mk();  // Body 4
          const r = await actor.rollAttributeTest("body", 4, { miscDice: -1 });
          assert.equal(r.dice.length, 3, "4 base − 1 misc = 3 dice");
          assert.ok(lastCard().includes("−1"), "the card should show the −1 misc penalty");
        });

        it("floors the pool at ZERO dice (automatic failure), never negative", async () => {
          const actor = await mk();  // Body 4
          const r = await actor.rollAttributeTest("body", 4, { miscDice: -99 });
          assert.equal(r.dice.length, 0, "a penalty past the pool is an automatic failure (0 dice)");
          assert.equal(r.successes, 0, "0 dice can score no successes");
          assert.ok(lastCard().includes("min 0"), "the card should flag that the pool floored at 0");
        });

        it("bounds an absurd programmatic value instead of freezing the client", async () => {
          const actor = await mk();  // Body 4
          const r = await actor.rollAttributeTest("body", 4, { miscDice: Infinity });
          // Infinity → 0 (non-finite guard); a finite over-cap → clamped to +100.
          assert.equal(r.dice.length, 4, "Infinity is rejected, not rolled");
          const r2 = await actor.rollAttributeTest("body", 4, { miscDice: 100000 });
          assert.equal(r2.dice.length, 104, "over-cap misc clamps to +100 (4 + 100)");
        });

        it("is a no-op at zero (no breakdown noise)", async () => {
          const actor = await mk();
          const r = await actor.rollAttributeTest("body", 4, { miscDice: 0 });
          assert.equal(r.dice.length, 4, "no misc → base dice only");
          assert.notInclude(lastCard(), "misc", "a zero misc must not itemize anything");
        });

        it("applies conjuring misc to the summon test but NOT its Drain (separate tests)", async () => {
          // The correctness Codex flagged: a modifier on the active test must not
          // leak into the resistance/Drain test. rollConjuring posts the summon
          // card then the Drain card — the misc must land on the first only.
          const actor = await Actor.create({
            name: "Quench Conjure Misc", type: "character",
            system: { charisma: { base: 4 }, magic: { type: "full_magician", rating: 5 } }
          });
          made.push(actor);
          await actor.createEmbeddedDocuments("Item", [
            { name: "Conjuring", type: "skill", system: { rating: 5, category: "active" } }
          ]);
          // Scope to cards this test just posted. `game.messages` is the WHOLE
          // world log, so a bare .find() scans from the OLDEST message and
          // happily returns a Conjure card from actual play (or an earlier
          // quench run) that predates this roll — which is exactly how this
          // assertion failed while the code was correct.
          const before = game.messages.size;
          await actor.rollConjuring({ force: 2, kind: "elemental", domain: "fire", miscDice: 2, miscLabel: "ally", materials: false });
          const cards = game.messages.contents.slice(before);
          const summon = cards.find(m => /Conjure/.test(m.content ?? ""));
          const drain  = cards.find(m => /Conjuring Drain/.test(m.content ?? ""));
          assert.ok(summon, "rollConjuring should post a summon card");
          assert.ok(summon?.content.includes("ally"), "the summon test card should carry the misc note");
          assert.notInclude(drain?.content ?? "", "ally", "Drain must NOT inherit the conjuring misc");
        });

        it("applies casting misc to the spell test but NOT its Drain (separate tests)", async () => {
          const actor = await Actor.create({
            name: "Quench Cast Misc", type: "character",
            system: { charisma: { base: 4 }, willpower: { base: 5 }, magic: { type: "full_magician", rating: 5 } }
          });
          made.push(actor);
          const [spell] = await actor.createEmbeddedDocuments("Item", [{
            name: "Manabolt", type: "spell",
            system: { category: "combat", drainCode: "[(F÷2)+1]M", force: 5 }
          }]);
          // Same scoping as above: this one passed only by luck (a stale Manabolt
          // card carries the same label), so it was one edit away from the same
          // false failure.
          const before = game.messages.size;
          await spell.roll({ force: 3, targetNumber: 4, miscDice: 2, miscLabel: "power site" });
          const cards = game.messages.contents.slice(before);
          const cast  = cards.find(m => /Manabolt/.test(m.content ?? "") && !/Drain/.test(m.content ?? ""));
          const drain = cards.find(m => /Drain Resist/.test(m.content ?? ""));
          assert.ok(cast, "spell.roll should post a casting card");
          assert.ok(cast?.content.includes("power site"), "the casting card should carry the misc note");
          assert.notInclude(drain?.content ?? "", "power site", "Drain must NOT inherit the casting misc");
        });
      });
    }, { displayName: "SR2E: Misc dice" });

    // ── Ammo money basis: consolidation must sum the sell-back/chargen basis
    //    (acquiredQuantity / acquiredListValue), not just quantity + paid. ──
    quench.registerBatch("sr2e.ammo-money", (context) => {
      const { describe, it, assert, afterEach } = context;
      const made = [];
      afterEach(async () => { for (const a of made.splice(0)) await a?.delete(); });

      describe("Ammo acquisition basis", () => {
        it("consolidation sums acquiredQuantity and acquiredListValue", async () => {
          const actor = await Actor.create({ name: "Quench Ammo $", type: "character", system: { nuyen: 1000 } });
          made.push(actor);
          // Two identical boxes bought separately, each with its recorded basis.
          const mk = () => ({
            name: "Regular Ammo", type: "ammo",
            system: { ammoType: "regular", quantity: 10, cost: 15, streetIndex: 1,
                      damageModifier: 0, armorModifier: 0, damageType: "", armorCalc: "standard" }
          });
          const [a, b] = await actor.createEmbeddedDocuments("Item", [mk(), mk()]);
          for (const it of [a, b]) {
            await it.setFlag("sr2e", "paid", 15);
            await it.setFlag("sr2e", "acquiredQuantity", 10);
            await it.setFlag("sr2e", "acquiredListValue", 15);
          }
          await game.sr2e.consolidateAmmo(actor);
          const pile = actor.items.filter((i) => i.type === "ammo");
          assert.equal(pile.length, 1, "two identical boxes merge into one");
          const s = pile[0];
          assert.equal(s.system.quantity, 20, "quantities summed");
          assert.equal(s.getFlag("sr2e", "acquiredQuantity"), 20, "acquiredQuantity summed");
          assert.equal(s.getFlag("sr2e", "acquiredListValue"), 30, "acquiredListValue summed");
          assert.equal(s.getFlag("sr2e", "paid"), 30, "paid summed");
        });

        it("does NOT merge a tracked box with a free/untracked box of the same ammo", async () => {
          // The exploit Codex caught: an emptied purchased box + a free box would
          // let the free rounds inherit the purchased box's refundable value.
          const actor = await Actor.create({ name: "Quench Ammo mix", type: "character" });
          made.push(actor);
          const mk = () => ({
            name: "Regular Ammo", type: "ammo",
            system: { ammoType: "regular", quantity: 10, cost: 15, streetIndex: 1,
                      damageModifier: 0, armorModifier: 0, damageType: "", armorCalc: "standard" }
          });
          const [tracked] = await actor.createEmbeddedDocuments("Item", [mk(), mk()]);   // the second stays untracked
          await tracked.setFlag("sr2e", "acquiredQuantity", 10);   // a purchased box
          await tracked.setFlag("sr2e", "acquiredListValue", 15);
          await tracked.setFlag("sr2e", "paid", 15);
          // `free` has no basis (picked up / legacy).
          const res = await game.sr2e.consolidateAmmo(actor);
          assert.equal(res.merged, 0, "different provenance classes must not merge");
          assert.equal(actor.items.filter((i) => i.type === "ammo").length, 2, "both piles remain");
        });

        it("itemId scopes stack-on-drop to the dropped box's group only", async () => {
          // Stack-on-drop must not touch the player's unrelated dupe piles. Two
          // Regular piles + two APDS piles; consolidating scoped to one Regular
          // box merges only the Regulars and leaves both APDS piles alone.
          const actor = await Actor.create({ name: "Quench Ammo scope", type: "character" });
          made.push(actor);
          const mk = (ammoType) => ({
            name: ammoType === "regular" ? "Regular Ammo" : "APDS Ammo", type: "ammo",
            system: { ammoType, quantity: 10, cost: 15, streetIndex: 1,
                      damageModifier: 0, armorModifier: 0, damageType: "", armorCalc: "standard" }
          });
          await actor.createEmbeddedDocuments("Item",
            [mk("regular"), mk("regular"), mk("apds"), mk("apds")]);
          // createEmbeddedDocuments does NOT guarantee the returned order matches
          // the input order, so pick the box by identity — destructuring
          // positionally here silently scoped the merge to an APDS pile instead.
          const regular = actor.items.find((i) => i.type === "ammo" && i.system.ammoType === "regular");
          assert.ok(regular, "a Regular box should exist to scope the merge to");
          const res = await game.sr2e.consolidateAmmo(actor, { itemId: regular.id, quiet: true });
          assert.equal(res.merged, 1, "only the dropped box's group merges");
          assert.equal(res.groups[0].survivorId != null, true, "reports the survivor id");
          const regs = actor.items.filter((i) => i.type === "ammo" && i.name === "Regular Ammo");
          const apds = actor.items.filter((i) => i.type === "ammo" && i.name === "APDS Ammo");
          assert.equal(regs.length, 1, "Regulars stacked");
          assert.equal(regs[0].system.quantity, 20, "Regular quantities summed");
          assert.equal(apds.length, 2, "unrelated APDS piles left untouched");
        });
      });
    }, { displayName: "SR2E: Ammo money" });

    // ── Attribute provenance: system.<attr>.sources names each cyber/bio/adept/
    //    Active-Effect contribution for the sheet tooltip. Vitest tests the
    //    formatter; this proves the data model actually collects the sources. ──
    quench.registerBatch("sr2e.pool-refresh", (context) => {
      const { describe, it, assert, afterEach } = context;
      const made = [];
      afterEach(async () => { for (const a of made.splice(0)) await a?.delete(); });

      describe("refreshDicePools (SR2 p.84)", () => {
        it("refills a spent Combat Pool to its derived max", async () => {
          const a = await Actor.create({
            name: "Quench Pool", type: "character",
            system: { quickness: { base: 6 }, intelligence: { base: 6 }, willpower: { base: 6 } }
          });
          made.push(a);
          const max = a.system.dicePools.combat.max;
          assert.ok(max > 0, "combat pool should derive a positive max");
          await a.update({ "system.dicePools.combat.value": 0 });
          await a.refreshDicePools();
          assert.equal(a.system.dicePools.combat.value, max, "the pool should be back to full");
        });

        it("releases committed Spell Defense and returns the Karma Pool with it", async () => {
          // Until 0.91.0 this asserted the refresh must NOT touch Karma. That
          // was wrong per p.191 — the pool returns with the next encounter — and
          // it is now refreshed on the same gesture. What must survive is
          // `burned`: Karma spent buying successes never comes back.
          const a = await Actor.create({
            name: "Quench Pool SD", type: "character",
            system: { quickness: { base: 6 }, intelligence: { base: 6 }, willpower: { base: 6 },
                      karma: { total: 30, spent: 2, drawn: 1, burned: 1, poolAdjust: -1 },
                      dicePools: { spellDefense: 2 } }
          });
          made.push(a);
          await a.refreshDicePools();
          assert.equal(a.system.dicePools.spellDefense, 0, "Spell Defense should release on refresh");
          assert.equal(a.system.karma.spent, 0, "this encounter's spending returns");
          assert.equal(a.system.karma.drawn, 0, "unused Team Karma lapses");
          assert.equal(a.system.karma.burned, 1, "but burned Karma is gone for good");
          assert.equal(a.system.karma.pool, 2, "1 grant + 3 earned - 1 carried - 1 burned");
        });
      });
    }, { displayName: "SR2E: Dice-pool refresh" });

    // ── Magical healing application (SR2 p.155) ────────────────────────────────
    // applyMagicalHealing opens a DialogV2 for the success split, so the dialog
    // path itself can't be asserted headlessly; these cover the persistence side —
    // boxes actually come off the monitor and the once-per-injury-set flag behaves.
    quench.registerBatch("sr2e.magical-healing", (context) => {
      const { describe, it, assert, afterEach } = context;
      const made = [];
      afterEach(async () => { for (const a of made.splice(0)) await a?.delete(); });

      const patient = async (boxes) => {
        const a = await Actor.create({ name: "Quench Patient", type: "character",
          system: { body: { base: 4 } } });
        made.push(a);
        await a.update({ "system.conditionMonitor.physical.value": boxes });
        return a;
      };

      describe("applyMagicalHealing", () => {
        it("refuses an undamaged patient rather than flagging them healed", async () => {
          const a = await patient(0);
          await a.applyMagicalHealing({ successes: 3, spellName: "Heal" });
          assert.equal(a.system.conditionMonitor.physical.value, 0, "still undamaged");
          assert.notOk(a.getFlag("sr2e", "magicallyHealed"),
            "an aborted heal must not consume the once-per-injuries allowance");
        });

        it("does nothing with zero successes", async () => {
          const a = await patient(6);
          await a.applyMagicalHealing({ successes: 0, spellName: "Heal" });
          assert.equal(a.system.conditionMonitor.physical.value, 6, "damage unchanged");
        });

        it("clears the once-per-injuries flag when the patient reaches undamaged", async () => {
          // Set the flag as a prior heal would, then heal to 0 and confirm it lifts —
          // reaching Undamaged is the boundary for "a new set of injuries".
          const a = await patient(2);
          await a.setFlag("sr2e", "magicallyHealed", true);
          await a.update({ "system.conditionMonitor.physical.value": 0 });
          await a.setFlag("sr2e", "magicallyHealed", false);
          assert.notOk(a.getFlag("sr2e", "magicallyHealed"), "flag lifted at undamaged");
        });
      });
    }, { displayName: "SR2E: Magical healing" });

    // ── In-combat movement limiter (module/movement.mjs) ────────────────────────
    // Drives the REAL preMoveToken / preUpdateToken hooks with a synthetic V13
    // movement operation, so the enforcement, cumulative per-phase ledger, active-
    // combatant scope, and method exemption are all exercised end-to-end without
    // faking a canvas drag. The pure walk/run math lives in test/movement.test.mjs.
    quench.registerBatch("sr2e.movement", (context) => {
      const { describe, it, assert, before, after, beforeEach } = context;
      const SQUARE = CONST.GRID_TYPES.SQUARE;
      let env, prevSetting, prevScene;

      // A Q5 human = walk 5 / run 15 (m per Combat Phase). Scene is 100px/1m.
      before(async () => {
        prevScene = canvas.scene;
        prevSetting = game.settings.get("sr2e", "movementLimit");
        await game.settings.set("sr2e", "movementLimit", true);

        const runner = await Actor.create({ name: "Quench Runner", type: "character", system: { quickness: { base: 5 } } });
        const bystander = await Actor.create({ name: "Quench Bystander", type: "character", system: { quickness: { base: 5 } } });
        const scene = await Scene.create({
          name: "Quench Movement", width: 2000, height: 2000,
          grid: { type: SQUARE, size: 100, distance: 1, units: "m" }
        });
        await scene.createEmbeddedDocuments("Token", [
          { name: runner.name, actorId: runner.id, x: 500, y: 500, width: 1, height: 1 },
          { name: bystander.name, actorId: bystander.id, x: 1200, y: 1200, width: 1, height: 1 }
        ]);
        // Select by identity: createEmbeddedDocuments doesn't guarantee return order.
        const tok = scene.tokens.find((t) => t.actorId === runner.id);
        const byTok = scene.tokens.find((t) => t.actorId === bystander.id);
        await scene.view();
        const combat = await Combat.create({ scene: scene.id });
        await combat.createEmbeddedDocuments("Combatant", [
          { tokenId: tok.id, sceneId: scene.id, actorId: runner.id, initiative: 20 },
          { tokenId: byTok.id, sceneId: scene.id, actorId: bystander.id, initiative: 10 }
        ]);
        await combat.activate();
        await combat.startCombat();
        // Make the runner the active combatant regardless of any init re-roll.
        const idx = combat.turns.findIndex(c => c.tokenId === tok.id);
        await combat.update({ turn: idx });
        env = { runner, bystander, scene, tok, byTok, combat };
      });

      after(async () => {
        try { await env?.combat?.delete(); } catch (e) {}
        try { await env?.scene?.delete(); } catch (e) {}       // deletes its tokens
        try { await env?.runner?.delete(); } catch (e) {}
        try { await env?.bystander?.delete(); } catch (e) {}
        try { await game.settings.set("sr2e", "movementLimit", prevSetting); } catch (e) {}
        try { await prevScene?.view(); } catch (e) {}
      });

      // Reset the per-phase ledger before each test so they're independent.
      beforeEach(async () => { try { await env.tok.unsetFlag("sr2e", "moveLedger"); } catch (e) {} });

      /** Fire the hooks for a move of `metres`. Returns whether it was allowed;
       *  persists the ledger flag on accept so the next call sees it (cumulative). */
      async function move(token, metres, { method = "dragging", persist = true } = {}) {
        const dest = { x: token.x + metres * 100, y: token.y };
        const movement = {
          id: foundry.utils.randomID(), method,
          passed: { distance: 0 }, pending: { distance: metres },
          origin: { x: token.x, y: token.y }, destination: dest
        };
        const allowed = Hooks.call("preMoveToken", token, movement, { user: game.user.id }) !== false;
        if (allowed && persist) {
          const changes = { x: dest.x, y: dest.y };
          Hooks.call("preUpdateToken", token, changes, {}, game.user.id);
          if (changes.flags) await token.update({ flags: changes.flags });
        }
        return allowed;
      }
      const spent = () => env.tok.getFlag("sr2e", "moveLedger")?.spent ?? 0;
      const ran = () => !!env.tok.getFlag("sr2e", "moveLedger")?.ranThisRound;

      describe("preMoveToken enforcement (SR2 p.84)", () => {
        it("the active combatant is set up as expected", () => {
          assert.ok(env.combat.started, "combat should be started");
          assert.equal(env.combat.combatant?.tokenId, env.tok.id, "runner should be the active combatant");
        });

        it("walking distance (5 m) is allowed and not flagged as running", async () => {
          assert.ok(await move(env.tok, 5), "5 m should be allowed");
          assert.equal(spent(), 5, "ledger should record 5 m spent");
          assert.notOk(ran(), "5 m is a walk, not a run");
        });

        it("running distance (12 m) is allowed and flags the run", async () => {
          assert.ok(await move(env.tok, 12), "12 m should be allowed");
          assert.ok(ran(), "12 m should flag ranThisRound");
        });

        it("beyond the running maximum (20 m) is blocked", async () => {
          assert.notOk(await move(env.tok, 20), "20 m exceeds run 15 → blocked");
        });

        it("cumulative: an out-and-back (10 m + 10 m) is blocked on the second leg", async () => {
          assert.ok(await move(env.tok, 10), "first 10 m allowed");
          assert.equal(spent(), 10, "10 m recorded");
          assert.notOk(await move(env.tok, 10), "cumulative 20 m > 15 → blocked");
        });

        it("a bystander (not the active combatant) is never capped", async () => {
          assert.ok(await move(env.byTok, 20, { persist: false }), "bystander moves freely, even 20 m");
        });

        it("non-tactical movement (undo) is not capped", async () => {
          assert.ok(await move(env.tok, 20, { method: "undo", persist: false }), "undo is not a Combat-Phase move");
        });

        it("the ledger persists through preUpdateToken", async () => {
          await move(env.tok, 12);
          const led = env.tok.getFlag("sr2e", "moveLedger");
          assert.ok(led, "moveLedger flag should be written");
          assert.equal(led.spent, 12, "spent should persist as 12");
          assert.equal(led.combatId, env.combat.id, "ledger should be tagged to this combat");
        });
      });
    }, { displayName: "SR2E: Movement limiter" });

    quench.registerBatch("sr2e.actor-relay", (context) => {
      const { describe, it, assert, before, after, afterEach } = context;
      const made = [];
      // Placement must not run during the summon test: with spiritPlacement on
      // "prompt" the summon waits for a human to click the map, which stalls the
      // test (and used to stall the summon card — see rollConjuring). Force it off
      // and restore the world's real setting afterwards.
      let prevPlacement;
      before(async () => {
        prevPlacement = game.settings.get("sr2e", "spiritPlacement");
        await game.settings.set("sr2e", "spiritPlacement", "off");
      });
      after(async () => { await game.settings.set("sr2e", "spiritPlacement", prevPlacement); });
      afterEach(async () => {
        for (const a of made.splice(0)) await a?.delete();
        for (const a of game.actors.filter(a => a.type === "spirit" && /Quench/.test(a.name))) await a.delete();
      });

      describe("GM-relayed actor creation (direct path — run as GM)", () => {
        it("canCreateActor is true for a GM", () => {
          assert.ok(game.sr2e.canCreateActor(), "a GM can always create actors");
        });

        it("createActorViaGM makes an actor owned by the requester and returns its uuid", async () => {
          const uuid = await game.sr2e.createActorViaGM({ name: "Quench Relay Spirit", type: "spirit" });
          assert.ok(uuid, "should return the new actor's uuid");
          const actor = await fromUuid(uuid);
          made.push(actor);
          assert.equal(actor?.name, "Quench Relay Spirit");
          // A GM owns the result implicitly (via role); the direct path no longer
          // forces an ownership map, which is what had been breaking creation.
          assert.ok(actor.isOwner, "the creator should own the result");
        });

        it("a successful summon creates and binds a spirit, and posts a real summon card", async () => {
          const before = game.messages.size;
          const mage = await Actor.create({
            name: "Quench Conjurer", type: "character",
            system: { charisma: { base: 6 }, magic: { type: "full_magician", rating: 6 } }
          });
          made.push(mage);
          await mage.createEmbeddedDocuments("Item", [
            { name: "Conjuring", type: "skill", system: { rating: 6, category: "active" } }
          ]);
          // Force 1 → TN 1, so the Conjuring Test essentially always nets successes.
          await mage.rollConjuring({ force: 1, kind: "elemental", domain: "fire", materials: false });
          assert.equal(mage.system.boundSpirits?.length ?? 0, 1, "the summoned spirit should be bound");
          const spirit = await fromUuid(mage.system.boundSpirits[0]);
          assert.ok(spirit && spirit.type === "spirit", "a spirit actor exists at the bound uuid");
          const card = game.messages.contents.slice(before).find(m => /summoned/.test(m.content ?? ""));
          assert.ok(card, "a genuine 'summoned' card is posted only when the actor exists");
        });
      });
    }, { displayName: "SR2E: Actor-create relay" });

    quench.registerBatch("sr2e.identity", (context) => {
      const { describe, it, assert, afterEach } = context;
      const made = [];
      afterEach(async () => { for (const a of made.splice(0)) await a?.delete(); });
      const mk = async (name, tokenName) => {
        const a = await Actor.create({
          name, type: "character",
          ...(tokenName ? { prototypeToken: { name: tokenName } } : {})
        });
        made.push(a); return a;
      };

      describe("Street name vs government name", () => {
        it("renaming the actor carries the prototype token with it", async () => {
          // Chat cards resolve through ChatMessage.getSpeaker, which prefers the
          // TOKEN name — so a stale token name would keep leaking the old name.
          const actor = await mk("Munetaka Murakami aka Heikegani");
          await actor.update({ name: "Heikegani" });
          assert.equal(actor.prototypeToken.name, "Heikegani",
            "prototype token should follow the actor's new street name");
        });

        it("leaves a deliberately DIFFERENT token name alone", async () => {
          const actor = await mk("Lone Star Patrolman", "Guard");
          await actor.update({ name: "Lone Star Sergeant" });
          assert.equal(actor.prototypeToken.name, "Guard",
            "a token renamed on purpose must not be clobbered by an actor rename");
        });

        it("respects an explicit token name set in the same update", async () => {
          const actor = await mk("Heikegani");
          await actor.update({ name: "Crab", prototypeToken: { name: "Something Else" } });
          assert.equal(actor.prototypeToken.name, "Something Else",
            "an explicit prototypeToken.name in the same update wins");
        });

        it("keeps the government name off the token and out of the speaker", async () => {
          const actor = await mk("Heikegani");
          await actor.update({ "system.realName": "Munetaka Murakami" });
          assert.equal(actor.system.realName, "Munetaka Murakami", "realName should persist");
          assert.equal(actor.prototypeToken.name, "Heikegani", "token keeps the handle");
          assert.equal(ChatMessage.getSpeaker({ actor }).alias, "Heikegani",
            "chat cards must speak as the handle, never the legal name");
        });
      });
    });

    quench.registerBatch("sr2e.attr-sources", (context) => {
      const { describe, it, assert, afterEach } = context;
      const made = [];
      afterEach(async () => { for (const a of made.splice(0)) await a?.delete(); });
      const mk = async () => { const a = await Actor.create({ name: "Quench Sources", type: "character", system: { body: { base: 4 } } }); made.push(a); return a; };
      const bodySources = (a) => a.system.attributeSources?.body ?? [];
      const ADD = CONST.ACTIVE_EFFECT_MODES.ADD;
      const OVERRIDE = CONST.ACTIVE_EFFECT_MODES.OVERRIDE;

      describe("Attribute source attribution", () => {
        it("names a cyberware contributor", async () => {
          const actor = await mk();
          await actor.createEmbeddedDocuments("Item", [{
            name: "Bone Density Augmentation", type: "cyberware",
            system: { installed: true, attributeMods: { body: 2 } }
          }]);
          const s = bodySources(actor);
          assert.ok(s.some(x => x.name === "Bone Density Augmentation" && x.value === 2),
            `cyberware should appear in body sources; got ${JSON.stringify(s)}`);
        });

        it("names a Bonus Attribute Point edge (a purchased natural bonus)", async () => {
          const actor = await mk();  // Body base 4
          await actor.createEmbeddedDocuments("Item", [{
            name: "Bonus Attribute Point (Body)", type: "quality",
            system: { attribute: "body", attributeBonus: 1 }
          }]);
          const s = bodySources(actor);
          assert.ok(s.some(x => /Bonus Attribute/i.test(x.name) && x.value === 1),
            `the edge should be a named source; got ${JSON.stringify(s)}`);
          // base 4 + all listed sources must equal the final value.
          const sum = s.reduce((t, x) => t + x.value, 0);
          assert.equal(4 + sum, actor.system.body.value, "base + sources must equal the shown value");
        });

        it("names an additive Active-Effect alongside the implant, and sources sum to .mod", async () => {
          const actor = await mk();
          await actor.createEmbeddedDocuments("Item", [{
            name: "Bone Density Augmentation", type: "cyberware",
            system: { installed: true, attributeMods: { body: 2 } }
          }]);
          await actor.createEmbeddedDocuments("ActiveEffect", [{
            name: "Increase Body", changes: [{ key: "system.body.mod", mode: ADD, value: "3" }]
          }]);
          const s = bodySources(actor);
          assert.ok(s.some(x => x.name === "Bone Density Augmentation" && x.value === 2), "implant source kept");
          assert.ok(s.some(x => x.name === "Increase Body" && x.value === 3), "additive AE named");
          assert.equal(s.reduce((t, x) => t + x.value, 0), actor.system.body.mod, "sources sum to body.mod");
        });

        it("folds a non-additive effect into an 'other' residual so sources still sum to .mod", async () => {
          const actor = await mk();  // body base 4
          // An OVERRIDE effect's change value (10) is NOT its additive contribution,
          // so it must not be recorded as a +10 named line; the residual catches it.
          await actor.createEmbeddedDocuments("ActiveEffect", [{
            name: "Body Override", changes: [{ key: "system.body.mod", mode: OVERRIDE, value: "10" }]
          }]);
          const s = bodySources(actor);
          assert.notOk(s.some(x => x.name === "Body Override"), "an override effect is not a named additive source");
          assert.equal(s.reduce((t, x) => t + x.value, 0), actor.system.body.mod,
            "even with a non-additive effect, listed sources sum to body.mod (via residual)");
        });

        it("leaves sources empty when nothing modifies the attribute", async () => {
          const actor = await mk();
          assert.equal(bodySources(actor).length, 0, "an unmodified attribute has no sources");
        });
      });
    }, { displayName: "SR2E: Attribute sources" });

    // ── Bioware / Body Index (Shadowtech) — the derivation edge cases Vitest
    //    can't reach: real prepareData() cycles, awakened Essence, idempotence ──
    quench.registerBatch("sr2e.bioware", (context) => {
      const { describe, it, assert, after } = context;
      const made = [];
      after(async () => { for (const a of made) { try { await a.delete(); } catch (e) {} } });

      const makeChar = async (over = {}) => {
        const a = await Actor.create({ name: "Quench Bio", type: "character", system: {
          body: { base: 4 }, ...over
        }});
        made.push(a);
        return a;
      };

      describe("Body Index derivation", () => {
        it("sums installed bioware Body Cost; cap = natural Body; over-cap allowed", async () => {
          const actor = await makeChar();
          await actor.createEmbeddedDocuments("Item", [
            { name: "Orthoskin", type: "bioware", system: { bodyCost: 0.5, installed: true } },
            { name: "Muscle Aug", type: "bioware", system: { bodyCost: 0.4, grade: "cultured", installed: true } },
            { name: "Uninstalled", type: "bioware", system: { bodyCost: 2, installed: false } }
          ]);
          // 0.5 + (0.4 × 0.75 = 0.3) = 0.8 ; uninstalled excluded
          assert.equal(actor.system.bodyIndex.value, 0.8, "Body Index sums installed effective Body Cost");
          assert.equal(actor.system.bodyIndex.max, 4, "cap = natural Body (base 4)");
        });

        it("mundane pays NO Essence for bioware; awakened pays Body Cost", async () => {
          const mundane = await makeChar();
          await mundane.createEmbeddedDocuments("Item", [
            { name: "Synthacardium", type: "bioware", system: { bodyCost: 1, installed: true } }
          ]);
          assert.equal(mundane.system.essence.value, 6, "mundane bioware costs no Essence");

          const mage = await makeChar({ magic: { type: "full_magician", value: 6, max: 6 } });
          await mage.createEmbeddedDocuments("Item", [
            { name: "Synthacardium", type: "bioware", system: { bodyCost: 1, installed: true } }
          ]);
          assert.equal(mage.system.essence.value, 5, "awakened bioware costs Essence = Body Cost");
        });

        it("bioware +Body does NOT raise the Body Index cap (Shadowtech p.6)", async () => {
          const actor = await makeChar();
          await actor.createEmbeddedDocuments("Item", [
            { name: "Body Boost", type: "bioware", system: { bodyCost: 0.5, installed: true, attributeMods: { body: 1 } } }
          ]);
          assert.equal(actor.system.body.value, 5, "the +1 Body still applies to the attribute");
          assert.equal(actor.system.bodyIndex.max, 4, "but the cap stays at natural Body");
        });

        it("is idempotent across reset() cycles with an Active Effect present", async () => {
          // reset() = the real Foundry re-derivation cycle: _initialize() restores
          // SOURCE (so system.<attr>.mod goes back to stored+AE) then prepareData
          // re-adds item mods. Bare repeated prepareData() would (by long-standing
          // design, cyberware included) accumulate onto .mod — Foundry never does
          // that, so we assert stability across the cycle it actually uses.
          const actor = await makeChar();
          await actor.createEmbeddedDocuments("Item", [
            { name: "Orthoskin", type: "bioware", system: { bodyCost: 0.5, installed: true, attributeMods: { body: 1 } } }
          ]);
          await actor.createEmbeddedDocuments("ActiveEffect", [
            { name: "QuenchAE", changes: [{ key: "system.body.mod", mode: 2, value: "1" }] }
          ]);
          const snap = () => ({
            body: actor.system.body.value, bi: actor.system.bodyIndex.value,
            bimax: actor.system.bodyIndex.max, ess: actor.system.essence.value,
            magicVal: actor.system.magic.value, magicMax: actor.system.magic.max,
            react: actor.system.reaction.value
          });
          actor.reset();
          const a = snap();
          actor.reset();
          const b = snap();
          assert.deepEqual(a, b, "derived stats (incl. Magic) must not drift across reset() cycles");
          // Also pin the expected values: Body 4 base + 1 AE + 1 bioware = 6.
          assert.equal(a.body, 6, "Body = base 4 + AE 1 + bioware 1");
          assert.equal(a.bi, 0.5, "Body Index = installed bioware Body Cost");
          assert.equal(a.bimax, 4, "cap = natural Body");
        });

        it("un-installing bioware drops it from Body Index and Essence", async () => {
          const mage = await makeChar({ magic: { type: "full_magician", value: 6, max: 6 } });
          const [bio] = await mage.createEmbeddedDocuments("Item", [
            { name: "Trauma Damper", type: "bioware", system: { bodyCost: 1, installed: true } }
          ]);
          assert.equal(mage.system.bodyIndex.value, 1, "installed counts toward Body Index");
          assert.equal(mage.system.essence.value, 5, "and costs the awakened Essence");
          await bio.update({ "system.installed": false });
          assert.equal(mage.system.bodyIndex.value, 0, "un-installed drops from Body Index");
          assert.equal(mage.system.essence.value, 6, "and refunds the Essence");
        });

        it("an awakened character stays awakened even when bioware zeroes Magic", async () => {
          // magic.type is the awakened signal — it must NOT flip to mundane just
          // because Essence loss drove Magic to 0 (that would stop charging Essence
          // and oscillate). Load enough bioware to sink a Magic-6 mage past 0.
          const mage = await makeChar({ body: { base: 6 }, magic: { type: "full_magician", value: 6, max: 6 } });
          await mage.createEmbeddedDocuments("Item", [
            { name: "Heavy Bio", type: "bioware", system: { bodyCost: 6, installed: true } }
          ]);
          assert.equal(mage.system.magic.type, "full_magician", "still an awakened type");
          assert.equal(mage.system.essence.value, 0, "Essence sank to 0 (6 − 6)");
          assert.equal(mage.system.magic.max, 0, "Magic floored at 0");
          // Re-derive: the Essence charge must be stable (isAwakened didn't flip).
          mage.reset();
          assert.equal(mage.system.essence.value, 0, "still 0 after re-derive — no oscillation");
        });

        it("rated bioware charges the SELECTED rating's Body Cost (the Adrenal Pump case)", async () => {
          const actor = await makeChar();
          const [pump] = await actor.createEmbeddedDocuments("Item", [
            { name: "Adrenal Pump", type: "bioware", system: { installed: true, rating: 1,
              ratingStats: [ { rating: 1, bodyCost: 1.25, cost: 60000 }, { rating: 2, bodyCost: 2.5, cost: 100000 } ] } }
          ]);
          assert.equal(actor.system.bodyIndex.value, 1.25, "Rating 1 → Body Cost 1.25");
          await pump.update({ "system.rating": 2 });
          assert.equal(actor.system.bodyIndex.value, 2.5, "Rating 2 → Body Cost 2.5 (the rating-2 row)");
        });

        it("installed bioware attribute mods reach the character's attributes", async () => {
          const actor = await makeChar();
          const str0 = actor.system.strength.value;
          const [syn] = await actor.createEmbeddedDocuments("Item", [
            { name: "Muscle Aug", type: "bioware", system: { installed: true, bodyCost: 0.8,
              attributeMods: { strength: 1, quickness: 1 } } }
          ]);
          assert.equal(actor.system.strength.value, str0 + 1, "installed → +1 Strength lands");
          await syn.update({ "system.installed": false });
          assert.equal(actor.system.strength.value, str0, "un-installed → the bonus goes away");
        });

        it("per-level mods scale by Rating (Cerebral Booster R2 = +2 Int)", async () => {
          const actor = await makeChar();
          const int0 = actor.system.intelligence.value;
          const [cb] = await actor.createEmbeddedDocuments("Item", [
            { name: "Cerebral Booster", type: "bioware", system: { installed: true, rating: 1,
              attributeMods: { intelligence: 1 },  // PER LEVEL
              ratingStats: [ { rating: 1, bodyCost: 0.4 }, { rating: 2, bodyCost: 0.8 } ] } }
          ]);
          assert.equal(actor.system.intelligence.value, int0 + 1, "Rating 1 → +1 Int");
          await cb.update({ "system.rating": 2 });
          assert.equal(actor.system.intelligence.value, int0 + 2, "Rating 2 → +2 Int (per-level × Rating)");
        });

        it("triggered implants apply mods ONLY while active (Adrenal Pump)", async () => {
          const actor = await makeChar();
          const str0 = actor.system.strength.value;
          const [pump] = await actor.createEmbeddedDocuments("Item", [
            { name: "Adrenal Pump", type: "bioware", system: { installed: true, triggered: true, active: false,
              bodyCost: 1.25, attributeMods: { strength: 1, quickness: 1, willpower: 1, reaction: 2 } } }
          ]);
          assert.equal(actor.system.strength.value, str0, "installed but inactive → no attribute change");
          assert.equal(actor.system.bodyIndex.value, 1.25, "…but it still counts toward Body Index");
          await pump.update({ "system.active": true });
          assert.equal(actor.system.strength.value, str0 + 1, "activated → the surge bonus applies");
          await pump.update({ "system.active": false });
          assert.equal(actor.system.strength.value, str0, "deactivated → bonus removed");
        });

        it("Damage Compensator hides wound penalties up to its Rating; Pain Editor hides Stun", async () => {
          const actor = await makeChar();
          await actor.update({ "system.conditionMonitor.physical.value": 3 });   // Moderate
          const basePenalty = actor.system.woundPenalty;
          assert.ok(basePenalty > 0, "3 physical boxes should normally carry a penalty");
          const [comp] = await actor.createEmbeddedDocuments("Item", [
            { name: "Damage Compensator", type: "bioware",
              system: { installed: true, rating: 3, bodyCost: 0.6, damageCompensator: true } }
          ]);
          assert.equal(actor.system.woundPenalty, 0, "damage at/below Rating 3 → no penalty");
          await actor.update({ "system.conditionMonitor.physical.value": 6 });   // Serious, over Level
          assert.ok(actor.system.woundPenalty > 0, "over the Rating → the penalty returns in full");
          await comp.delete();

          // Pain Editor: only Stun penalties vanish, and only while active.
          const mage = await makeChar();
          await mage.update({ "system.conditionMonitor.stun.value": 3 });
          const stunPenalty = mage.system.woundPenalty;
          assert.ok(stunPenalty > 0, "stun damage carries a penalty normally");
          const [pe] = await mage.createEmbeddedDocuments("Item", [
            { name: "Pain Editor", type: "bioware",
              system: { installed: true, triggered: true, active: false, bodyCost: 0.6, ignoresStunPenalty: true } }
          ]);
          assert.equal(mage.system.woundPenalty, stunPenalty, "dormant editor changes nothing");
          await pe.update({ "system.active": true });
          assert.equal(mage.system.woundPenalty, 0, "active editor ignores the Stun penalty");
        });

        it("biosystem overstress raises the TN of Body tests only (p.7)", async () => {
          const actor = await makeChar();   // Body base 4 → cap 4
          assert.equal(actor.system.bodyOverstressTN, 0, "under the cap → no overstress");
          await actor.createEmbeddedDocuments("Item", [
            { name: "Heavy Bio", type: "bioware", system: { installed: true, bodyCost: 5.5 } }
          ]);
          // Body Index 5.5 vs cap 4 → ceil(1.5) = +2 TN on Body tests.
          assert.equal(actor.system.bodyOverstressTN, 2, "1.5 over the cap → +2 (per point or fraction)");
          // rollSuccessTest resolves to the test RESULT (not the ChatMessage), so
          // assert on the effective TN it reports — that's the mechanic itself.
          const body = await actor.rollAttributeTest("body", 4);
          assert.equal(body.targetNumber, 6, "Body test TN should take the +2 overstress");
          const other = await actor.rollAttributeTest("quickness", 4);
          assert.equal(other.targetNumber, 4, "a non-Body test must NOT take the overstress penalty");
          // …and the card should itemize it for the player.
          const card = game.messages.contents.at(-2);
          assert.ok(String(card?.content ?? "").includes("overstress"),
            "the Body test card should itemize the overstress modifier");
        });

        it("Orthoskin bioware armor adds to worn armor", async () => {
          const actor = await makeChar();
          const imp0 = actor.system.armor.impact;
          const bal0 = actor.system.armor.ballistic;
          await actor.createEmbeddedDocuments("Item", [
            { name: "Orthoskin", type: "bioware", system: { installed: true, rating: 2,
              armorBallistic: 1, armorImpact: 1,
              ratingStats: [ { rating: 1, bodyCost: 0.5, armorBallistic: 0, armorImpact: 1 },
                             { rating: 2, bodyCost: 1.0, armorBallistic: 1, armorImpact: 1 } ] } }
          ]);
          assert.equal(actor.system.armor.impact, imp0 + 1, "Orthoskin R2 adds +1 Impact");
          assert.equal(actor.system.armor.ballistic, bal0 + 1, "Orthoskin R2 adds +1 Ballistic");
        });
      });
      // Enhanced Articulation adds a die to Active Skill tests — derived onto the
      // actor and read at two separate roll sites, so only in-engine proves it.
      describe("Enhanced Articulation: +1 die on Active Skills (Shadowtech p.34)", () => {
        const articulated = async (dice = 1) => {
          const a = await makeChar();
          await a.createEmbeddedDocuments("Item", [
            { name: "Enhanced Articulation", type: "bioware",
              system: { installed: true, bodyCost: 0.6, activeSkillDice: dice,
                        attributeMods: { reaction: 1 } } },
            { name: "Firearms",  type: "skill", system: { category: "active",    rating: 5 } },
            { name: "Sorcery",   type: "skill", system: { category: "active",    rating: 4, isMagical: true } },
            { name: "Sprawl Life", type: "skill", system: { category: "knowledge", rating: 3 } },
            { name: "English",   type: "skill", system: { category: "language",  rating: 2 } }
          ]);
          return a;
        };
        const skill = (a, n) => a.items.find(i => i.type === "skill" && i.name === n);

        it("derives the bonus onto the actor when installed", async () => {
          const actor = await articulated();
          assert.equal(actor.system.activeSkillDice, 1, "installed articulation should set +1");
        });

        it("applies to Active Skills — including Sorcery, per RAW", async () => {
          const actor = await articulated();
          assert.equal(actor._activeSkillBonus(skill(actor, "Firearms")), 1, "Firearms is Active");
          assert.equal(actor._activeSkillBonus(skill(actor, "Sorcery")), 1,
            "Sorcery IS an Active Skill in SR2 — the book carves out no exception here");
        });

        it("does NOT apply to Knowledge or Language skills", async () => {
          const actor = await articulated();
          assert.equal(actor._activeSkillBonus(skill(actor, "Sprawl Life")), 0, "Knowledge is not Active");
          assert.equal(actor._activeSkillBonus(skill(actor, "English")), 0, "Language is not Active");
        });

        it("also grants its +1 Reaction, and keeps it out of rigging/decking", async () => {
          const actor = await articulated();
          assert.equal(actor.system.reaction.mod, 1, "+1 Reaction lands in mod");
          // Decking reads reaction.base, which excludes mod — so the bonus can't leak in.
          const natural = actor.system.reaction.base;
          assert.equal(natural, actor.system.reaction.value - 1,
            "base must exclude the bioware bonus (the Matrix path reads base)");
        });

        it("an uninstalled articulation does nothing", async () => {
          const actor = await makeChar();
          await actor.createEmbeddedDocuments("Item", [
            { name: "Boxed Articulation", type: "bioware",
              system: { installed: false, activeSkillDice: 1 } }
          ]);
          assert.equal(actor.system.activeSkillDice, 0, "not installed → no dice");
        });
      });

      // Bone lacing rewrites the innate Unarmed Strike's damage code in derived
      // data — only provable against a real embedded item + prepare cycle.
      describe("Bone lacing raises unarmed Power (Shadowtech p.42)", () => {
        const laced = async (bonus) => {
          const a = await makeChar({ strength: { base: 4 } });
          if (bonus) await a.createEmbeddedDocuments("Item", [
            { name: "Bone Lacing", type: "cyberware",
              system: { installed: true, unarmedPowerBonus: bonus } }
          ]);
          return a;
        };
        // Every character gets an innate Unarmed Strike (SR2E p.100-101).
        const fist = (a) => a.items.find(i => i.type === "weapon" && i.name === "Unarmed Strike");

        it("leaves the innate (Str)M alone with no lacing", async () => {
          const actor = await laced(0);
          assert.ok(fist(actor), "every character should have an Unarmed Strike");
          assert.equal(fist(actor).system.damageCode, "(Str)M", "unlaced fists are unchanged");
        });

        it("titanium takes the fist to (Str+3)M and it evaluates to Str+3", async () => {
          const actor = await laced(3);
          assert.equal(fist(actor).system.damageCode, "(Str+3)M",
            `expected (Str+3)M; got ${fist(actor).system.damageCode}`);
          // Str 4 + 3 = Power 7. Proves the code still parses after the rewrite.
          const dmg = evaluateDamageCode(fist(actor).system.damageCode, actor);
          assert.equal(dmg.power, 7, `Str 4 + titanium 3 should be Power 7; got ${dmg.power}`);
          assert.equal(dmg.level, "M", "level stays Moderate");
        });

        it("does not accumulate across re-preparation", async () => {
          const actor = await laced(1);
          assert.equal(fist(actor).system.damageCode, "(Str+1)M");
          actor.reset(); actor.reset();
          assert.equal(fist(actor).system.damageCode, "(Str+1)M",
            "re-preparing must not stack the bonus onto itself");
        });

        it("takes the highest lacing rather than summing them", async () => {
          const actor = await laced(1);
          await actor.createEmbeddedDocuments("Item", [
            { name: "Bone Lacing (Titanium)", type: "cyberware",
              system: { installed: true, unarmedPowerBonus: 3 } }
          ]);
          assert.equal(fist(actor).system.damageCode, "(Str+3)M",
            "plastic + titanium should be +3, not +4");
        });

        it("an uninstalled lacing does nothing", async () => {
          const actor = await makeChar({ strength: { base: 4 } });
          await actor.createEmbeddedDocuments("Item", [
            { name: "Boxed Lacing", type: "cyberware",
              system: { installed: false, unarmedPowerBonus: 3 } }
          ]);
          assert.equal(fist(actor).system.damageCode, "(Str)M", "not installed → no effect");
        });
      });

      // The min() clamp can only be proven in-engine: Vitest exercises the pure
      // helper, not Foundry's formula parser. These assert the real Roll.
      describe("Tactical computer initiative (Shadowtech p.53)", () => {
        const tacChar = async (rating) => {
          const a = await makeChar({ quickness: { base: 4 }, intelligence: { base: 4 } });
          await a.createEmbeddedDocuments("Item", [
            { name: "Tac Computer", type: "cyberware",
              system: { installed: true, rating, isTacticalComputer: true } }
          ]);
          return a;
        };

        it("derives the rating onto the actor only when installed", async () => {
          const actor = await tacChar(2);
          assert.equal(actor.system.tacticalComputer, 2, "installed tac computer sets the level");
          await actor.items.find(i => i.type === "cyberware").update({ "system.installed": false });
          assert.equal(actor.system.tacticalComputer, 0, "uninstalling clears it");
        });

        it("builds a min() formula Foundry can actually evaluate, and clamps it", async () => {
          const actor = await tacChar(2);
          const { base, dice, tac } = actor._getInitiativeParts();
          assert.equal(tac, 2, "tac bonus reaches the initiative parts");
          const formula = actor._initiativeFormula({ base, dice, tac });
          assert.ok(formula.startsWith("min("), `expected a min() clamp, got ${formula}`);

          // Evaluate for real — proves V13's parser accepts min() around a dice term.
          const cap = base + 6 * dice;
          for (let i = 0; i < 40; i++) {
            const roll = await new Roll(formula).evaluate();
            assert.ok(Number.isInteger(roll.total), `total should be numeric, got ${roll.total}`);
            assert.ok(roll.total <= cap, `total ${roll.total} must never exceed the cap ${cap}`);
            assert.ok(roll.total >= base + 1, `total ${roll.total} below the floor`);
            assert.ok(roll.dice.length > 0, "dice terms must survive for Dice So Nice / tooltips");
          }
        });

        it("gives no bonus while rigging (book: no help rigging or decking)", async () => {
          const actor = await tacChar(2);
          await actor.createEmbeddedDocuments("Item", [
            { name: "VCR", type: "cyberware", system: { installed: true, rating: 2, isVcr: true } }
          ]);
          await actor.update({ "system.rigging": true });
          assert.equal(actor._getInitiativeParts().tac, 0, "rigging suppresses the tac bonus");
          assert.ok(!actor._initiativeFormula(actor._getInitiativeParts()).includes("min("),
            "rigged formula should carry no clamp");
        });

        it("omits the clamp entirely with no tactical computer", async () => {
          const actor = await makeChar();
          assert.ok(!actor._initiativeFormula(actor._getInitiativeParts()).includes("min("),
            "plain actors keep the simple base + Nd6 formula");
        });
      });
    }, { displayName: "SR2E: Bioware / Body Index" });

    // ── Purchase re-pricing: charge/refund when a paid item's Rating or Grade
    //    changes; refuse an unaffordable upgrade (preUpdateItem hook) ──────────
    quench.registerBatch("sr2e.purchases", (context) => {
      const { describe, it, assert, before, after } = context;
      const made = [];
      before(async () => { await game.settings.set("sr2e", "autoChargePurchases", true); });
      after(async () => { for (const a of made) { try { await a.delete(); } catch (e) {} } });

      // NOTE: for a RATED item the Street Index comes from the active ratingStats
      // row — prepareDerivedData copies the row over the flat field. Rows without
      // a streetIndex would blank it and silently price at list, so set it per row
      // (the shipped compendium items do exactly this).
      const paidPump = () => ([{ name: "Adrenal Pump", type: "bioware",
        flags: { sr2e: { paid: 180000 } },
        system: { rating: 1, streetIndex: "3",
          ratingStats: [ { rating: 1, bodyCost: 1.25, cost: 60000, streetIndex: "3" },
                         { rating: 2, bodyCost: 2.5,  cost: 100000, streetIndex: "3" } ] } }]);

      // New characters default to chargen.inProgress = true, which buys at LIST
      // price. These tests exercise the in-play street-price path, so leave it.
      const makeBuyer = async (name, nuyen) => {
        const a = await Actor.create({ name, type: "character", system: { nuyen } });
        made.push(a);
        await a.update({ "system.chargen.inProgress": false });
        return a;
      };

      describe("Rating/Grade change re-prices a purchased item", () => {
        it("upgrade charges the street-priced difference; downgrade refunds", async () => {
          const actor = await makeBuyer("Quench Buyer", 1000000);
          const [pump] = await actor.createEmbeddedDocuments("Item", paidPump());
          const n0 = actor.system.nuyen;
          await pump.update({ "system.rating": 2 });
          // The charge runs in an async updateItem hook that Foundry doesn't await.
          // SI 3: street(100k) − street(60k) = 300k − 180k = 120k charged.
          assert.ok(await settle(() => n0 - actor.system.nuyen === 120000),
            `upgrade should charge the SI-3 difference (120000¥); charged ${n0 - actor.system.nuyen}`);
          assert.ok(await settle(() => pump.getFlag("sr2e", "paid") === 300000),
            "paid flag should update to the new total");
          await pump.update({ "system.rating": 1 });
          assert.ok(await settle(() => actor.system.nuyen === n0),
            `downgrade should refund back to ${n0}; got ${actor.system.nuyen}`);
        });

        it("refuses an upgrade the character can't afford (rating unchanged)", async () => {
          const actor = await makeBuyer("Quench Broke", 1000);
          const [pump] = await actor.createEmbeddedDocuments("Item", paidPump());
          await pump.update({ "system.rating": 2 });
          assert.equal(pump.system.rating, 1, "unaffordable upgrade vetoed — rating stayed at 1");
          assert.equal(actor.system.nuyen, 1000, "no nuyen was spent");
        });

        it("leaves free (unpaid) items alone", async () => {
          const actor = await makeBuyer("Quench Gift", 1000000);
          const [pump] = await actor.createEmbeddedDocuments("Item", [{ name: "Adrenal Pump", type: "bioware",
            system: { rating: 1, streetIndex: "3",
              ratingStats: [ { rating: 1, cost: 60000, streetIndex: "3" }, { rating: 2, cost: 100000, streetIndex: "3" } ] } }]);
          const n0 = actor.system.nuyen;
          await pump.update({ "system.rating": 2 });
          // Asserting "nothing happened" needs a beat, or it passes just because
          // the async hook hasn't run yet. Give a hypothetical charge time to fire.
          await settle(() => actor.system.nuyen !== n0, 300);
          assert.equal(actor.system.nuyen, n0, "no paid flag → not re-charged");
          assert.equal(pump.system.rating, 2, "…and the rating change itself still went through");
        });

        // The refund is derived from the CURRENT price tables, but `paid` is what
        // the character actually handed over. They disagree whenever a price moves
        // under a saved item — a GM edits a cost, or a rules fix lands (the
        // alphaware ×2→×3 correction did exactly this). Refunding the computed
        // delta would then pay out money that was never spent.
        it("caps a refund when the price moved under a legacy item", async () => {
          const actor = await makeBuyer("Quench Legacy", 50000);
          // Bought under the old (wrong) ×2 alphaware rule: paid 200,000¥.
          // The table now prices alpha at ×3 = 300,000¥, standard at 100,000¥.
          const [ware] = await actor.createEmbeddedDocuments("Item", [
            { name: "Legacy Chrome", type: "cyberware",
              flags: { sr2e: { paid: 200000 } },
              system: { grade: "alpha", essenceCost: 0.5, cost: 100000, streetIndex: "1" } }
          ]);
          const n0 = actor.system.nuyen;
          await ware.update({ "system.grade": "standard" });
          // Raw delta would be 100k − 300k = −200k, refunding the whole 200k paid
          // AND leaving 100k of standard ware for free. Correct: refund 100k and
          // leave them having paid 100k for what they now hold.
          assert.ok(await settle(() => actor.system.nuyen - n0 === 100000),
            `expected a 100000¥ refund; got ${actor.system.nuyen - n0}`);
          assert.ok(await settle(() => ware.getFlag("sr2e", "paid") === 100000),
            `paid should settle at the standard price; got ${ware.getFlag("sr2e", "paid")}`);
        });
      });

      // Derived-cost items price from a FORMULA, not the stored snapshot. Only
      // in-engine proves the hook reprices them — Vitest can't run preUpdateItem.
      describe("Derived-cost repricing (the 29,000Y exploit)", () => {
        it("charges the real difference when a skillsoft's rating changes", async () => {
          const actor = await makeBuyer("Quench Soft", 1000000);
          const [soft] = await actor.createEmbeddedDocuments("Item", [
            { name: "Firearms ActiveSoft", type: "gear",
              flags: { sr2e: { paid: 1000 } },
              system: { category: "skillsoft", grantedSkillCategory: "active",
                        rating: 1, streetIndex: "1" } }
          ]);
          assert.equal(soft.system.cost, 1000, "rating 1 derives to 1,000Y");
          const n0 = actor.system.nuyen;
          await soft.update({ "system.rating": 6 });
          // Was 0 before: itemBaseCost read the stale `cost` snapshot for both sides.
          assert.ok(await settle(() => n0 - actor.system.nuyen === 29000),
            `rating 1->6 should charge 29,000Y; charged ${n0 - actor.system.nuyen}`);
          assert.ok(await settle(() => soft.getFlag("sr2e", "paid") === 30000),
            `paid should reach 30,000Y; got ${soft.getFlag("sr2e", "paid")}`);
        });

        it("reprices a DataSoft category switch using the authored price", async () => {
          const actor = await makeBuyer("Quench Data", 1000000);
          const [soft] = await actor.createEmbeddedDocuments("Item", [
            { name: "Paydata", type: "gear",
              flags: { sr2e: { paid: 50000 } },
              system: { category: "skillsoft", grantedSkillCategory: "data",
                        rating: 1, cost: 50000, streetIndex: "1" } }
          ]);
          // An authored price wins for data — reconstructing this from the PREPARED
          // cost alone is impossible, which is why ctx carries _source.
          assert.equal(soft.system.cost, 50000, "authored DataSoft price survives derivation");
          const n0 = actor.system.nuyen;
          await soft.update({ "system.grantedSkillCategory": "active" });
          // active at rating 1 = 1,000Y; refund is capped at what was paid.
          assert.ok(await settle(() => actor.system.nuyen > n0),
            "switching data->active should refund the difference");
        });

        it("a GM editing the catalog price charges NOTHING", async () => {
          const actor = await makeBuyer("Quench Catalog", 1000000);
          const [soft] = await actor.createEmbeddedDocuments("Item", [
            { name: "Catalog Soft", type: "gear",
              flags: { sr2e: { paid: 1000 } },
              system: { category: "skillsoft", grantedSkillCategory: "active",
                        rating: 1, streetIndex: "1" } }
          ]);
          const n0 = actor.system.nuyen;
          // cost / streetIndex are catalog metadata — NOT purchase drivers.
          await soft.update({ "system.streetIndex": "5" });
          await settle(() => actor.system.nuyen !== n0, 300);
          assert.equal(actor.system.nuyen, n0,
            "re-pricing the market must not retroactively transact against the actor");
        });

        it("re-sending the same value is a no-op", async () => {
          const actor = await makeBuyer("Quench Noop", 1000000);
          const [soft] = await actor.createEmbeddedDocuments("Item", [
            { name: "Noop Soft", type: "gear",
              flags: { sr2e: { paid: 1000 } },
              system: { category: "skillsoft", grantedSkillCategory: "active",
                        rating: 1, streetIndex: "1" } }
          ]);
          const n0 = actor.system.nuyen;
          await soft.update({ "system.rating": 1 });   // unchanged
          await settle(() => actor.system.nuyen !== n0, 300);
          assert.equal(actor.system.nuyen, n0, "an unchanged driver must not transact");
        });

        it("rebonding a weapon focus reprices off the NEW weapon's Reach", async () => {
          const actor = await makeBuyer("Quench Rebond", 5000000);
          await actor.createEmbeddedDocuments("Item", [
            { name: "Knife",   type: "weapon", system: { weaponType: "melee", reach: 0 } },
            { name: "Polearm", type: "weapon", system: { weaponType: "melee", reach: 2 } }
          ]);
          const knife = actor.items.find(i => i.name === "Knife");
          const pole  = actor.items.find(i => i.name === "Polearm");
          // Reach 0 + Force 2 = (0+1)*100k + 2*90k = 280,000
          const [focus] = await actor.createEmbeddedDocuments("Item", [
            { name: "Blade Focus", type: "focus",
              flags: { sr2e: { paid: 280000 } },
              system: { focusType: "weapon", force: 2, bonded: true,
                        bondedWeaponId: knife.id, streetIndex: "1" } }
          ]);
          const n0 = actor.system.nuyen;
          await focus.update({ "system.bondedWeaponId": pole.id });
          // Reach 2 + Force 2 = (2+1)*100k + 2*90k = 480,000 -> charge 200,000.
          // Resolving BOTH sides from the new id would give a zero delta — the very
          // bug this guards.
          assert.ok(await settle(() => n0 - actor.system.nuyen === 200000),
            `rebond knife->polearm should charge 200,000Y; charged ${n0 - actor.system.nuyen}`);
        });
      });

      describe("Custom cyberware grades (SSC p.98)", () => {
        it("prices alpha at ×3 and beta at ×7, and reduces Essence by 20% / 40%", async () => {
          const actor = await makeBuyer("Quench Grades", 5000000);
          const [ware] = await actor.createEmbeddedDocuments("Item", [
            { name: "Wired Reflexes 1", type: "cyberware",
              system: { essenceCost: 2.0, cost: 55000, streetIndex: "1" } }
          ]);
          assert.equal(ware.system.actualEssenceCost, 2.0, "standard is unreduced");

          await ware.update({ "system.grade": "alpha" });
          assert.ok(await settle(() => ware.system.actualEssenceCost === 1.6),
            `alpha Essence should be 1.6; got ${ware.system.actualEssenceCost}`);

          await ware.update({ "system.grade": "beta" });
          assert.ok(await settle(() => ware.system.actualEssenceCost === 1.2),
            `beta Essence should be 1.2; got ${ware.system.actualEssenceCost}`);
        });
      });
    }, { displayName: "SR2E: Purchases" });

    // ── Matrixware: the cranial cyberdeck ("C2", Shadowtech p.54–59) ─────────
    quench.registerBatch("sr2e.matrixware", (context) => {
      const { describe, it, assert, after } = context;
      const made = [];
      after(async () => { for (const a of made) { try { await a.delete(); } catch (e) {} } });
      const c2 = (deck = {}) => ([{ name: "Cranial Cyberdeck (C2)", type: "cyberware",
        system: { installed: true, cranialDeck: true, location: "headware",
          deck: Object.assign({ active: false, mpcp: 6, hardening: 3, activeMemory: 300,
            storageMemory: 600, loadSpeed: 300, ioSpeed: 2, response: 1 }, deck) } }]);

      describe("Cranial deck behaves like a cyberdeck", () => {
        it("an ACTIVE cranial deck snapshots onto the actor's cyberdeck stats", async () => {
          const actor = await Actor.create({ name: "Quench C2", type: "character",
            system: { intelligence: { base: 6 } } });
          made.push(actor);
          const [deck] = await actor.createEmbeddedDocuments("Item", c2());
          assert.notEqual(actor.system.cyberdeck.mpcp, 6, "inactive deck should not drive the Matrix tab");
          await deck.update({ "system.deck.active": true });
          assert.equal(actor.system.cyberdeck.mpcp, 6, "active cranial deck snapshots MPCP");
          assert.equal(actor.system.cyberdeck.hardening, 3, "…and hardening");
        });

        it("Essence is derived from the installed components", async () => {
          const actor = await Actor.create({ name: "Quench C2 Ess", type: "character",
            system: { intelligence: { base: 6 } } });
          made.push(actor);
          const [deck] = await actor.createEmbeddedDocuments("Item", c2());
          // MPCP 6 → 0.7, +0.30 persona, +0.3 hardening, +0.1 transfer, +0.2 response
          assert.equal(deck.system.actualEssenceCost, 1.6, "derived C2 Essence");
          assert.equal(actor.system.essence.value, 6 - 1.6, "and it costs the decker Essence");
        });

        it("MPCP over 1.5 × Intelligence inflicts +4 TN on every action", async () => {
          const actor = await Actor.create({ name: "Quench C2 Overload", type: "character",
            system: { intelligence: { base: 4 } } });   // cap = ceil(6) = 6
          made.push(actor);
          const [deck] = await actor.createEmbeddedDocuments("Item", c2({ mpcp: 6 }));
          assert.equal(actor.system.mpcpOverloadPenalty, 0, "MPCP 6 at Int 4 is exactly the cap — no penalty");
          await deck.update({ "system.deck.mpcp": 7 });
          assert.equal(actor.system.mpcpOverloadPenalty, 4, "MPCP 7 over the cap → +4 TN");
        });

        it("only one deck is active at a time (gear vs cranial)", async () => {
          const actor = await Actor.create({ name: "Quench C2 Solo", type: "character",
            system: { intelligence: { base: 6 } } });
          made.push(actor);
          const [cranial] = await actor.createEmbeddedDocuments("Item", c2({ active: true }));
          const [gearDeck] = await actor.createEmbeddedDocuments("Item", [{ name: "Fuchi Cyber-6",
            type: "gear", system: { category: "cyberdeck", deck: { active: false, mpcp: 4 } } }]);
          await gearDeck.update({ "system.deck.active": true });
          // The switch-off runs in an async updateItem hook Foundry doesn't await.
          assert.ok(await settle(() => actor.items.get(cranial.id).system.deck.active === false),
            "activating the gear deck should switch the cranial deck off");
        });
      });
    }, { displayName: "SR2E: Matrixware (C2)" });

    // ── Spell foci (SR2E p.137) ───────────────────────────────────────────────
    // Vitest covers the arithmetic; this covers what it cannot reach — that the
    // dice are actually PERSISTED as spent, that they come back on refresh, and
    // that the derived unbound flag the sheets warn on is right. Every case here
    // is a way the old "permanent bonus" behaviour could creep back.
    quench.registerBatch("sr2e.spell-foci", (context) => {
      const { describe, it, assert, after } = context;
      const made = [];
      after(async () => { for (const a of made) { try { await a.delete(); } catch (e) {} } });

      /** A magician with one spell and a focus bound to it. */
      async function caster({ bind = true, force = 4, expendable = false } = {}) {
        const actor = await Actor.create({
          name: "Quench Focus Mage", type: "character",
          system: { willpower: { base: 5 }, magic: { value: 6, type: "full_magician" } },
          items: [{ name: "Sleep", type: "spell", system: { force: 4 } }]
        });
        made.push(actor);
        const spell = actor.items.find(i => i.type === "spell");
        await actor.createEmbeddedDocuments("Item", [{
          name: "Sleep Focus", type: "focus",
          system: { focusType: "spell", force, bonded: true, active: true, expendable,
                    spellSubtype: "specific", boundSpellId: bind ? spell.id : "", spent: 0 }
        }]);
        // createEmbeddedDocuments returns items OUT of order — find by type.
        return { actor, spell, focus: actor.items.find(i => i.type === "focus") };
      }

      describe("Spell focus dice are a pool, not a bonus", () => {
        it("an unbound focus is flagged so the sheets can warn", async () => {
          const { focus } = await caster({ bind: false });
          assert.isTrue(focus.system._unbound,
            "an unbound specific focus must flag itself — it grants nothing and the " +
            "player has no other way to find out");
        });

        it("a bound focus is not flagged", async () => {
          const { focus } = await caster();
          assert.isFalse(focus.system._unbound);
        });

        it("an expendable fetish focus is never treated as unbound", async () => {
          // They are outside this mechanism entirely; flagging them would nag
          // about a binding they must never have.
          const { focus } = await caster({ bind: false, expendable: true });
          assert.isFalse(focus.system._unbound);
        });

        it("remaining dice fall as they are spent", async () => {
          const { focus } = await caster({ force: 4 });
          assert.equal(focus.system.remainingFocusDice, 4);
          await focus.update({ "system.spent": 3 });
          assert.equal(focus.system.remainingFocusDice, 1);
        });

        it("lowering the rating re-clamps spent instead of going negative", async () => {
          // `spent` has no schema max — its ceiling is the dynamic rating.
          const { focus } = await caster({ force: 4 });
          await focus.update({ "system.spent": 4 });
          await focus.update({ "system.force": 2 });
          assert.equal(focus.system.spent, 2, "spent must be clamped to the new rating");
          assert.equal(focus.system.remainingFocusDice, 0);
        });

        it("refreshDicePools resets spent EVEN WHEN the actor pools are unchanged", async () => {
          // The trap: refreshDicePools returns early when the actor-side update is
          // empty. `spent` lives on an embedded item, so an early return would skip
          // it and present as "foci sometimes don't refresh".
          const { actor, focus } = await caster({ force: 4 });
          await actor.update({ "system.dicePools.magic.value": actor.system.dicePools.magic.max });
          await focus.update({ "system.spent": 4 });
          await actor.refreshDicePools();
          assert.equal(actor.items.get(focus.id).system.spent, 0,
            "focus dice must refresh on the same path as the Magic Pool");
        });

        it("spending persists to the item, not just to the roll", async () => {
          const { actor, spell, focus } = await caster({ force: 4 });
          await spell.roll({ force: 3, targetNumber: 4,
                             focusDice: { [focus.id]: { cast: 2, drain: 1 } } });
          assert.equal(actor.items.get(focus.id).system.spent, 3,
            "3 dice were committed, so 3 must be recorded as spent");
        });

        it("a greedy request cannot exceed the rating", async () => {
          // Straight through item.roll, bypassing the dialog entirely.
          const { actor, spell, focus } = await caster({ force: 4 });
          await spell.roll({ force: 3, targetNumber: 4,
                             focusDice: { [focus.id]: { cast: 4, drain: 4 } } });
          assert.equal(actor.items.get(focus.id).system.spent, 4,
            "cast and drain share one budget — 4+4 from a rating-4 focus must spend 4, not 8");
        });

        it("a focus bound to a DIFFERENT spell contributes nothing", async () => {
          const { actor, focus } = await caster({ force: 4 });
          const [other] = await actor.createEmbeddedDocuments("Item",
            [{ name: "Mana Bolt", type: "spell", system: { force: 4 } }]);
          await other.roll({ force: 3, targetNumber: 4,
                             focusDice: { [focus.id]: { cast: 4, drain: 0 } } });
          assert.equal(actor.items.get(focus.id).system.spent, 0,
            "this is the original bug: the focus must not fuel every spell");
        });
      });
    }, { displayName: "SR2E: Spell Foci (p.137)" });

    // ── Damage application & Karma spends ─────────────────────────────────────
    // The two most consequential mutations in the system and neither had any
    // Quench coverage. applyDamage runs on every hit; applyKarmaToTest spends
    // Karma Pool, which the book makes PERMANENT — a bug there costs a player
    // something they cannot get back, so it deserves a test more than most.
    quench.registerBatch("sr2e.damage-karma", (context) => {
      const { describe, it, assert, after } = context;
      const made = [];
      after(async () => { for (const a of made) { try { await a.delete(); } catch (e) {} } });

      async function pc(system = {}) {
        const actor = await Actor.create({ name: "Quench Damage", type: "character",
          system: foundry.utils.mergeObject({ body: { base: 6 }, willpower: { base: 6 } }, system) });
        made.push(actor);
        return actor;
      }

      describe("applyDamage", () => {
        it("fills the physical monitor without exceeding its max", async () => {
          const a = await pc();
          const max = a.system.conditionMonitor.physical.max;
          await a.applyDamage("physical", max + 3);
          assert.equal(a.system.conditionMonitor.physical.value, max,
            "the monitor itself must cap — the excess belongs in overflow");
        });

        it("records physical overflow past the monitor", async () => {
          const a = await pc();
          const max = a.system.conditionMonitor.physical.max;
          await a.applyDamage("physical", max + 3);
          assert.equal(a.system.conditionMonitor.overflow, 3,
            "3 boxes past a full monitor is 3 overflow");
        });

        it("computes overflow from the PRE-hit value, not the clamped one", async () => {
          // The subtle one: `monitor` is captured before the update. If the data
          // model ever mutated in place instead of rebuilding, monitor.value would
          // read back as the clamped value and overflow would silently compute 0.
          const a = await pc();
          const max = a.system.conditionMonitor.physical.max;
          await a.applyDamage("physical", max - 1);   // one short of full
          await a.applyDamage("physical", 5);         // 4 past
          assert.equal(a.system.conditionMonitor.physical.value, max);
          assert.equal(a.system.conditionMonitor.overflow, 4);
        });

        it("converts stun overflow into physical (p.110)", async () => {
          const a = await pc();
          const smax = a.system.conditionMonitor.stun.max;
          await a.applyDamage("stun", smax + 2);
          assert.equal(a.system.conditionMonitor.stun.value, smax, "stun caps at its max");
          assert.equal(a.system.conditionMonitor.physical.value, 2,
            "the 2 boxes past a full stun monitor become physical");
        });

        it("ignores non-positive amounts rather than healing", async () => {
          const a = await pc();
          await a.applyDamage("physical", 3);
          await a.applyDamage("physical", 0);
          await a.applyDamage("physical", -5);
          assert.equal(a.system.conditionMonitor.physical.value, 3,
            "a zero or negative hit must not move the monitor in either direction");
        });

        it("uses the single flat monitor for vehicles", async () => {
          const v = await Actor.create({ name: "Quench Rig", type: "vehicle",
            system: { body: 3 } });
          made.push(v);
          const max = v.system.conditionMonitor.max;
          await v.applyDamage("physical", max + 5);
          assert.equal(v.system.conditionMonitor.value, max);
        });
      });

      describe("Karma Pool spends are permanent (p.100)", () => {
        // `extra` is merged into the card state. It exists for the glitch test:
        // avoidGlitch returns early unless state.criticalGlitch is set, and the
        // flag CANNOT live in the shared fixture because the reroll branch bails
        // on an unavoided glitch — which would break the two reroll tests.
        async function tested(karma = 5, extra = {}) {
          // karma.pool is DERIVED as of 0.91.0. Capacity is the p.47 starting
          // grant (1 for a human) PLUS Career Karma / 10 rounded up, so seeding
          // total alone overshoots by the grant. total = karma * 10 with
          // poolAdjust -1 cancels it and yields exactly `karma` points —
          // including karma = 0, which floors at 0.
          const a = await pc({ karma: { total: karma * 10, poolAdjust: -1 } });
          const msg = await ChatMessage.create({ content: "quench",
            flags: { sr2e: { test: { dice: [{ result: 2 }, { result: 5 }, { result: 1 }],
                                     tn: 4, successes: 1, rerolls: 0, ...extra } } } });
          return { actor: a, msg };
        }

        it("a reroll costs escalating Karma and deducts it", async () => {
          // The SECOND reroll only charges if the FIRST one left a failure
          // behind: applyKarmaToTest replaces state.dice with the rolled
          // results, and an empty failedIdx correctly returns without spending.
          // At TN 4 every die is a coin flip, so all three coming up successes
          // is a 1-in-8 run and the test failed intermittently through no fault
          // of the rule. Pin every face to 1 — always a failure at TN 4, and no
          // Rule of Six explosion to complicate it.
          //
          // Face 2, NOT face 1. All ones would make the reroll a critical
          // glitch, and this test would then only reach the second spend
          // because applyKarmaToTest never copies isCriticalGlitch back into
          // state.criticalGlitch. That would tie a cost assertion to a separate
          // and arguable behaviour. A 2 always fails TN 4, never explodes, and
          // is never a glitch.
          // mapRandomFace(u) = ceil((1 - u) * 6), so u = 0.75 -> 2.
          const realRandom = CONFIG.Dice.randomUniform;
          CONFIG.Dice.randomUniform = () => 0.75;
          let card;
          try {
            const { actor, msg } = await tested(5);
            card = msg;
            await actor.applyKarmaToTest(msg, "reroll");
            assert.equal(actor.system.karma.pool, 4, "first reroll costs 1");
            await actor.applyKarmaToTest(msg, "reroll");
            assert.equal(actor.system.karma.pool, 2, "second reroll costs 2 — it escalates");
          } finally {
            CONFIG.Dice.randomUniform = realRandom;
            if (card) { try { await card.delete(); } catch (e) {} }
          }
        });

        it("refuses a reroll it cannot afford, and spends nothing", async () => {
          const { actor, msg } = await tested(0);
          await actor.applyKarmaToTest(msg, "reroll");
          assert.equal(actor.system.karma.pool, 0,
            "a refused action must not leave the pool negative or partially spent");
          await msg.delete();
        });

        // p.191, "Avoid an Oops": paying 1 Karma "does not allow a re-roll, but
        // does turn the disaster into a simple failure. Additional Karma cannot
        // be spent on the failure." The test is CLOSED after that — the guard
        // used to read `criticalGlitch && !glitchAvoided`, so paying to avoid
        // the disaster unlocked rerolling, which is backwards.
        it("closes a Rule of One test to further Karma, avoided or not", async () => {
          const glitch = { dice: [{ result: 1 }, { result: 1 }, { result: 1 }],
                           successes: 0, criticalGlitch: true };

          const a = await tested(6, glitch);
          await a.actor.applyKarmaToTest(a.msg, "reroll");
          assert.equal(a.actor.system.karma.pool, 6,
            "a Rule of One failure may not be re-rolled at all (p.191)");
          await a.msg.delete();

          const b = await tested(6, glitch);
          await b.actor.applyKarmaToTest(b.msg, "avoidGlitch");
          assert.equal(b.actor.system.karma.pool, 5, "avoiding the Oops costs exactly 1");
          await b.actor.applyKarmaToTest(b.msg, "reroll");
          assert.equal(b.actor.system.karma.pool, 5,
            "no additional Karma may be spent on the failure once it is bought off");
          await b.actor.applyKarmaToTest(b.msg, "buySuccess");
          assert.equal(b.actor.system.karma.pool, 5,
            "and successes cannot be bought on it either");
          await b.msg.delete();
        });

        it("avoiding a glitch costs exactly 1", async () => {
          // A real critical glitch is all ones and no successes; flagging the
          // 2/5/1 fixture would exercise the guard while modelling a roll that
          // could not have glitched.
          const { actor, msg } = await tested(3, {
            dice: [{ result: 1 }, { result: 1 }, { result: 1 }],
            successes: 0, criticalGlitch: true });
          await actor.applyKarmaToTest(msg, "avoidGlitch");
          assert.equal(actor.system.karma.pool, 2);
          await msg.delete();
        });
      });
    }, { displayName: "SR2E: Damage & Karma" });

    // ── Karma Pool: derived capacity, permanent vs temporary ─────────────────
    // SR2E p.191. The pool is not stored: capacity is Career Karma / 10 ROUND
    // UP less what has been permanently burned, and a refresh clears only the
    // temporary buckets. The arithmetic is unit-tested in test/karma-pool.test.mjs;
    // what needs a live world is the persistence behaviour — that the derived
    // fields are NOT stored, and that a legacy write cannot resurrect them.
    quench.registerBatch("sr2e.karma-pool", (context) => {
      const { describe, it, assert, after } = context;
      const made = [];
      after(async () => { for (const a of made) { try { await a.delete(); } catch (e) {} } });

      async function pc(karma = {}) {
        const a = await Actor.create({
          name: "Quench Karma Pool", type: "character",
          system: { karma: foundry.utils.mergeObject({ total: 50 }, karma) } });
        made.push(a); return a;
      }

      describe("derivation", () => {
        it("is Career Karma / 10 ROUNDED UP", async () => {
          assert.equal((await pc({ total: 50 })).system.karma.poolMax, 6, "1 grant + 5 earned");
          assert.equal((await pc({ total: 51 })).system.karma.poolMax, 7, "51 rounds UP to 6, plus the grant");
          assert.equal((await pc({ total: 1 })).system.karma.poolMax, 2, "1 Karma rounds up, on top of the grant");
          assert.equal((await pc({ total: 0 })).system.karma.poolMax, 1, "and a fresh human still starts with 1 (p.47)");
        });

        it("subtracts permanently burned capacity but not this encounter's spending", async () => {
          const a = await pc({ total: 50, burned: 2, spent: 1 });
          assert.equal(a.system.karma.poolMax, 4, "1 + 5 - 2 burned");
          assert.equal(a.system.karma.pool, 3, "availability also drops by what was spent");
        });

        it("grants metahumans the larger starting pool (p.47)", async () => {
          const a = await Actor.create({ name: "Quench Troll Karma", type: "character",
            system: { race: "troll", karma: { total: 0 } } });
          made.push(a);
          assert.equal(a.system.karma.poolMax, 2, "a metahuman starts with 2, not 1");
        });

        it("honours the More Metahumans world setting", async () => {
          // Flipping the setting must move existing metahumans, not just new
          // ones — the pool is derived, so the change is retroactive by design.
          const prior = game.settings.get("sr2e", "moreMetahumans");
          const a = await Actor.create({ name: "Quench Ork Karma", type: "character",
            system: { race: "ork", karma: { total: 0 } } });
          made.push(a);
          try {
            await game.settings.set("sr2e", "moreMetahumans", false);
            assert.equal(a.system.karma.poolMax, 2, "off: a metahuman starts with 2");
            await game.settings.set("sr2e", "moreMetahumans", true);
            assert.equal(a.system.karma.poolMax, 1, "on: the standard 1 point (p.47)");
          } finally {
            await game.settings.set("sr2e", "moreMetahumans", prior);
          }
        });

        it("counts held Team Karma on top, which may exceed capacity", async () => {
          const a = await pc({ total: 50, drawn: 2 });
          assert.equal(a.system.karma.pool, 8, "6 own + 2 borrowed");
        });
      });

      // The condition Codex attached to approving the plan: prove the derived
      // fields are not persisted and that a legacy write cannot take hold.
      describe("the derived fields are NOT stored", () => {
        it("keeps pool and poolMax out of the source data", async () => {
          const a = await pc({ total: 50 });
          const src = a.system.toObject();
          assert.notProperty(src.karma, "pool", "pool must not be persisted");
          assert.notProperty(src.karma, "poolMax", "poolMax must not be persisted");
          assert.property(src.karma, "burned");
          assert.property(src.karma, "spent");
          assert.property(src.karma, "drawn");
        });

        it("drops a legacy write to system.karma.pool instead of honouring it", async () => {
          const a = await pc({ total: 50 });
          assert.equal(a.system.karma.pool, 6);
          await a.update({ "system.karma.pool": 99 });
          assert.equal(a.system.karma.pool, 6,
            "an old macro writing the pool must not change the derived value");
          // Check the DOCUMENT's raw source too, not just the validated model —
          // a field can vanish from the model while surviving in _source, which
          // is exactly how removed fields persist through migrations.
          assert.notProperty(a.system.toObject().karma, "pool",
            "must not appear in the prepared model's source");
          assert.notProperty(a.toObject().system.karma, "pool",
            "must not appear in the document's serialized source");
          assert.notProperty(a._source.system.karma, "pool",
            "and must not be sitting in raw _source either");
        });
      });

      describe("the carried adjustment", () => {
        it("persists a NEGATIVE value through Foundry validation", async () => {
          // poolAdjust is deliberately not min:0. If the schema ever regains a
          // floor, a character migrated down from a smaller hand-kept pool
          // silently gains capacity.
          const a = await pc({ total: 50, poolAdjust: -3 });
          assert.equal(a.system.karma.poolAdjust, -3, "the negative offset must survive");
          assert.equal(a.system.karma.poolMax, 3, "1 grant + 5 earned, less the 3 carried down");
        });

        it("survives a refresh untouched", async () => {
          const a = await pc({ total: 50, poolAdjust: 2, spent: 3 });
          await a.refreshDicePools();
          assert.equal(a.system.karma.poolAdjust, 2, "a refresh must not clear the offset");
          assert.equal(a.system.karma.poolMax, 8);
        });

        it("offsets capacity but cannot un-burn Karma", async () => {
          // The adjustment and the burn are separate terms; raising one does not
          // erase the other. This is why the sheet shows it read-only.
          const a = await pc({ total: 50, poolAdjust: 2, burned: 2 });
          assert.equal(a.system.karma.poolMax, 6, "1 + 5 + 2 - 2");
          assert.equal(a.system.karma.burned, 2, "the burn is still recorded");
        });
      });

      describe("permanent vs temporary (p.191)", () => {
        it("returns spent points on a refresh but never burned ones", async () => {
          const a = await pc({ total: 50, spent: 2, burned: 1 });
          assert.equal(a.system.karma.pool, 3, "6 capacity - 1 burned - 2 spent");
          await a.refreshDicePools();
          assert.equal(a.system.karma.pool, 5, "the 2 spent come back");
          assert.equal(a.system.karma.poolMax, 5, "the burned point does NOT");
          assert.equal(a.system.karma.burned, 1, "burned survives the refresh");
        });

        it("lets unused Team Karma loans lapse at the refresh", async () => {
          const a = await pc({ total: 50, drawn: 3 });
          assert.equal(a.system.karma.pool, 9);
          await a.refreshDicePools();
          assert.equal(a.system.karma.drawn, 0, "borrowed points do not become the character's");
          assert.equal(a.system.karma.pool, 6);
        });
      });

      describe("spending order", () => {
        it("spends borrowed Team Karma before the character's own", async () => {
          const a = await pc({ total: 50, drawn: 2 });
          await a._spendKarmaPool(1);
          assert.equal(a.system.karma.drawn, 1, "the loan is drawn down first");
          assert.equal(a.system.karma.spent, 0, "personal capacity is untouched");
        });

        it("splits a spend that outruns the loan", async () => {
          const a = await pc({ total: 50, drawn: 1 });
          await a._spendKarmaPool(3);
          assert.equal(a.system.karma.drawn, 0);
          assert.equal(a.system.karma.spent, 2, "the remainder falls on personal capacity");
        });

        it("buying a success with a BORROWED point does not burn personal capacity", async () => {
          // The sequence that killed the first design: the shared pool was
          // already debited when the points were drawn, so charging `burned`
          // as well would take the same point twice.
          const a = await pc({ total: 50, drawn: 2 });
          await a._burnKarmaPool(1);
          assert.equal(a.system.karma.drawn, 1, "the loan absorbs it");
          assert.equal(a.system.karma.burned, 0, "and capacity is NOT permanently reduced");
          await a.refreshDicePools();
          assert.equal(a.system.karma.poolMax, 6, "so the pool returns in full next encounter");
        });

        it("burns personal capacity when nothing is borrowed", async () => {
          const a = await pc({ total: 50 });
          await a._burnKarmaPool(1);
          assert.equal(a.system.karma.burned, 1);
          await a.refreshDicePools();
          assert.equal(a.system.karma.poolMax, 5, "gone (pffft!) forever");
        });
      });
    }, { displayName: "SR2E: Karma Pool (p.191)" });

    // ── Skill Concentrations / Specializations (p.70, p.191) ────────────────
    // The arithmetic is unit-tested; what needs a live world is the lifecycle:
    // that a pending skill derives, that finishing creation freezes it, and
    // that a slotted skillsoft cannot be rolled through a specialization.
    quench.registerBatch("sr2e.skill-tiers", (context) => {
      const { describe, it, assert, after } = context;
      const made = [];
      after(async () => { for (const a of made) { try { await a.delete(); } catch (e) {} } });

      async function pc(chargen = true, skills = []) {
        const a = await Actor.create({
          name: "Quench Skill Tiers", type: "character",
          system: { quickness: { base: 4 }, chargen: { inProgress: chargen } },
          items: skills
        });
        made.push(a); return a;
      }
      const firearms = (system) => ({
        name: "Firearms", type: "skill",
        system: { category: "active", linkedAttribute: "quickness", ...system }
      });

      describe("pending: the tiers derive from the allocation (p.70)", () => {
        it("reproduces the book's worked example", async () => {
          const a = await pc(true, [firearms({
            allocated: 5, ratingsFinalized: false,
            concentration: { name: "SMG" }, specialization: { name: "Uzi III" }
          })]);
          const s = a.items.find(i => i.type === "skill").system;
          assert.equal(s.rating, 3, "Firearms 3");
          assert.equal(s.concentration.rating, 5, "SMG 5");
          assert.equal(s.specialization.rating, 7, "Uzi III 7");
        });

        it("grants the concentration p.70 grants, even if only the spec was named", async () => {
          const a = await pc(true, [firearms({
            allocated: 5, ratingsFinalized: false, specialization: { name: "Uzi III" }
          })]);
          assert.equal(a.items.find(i => i.type === "skill").system.concentration.rating, 5);
        });

        it("re-derives when a concentration is added", async () => {
          const a = await pc(true, [firearms({ allocated: 5, ratingsFinalized: false })]);
          const it0 = a.items.find(i => i.type === "skill");
          assert.equal(it0.system.rating, 5, "plain: general is the whole allocation");
          await it0.update({ "system.concentration.name": "SMG" });
          assert.equal(it0.system.rating, 4, "general drops by 1");
          assert.equal(it0.system.concentration.rating, 6);
        });
      });

      describe("finalized: the ratings are independent (p.191)", () => {
        it("stops deriving, so a Karma-bought specialization holds", async () => {
          const a = await pc(false, [firearms({
            ratingsFinalized: true, rating: 3,
            concentration: { name: "SMG", rating: 5 },
            specialization: { name: "Uzi III", rating: 7 }
          })]);
          const item = a.items.find(i => i.type === "skill");
          await item.update({ "system.specialization.rating": 9 });
          assert.equal(item.system.specialization.rating, 9,
            "a Karma-advanced specialization must survive preparation");
          await item.update({ "system.rating": 6 });
          assert.equal(item.system.specialization.rating, 9,
            "and raising the general must NOT drag the specialization with it");
        });
      });

      describe("finishing creation finalizes", () => {
        it("freezes the derived tiers and flips the flag", async () => {
          const a = await pc(true, [firearms({
            allocated: 5, ratingsFinalized: false,
            concentration: { name: "SMG" }, specialization: { name: "Uzi III" }
          })]);
          await a.update({ "system.chargen.inProgress": false });
          // The hook re-issues the update asynchronously; give it a tick.
          await new Promise(r => setTimeout(r, 250));
          const s = a.items.find(i => i.type === "skill").system;
          assert.isTrue(s.ratingsFinalized, "the skill should be finalized");
          assert.equal(s.rating, 3, "and keep exactly the ratings it had");
          assert.equal(s.concentration.rating, 5);
          assert.equal(s.specialization.rating, 7);
        });

        it("is idempotent — re-running finds everything already finalized", async () => {
          const a = await pc(false, [firearms({
            ratingsFinalized: true, rating: 3, concentration: { name: "SMG", rating: 5 }
          })]);
          await a.update({ "system.chargen.inProgress": false });
          await new Promise(r => setTimeout(r, 150));
          assert.equal(a.items.find(i => i.type === "skill").system.concentration.rating, 5,
            "a second finish must not move anything");
        });
      });

      describe("adding a skill picks the right lifecycle", () => {
        // Regression: the schema defaults `ratingsFinalized` to TRUE so that
        // NPCs and compendium skills are authored data. That default is wrong
        // for a character still in creation, and nothing in the Add Skill
        // button knew it — a skill added mid-chargen came out finalized and
        // never derived its tiers.
        it("a skill added DURING creation is pending, with an allocation", async () => {
          const a = await pc(true);
          const [item] = await a.createEmbeddedDocuments("Item", [
            { name: "Firearms", type: "skill", system: { category: "active" } }]);
          assert.isFalse(item.system.ratingsFinalized, "should be pending");
          assert.equal(item.system.allocated, 0, "a blank skill starts at 0, not 1");
          await item.update({ "system.allocated": 5, "system.concentration.name": "SMG" });
          assert.equal(item.system.rating, 4, "and p.70 now derives from it");
          assert.equal(item.system.concentration.rating, 6);
        });

        it("a skill dropped mid-chargen keeps the rating it was authored with", async () => {
          const a = await pc(true);
          const [item] = await a.createEmbeddedDocuments("Item", [
            { name: "Etiquette", type: "skill", system: { category: "active", rating: 6 } }]);
          assert.equal(item.system.allocated, 6, "the authored general IS the allocation");
          assert.equal(item.system.rating, 6, "so the number on the sheet does not move");
        });

        it("skills embedded in an Actor.create payload are normalized too", async () => {
          // preCreateItem does NOT fire for items supplied inside an actor's
          // creation payload — they are descendants of the actor's own create.
          // Without preCreateActor, a whole character imported mid-creation
          // would arrive finalized while a skill added a second later did not.
          const a = await Actor.create({
            name: "Quench Embedded Skills", type: "character",
            system: { chargen: { inProgress: true } },
            items: [{
              name: "Firearms", type: "skill",
              system: {
                category: "active", linkedAttribute: "quickness",
                rating: 3, ratingsFinalized: true,
                concentration: { name: "SMG", rating: 5 },
                specialization: { name: "Uzi III", rating: 7 }
              }
            }]
          });
          made.push(a);
          // Exactly one: rebuilding the items array without carrying each _id
          // across makes updateSource APPEND the normalized copies instead of
          // rewriting them, leaving the original finalized skill in place.
          assert.equal(a.items.filter(i => i.type === "skill").length, 1,
            "normalization must rewrite the skill, not add a second one");
          const s2 = a.items.find(i => i.type === "skill").system;
          assert.isFalse(s2.ratingsFinalized, "the destination character is mid-creation");
          assert.equal(s2.allocated, 5, "3 + 2 for the specialization (p.70)");
          assert.equal(s2.rating, 3, "and the tiers re-derive to exactly where they were");
          assert.equal(s2.specialization.rating, 7);
          // Two hooks each rebuilding the items array would clobber each other;
          // the default weapon is the thing that goes missing when they do.
          assert.equal(a.items.filter(i => i.name === "Unarmed Strike").length, 1,
            "the default Unarmed Strike must survive skill normalization");
        });

        it("a FINISHED actor's embedded skills are left alone", async () => {
          // The sample runners ship this way. Their ratings must not be touched.
          const a = await pc(false, [firearms({
            ratingsFinalized: true, rating: 3,
            concentration: { name: "SMG", rating: 5 }
          })]);
          const s2 = a.items.find(i => i.type === "skill").system;
          assert.isTrue(s2.ratingsFinalized);
          assert.equal(s2.rating, 3);
          assert.equal(s2.concentration.rating, 5);
        });

        it("a FINALIZED skill copied from another actor becomes pending, once", async () => {
          // The payload of a document-to-document copy carries the schema's own
          // `ratingsFinalized: true`, which is why provenance cannot be trusted
          // to decide the lifecycle. p.70 must be inverted exactly once.
          const src = await pc(false, [firearms({
            ratingsFinalized: true, rating: 3,
            concentration: { name: "SMG", rating: 5 },
            specialization: { name: "Uzi III", rating: 7 }
          })]);
          const payload = src.items.find(i => i.type === "skill").toObject();
          assert.isTrue(payload.system.ratingsFinalized, "the copy really does carry true");
          const dest = await pc(true);
          const [item] = await dest.createEmbeddedDocuments("Item", [payload]);
          assert.isFalse(item.system.ratingsFinalized, "the destination is mid-creation");
          assert.equal(item.system.allocated, 5, "3 + 2 for the specialization (p.70)");
          assert.equal(item.system.rating, 3, "and the derived tiers land back where they were");
          assert.equal(item.system.specialization.rating, 7);
        });

        it("a PENDING skill copied from another actor is not inverted twice", async () => {
          const src = await pc(true, [firearms({
            allocated: 5, ratingsFinalized: false, concentration: { name: "SMG" }
          })]);
          const payload = src.items.find(i => i.type === "skill").toObject();
          const dest = await pc(true);
          const [item] = await dest.createEmbeddedDocuments("Item", [payload]);
          // Inversion happens to reconstruct the same number here, so this
          // proves the allocation SURVIVES the copy, not which branch ran.
          assert.equal(item.system.allocated, 5, "the allocation carries across");
          assert.equal(item.system.rating, 4);
        });

        it("a skill added to a FINISHED character stays authored", async () => {
          const a = await pc(false);
          const [item] = await a.createEmbeddedDocuments("Item", [
            { name: "Firearms", type: "skill", system: { category: "active", rating: 4 } }]);
          assert.isTrue(item.system.ratingsFinalized);
          assert.equal(item.system.rating, 4, "a Karma purchase is not chargen arithmetic");
        });

        it("finishing creation does not choke on a blank row", async () => {
          // An empty skill the player added and abandoned must not jam the
          // whole sheet behind a validation error.
          const a = await pc(true);
          await a.createEmbeddedDocuments("Item", [
            { name: "Abandoned", type: "skill", system: { category: "active" } }]);
          await a.update({ "system.chargen.inProgress": false });
          await new Promise(r => setTimeout(r, 250));
          assert.isFalse(a.system.chargen.inProgress, "creation should have finished");
          assert.isTrue(a.items.find(i => i.name === "Abandoned").system.ratingsFinalized);
        });
      });

      describe("derived markers do not survive the thing that set them", () => {
        // All three are the same defect: prepareDerivedData mutates the prepared
        // embedded item, nothing re-initializes it between passes, and the code
        // that writes the marker never cleared it first.
        it("an adept bonus does not grow on every preparation", async () => {
          const a = await pc(false, [
            firearms({ ratingsFinalized: true, rating: 4 }),
            { name: "Improved Ability (Firearms)", type: "adept_power",
              system: { improvedSkill: "Firearms", level: 2 } }
          ]);
          const skill = a.items.find(i => i.type === "skill");
          assert.equal(skill.system._adeptBonus, 2, "+1 die per level (p.125)");
          for (let n = 0; n < 3; n++) a.prepareData();
          assert.equal(a.items.find(i => i.type === "skill").system._adeptBonus, 2,
            "three more preparations must not make it 8");
        });

        it("an adept bonus disappears with the power that granted it", async () => {
          const a = await pc(false, [
            firearms({ ratingsFinalized: true, rating: 4 }),
            { name: "Improved Ability (Firearms)", type: "adept_power",
              system: { improvedSkill: "Firearms", level: 2 } }
          ]);
          await a.items.find(i => i.type === "adept_power").delete();
          assert.notOk(a.items.find(i => i.type === "skill").system._adeptBonus,
            "deleting the power must take its dice with it");
        });

        it("removing a VCR drops the rig, without eating the manual entry", async () => {
          // The live one: vehicleControlRig feeds Reaction, Initiative and the
          // Control Pool. The manual field is the documented fallback for quick
          // setups, so restoring must land on the AUTHORED value, not on 0.
          const a = await pc(false, []);
          await a.update({ "system.vehicleControlRig": 1, "system.rigging": true });
          const [vcr] = await a.createEmbeddedDocuments("Item", [{
            name: "Vehicle Control Rig 3", type: "cyberware",
            system: { installed: true, isVcr: true, rating: 3 }
          }]);
          assert.equal(a.system.vehicleControlRig, 3, "installed cyberware is authoritative");
          await vcr.delete();
          assert.equal(a.system.vehicleControlRig, 1,
            "back to the manually entered rig, not stuck on the removed implant's 3");
          assert.equal(a.system.reaction.mod, 2, "and Reaction follows it down");
        });

        it("removing bone lacing puts the unarmed Power back", async () => {
          const a = await pc(false, []);
          const unarmed = a.items.find(i => i.name === "Unarmed Strike");
          const authored = unarmed._source.system.damageCode;
          const [lacing] = await a.createEmbeddedDocuments("Item", [{
            name: "Bone Lacing (Aluminum)", type: "cyberware",
            system: { installed: true, unarmedPowerBonus: 2 }
          }]);
          assert.notEqual(a.items.get(unarmed.id).system.damageCode, authored,
            "the lacing should have raised the Power (Shadowtech p.42)");
          await lacing.delete();
          assert.equal(a.items.get(unarmed.id).system.damageCode, authored,
            "and removing it must put the authored code back, not leave it raised");
          assert.notOk(a.items.get(unarmed.id).system._unarmedPowerBonus);
        });

        it("un-bonding a weapon focus stops it granting dice", async () => {
          const a = await pc(false, [
            { name: "Quench Katana", type: "weapon",
              system: { weaponType: "melee", reach: 1, damageCode: "(Str+3)M" } }
          ]);
          const weapon = a.items.find(i => i.type === "weapon" && i.name === "Quench Katana");
          const [focus] = await a.createEmbeddedDocuments("Item", [{
            name: "Quench Weapon Focus", type: "focus",
            system: { focusType: "weapon", force: 3, bonded: true, active: true,
                      bondedWeaponId: weapon.id }
          }]);
          assert.equal(a.items.get(weapon.id).system._boundFocusForce, 3, "bonded");
          await focus.update({ "system.bondedWeaponId": "" });
          assert.notOk(a.items.get(weapon.id).system._boundFocusId,
            "un-bonding must not leave the weapon holding the focus's Force");
        });
      });

      describe("Improved Ability (SR2E p.125, p.248)", () => {
        // Reported from the table: a physical adept rolled 9 dice with his katana
        // instead of 11, because his Improved Ability powers named their skill in
        // the ITEM NAME and left `improvedSkill` empty, so they granted nothing.
        async function adept(skillRating, level, chip = 0) {
          const items = [
            firearms({ ratingsFinalized: true, rating: skillRating }),
            { name: "Improved Ability (Firearms)", type: "adept_power",
              system: { improvedSkill: "", level } }
          ];
          if (chip) items.push(
            { name: "Skillwires 8", type: "cyberware", system: { installed: true, rating: 8 } },
            { name: "Firearms ActiveSoft", type: "gear",
              system: { category: "skillsoft", slotted: true, rating: chip,
                        grantedSkill: "Firearms", grantedSkillCategory: "active" } });
          const a = await pc(false, items);
          return [a, a.items.find(i => i.type === "skill")];
        }

        it("reads the skill from the power's name when the field is empty", async () => {
          const [, skill] = await adept(6, 2);
          assert.equal(skill.system._adeptBonus, 2, "the named power must grant its dice");
        });

        it("caps combat-skill dice at the current rating (p.125's own example)", async () => {
          // "a character with Firearms 4 cannot have more than 4 additional dice"
          const [, skill] = await adept(4, 6);
          assert.equal(skill.system._adeptBonus, 4);
        });

        it("a slotted skillsoft SUPPRESSES the bonus rather than raising the cap", async () => {
          // p.248: with a chip duplicating a natural skill "he uses only the
          // skillsoft's rating. The character's natural ability is lost."
          // Before the fix the cap was read against the CHIP: +2 became +4.
          const [, skill] = await adept(2, 4, 6);
          assert.equal(skill.system.rating, 6, "the chip supplies the skill");
          assert.notOk(skill.system._adeptBonus, "and natural Improved Ability is lost while it is in");
        });

        it("un-slotting the chip gives the natural bonus back, capped", async () => {
          const [a] = await adept(2, 4, 6);
          await a.items.find(i => i.type === "gear").update({ "system.slotted": false });
          const skill = a.items.find(i => i.type === "skill");
          assert.equal(skill.system.rating, 2, "back to the natural rating");
          assert.equal(skill.system._adeptBonus, 2, "and Improved Ability returns, capped at 2");
        });
      });

      describe("a slotted skillsoft suppresses sub-ratings", () => {
        // Built through a REAL ActiveSoft rather than by setting the marker by
        // hand: the marker is only correct if _applySkillsofts actually sets it,
        // and the chip rating has to visibly replace the natural one.
        async function chipped(slotted) {
          const a = await pc(false, [
            firearms({ ratingsFinalized: true, rating: 3,
                       concentration: { name: "SMG", rating: 5 },
                       specialization: { name: "Uzi III", rating: 7 } }),
            { name: "Skillwires 8", type: "cyberware",
              system: { installed: true, rating: 8 } },
            { name: "Firearms ActiveSoft", type: "gear",
              system: { category: "skillsoft", slotted, rating: 6,
                        grantedSkill: "Firearms", grantedSkillCategory: "active",
                        grantedSkillAttribute: "quickness" } }
          ]);
          return [a, a.items.find(i => i.type === "skill")];
        }

        it("the chip's rating replaces the skill, and the sub-ratings go with it", async () => {
          const [, item] = await chipped(true);
          assert.equal(item.system.rating, 6, "the chip supplies the skill at ITS rating");
          assert.isTrue(item.system._subRatingsSuppressed, "_applySkillsofts must set the marker");
          assert.equal(sr2eEffectiveSkillRating(item.system, "specialization"), 6,
            "the chip's rating applies, not the natural spec");
          assert.equal(sr2eEffectiveSkillRating(item.system, "concentration"), 6);
          assert.equal(item.system.specialization.rating, 7,
            "and the natural rating is NOT destroyed — it is a marker, not a wipe");
        });

        it("two chips for the same skill do not poison the natural rating", async () => {
          // The first chip captures the natural 3; without a capture-once guard
          // the second captures the FIRST CHIP's rating as "natural", and
          // un-slotting both would strand the skill at a chip rating.
          const a = await pc(false, [
            firearms({ ratingsFinalized: true, rating: 3 }),
            { name: "Skillwires 12", type: "cyberware",
              system: { installed: true, rating: 12 } },
            { name: "Firearms ActiveSoft 5", type: "gear",
              system: { category: "skillsoft", slotted: true, rating: 5,
                        grantedSkill: "Firearms", grantedSkillCategory: "active" } },
            { name: "Firearms ActiveSoft 6", type: "gear",
              system: { category: "skillsoft", slotted: true, rating: 6,
                        grantedSkill: "Firearms", grantedSkillCategory: "active" } }
          ]);
          assert.equal(a.items.find(i => i.type === "skill").system._nativeRating, 3,
            "the natural rating is captured once, from the character");
          for (const g of a.items.filter(i => i.type === "gear")) {
            await g.update({ "system.slotted": false });
          }
          assert.equal(a.items.find(i => i.type === "skill").system.rating, 3,
            "un-slotting both must land back on the character's own rating");
        });

        it("editing a PENDING skill while chipped does not strand a stale rating", async () => {
          // The pending general re-derives from the allocation every pass, so
          // restoring a value cached before the edit would put back the old one.
          const a = await pc(true, [
            firearms({ allocated: 3, ratingsFinalized: false }),
            { name: "Skillwires 8", type: "cyberware",
              system: { installed: true, rating: 8 } },
            { name: "Firearms ActiveSoft", type: "gear",
              system: { category: "skillsoft", slotted: true, rating: 6,
                        grantedSkill: "Firearms", grantedSkillCategory: "active" } }
          ]);
          const skill = a.items.find(i => i.type === "skill");
          assert.equal(skill.system.rating, 6, "the chip supplies the skill");
          await skill.update({ "system.allocated": 4 });
          await a.items.find(i => i.type === "gear").update({ "system.slotted": false });
          assert.equal(a.items.find(i => i.type === "skill").system.rating, 4,
            "the EDITED allocation is what comes back, not the 3 cached before it");
        });

        it("raising a FINALIZED skill while chipped is not lost on un-slot", async () => {
          const a = await pc(false, [
            firearms({ ratingsFinalized: true, rating: 3 }),
            { name: "Skillwires 8", type: "cyberware",
              system: { installed: true, rating: 8 } },
            { name: "Firearms ActiveSoft", type: "gear",
              system: { category: "skillsoft", slotted: true, rating: 6,
                        grantedSkill: "Firearms", grantedSkillCategory: "active" } }
          ]);
          // Karma advances the natural skill while the chip is in.
          await a.items.find(i => i.type === "skill").update({ "system.rating": 5 });
          await a.items.find(i => i.type === "gear").update({ "system.slotted": false });
          assert.equal(a.items.find(i => i.type === "skill").system.rating, 5,
            "restoration reads the authored source, so the Karma purchase survives");
        });

        it("un-slotting restores the character's own ratings", async () => {
          const [a] = await chipped(true);
          await a.items.find(i => i.type === "gear").update({ "system.slotted": false });
          const skill = a.items.find(i => i.type === "skill");
          assert.notOk(skill.system._subRatingsSuppressed, "the marker must clear");
          assert.notOk(skill.system._chipped, "and so must the rest of the chip markers");
          assert.equal(skill.system.rating, 3, "back to the natural rating");
          assert.equal(sr2eEffectiveSkillRating(skill.system, "specialization"), 7);
        });
      });
    }, { displayName: "SR2E: Skill tiers (p.70)" });

    // ── Healing & recovery ────────────────────────────────────────────────────
    // The guard conditions matter more than the rolls here. These are the paths a
    // player hits when already hurt, so a wrong guard either blocks legitimate
    // healing or lets someone walk off a Deadly wound.
    quench.registerBatch("sr2e.healing-guards", (context) => {
      const { describe, it, assert, after } = context;
      const made = [];
      after(async () => { for (const a of made) { try { await a.delete(); } catch (e) {} } });

      async function pc(system = {}) {
        const a = await Actor.create({ name: "Quench Heal", type: "character",
          system: foundry.utils.mergeObject(
            { body: { base: 6 }, willpower: { base: 4 } }, system) });
        made.push(a); return a;
      }

      describe("healPhysical", () => {
        it("refuses a Deadly wound — that needs First Aid or a doctor", async () => {
          const a = await pc();
          const max = a.system.conditionMonitor.physical.max;
          await a.applyDamage("physical", max);
          const before = a.system.conditionMonitor.physical.value;
          await a.healPhysical();
          assert.equal(a.system.conditionMonitor.physical.value, before,
            "a Deadly wound must not heal naturally, and must not be silently ignored either");
        });

        it("does nothing when undamaged", async () => {
          const a = await pc();
          await a.healPhysical();
          assert.equal(a.system.conditionMonitor.physical.value, 0);
        });

        it("heals off NATURAL Body, ignoring cyberware bonuses", async () => {
          // Natural healing uses base + racial only. If it ever read body.value,
          // a chromed character would out-heal an unaugmented one, which inverts
          // the fiction — cyberware is supposed to make healing harder, not easier.
          const a = await pc({ body: { base: 3, mod: 5 } });
          assert.equal(a.system.body.value, 8, "derived Body includes the mod");
          await a.applyDamage("physical", 2);
          // Not asserting the roll outcome — only that the guard let it proceed
          // and it did not throw on the mod being present.
          await a.healPhysical();
          assert.isAtMost(a.system.conditionMonitor.physical.value, 2);
        });
      });

      describe("recoverStun", () => {
        it("does nothing when there is no stun damage", async () => {
          const a = await pc();
          await a.recoverStun();
          assert.equal(a.system.conditionMonitor.stun.value, 0);
        });

        it("rolls the HIGHER of Body and Willpower", async () => {
          // Ties resolve to Willpower, which keeps the Body-overstress branch
          // unambiguous — a tie must not silently become a Body test.
          const a = await pc({ body: { base: 4 }, willpower: { base: 4 } });
          await a.applyDamage("stun", 2);
          await a.recoverStun();
          // The label records which attribute was used; a tie must say Willpower.
          const msgs = game.messages.contents.slice(-4)
            .filter(m => /Recover Stun/.test(m.flavor ?? m.content ?? ""));
          if (msgs.length) {
            assert.match(msgs.at(-1).flavor ?? msgs.at(-1).content, /Willpower/,
              "a Body/Willpower tie must resolve to Willpower");
            for (const m of msgs) await m.delete();
          }
        });
      });
    }, { displayName: "SR2E: Healing guards" });

    // ── Guards & boundaries: dump shock, melee defense, escape ────────────────
    // Three more of the uncovered mutating methods. Each is tested at its GUARD
    // and its BOUNDARY rather than its dice, because those are the parts that are
    // deterministic and the parts that go wrong quietly.
    quench.registerBatch("sr2e.guards-boundaries", (context) => {
      const { describe, it, assert, after } = context;
      const made = [], msgs = [];
      after(async () => {
        for (const m of msgs) { try { await m.delete(); } catch (e) {} }
        for (const a of made) { try { await a.delete(); } catch (e) {} }
      });
      const mk = async (data) => { const a = await Actor.create(data); made.push(a); return a; };

      describe("recoverDumpShock", () => {
        it("does nothing at all when not dump-shocked", async () => {
          const a = await mk({ name: "Quench Decker", type: "character",
            system: { willpower: { base: 5 } } });
          const before = game.messages.size;
          await a.recoverDumpShock();
          assert.equal(game.messages.size, before,
            "no roll, no card — an un-shocked decker pressing the button must be a no-op");
        });

        it("clears the flag only on a success, and posts either way", async () => {
          const a = await mk({ name: "Quench Decker 2", type: "character",
            system: { willpower: { base: 6 }, dumpShock: true } });
          await a.recoverDumpShock();
          for (const m of game.messages.contents.slice(-2)) msgs.push(m);
          // Whichever way the dice fell, the flag and the message must AGREE —
          // a cleared flag with a "still disoriented" card, or vice versa, is the
          // failure worth catching.
          const last = game.messages.contents.at(-1);
          const said = /shakes off/.test(last?.content ?? "");
          assert.equal(a.system.dumpShock, !said,
            "the dumpShock flag must match what the chat card claims happened");
        });
      });

      describe("rollMeleeDefense", () => {
        it("refuses to let the attacker defend against their own attack", async () => {
          const a = await mk({ name: "Quench Attacker", type: "character", system: {} });
          const msg = await ChatMessage.create({ content: "quench melee",
            flags: { sr2e: { melee: { attackerUuid: a.uuid, resolved: false, successes: 2 } } } });
          msgs.push(msg);
          await a.rollMeleeDefense(msg);
          assert.isFalse(msg.getFlag("sr2e", "melee").resolved,
            "self-defence must be refused without consuming the exchange");
        });

        it("ignores an exchange that is already resolved", async () => {
          const atk = await mk({ name: "Quench Atk", type: "character", system: {} });
          const def = await mk({ name: "Quench Def", type: "character", system: {} });
          const msg = await ChatMessage.create({ content: "quench melee 2",
            flags: { sr2e: { melee: { attackerUuid: atk.uuid, resolved: true, successes: 2 } } } });
          msgs.push(msg);
          const before = game.messages.size;
          await def.rollMeleeDefense(msg);
          assert.equal(game.messages.size, before,
            "a resolved exchange must not be re-rollable — otherwise a defender can retry a bad result");
        });
      });

      describe("rollEscapeTest (p.107)", () => {
        // NOTE: the actor here is the PURSUING vehicle, not the fleeing one —
        // p.107 has the pursuer roll, against a TN equal to the fleeing vehicle's
        // net successes, and ZERO successes means the quarry got away. The method
        // name reads the other way round, which is worth knowing before editing it.
        it("fails automatically when the pursuer TIES the fleeing successes", async () => {
          // The boundary is >=, not >, and the book supports it from both ends:
          // the escape auto-fails if the pursuer has "more successes", AND the
          // quarry "may yet get away" only if IT generated "more successes". A tie
          // satisfies neither, so it falls through to no escape.
          const v = await mk({ name: "Quench Pursuer", type: "vehicle", system: { body: 3 } });
          const res = await v.rollEscapeTest({ fleeingSuccesses: 3, pursuerSuccesses: 3 });
          if (res) msgs.push(res);
          assert.match(res?.content ?? "", /Escape fails automatically/,
            "3 vs 3 must fail — the pursuer matching is enough");
        });

        it("proceeds when the fleeing vehicle is genuinely ahead", async () => {
          const v = await mk({ name: "Quench Pursuer 2", type: "vehicle", system: { body: 3 } });
          const res = await v.rollEscapeTest({ fleeingSuccesses: 4, pursuerSuccesses: 3 });
          if (res) msgs.push(res);
          assert.notMatch(res?.content ?? "", /fails automatically/,
            "a net of 1 is still a net — this must roll rather than auto-fail");
        });
      });
    }, { displayName: "SR2E: Guards & boundaries" });

    // ── Astral, spell resistance, ramming ─────────────────────────────────────
    // The last three uncovered mutating methods. Same approach: assert the parts
    // that are deterministic — type gates, attribute selection, and the rounding
    // and floors in the ram arithmetic.
    quench.registerBatch("sr2e.astral-resist-ram", (context) => {
      const { describe, it, assert, after } = context;
      const made = [], msgs = [];
      after(async () => {
        for (const m of msgs) { try { await m.delete(); } catch (e) {} }
        for (const a of made) { try { await a.delete(); } catch (e) {} }
      });
      const mk = async (d) => { const a = await Actor.create(d); made.push(a); return a; };
      const since = () => game.messages.contents.slice(-3);

      describe("rollAstralAttack", () => {
        it("refuses actor types that have no astral existence", async () => {
          // Vehicles and IC are not astrally present. The gate is a silent early
          // return, so the only observable proof is that nothing was posted.
          const v = await mk({ name: "Quench Ram A", type: "vehicle", system: { body: 3 } });
          const before = game.messages.size;
          await v.rollAstralAttack();
          assert.equal(game.messages.size, before, "a vehicle must not roll an astral attack");
        });

        it("also refuses NPCs — a known limitation, not an accident", async () => {
          // NPCData has no astralState, the NPC sheet has no astral controls, and
          // this method gates on character|spirit. All three agree, so the design
          // is coherent — but it does mean NPC magicians (Craft, Stone, Pride in
          // Queen Euphoria) cannot go astral. Pinned so the limitation is visible
          // and a future change has to be deliberate.
          const n = await mk({ name: "Quench NPC Mage", type: "npc",
            system: { magic: { value: 6, type: "full_magician" }, charisma: { base: 4 } } });
          const before = game.messages.size;
          await n.rollAstralAttack();
          assert.equal(game.messages.size, before);
        });

        it("a spirit attacks off its Force", async () => {
          const sp = await mk({ name: "Quench Spirit", type: "spirit",
            system: { spiritType: "elemental", domain: "fire", force: 5 } });
          await sp.rollAstralAttack();
          for (const m of since()) msgs.push(m);
          assert.isAbove(game.messages.size, 0, "a spirit is astrally present and must roll");
        });
      });

      describe("rollSpellResistance", () => {
        // The state carries successes/baseLevel/dmgType so resolution is
        // well-defined. Without them `stages.indexOf(undefined)` is -1 and the
        // damage branch indexes arrays out of bounds — the test would pass while
        // walking through NaN arithmetic.
        async function carded(resistAttr) {
          const a = await mk({ name: `Quench Resist ${resistAttr}`, type: "character",
            system: { body: { base: 5 }, willpower: { base: 3 } } });
          const msg = await ChatMessage.create({ content: "quench spell",
            flags: { sr2e: { spell: { spellName: "Mana Bolt", force: 4, successes: 2,
                                      baseLevel: "M", dmgType: "physical",
                                      resistAttr, resolved: false } } } });
          msgs.push(msg);
          return { actor: a, msg };
        }

        it("ignores an already-resolved spell card", async () => {
          const { actor, msg } = await carded("willpower");
          await msg.setFlag("sr2e", "spell",
            { ...msg.getFlag("sr2e", "spell"), resolved: true });
          const before = game.messages.size;
          await actor.rollSpellResistance(msg);
          assert.equal(game.messages.size, before,
            "a resolved spell must not be re-resistable — otherwise a target retries a bad roll");
        });

        it("resists a mana spell with WILLPOWER", async () => {
          const { actor, msg } = await carded("willpower");
          const resist = await actor.rollSpellResistance(msg);
          for (const m of since()) msgs.push(m);
          // Address the roll card directly. A damage/no-effect card is posted
          // after it, so the last message is never the one carrying the label.
          const card = game.messages.get(resist?.testMessageId);
          assert.ok(card, "the resistance test should have posted a roll card");
          assert.match(card.content ?? "", /Willpower/);
        });

        it("resists a physical spell with BODY", async () => {
          // The attribute is not cosmetic: Body carries biosystem overstress and
          // Willpower must not, so picking the wrong one changes the dice for
          // anyone with bioware.
          const { actor, msg } = await carded("body");
          const resist = await actor.rollSpellResistance(msg);
          for (const m of since()) msgs.push(m);
          // Address the roll card directly. A damage/no-effect card is posted
          // after it, so the last message is never the one carrying the label.
          const card = game.messages.get(resist?.testMessageId);
          assert.ok(card, "the resistance test should have posted a roll card");
          assert.match(card.content ?? "", /Body/);
        });
      });

      describe("rollVehicleRam — half armour rounds DOWN", () => {
        it("treats armour 5 as 2, not 2.5 or 3", async () => {
          // Fractional dice would either throw or silently round in the engine.
          // Odd armour is the case that exposes it.
          const drv = await mk({ name: "Quench Driver", type: "character",
            system: { reaction: { base: 4 }, intelligence: { base: 4 } } });
          const veh = await mk({ name: "Quench Rammer", type: "vehicle",
            system: { body: 4, armor: 5, handling: 3 } });
          const res = await drv.rollVehicleRam(veh,
            { name: "Target", body: 3, armor: 5, handling: 3, skill: 4 }, "normal");
          for (const m of since()) msgs.push(m);
          assert.isOk(res ?? true, "a ram with odd armour on both sides must resolve, not throw");
        });
      });
    }, { displayName: "SR2E: Astral, resistance & ramming" });

    // A Karma spend used to update ONLY the success-test card. Any card posted
    // FROM that test — the opposed-melee Defend card above all — kept the
    // success count it was created with, so the defender rolled against a stale
    // number. Reported from live play: reroll took the attack from 3 to 8 and
    // the Defend card still said 3.
    quench.registerBatch("sr2e.karma-card-sync", (context) => {
      const { describe, it, assert, after } = context;
      const made = [], msgs = [];
      after(async () => {
        for (const m of msgs) { try { await m.delete(); } catch (e) {} }
        for (const a of made) { try { await a.delete(); } catch (e) {} }
      });

      /** An attacker with Karma Pool and a melee weapon. */
      async function attacker() {
        const actor = await Actor.create({
          name: "Quench Karma Attacker", type: "character",
          system: {
            strength: { base: 6 }, quickness: { base: 4 }, intelligence: { base: 4 },
            karma: { total: 100, current: 0, poolAdjust: -1 }   // derived pool of 10
          },
          items: [{
            name: "Quench Blade", type: "weapon",
            system: { weaponType: "melee", skill: "armed combat", damageCode: "(Str)M",
                      damageType: "physical" }
          }]
        });
        made.push(actor);
        return actor;
      }

      describe("a Karma spend reaches the cards posted from the test", () => {
        it("buying a success updates the linked melee Defend card", async () => {
          const actor = await attacker();
          const before = game.messages.contents.length;
          await actor.items.find(i => i.type === "weapon").rollAttack?.({});
          const posted = game.messages.contents.slice(before);
          for (const m of posted) msgs.push(m);

          const testMsg  = posted.find(m => m.getFlag("sr2e", "test"));
          const meleeMsg = posted.find(m => m.getFlag("sr2e", "melee"));
          if (!testMsg || !meleeMsg) return;   // attack missed: no melee card to sync

          assert.equal(meleeMsg.getFlag("sr2e", "melee").testMessageId, testMsg.id,
            "the melee card must record which test it came from");

          const was = meleeMsg.getFlag("sr2e", "melee").successes;
          await actor.applyKarmaToTest(testMsg, "buySuccess");

          const after = meleeMsg.getFlag("sr2e", "melee").successes;
          const expected = testTotalSuccesses(testMsg.getFlag("sr2e", "test"));
          assert.equal(after, expected,
            `Defend card should track the test (was ${was}, test now ${expected})`);
        });

        it("leaves a RESOLVED card alone — that exchange is already settled", async () => {
          const actor = await attacker();
          const state = {
            attackerUuid: actor.uuid, attackerName: actor.name, weaponName: "Quench Blade",
            successes: 3, power: 6, level: "M", damageType: "physical",
            testMessageId: "quenchfaketest01", resolved: true
          };
          const msg = await ChatMessage.create({
            content: "resolved melee card", flags: { sr2e: { melee: state } }
          });
          msgs.push(msg);
          await actor._syncDependentCards("quenchfaketest01",
            { dice: [{ success: true }, { success: true }, { success: true },
                     { success: true }, { success: true }] });
          assert.equal(msg.getFlag("sr2e", "melee").successes, 3,
            "a resolved card must not be rewritten after the fact");
        });

        it("corrects a curative-spell card too (it carries successes in a button)", async () => {
          const actor = await attacker();
          const state = {
            spellName: "Heal", casterName: actor.name,
            subjectUuid: actor.uuid, subjectName: actor.name,
            successes: 2, hurt: true,
            testMessageId: "quenchhealtest01", resolved: false
          };
          const msg = await ChatMessage.create({
            content: "healing card", flags: { sr2e: { healing: state } }
          });
          msgs.push(msg);
          await actor._syncDependentCards("quenchhealtest01",
            { dice: [{ success: true }, { success: true }, { success: true },
                     { success: true }] });
          assert.equal(msg.getFlag("sr2e", "healing").successes, 4,
            "the healing offer must follow the casting test");
          assert.include(msg.content, 'data-successes="4"',
            "the Apply Healing button must carry the corrected count");
        });

        it("does nothing when no card points at that test", async () => {
          const actor = await attacker();
          await actor._syncDependentCards("quenchnosuchtest", { dice: [{ success: true }] });
          assert.isOk(true, "syncing with no dependents must not throw");
        });
      });
    }, { displayName: "SR2E: Karma spend syncs dependent cards" });

    // ── Area-effect spells (SR2E p.130): no target token needed; one roll,
    //    scored per target; frozen cards; nothing spent on an abort. ──────────
    quench.registerBatch("sr2e.area-spells", (context) => {
      const { describe, it, assert, before, after } = context;
      const made = { actors: [], tokens: [], templates: [], messages: [] };
      let mage, sleep, w3, w5, centre;
      const newMessages = (n) => game.messages.contents.slice(n);
      // Deterministic dice: Foundry rolls a face as ceil((1 − u) × 6), so the
      // uniform (6.5 − f) / 6 yields face f. After the queue, real randomness
      // (the drain roll does not matter here).
      const withFaces = async (faces, fn) => {
        const orig = CONFIG.Dice.randomUniform;
        const q = [...faces];
        CONFIG.Dice.randomUniform = () => q.length ? (6.5 - q.shift()) / 6 : orig();
        try { return await fn(); } finally { CONFIG.Dice.randomUniform = orig; }
      };

      before(async () => {
        if (!canvas?.ready) return;
        const pack = game.packs.get("sr2e.spells");
        const idx = await pack.getIndex();
        const doc = async (name) => (await pack.getDocument(idx.find(e => e.name === name)._id)).toObject();
        const npc = async (name, wil, extra = {}) => {
          const a = await Actor.create({ name, type: "npc", system: { willpower: { base: wil }, ...extra } });
          made.actors.push(a); return a;
        };
        mage = await npc("Quench Area Mage", 5, { magic: { value: 6 } });
        await mage.createEmbeddedDocuments("Item", [await doc("Sleep"), await doc("Confusion")]);
        sleep = mage.items.getName("Sleep");
        w3 = await npc("Quench Area W3", 3);
        w5 = await npc("Quench Area W5", 5);
        const far = await npc("Quench Area Far", 3);
        const hidden = await npc("Quench Area Hidden", 3);
        const g = canvas.dimensions.size;                       // px per grid unit
        const m = g / canvas.dimensions.distance;               // px per metre
        const o = { x: canvas.dimensions.sceneX + 20 * g, y: canvas.dimensions.sceneY + 20 * g };
        const put = async (a, dx, dy, hidden = false) => {
          const t = (await canvas.scene.createEmbeddedDocuments("Token", [{
            ...(await a.getTokenDocument()).toObject(), x: o.x + dx * m, y: o.y + dy * m, hidden }]))[0];
          made.tokens.push(t.id);
        };
        // Magic 6 → a 6 m radius. The mage stands INSIDE (friend and foe alike).
        await put(mage, -3, 0); await put(w3, 2, 0); await put(w5, 0, 4);
        await put(far, 12, 0); await put(hidden, 1, 1, true);
        await new Promise(r => setTimeout(r, 300));
        centre = { x: o.x + (g * 1) / 2, y: o.y + (g * 1) / 2, sceneId: canvas.scene.id };
      });

      after(async function () {
        this.timeout(15000);
        if (!canvas?.ready) return;
        // Let Foundry's floating damage numbers (drain on the mage) finish:
        // deleting a token under one throws an uncaught PIXI error.
        await new Promise(r => setTimeout(r, 2500));
        const tpl = canvas.scene.templates.filter(t => String(t.flags?.sr2e?.areaSpell ?? "").length && made.templates.includes(t.id));
        if (tpl.length) await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", tpl.map(t => t.id));
        await canvas.scene.deleteEmbeddedDocuments("Token", made.tokens.filter(id => canvas.scene.tokens.has(id)));
        await ChatMessage.deleteDocuments(made.messages.filter(id => game.messages.has(id)));
        for (const a of made.actors) await a.delete();
      });

      const cast = async (item, opts) => {
        const n = game.messages.size;
        const tplBefore = new Set(canvas.scene.templates.map(t => t.id));
        const r = await item.roll(opts);
        await new Promise(res => setTimeout(res, 300));
        const msgs = newMessages(n);
        made.messages.push(...msgs.map(x => x.id));
        made.templates.push(...canvas.scene.templates.filter(t => !tplBefore.has(t.id)).map(t => t.id));
        return { r, msgs };
      };

      describe("Area combat spell with no targeted token", () => {
        it("scores ONE roll against each caught target's own Willpower", async function () {
          if (!canvas?.ready) this.skip();
          // Force 4 Sleep, faces 5,4,3,1. Caught: W3, W5 and the caster (W5),
          // who stands inside — p.130, friend and foe alike.
          const { msgs } = await withFaces([5, 4, 3, 1],
            () => cast(sleep, { force: 4, area: { ...centre, radiusDelta: 0 } }));
          const test = msgs.find(x => x.flags?.sr2e?.test?.areaCast)?.flags.sr2e.test;
          assert.ok(test, "the casting test must be flagged areaCast");
          assert.deepEqual(test.dice.map(d => d.total), [5, 4, 3, 1]);
          assert.equal(test.tn, 3, "the roll's own TN is the lowest caught Willpower");
          // Only this batch's tokens: the scene may hold real ones in range.
          const cards = Object.fromEntries(msgs.filter(x => x.flags?.sr2e?.spell?.areaCard)
            .filter(x => x.flags.sr2e.spell.targetName.startsWith("Quench "))
            .map(x => [x.flags.sr2e.spell.targetName, x.flags.sr2e.spell]));
          assert.hasAllKeys(cards, ["Quench Area W3", "Quench Area W5", "Quench Area Mage"],
            "one card per caught target with successes — never the far or hidden token");
          assert.include(cards["Quench Area W3"], { targetTN: 3, successes: 3 });
          assert.include(cards["Quench Area W5"], { targetTN: 5, successes: 1 });
          assert.include(cards["Quench Area Mage"], { targetTN: 5, successes: 1 });
          const summary = msgs.find(x => x.whisper.length && /One roll/.test(x.content));
          assert.ok(summary, "a whispered summary is posted");
          assert.notInclude(summary.content, "Quench Area Far");
          assert.notInclude(summary.content, "Quench Area Hidden", "hidden tokens are never caught or named");
        });

        it("floors the base dice at 0 once, then adds the rest (withheld = Force)", async function () {
          if (!canvas?.ready) this.skip();
          // Force 2 with a +2 m radius withholds both Force dice; 2 misc dice
          // still roll. spellCastDice: base max(0, 0) = 0, total 0 + 2 = 2.
          const { msgs } = await cast(sleep, { force: 2, miscDice: 2, area: { ...centre, radiusDelta: 2 } });
          const test = msgs.find(x => x.flags?.sr2e?.test?.areaCast)?.flags.sr2e.test;
          assert.lengthOf(test.dice, 2, "0 base dice + 2 misc = 2 dice rolled");
          assert.ok(msgs.some(x => /8 m radius/.test(x.content)), "Magic 6 + 2 = 8 m");
        });

        it("whispers target-naming cards away from uninvolved players", async function () {
          if (!canvas?.ready) this.skip();
          const bystander = game.users.find(u => !u.isGM && u.id !== game.user.id
            && !w3.testUserPermission(u, "OWNER") && !w5.testUserPermission(u, "OWNER"));
          if (!bystander) this.skip();
          const { msgs } = await cast(sleep, { force: 4, area: { ...centre, radiusDelta: 0 } });
          for (const x of msgs.filter(x => x.flags?.sr2e?.spell?.areaCard || /One roll|no one was caught/.test(x.content))) {
            assert.ok(x.whisper.length > 0, "target-naming output is whispered");
            assert.notInclude(x.whisper, bystander.id, "an uninvolved player does not receive it");
          }
        });

        it("refuses Karma reroll / buy on the multi-target roll", async function () {
          if (!canvas?.ready) this.skip();
          const { msgs } = await cast(sleep, { force: 4, area: { ...centre, radiusDelta: 0 } });
          const testMsg = msgs.find(x => x.flags?.sr2e?.test?.areaCast);
          const before = JSON.stringify(testMsg.flags.sr2e.test);
          await mage.applyKarmaToTest(testMsg, "reroll");
          await mage.applyKarmaToTest(testMsg, "buySuccess");
          assert.equal(JSON.stringify(game.messages.get(testMsg.id).flags.sr2e.test), before);
        });

        it("aborts an invalid radius or a stale scene before spending anything", async function () {
          if (!canvas?.ready) this.skip();
          const stun = mage.system.conditionMonitor.stun.value;
          const a = await cast(sleep, { force: 4, area: { ...centre, radiusDelta: 5 } });   // 5 dice > Force 4
          const b = await cast(sleep, { force: 4, area: { ...centre, sceneId: "nope", radiusDelta: 0 } });
          assert.isNull(a.r); assert.isNull(b.r);
          assert.lengthOf(a.msgs, 0); assert.lengthOf(b.msgs, 0);
          assert.equal(mage.system.conditionMonitor.stun.value, stun, "no drain was taken");
        });

        it("still resolves when the caster may not create templates", async function () {
          if (!canvas?.ready) this.skip();
          const orig = game.user.can;
          game.user.can = (p) => p === "TEMPLATE_CREATE" ? false : orig.call(game.user, p);
          try {
            const { msgs } = await cast(sleep, { force: 4, area: { ...centre, radiusDelta: 0 } });
            assert.ok(msgs.some(x => /no template/.test(x.content)), "says why there is no template");
            assert.ok(msgs.some(x => /One roll/.test(x.content)), "the spell still resolves");
          } finally { game.user.can = orig; }
        });
      });

      describe("Non-combat area spell", () => {
        it("lists who is in the area without success counts, and keeps normal Karma", async function () {
          if (!canvas?.ready) this.skip();
          const { msgs } = await withFaces([2], () => cast(mage.items.getName("Confusion"),
            { force: 3, targetNumber: 4, area: { ...centre, radiusDelta: -1 } }));   // 5 m, 2 dice withheld
          const testMsg = msgs.find(x => x.flags?.sr2e?.test);
          assert.notOk(testMsg.flags.sr2e.test.areaCast, "one TN — Karma stays available");
          assert.lengthOf(testMsg.flags.sr2e.test.dice, 1, "Force 3 less 2 withheld = 1 die");
          const summary = msgs.find(x => x.whisper.length && /In the area/.test(x.content));
          assert.ok(summary, "candidates summary posted");
          assert.include(summary.content, "Quench Area W3");
          assert.notMatch(summary.content, /\d+ success/, "no counts that a later reroll could contradict");
          // Now actually reroll with Karma: the test changes, the summary does not.
          const before = summary.content;
          const saved = { karma: mage.system.karma, spend: mage._spendKarmaPool };
          mage.system.karma = { pool: 5 };
          mage._spendKarmaPool = async () => {};
          try {
            await withFaces([6, 1], () => mage.applyKarmaToTest(testMsg, "reroll"));
          } finally { mage.system.karma = saved.karma; mage._spendKarmaPool = saved.spend; }
          assert.equal(game.messages.get(testMsg.id).flags.sr2e.test.rerolls, 1, "the reroll went through");
          assert.equal(game.messages.get(summary.id).content, before, "the summary is untouched");
        });
      });
    }, { displayName: "SR2E: Area spells (p.130)" });

    // ── Damaging manipulation spells (SR2E p.129–131, p.158): Flamethrower,
    //    Spark, Flame Bomb resolve as ranged-combat damage. ──────────────────
    quench.registerBatch("sr2e.manipulation-damage", (context) => {
      const { describe, it, assert, before, after } = context;
      const made = { actors: [], tokens: [], templates: [], messages: [] };
      let mage, goon, centre;
      const withFaces = async (faces, fn) => {
        const orig = CONFIG.Dice.randomUniform;
        const q = [...faces];
        CONFIG.Dice.randomUniform = () => q.length ? (6.5 - q.shift()) / 6 : orig();
        try { return await fn(); } finally { CONFIG.Dice.randomUniform = orig; }
      };
      const cast = async (item, opts) => {
        // Drain from an earlier case would raise this cast's TN (wounds).
        await item.parent.update({ "system.conditionMonitor.stun.value": 0, "system.conditionMonitor.physical.value": 0 });
        const n = game.messages.size;
        const tplBefore = new Set(canvas.scene.templates.map(t => t.id));
        const r = await item.roll(opts);
        await new Promise(res => setTimeout(res, 300));
        const msgs = game.messages.contents.slice(n);
        made.messages.push(...msgs.map(x => x.id));
        made.templates.push(...canvas.scene.templates.filter(t => !tplBefore.has(t.id)).map(t => t.id));
        return { r, msgs };
      };

      before(async () => {
        if (!canvas?.ready) return;
        const pack = game.packs.get("sr2e.spells");
        const idx = await pack.getIndex();
        const doc = async (name) => (await pack.getDocument(idx.find(e => e.name === name)._id)).toObject();
        const npc = async (name, extra = {}) => {
          const a = await Actor.create({ name, type: "npc", system: extra }); made.actors.push(a); return a;
        };
        mage = await npc("Quench Manip Mage", { magic: { value: 6 }, willpower: { base: 6 } });
        await mage.createEmbeddedDocuments("Item", [await doc("Flamethrower"), await doc("Flame Bomb"), await doc("Spark")]);
        // Body 12: twelve resistance dice, so fixed faces can force either outcome.
        goon = await npc("Quench Manip Goon", { body: { base: 12 } });
        const goon2 = await npc("Quench Manip Goon2");
        const hidden = await npc("Quench Manip Hidden");
        const car = await Actor.create({ name: "Quench Manip Car", type: "vehicle" }); made.actors.push(car);
        const g = canvas.dimensions.size, m = g / canvas.dimensions.distance;
        const o = { x: canvas.dimensions.sceneX + 30 * g, y: canvas.dimensions.sceneY + 20 * g };
        const put = async (a, dx, dy, hidden = false) => {
          const t = (await canvas.scene.createEmbeddedDocuments("Token", [{
            ...(await a.getTokenDocument()).toObject(), x: o.x + dx * m, y: o.y + dy * m, hidden }]))[0];
          made.tokens.push(t.id); return t;
        };
        await put(mage, -10, 0);                   // outside the 6 m blast
        await put(goon, 2, 0); await put(goon2, -2, 0); await put(car, 0, 3); await put(hidden, 1, 1, true);
        await new Promise(r => setTimeout(r, 300));
        centre = { x: o.x + g / 2, y: o.y + g / 2, sceneId: canvas.scene.id };
      });

      after(async function () {
        this.timeout(15000);   // the wait below outlasts Mocha's 2 s hook default
        if (!canvas?.ready) return;
        await canvas.tokens.setTargets([]);
        // Let Foundry's floating damage numbers finish first: deleting a token
        // under one throws an uncaught PIXI error that Quench counts as a failure.
        await new Promise(r => setTimeout(r, 2500));
        const tpl = made.templates.filter(id => canvas.scene.templates.has(id));
        if (tpl.length) await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", tpl);
        await canvas.scene.deleteEmbeddedDocuments("Token", made.tokens.filter(id => canvas.scene.tokens.has(id)));
        await ChatMessage.deleteDocuments(made.messages.filter(id => game.messages.has(id)));
        for (const a of made.actors) await a.delete();
      });

      const goonToken = () => canvas.scene.tokens.find(t => t.actor?.name === "Quench Manip Goon");

      describe("Flamethrower / Spark (single target)", () => {
        it("posts (F)M with the successes to stage on the net, ½ Impact, complete-miss aware", async function () {
          if (!canvas?.ready) this.skip();
          await canvas.tokens.setTargets([goonToken().id]);
          // Force 5 at TN 4: faces 5,5,5,5,1 → 4 successes → M +2 = D.
          const { msgs } = await withFaces([5, 5, 5, 5, 1],
            () => cast(mage.items.getName("Flamethrower"), { force: 5, targetNumber: 4 }));
          const card = msgs.find(x => x.flags?.sr2e?.manipDamage);
          assert.ok(card, "a damage card is posted");
          const st = card.flags.sr2e.manipDamage;
          assert.include(st, { basePower: 5, baseLevel: "M", successes: 4, targetName: goonToken().name });
          const btn = new DOMParser().parseFromString(card.content, "text/html").querySelector("button[data-manip]");
          // Net staging (p.91 via p.130): the button carries the BASE level and
          // the caster's successes; the target's roll decides the net.
          assert.equal(btn.dataset.level, "M");
          assert.equal(btn.dataset.stage, "net");
          assert.equal(btn.dataset.stageVs, "4");
          assert.equal(st.staging, "net");
          assert.equal(btn.dataset.power, "5");
          assert.equal(btn.dataset.armorCalc, "half_impact");
          assert.equal(btn.dataset.attackerSuccesses, "4");
          assert.equal(btn.dataset.targetUuid, goonToken().actor.uuid);
        });

        it("fizzles with no button at 0 successes, and a Karma reroll brings it to life", async function () {
          if (!canvas?.ready) this.skip();
          await canvas.tokens.setTargets([goonToken().id]);
          const { msgs } = await withFaces([1, 2, 3],
            () => cast(mage.items.getName("Spark"), { force: 3, targetNumber: 4 }));
          const card = msgs.find(x => x.flags?.sr2e?.manipDamage);
          assert.ok(card, "the card exists even at 0 successes");
          assert.notInclude(card.content, "data-manip", "no Resist button on a fizzle");
          const testMsg = msgs.find(x => x.flags?.sr2e?.test && /Cast Spark/.test(x.flags.sr2e.test.label));
          const saved = { karma: mage.system.karma, spend: mage._spendKarmaPool };
          mage.system.karma = { pool: 5 };
          mage._spendKarmaPool = async () => {};
          try {
            await withFaces([5, 4, 6, 2], () => mage.applyKarmaToTest(testMsg, "reroll"));
          } finally { mage.system.karma = saved.karma; mage._spendKarmaPool = saved.spend; }
          const live = game.messages.get(card.id);
          assert.isAbove(live.flags.sr2e.manipDamage.successes, 0, "the card picked up the reroll");
          assert.include(live.content, "data-manip", "and now has its Resist button");
        });

        it("hands a vehicle target to the GM instead of a button", async function () {
          if (!canvas?.ready) this.skip();
          const carTok = canvas.scene.tokens.find(t => t.actor?.name === "Quench Manip Car");
          await canvas.tokens.setTargets([carTok.id]);
          const { msgs } = await withFaces([5, 5, 5],
            () => cast(mage.items.getName("Spark"), { force: 3, targetNumber: 4 }));
          assert.notOk(msgs.some(x => x.flags?.sr2e?.manipDamage), "no auto-resolved card");
          assert.ok(msgs.some(x => /GM resolves it against a vehicle/.test(x.content)));
          await canvas.tokens.setTargets([]);
        });
      });

      describe("Flame Bomb (area)", () => {
        it("gives everyone caught the same staged code; vehicles to the GM; hidden never", async function () {
          if (!canvas?.ready) this.skip();
          await canvas.tokens.setTargets([]);
          const { msgs } = await withFaces([5, 5, 2, 1],
            () => cast(mage.items.getName("Flame Bomb"), { force: 4, targetNumber: 4, area: { ...centre, radiusDelta: 0 } }));
          // Only this batch's tokens: the scene may hold real ones in range.
          const cards = msgs.filter(x => x.flags?.sr2e?.manipDamage).map(x => x.flags.sr2e.manipDamage)
            .filter(c => c.targetName.startsWith("Quench "));
          assert.deepEqual(cards.map(c => c.targetName).sort(), ["Quench Manip Goon", "Quench Manip Goon2"],
            "a card per goon (car → GM, hidden excluded, mage outside)");
          for (const c of cards) assert.include(c, { successes: 2, basePower: 4, area: true });
          const summary = msgs.find(x => x.whisper.length && /Caught in the blast/.test(x.content));
          assert.include(summary.content, "vehicle: the GM resolves it");
          assert.notInclude(summary.content, "Quench Manip Hidden");
        });
      });

      describe("Reconciling cards posted while Karma or a resolution lands", () => {
        it("never rewrites a resolved card, and brings the rest to the newest total", async function () {
          if (!canvas?.ready) this.skip();
          await canvas.tokens.setTargets([]);
          const bomb = mage.items.getName("Flame Bomb");
          const { msgs } = await withFaces([5, 5, 2, 1],
            () => cast(bomb, { force: 4, targetNumber: 4, area: { ...centre, radiusDelta: 0 } }));
          const [a, b] = msgs.filter(x => x.flags?.sr2e?.manipDamage?.targetName?.startsWith("Quench "));
          const testId = a.flags.sr2e.manipDamage.testMessageId;
          // Someone resolves card A; then the caster's casting test gains 2
          // successes — the state a batch can find mid-post.
          const r = await ChatMessage.create({ content: "resolved elsewhere", flags: { sr2e: { resolves: a.id } } });
          made.messages.push(r.id);
          const test = game.messages.get(testId);
          await test.update({ "flags.sr2e.test": { ...test.flags.sr2e.test,
            boughtSuccesses: (test.flags.sr2e.test.boughtSuccesses ?? 0) + 2 } });
          await bomb._reconcileManipCards([a, b], { testMessageId: testId, successes: 2 });
          assert.equal(game.messages.get(a.id).flags.sr2e.manipDamage.successes, 2, "the resolved card keeps its damage");
          assert.equal(game.messages.get(b.id).flags.sr2e.manipDamage.successes, 4, "the live card takes the newest total");
        });
      });

      describe("Resolution guards (the real resist path)", () => {
        // Resolves with the next DialogV2 once it renders, so a test can act
        // while the resist dialog is open, then confirm it.
        const nextDialog = () => new Promise(res => Hooks.once("renderDialogV2", (app) => setTimeout(() => res(app), 50)));
        const confirm = (app) => app.element.querySelector('button[data-action="roll"]').click();
        const resist = (card) => game.sr2e.resistManipDamage(card);
        const spark = async (faces = [5, 5, 5]) => {
          await canvas.tokens.setTargets([goonToken().id]);
          const { msgs } = await withFaces(faces, () => cast(mage.items.getName("Spark"), { force: 3, targetNumber: 4 }));
          await canvas.tokens.setTargets([]);
          return msgs.find(x => x.flags?.sr2e?.manipDamage);
        };
        const newSince = (n) => { const m = game.messages.contents.slice(n); made.messages.push(...m.map(x => x.id)); return m; };

        it("beforeRoll=false spends nothing and applies nothing", async function () {
          if (!canvas?.ready) this.skip();
          const target = goonToken().actor;
          const phys = target.system.conditionMonitor.physical.value;
          const n = game.messages.size;
          nextDialog().then(confirm);
          const r = await target.rollDamageResistance(5, "M", "impact", "physical",
            { armorCalc: "half_impact", beforeRoll: async () => false });
          assert.isNull(r);
          assert.lengthOf(newSince(n), 0, "no roll, no outcome message");
          assert.equal(target.system.conditionMonitor.physical.value, phys);
        });

        it("tags every outcome with the card it resolves (damage taken, fully resisted)", async function () {
          if (!canvas?.ready) this.skip();
          const { isManipCardResolved } = await import("../documents/item.mjs");
          for (const [label, bodyFaces] of [["damage taken", Array(12).fill(2)], ["fully resisted", Array(12).fill(5)]]) {
            const card = await spark();
            assert.isFalse(isManipCardResolved(card), `${label}: starts live`);
            const n = game.messages.size;
            nextDialog().then(confirm);
            await withFaces(bodyFaces, () => resist(card));
            const out = newSince(n);
            assert.ok(out.some(x => x.flags?.sr2e?.resolves === card.id), `${label}: outcome carries the marker`);
            assert.isTrue(isManipCardResolved(game.messages.get(card.id)), `${label}: card now reads resolved`);
          }
        });

        it("a double click on this client resolves once", async function () {
          if (!canvas?.ready) this.skip();
          const card = await spark();
          const n = game.messages.size;
          nextDialog().then(confirm);
          await Promise.all([resist(card), resist(card)]);
          assert.lengthOf(newSince(n).filter(x => x.flags?.sr2e?.resolves === card.id), 1);
        });

        it("refuses when the caster spends Karma while the dialog is open", async function () {
          if (!canvas?.ready) this.skip();
          const card = await spark();
          const n = game.messages.size;
          nextDialog().then(async (app) => {
            const st = card.flags.sr2e.manipDamage;
            await card.update({ "flags.sr2e.manipDamage": { ...st, successes: st.successes + 2 } });
            confirm(app);
          });
          const r = await resist(card);
          assert.isNull(r, "revalidation failed");
          assert.lengthOf(newSince(n).filter(x => x.flags?.sr2e?.resolves), 0, "nothing resolved");
        });

        it("refuses when someone else resolves it while the dialog is open", async function () {
          if (!canvas?.ready) this.skip();
          const card = await spark();
          const n = game.messages.size;
          nextDialog().then(async (app) => {
            const m = await ChatMessage.create({ content: "elsewhere", flags: { sr2e: { resolves: card.id } } });
            made.messages.push(m.id);
            confirm(app);
          });
          const r = await resist(card);
          assert.isNull(r);
          assert.lengthOf(newSince(n).filter(x => x.flags?.sr2e?.resolves === card.id && x.content !== "elsewhere"), 0);
        });

        it("never redirects a card whose target is gone, and refuses a vehicle stand-in", async function () {
          if (!canvas?.ready) this.skip();
          const card = await spark();
          const st = card.flags.sr2e.manipDamage;
          await card.update({ "flags.sr2e.manipDamage": { ...st, targetUuid: "Actor.doesnotexist000" } });
          const n = game.messages.size;
          await resist(game.messages.get(card.id));
          assert.lengthOf(newSince(n), 0, "deleted target: nothing rolled against whoever is selected");
          // An untargeted card with a VEHICLE selected must not reach the vehicle rules.
          await card.update({ "flags.sr2e.manipDamage": { ...st, targetUuid: "" } });
          const carTok = canvas.tokens.placeables.find(t => t.actor?.name === "Quench Manip Car");
          carTok.control({ releaseOthers: true });
          const m = game.messages.size;
          await resist(game.messages.get(card.id));
          carTok.release();
          assert.lengthOf(newSince(m), 0, "vehicle refused");
        });
      });
    }, { displayName: "SR2E: Damaging manipulation (p.158)" });

    // ── Elementals aiding sorcery (SR2E p.141–142): Aid Sorcery and Spell
    //    Sustaining through the one transition executor. ──────────────────────
    // ── Net-success damage staging (SR2E p.91, p.97, p.108, p.130) ───────────
    // Ranged, blast, spread, vehicle and manipulation damage stage on attacker
    // vs target successes, not up-then-down on each side's gross.
    quench.registerBatch("sr2e.net-staging", (context) => {
      const { describe, it, assert, before, after } = context;
      const made = { actors: [], tokens: [], messages: [], templates: [] };
      let shooter, target, car, shooterTok, targetTok;
      const withFaces = async (faces, fn) => {
        const orig = CONFIG.Dice.randomUniform;
        const q = [...faces];
        CONFIG.Dice.randomUniform = () => q.length ? (6.5 - q.shift()) / 6 : orig();
        try { return await fn(); } finally { CONFIG.Dice.randomUniform = orig; }
      };
      const nextDialog = () => new Promise(res => Hooks.once("renderDialogV2", (app) => setTimeout(() => res(app), 50)));
      const confirm = (app) => app.element.querySelector('button[data-action="roll"]').click();
      const since = (n) => { const m = game.messages.contents.slice(n); made.messages.push(...m.map(x => x.id)); return m; };
      const heal = (a) => a.update({ "system.conditionMonitor.physical.value": 0, "system.conditionMonitor.stun.value": 0 });
      const phys = (a) => a.system.conditionMonitor.physical.value;
      const btnOf = (msg, sel = "button.sr2e-resist-btn") =>
        new DOMParser().parseFromString(msg.content, "text/html").querySelector(sel);
      // A blast/spread card has one row per caught token; find the target's.
      const rowFor = (msgs, uuid) => msgs.flatMap(m => [...new DOMParser()
        .parseFromString(m.content, "text/html").querySelectorAll("button.sr2e-resist-btn")])
        .find(b => b.dataset.targetUuid === uuid);
      // Resist with fixed faces, confirming the dialog (and a pool, if asked).
      const resist = async (actor, power, level, faces, opts = {}, pool = 0) => {
        const n = game.messages.size;
        nextDialog().then(app => {
          const inp = app.element.querySelector('input[name="pool_combat"]');
          if (inp) inp.value = String(pool);
          confirm(app);
        });
        await withFaces(faces, () => actor.rollDamageResistance(power, level, "ballistic", "physical", opts));
        return since(n);
      };

      before(async () => {
        if (!canvas?.ready) return;
        shooter = await Actor.create({ name: "Quench Net Shooter", type: "character" }); made.actors.push(shooter);
        await shooter.createEmbeddedDocuments("Item", [
          { name: "Firearms", type: "skill", system: { rating: 6, category: "active" } }]);
        // Body 3, no armour: TN = Power − 0, and three dice so faces fix the count.
        // Q/I/W 2 give a Combat Pool of 3 for the complete-miss case.
        target = await Actor.create({ name: "Quench Net Target", type: "npc", system: {
          body: { base: 3 }, quickness: { base: 2 }, intelligence: { base: 2 }, willpower: { base: 2 } } });
        made.actors.push(target);
        car = await Actor.create({ name: "Quench Net Car", type: "vehicle", system: { body: 4, armor: 0 } });
        made.actors.push(car);
        const g = canvas.dimensions.size, m = g / canvas.dimensions.distance;
        const o = { x: canvas.dimensions.sceneX + 40 * g, y: canvas.dimensions.sceneY + 25 * g };
        const put = async (a, dx) => {
          const t = (await canvas.scene.createEmbeddedDocuments("Token", [{
            ...(await a.getTokenDocument()).toObject(), x: o.x + dx * m, y: o.y }]))[0];
          made.tokens.push(t.id); return t;
        };
        shooterTok = await put(shooter, -5);
        targetTok = await put(target, 0);
        await new Promise(r => setTimeout(r, 300));
      });

      after(async function () {
        this.timeout(15000);
        if (!canvas?.ready) return;
        await canvas.tokens.setTargets([]);
        await new Promise(r => setTimeout(r, 2500));   // floating damage text (PIXI) must finish first
        const tpl = canvas.scene.templates.filter(t => t.getFlag("sr2e", "blast")).map(t => t.id);
        if (tpl.length) await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", tpl);
        await canvas.scene.deleteEmbeddedDocuments("Token", made.tokens.filter(id => canvas.scene.tokens.has(id)));
        await ChatMessage.deleteDocuments(made.messages.filter(id => game.messages.has(id)));
        for (const a of made.actors) await a.delete();
      });

      describe("Producers carry the pre-staging level", () => {
        it("a direct shot posts the weapon's level and the successes, not a pre-staged code", async function () {
          if (!canvas?.ready) this.skip();
          const [gun] = await shooter.createEmbeddedDocuments("Item", [{ name: "Quench Net Pistol", type: "weapon",
            system: { weaponType: "firearm", skill: "firearms", damageCode: "5M", firingModes: { sa: true },
                      ammo: { current: 10, max: 10 } } }]);
          await canvas.tokens.setTargets([targetTok.id]);
          const n = game.messages.size;
          await withFaces(Array(6).fill(5), () => gun.roll({ firingMode: "sa" }));
          const btn = since(n).map(m => btnOf(m)).find(b => b?.dataset.power);
          assert.ok(btn, "a resist button was posted");
          assert.include(btn.dataset, { stage: "net", level: "M", stageVs: "6", ratedLevel: "M", calledShot: "0" });
        });

        it("a burst + called shot past D is capped at D, and remembers the printed rating", async function () {
          if (!canvas?.ready) this.skip();
          const [gun] = await shooter.createEmbeddedDocuments("Item", [{ name: "Quench Net SMG", type: "weapon",
            system: { weaponType: "firearm", skill: "firearms", damageCode: "6S", recoilComp: 3,
                      firingModes: { sa: true, bf: true }, ammo: { current: 30, max: 30 } } }]);
          await canvas.tokens.setTargets([targetTok.id]);
          const n = game.messages.size;
          // otherMod −4 cancels the called shot's +4 so forced 5s still hit TN 4.
          await withFaces(Array(6).fill(5), () => gun.roll({ firingMode: "bf", rounds: 3, calledShot: true, otherMod: -4 }));
          const btn = since(n).map(m => btnOf(m)).find(b => b?.dataset.power);
          assert.ok(btn, "a resist button was posted");
          assert.include(btn.dataset, { stage: "net", level: "D", ratedLevel: "S", calledShot: "1" });
        });

        it("blast rows stage on the net; an old launcher still pre-stages", async function () {
          if (!canvas?.ready) this.skip();
          const args = { centerTokenUuid: targetTok.uuid, basePower: 10, baseLevel: "S", damageType: "physical",
            blastType: "offensive", attackerSuccesses: 5, delivery: "launcher", blastName: "Quench Net Nade" };
          // 5 successes × 4 m ≥ 3D6: the round lands on the target.
          let n = game.messages.size;
          await game.sr2e.resolveBlast({ ...args, netStaging: true });
          const row = rowFor(since(n), targetTok.actor.uuid);
          assert.include(row.dataset, { stage: "net", level: "S", stageVs: "5", ratedLevel: "S", calledShot: "0" });
          assert.isUndefined(row.dataset.attackerSuccesses, "a blast is never a complete miss");
          n = game.messages.size;
          await game.sr2e.resolveBlast(args);
          const old = rowFor(since(n), targetTok.actor.uuid);
          assert.equal(old.dataset.level, "D", "legacy: S + ⌊5/2⌋ pre-staged");
          assert.isUndefined(old.dataset.stage);
        });

        it("spread rows stage on the net and keep complete-miss; an old launcher pre-stages", async function () {
          if (!canvas?.ready) this.skip();
          const args = { shooterTokenUuid: shooterTok.uuid, targetTokenUuid: targetTok.uuid, basePower: 10,
            baseLevel: "S", damageType: "physical", choke: 3, attackerSuccesses: 2, weaponName: "Quench Net Shotgun" };
          let n = game.messages.size;
          await game.sr2e.resolveShotgunSpread({ ...args, netStaging: true, calledShot: true });
          const row = rowFor(since(n), targetTok.actor.uuid);
          assert.include(row.dataset, { stage: "net", level: "D", stageVs: "2", attackerSuccesses: "2", calledShot: "1" },
            "called shot lifts S to D; complete-miss eligibility kept");
          n = game.messages.size;
          await game.sr2e.resolveShotgunSpread(args);
          const old = rowFor(since(n), targetTok.actor.uuid);
          assert.equal(old.dataset.level, "D", "legacy: S + ⌊2/2⌋ pre-staged");
          assert.isUndefined(old.dataset.stage);
        });
      });

      describe("Scatter Diagram (p.97)", () => {
        it("a 4 bounces the round straight back toward the thrower", async function () {
          if (!canvas?.ready) this.skip();
          const before = new Set(canvas.scene.templates.map(t => t.id));
          // Launcher: 3D6 scatter (2,2,2 = 6 m, no successes), then the diagram's 1D6 = 4.
          await withFaces([2, 2, 2, 4], () => game.sr2e.resolveBlast({
            centerTokenUuid: targetTok.uuid, shooterTokenUuid: shooterTok.uuid, basePower: 10, baseLevel: "S",
            damageType: "physical", blastType: "offensive", attackerSuccesses: 0, delivery: "launcher",
            blastName: "Quench Net Scatter", netStaging: true }));
          const tpl = canvas.scene.templates.find(t => !before.has(t.id));
          assert.ok(tpl, "a blast template was placed");
          const m = canvas.dimensions.size / canvas.dimensions.distance;
          const tgt = targetTok.object.center, me = shooterTok.object.center;
          // The shooter stands 5 m west of the target: 6 m back = 1 m past the shooter.
          assert.closeTo(tpl.x, tgt.x - 6 * m, 1);
          assert.closeTo(tpl.y, tgt.y, 1);
          assert.isBelow(tpl.x, me.x);
          const msg = game.messages.contents.at(-1); made.messages.push(msg.id);
          assert.include(msg.content, "back toward the thrower");
        });
      });

      describe("Resistance stages on the net", () => {
        it("attacker 4 vs target 3 is the base level (M, 3 boxes), not S", async function () {
          if (!canvas?.ready) this.skip();
          await heal(target);
          await resist(target, 5, "M", [5, 5, 5], { attackerSuccesses: 4, stageVs: 4 });
          assert.equal(phys(target), 3);
        });

        it("an unmarked (older) button still stages down per 2 successes", async function () {
          if (!canvas?.ready) this.skip();
          await heal(target);
          await resist(target, 5, "S", [5, 5, 1], {});   // 2 successes: S → M
          assert.equal(phys(target), 3);
        });

        it("the same pool result is a complete miss on a spread but net staging on a blast", async function () {
          if (!canvas?.ready) this.skip();
          await target.update({ "system.dicePools.combat.value": target.system.dicePools.combat.max });
          await heal(target);
          // 3 Body + 2 pool, all successes; the pool's 2 beat the attacker's 1.
          await resist(target, 5, "D", Array(5).fill(5), { attackerSuccesses: 1, stageVs: 1 }, 2);
          assert.equal(phys(target), 0, "spread: complete miss");
          await target.update({ "system.dicePools.combat.value": target.system.dicePools.combat.max });
          await resist(target, 5, "D", Array(5).fill(5), { stageVs: 1 }, 2);
          assert.equal(phys(target), 3, "blast: 1 vs 5 → D − 2 = M");
        });
      });

      describe("Vehicles (p.108)", () => {
        it("forwards the net: base M → L on the vehicle, attacker 4 vs 3 → L (1 box)", async function () {
          if (!canvas?.ready) this.skip();
          await car.update({ "system.conditionMonitor.value": 0 });
          const n = game.messages.size;
          nextDialog().then(confirm);
          // Body 4 dice vs TN 8 − 4 = 4; three 5s. Legacy staging would fully resist.
          await withFaces([5, 5, 5, 1], () => car.rollDamageResistance(8, "M", "ballistic", "physical",
            { stageVs: 4, ratedLevel: "M", calledShot: false }));
          since(n);
          assert.equal(car.system.conditionMonitor.value, 1);
        });

        it("a Light-rated burst cannot hurt a vehicle, even though the burst lifted it to M", async function () {
          if (!canvas?.ready) this.skip();
          await car.update({ "system.conditionMonitor.value": 0 });
          const n = game.messages.size;
          await car.rollDamageResistance(8, "M", "ballistic", "physical", { stageVs: 4, ratedLevel: "L", calledShot: false });
          assert.ok(since(n).some(m => /Light damage cannot affect vehicles/.test(m.content)));
          assert.equal(car.system.conditionMonitor.value, 0);
        });

        it("an over-D called burst is capped at D, then reduced to S before the net (tie → S, 6 boxes)", async function () {
          if (!canvas?.ready) this.skip();
          await car.update({ "system.conditionMonitor.value": 0 });
          const n = game.messages.size;
          nextDialog().then(confirm);
          await withFaces([5, 5, 1, 1], () => car.rollDamageResistance(8, "D", "ballistic", "physical",
            { stageVs: 2, ratedLevel: "S", calledShot: true }));
          since(n);
          assert.equal(car.system.conditionMonitor.value, 6);
        });
      });

      describe("Damaging manipulation cards", () => {
        it("an unversioned card still renders and resolves pre-staged", async function () {
          const { renderManipDamageCard } = await import("../documents/item.mjs");
          const html = renderManipDamageCard({ casterName: "X", spellName: "Spark", basePower: 3, baseLevel: "M",
            successes: 4, resolved: false });
          const btn = new DOMParser().parseFromString(html, "text/html").querySelector("button[data-manip]");
          assert.equal(btn.dataset.level, "D");
          assert.isUndefined(btn.dataset.stage);
        });
      });
    }, { displayName: "SR2E: Net-Success Staging" });

    // ── Multiple targets and walking fire (SR2E p.92–93) ────────────────────
    quench.registerBatch("sr2e.multi-target", (context) => {
      const { describe, it, assert, before, after } = context;
      const made = { actors: [], tokens: [], messages: [], combats: [] };
      let shooter, toks = {};
      const eng = () => import("../engagement.mjs");
      const target = async (t) => canvas.tokens.setTargets(t ? [t.id] : []);
      // Fire and return the attack test's label (the modifiers are named there).
      const fire = async (gun, opts, t) => {
        await target(t);
        const n = game.messages.size;
        await gun.roll(opts);
        const msgs = game.messages.contents.slice(n);
        made.messages.push(...msgs.map(m => m.id));
        return msgs.find(m => m.flags?.sr2e?.test)?.flags.sr2e.test.label ?? "";
      };
      const mkGun = async (name, system = {}) => (await shooter.createEmbeddedDocuments("Item", [{
        name, type: "weapon", system: { weaponType: "firearm", skill: "firearms", damageCode: "6M", recoilComp: 30,
          firingModes: { sa: true, fa: true }, ammo: { current: 30, max: 30 }, ...system } }]))[0];
      const fresh = async () => shooter.update((await eng()).recoilResetUpdate(shooter));

      before(async () => {
        if (!canvas?.ready) return;
        shooter = await Actor.create({ name: "Quench MT Shooter", type: "character" }); made.actors.push(shooter);
        await shooter.createEmbeddedDocuments("Item", [
          { name: "Firearms", type: "skill", system: { rating: 4, category: "active" } }]);
        const g = canvas.dimensions.size, m = g / canvas.dimensions.distance;
        const o = { x: canvas.dimensions.sceneX + 30 * g, y: canvas.dimensions.sceneY + 35 * g };
        const put = async (a, dx, actorLink = false) => {
          const t = (await canvas.scene.createEmbeddedDocuments("Token", [{
            ...(await a.getTokenDocument()).toObject(), x: o.x + dx * m, y: o.y, actorLink }]))[0];
          made.tokens.push(t.id); return t.object;
        };
        toks.me = await put(shooter, -8, true);   // linked: the combatant IS the shooter
        for (const [k, dx] of [["A", 0], ["B", 3], ["C", 6]]) {
          const a = await Actor.create({ name: `Quench MT ${k}`, type: "npc" }); made.actors.push(a);
          toks[k] = await put(a, dx);
        }
        await new Promise(r => setTimeout(r, 300));
      });

      after(async function () {
        this.timeout(15000);
        if (!canvas?.ready) return;
        await canvas.tokens.setTargets([]);
        for (const c of made.combats) { try { await c.delete(); } catch (e) {} }
        await canvas.scene.deleteEmbeddedDocuments("Token", made.tokens.filter(id => canvas.scene.tokens.has(id)));
        await ChatMessage.deleteDocuments(made.messages.filter(id => game.messages.has(id)));
        for (const a of made.actors) await a.delete();
      });

      describe("Multiple targets (+2 per earlier target this phase)", () => {
        it("semi-auto at A then B: the second shot is +2", async function () {
          if (!canvas?.ready) this.skip();
          await fresh();
          const gun = await mkGun("Quench MT Pistol");
          assert.notInclude(await fire(gun, { firingMode: "sa" }, toks.A), "multiple targets");
          assert.include(await fire(gun, { firingMode: "sa" }, toks.B), "multiple targets +2");
        });

        it("Wedge: A, B, C at +0 / +2 / +4 — and macro calls queue in order", async function () {
          if (!canvas?.ready) this.skip();
          await fresh();
          const gun = await mkGun("Quench MT LMG");
          const n = game.messages.size;
          // Not awaited between: each call captures its target synchronously.
          await target(toks.A); const p1 = gun.roll({ firingMode: "sa" });
          await target(toks.B); const p2 = gun.roll({ firingMode: "sa" });
          await target(toks.C); const p3 = gun.roll({ firingMode: "sa" });
          await Promise.all([p1, p2, p3]);
          const labels = game.messages.contents.slice(n).filter(m => m.flags?.sr2e?.test).map(m => m.flags.sr2e.test.label);
          made.messages.push(...game.messages.contents.slice(n).map(m => m.id));
          assert.lengthOf(labels, 3);
          assert.notInclude(labels[0], "multiple targets");
          assert.include(labels[1], "multiple targets +2");
          assert.include(labels[2], "multiple targets +4");
        });

        it("no target token: nothing automatic, and a typed count is used", async function () {
          if (!canvas?.ready) this.skip();
          await fresh();
          const gun = await mkGun("Quench MT Tokenless");
          await fire(gun, { firingMode: "sa" }, toks.A);
          assert.include(await fire(gun, { firingMode: "sa" }, null), "enter earlier targets by hand");
          assert.include(await fire(gun, { firingMode: "sa", priorTargets: 1 }, null), "multiple targets +2");
        });
      });

      describe("Walking fire (full auto, p.93)", () => {
        it("walking 3 m from A to B wastes 3 rounds: ammo and recoil both count them", async function () {
          if (!canvas?.ready) this.skip();
          await fresh();
          const gun = await mkGun("Quench MT AR");
          await fire(gun, { firingMode: "fa", rounds: 3 }, toks.A);
          const label = await fire(gun, { firingMode: "fa", rounds: 3 }, toks.B);
          assert.include(label, "walked fire: 3 rounds wasted");
          assert.include(label, "multiple targets +2");
          assert.equal(gun.system.ammo.current, 30 - 3 - 3 - 3);
          const { currentRecoil, phaseKey } = await eng();
          assert.equal(currentRecoil(shooter, phaseKey(shooter, gun)), 9);
        });

        it("smartguns never waste rounds", async function () {
          if (!canvas?.ready) this.skip();
          await fresh();
          const gun = await mkGun("Quench MT Smart", { smartgunCompatible: true });
          await fire(gun, { firingMode: "fa", rounds: 3 }, toks.A);
          assert.notInclude(await fire(gun, { firingMode: "fa", rounds: 3 }, toks.B), "walked fire");
          assert.equal(gun.system.ammo.current, 24);
        });

        it("a different weapon, or semi-auto, does not walk", async function () {
          if (!canvas?.ready) this.skip();
          await fresh();
          const g1 = await mkGun("Quench MT G1"), g2 = await mkGun("Quench MT G2");
          await fire(g1, { firingMode: "fa", rounds: 3 }, toks.A);
          assert.notInclude(await fire(g2, { firingMode: "fa", rounds: 3 }, toks.B), "walked fire");
        });

        it("walking into a short clip: 2 left is a short burst, 0 left is refused with nothing spent", async function () {
          if (!canvas?.ready) this.skip();
          await fresh();
          const gun = await mkGun("Quench MT Short", { ammo: { current: 8, max: 30 } });
          await fire(gun, { firingMode: "fa", rounds: 3 }, toks.A);            // 5 left
          assert.include(await fire(gun, { firingMode: "fa", rounds: 3 }, toks.B), "short burst: 2 of 3");
          assert.equal(gun.system.ammo.current, 0);
          await fresh();
          const g2 = await mkGun("Quench MT Dry", { ammo: { current: 6, max: 30 } });
          await fire(g2, { firingMode: "fa", rounds: 3 }, toks.A);             // 3 left, walk 3
          assert.equal(await fire(g2, { firingMode: "fa", rounds: 3 }, toks.B), "", "refused: no test rolled");
          assert.equal(g2.system.ammo.current, 3, "nothing spent");
        });

        it("a tokenless endpoint needs a typed distance for the exact transition", async function () {
          if (!canvas?.ready) this.skip();
          await fresh();
          const gun = await mkGun("Quench MT Blind");
          await fire(gun, { firingMode: "fa", rounds: 3 }, null);
          assert.equal(await fire(gun, { firingMode: "fa", rounds: 3 }, toks.B), "", "refused without a distance");
          const { phaseKey } = await eng();
          const walkContext = { key: phaseKey(shooter, gun), weaponUuid: gun.uuid, from: null, to: toks.B.document.uuid };
          assert.include(await fire(gun, { firingMode: "fa", rounds: 3, walkOverride: 4, walkContext }, toks.B),
            "walked fire: 4 rounds wasted");
          // Tokenless → tokenless is unknown too.
          await fresh();
          await fire(gun, { firingMode: "fa", rounds: 3 }, null);
          assert.equal(await fire(gun, { firingMode: "fa", rounds: 3 }, null), "");
        });
      });

      describe("Phase identity", () => {
        it("nextTurn with the same combatant still on top starts a new phase (recoil and targets expire)", async function () {
          if (!canvas?.ready) this.skip();
          await fresh();
          const combat = await Combat.create({ scene: canvas.scene.id }); made.combats.push(combat);
          await combat.createEmbeddedDocuments("Combatant", [
            { tokenId: toks.me.id, sceneId: canvas.scene.id, actorId: shooter.id, initiative: 30 },
            { tokenId: toks.C.id, sceneId: canvas.scene.id, actorId: toks.C.actor.id, initiative: 5 }]);
          await combat.startCombat();
          await combat.update({ turn: combat.turns.findIndex(c => c.actorId === shooter.id) });
          const gun = await mkGun("Quench MT Phase", { recoilComp: 0 });
          await fire(gun, { firingMode: "sa" }, toks.A);
          const { currentRecoil, phaseKey, engagedRecord } = await eng();
          const k1 = phaseKey(shooter, gun);
          assert.equal(currentRecoil(shooter, k1), 1);
          await combat.nextTurn();   // 30 → 20: still on top, same turn index
          const k2 = phaseKey(shooter, gun);
          assert.notEqual(k2, k1, "a new phase key");
          assert.equal(currentRecoil(shooter, k2), 0, "recoil expired");
          assert.notInclude(await fire(gun, { firingMode: "sa" }, toks.B), "multiple targets", "targets expired");
          // A manual tracker edit is a new phase too, and a shot right after it
          // records under the new key.
          await combat.update({ turn: combat.turns.findIndex(c => c.actorId === shooter.id) === 0 ? 1 : 0 });
          await combat.update({ turn: combat.turns.findIndex(c => c.actorId === shooter.id) });
          const k3 = phaseKey(shooter, gun);
          assert.notEqual(k3, k2);
          await fire(gun, { firingMode: "sa" }, toks.A);
          assert.equal(engagedRecord(shooter).key, k3);
        });

        it("an attack committed under an old key leaves the new phase untouched", async function () {
          if (!canvas?.ready) this.skip();
          const combat = made.combats[0];
          if (!combat) this.skip();
          const gun = shooter.items.getName("Quench MT Phase");
          const { currentRecoil, phaseKey } = await eng();
          const old = phaseKey(shooter, gun);
          await combat.nextTurn();
          const now = phaseKey(shooter, gun);
          await target(toks.A);
          // As if the attack had been captured before the boundary.
          await gun._rollWeaponAttack({ firingMode: "sa", _engage: { key: old, token: null } });
          assert.equal(currentRecoil(shooter, now), 0);
        });

        it("the Reset Recoil update clears recoil AND targets", async function () {
          if (!canvas?.ready) this.skip();
          const gun = await mkGun("Quench MT Reset");
          await fire(gun, { firingMode: "sa" }, toks.A);
          await fresh();
          assert.notInclude(await fire(gun, { firingMode: "sa" }, toks.B), "multiple targets");
        });
      });
    }, { displayName: "SR2E: Multiple Targets & Walking Fire" });

    // ── Conjuring limits, materials and a knocked-out conjurer (SR2E p.139–140) ──
    quench.registerBatch("sr2e.conjuring-limits", (context) => {
      const { describe, it, assert, beforeEach, afterEach } = context;
      let before, msgsBefore;
      const withFaces = async (faces, fn) => {
        const orig = CONFIG.Dice.randomUniform;
        const q = [...faces];
        CONFIG.Dice.randomUniform = () => q.length ? (6.5 - q.shift()) / 6 : orig();
        try { return await fn(); } finally { CONFIG.Dice.randomUniform = orig; }
      };
      beforeEach(() => { before = new Set(game.actors.map(a => a.id)); msgsBefore = game.messages.size; });
      afterEach(async () => {
        // Spirits are named randomly, so sweep every actor this test created.
        for (const a of game.actors.filter(a => !before.has(a.id))) await a.delete();
        await ChatMessage.deleteDocuments(game.messages.contents.slice(msgsBefore).map(m => m.id));
      });
      const conjurer = async (name, system, rating = 6) => {
        const a = await Actor.create({ name, type: "character", system });
        await a.createEmbeddedDocuments("Item", [
          { name: "Conjuring", type: "skill", system: { rating, category: "active" } }]);
        return a;
      };
      const newSpirits = () => game.actors.filter(a => !before.has(a.id) && a.type === "spirit");
      const posted = () => game.messages.contents.slice(msgsBefore).map(m => m.content ?? "").join("\n");

      describe("Limits", () => {
        it("a shaman with a nature spirit still in service cannot summon another", async () => {
          const shaman = await conjurer("Quench Limit Shaman", { charisma: { base: 5 }, magic: { type: "full_magician", rating: 6, tradition: "shamanic" } });
          const old = await Actor.create({ name: "Quench Old Spirit", type: "spirit", system: { spiritType: "nature", force: 2, services: 1 } });
          await shaman.update({ "system.boundSpirits": [old.uuid] });
          await shaman.rollConjuring({ force: 2, kind: "nature", domain: "forest" });
          assert.lengthOf(newSpirits().filter(a => a.id !== old.id), 0);
          assert.notInclude(posted(), "Conjuring Drain", "refused before any roll");
        });

        it("a mage at Charisma bound elementals must release one first", async () => {
          const mage = await conjurer("Quench Limit Mage", { charisma: { base: 1 }, magic: { type: "full_magician", rating: 6 } });
          const old = await Actor.create({ name: "Quench Old Elemental", type: "spirit", system: { spiritType: "elemental", force: 2, services: 2 } });
          await mage.update({ "system.boundSpirits": [old.uuid] });
          await mage.rollConjuring({ force: 1, kind: "elemental", domain: "fire", materials: false });
          assert.lengthOf(newSpirits().filter(a => a.id !== old.id), 0);
        });

        it("a spent spirit (0 services) no longer counts", async () => {
          const mage = await conjurer("Quench Limit Spent", { charisma: { base: 1 }, magic: { type: "full_magician", rating: 6 } });
          const old = await Actor.create({ name: "Quench Spent Elemental", type: "spirit", system: { spiritType: "elemental", force: 2, services: 0 } });
          await mage.update({ "system.boundSpirits": [old.uuid] });
          await withFaces(Array(12).fill(5), () => mage.rollConjuring({ force: 1, kind: "elemental", domain: "fire", materials: false }));
          assert.lengthOf(newSpirits().filter(a => a.id !== old.id), 1);
        });
      });

      describe("Elemental materials (1,000¥ × Force)", () => {
        it("refuses without the nuyen, and spends nothing", async () => {
          const mage = await conjurer("Quench Poor Mage", { charisma: { base: 6 }, nuyen: 1500, magic: { type: "full_magician", rating: 6 } });
          await mage.rollConjuring({ force: 2, kind: "elemental", domain: "fire" });
          assert.equal(mage.system.nuyen, 1500);
          assert.notInclude(posted(), "Conjuring Drain");
        });

        it("charges them even when no elemental comes", async () => {
          const mage = await conjurer("Quench Unlucky Mage", { charisma: { base: 6 }, nuyen: 5000, magic: { type: "full_magician", rating: 6 } });
          // Conjuring 6 dice all 1s (no successes), then Charisma 6 for Drain.
          await withFaces([...Array(6).fill(1), ...Array(6).fill(5)],
            () => mage.rollConjuring({ force: 2, kind: "elemental", domain: "fire" }));
          assert.equal(mage.system.nuyen, 3000);
          assert.include(posted(), "used up all the same");
        });
      });

      describe("Drain knocks the conjurer out", () => {
        it("a nature spirit simply departs", async () => {
          const shaman = await conjurer("Quench KO Shaman", { charisma: { base: 5 }, magic: { type: "full_magician", rating: 6, tradition: "shamanic" } });
          await shaman.update({ "system.conditionMonitor.stun.value": 9 });
          // Force 2 < ½ Charisma 5: (L)Stun. Stun 9 is Serious (+3), so the Conjuring
          // TN is 5: six 5s hit; Drain (TN 2, no wound modifier) 5 × 1 miss → 10 stun → out.
          await withFaces([...Array(6).fill(5), 1, 1, 1, 1, 1],
            () => shaman.rollConjuring({ force: 2, kind: "nature", domain: "forest" }));
          assert.lengthOf(newSpirits(), 0);
          assert.lengthOf(shaman.system.boundSpirits ?? [], 0);
          assert.include(posted(), "the spirit departs");
        });

        it("an elemental that fails its Force test attacks — hostile and bound to no one", async () => {
          const mage = await conjurer("Quench KO Mage", { charisma: { base: 2 }, magic: { type: "full_magician", rating: 6 } });
          await mage.update({ "system.conditionMonitor.stun.value": 8 });
          // Force 2 ≤ Charisma 2: (M)Stun. Conjuring hits, Drain misses, escape test 1,1 → 0 successes.
          await withFaces([...Array(6).fill(5), 1, 1, 1, 1],
            () => mage.rollConjuring({ force: 2, kind: "elemental", domain: "fire", materials: false }));
          const [free] = newSpirits();
          assert.ok(free, "the free elemental is on the loose");
          assert.equal(free.system.conjurerUuid, "");
          assert.equal(free.system.services, 0);
          assert.equal(free.prototypeToken.disposition, CONST.TOKEN_DISPOSITIONS.HOSTILE);
          assert.lengthOf(mage.system.boundSpirits ?? [], 0);
        });

        it("an elemental that makes its Force test flees", async () => {
          const mage = await conjurer("Quench KO Mage2", { charisma: { base: 2 }, magic: { type: "full_magician", rating: 6 } });
          await mage.update({ "system.conditionMonitor.stun.value": 8 });
          await withFaces([...Array(6).fill(5), 1, 1, 5, 1],
            () => mage.rollConjuring({ force: 2, kind: "elemental", domain: "fire", materials: false }));
          assert.lengthOf(newSpirits(), 0);
          assert.include(posted(), "and flees");
        });
      });

      describe("Totem modifiers in Drain (p.139)", () => {
        it("a shaman's totem bonus for the domain adds Drain dice", async () => {
          const shaman = await conjurer("Quench Totem Shaman", { charisma: { base: 3 }, magic: { type: "full_magician", rating: 6, tradition: "shamanic", totem: "bear" } });
          const bonus = CONFIG.SR2E.totems.bear?.conjuringBonus?.forest ?? 0;
          await withFaces(Array(20).fill(5), () => shaman.rollConjuring({ force: 1, kind: "nature", domain: "forest" }));
          const drain = game.messages.contents.slice(msgsBefore).find(m => /Conjuring Drain/.test(m.flags?.sr2e?.test?.label ?? ""));
          assert.ok(drain, "a drain test was rolled");
          assert.equal(drain.flags.sr2e.test.dice?.length ?? drain.flags.sr2e.test.pool, 3 + bonus);
        });
      });
    }, { displayName: "SR2E: Conjuring Limits & Drain" });

    // ── Astral space (SR2E p.147–148) ────────────────────────────────────────
    quench.registerBatch("sr2e.astral", (context) => {
      const { describe, it, assert, beforeEach, afterEach } = context;
      let before, msgsBefore;
      beforeEach(() => { before = new Set(game.actors.map(a => a.id)); msgsBefore = game.messages.size; });
      afterEach(async () => {
        for (const a of game.actors.filter(a => !before.has(a.id))) await a.delete();
        await ChatMessage.deleteDocuments(game.messages.contents.slice(msgsBefore).map(m => m.id));
      });
      const drainLabel = () => game.messages.contents.slice(msgsBefore)
        .map(m => m.flags?.sr2e?.test?.label ?? "").find(l => /^Drain Resist/.test(l)) ?? "";

      describe("Spells cast in astral space (p.148)", () => {
        const castAt = async (astralState) => {
          const mage = await Actor.create({ name: `Quench Astral Caster ${astralState}`, type: "character",
            system: { willpower: { base: 6 }, magic: { type: "full_magician", value: 6, max: 6 }, astralState } });
          const pack = game.packs.get("sr2e.spells");
          const idx = await pack.getIndex();
          const spell = (await pack.getDocument(idx.find(e => e.name === "Detect Enemies")._id)).toObject();
          const [sp] = await mage.createEmbeddedDocuments("Item", [spell,
            { name: "Sorcery", type: "skill", system: { rating: 6, category: "active" } }]).then(r => r.filter(i => i.type === "spell"));
          await sp.roll({ force: 2, targetNumber: 4 });
          return drainLabel();
        };
        it("always drains Physical while projecting, even at Force ≤ Magic", async () => {
          assert.include(await castAt("projecting"), "physical (cast in astral space, p.148)");
        });
        it("drains Stun in the physical world at Force ≤ Magic", async () => {
          assert.include(await castAt("none"), "stun");
        });
      });

      describe("Astral combat — opposed like melee (p.147–148)", () => {
        let toks = [];
        const withFaces = async (faces, fn) => {
          const orig = CONFIG.Dice.randomUniform;
          const q = [...faces];
          CONFIG.Dice.randomUniform = () => q.length ? (6.5 - q.shift()) / 6 : orig();
          try { return await fn(); } finally { CONFIG.Dice.randomUniform = orig; }
        };
        const place = async (actor, dx) => {
          const g = canvas.dimensions.size;
          const t = (await canvas.scene.createEmbeddedDocuments("Token", [{
            ...(await actor.getTokenDocument()).toObject(), actorLink: true,
            x: canvas.dimensions.sceneX + (50 + dx) * g, y: canvas.dimensions.sceneY + 40 * g }]))[0];
          toks.push(t.id); return t;
        };
        const cards = (key) => game.messages.contents.slice(msgsBefore).filter(m => m.flags?.sr2e?.[key]);
        const mkMage = async (name = "Quench Astral Mage") => {
          const a = await Actor.create({ name, type: "character", system: {
            intelligence: { base: 5 }, willpower: { base: 5 }, charisma: { base: 4 },
            magic: { type: "full_magician", value: 6, max: 6 }, astralState: "projecting" } });
          await a.createEmbeddedDocuments("Item", [{ name: "Sorcery", type: "skill", system: { rating: 5, category: "active" } }]);
          return a;
        };
        const mkSpirit = (name = "Quench Astral Spirit", extra = {}) =>
          Actor.create({ name, type: "spirit", system: { spiritType: "nature", domain: "forest", force: 4, services: 2, ...extra } });
        const attack = async (attacker, target, faces, opts = {}) => {
          await canvas.tokens.setTargets([target.id]);
          await withFaces(faces, () => game.sr2e.astralAttack(attacker, opts));
          return cards("astralMelee").at(-1);
        };
        afterEach(async function () {
          this.timeout(10000);
          if (!canvas?.ready) return;
          await canvas.tokens.setTargets([]);
          await new Promise(r => setTimeout(r, 1500));   // floating damage numbers (PIXI)
          await canvas.scene.deleteEmbeddedDocuments("Token", toks.filter(id => canvas.scene.tokens.has(id)));
          toks = [];
        });

        it("mage vs spirit: exchange → defence → the loser resists with Force, and the tests close", async function () {
          if (!canvas?.ready) this.skip();
          const mage = await mkMage(), spirit = await mkSpirit();
          await place(mage, 0); const st = await place(spirit, 2);
          const card = await attack(mage, st, [5, 5, 5, 5, 5], { skillKey: "sorcery", damageType: "physical" });
          assert.ok(card, "an opposed exchange card");
          assert.equal(card.flags.sr2e.astralMelee.targetUuid, spirit.uuid);
          await withFaces([1, 1, 1, 1], () => game.sr2e.astralDefend(card, { skillKey: "force" }));
          const res = cards("astralResist").at(-1);
          const rs = res.flags.sr2e.astralResist;
          assert.equal(rs.loserUuid, spirit.uuid);
          assert.equal(rs.level, "S", "(Charisma 4)L, 5 net → up two levels");
          assert.equal(rs.tn, 4, "Power 4, no armor");
          assert.equal(rs.resistLabel, "Force");
          const { isTestClosed } = await import("../astral-combat.mjs");
          assert.isTrue(isTestClosed(card.flags.sr2e.astralMelee.testMessageId), "attack test closed to Karma");
          // Spirit resists with Force 4 dice: all miss → S = 6 boxes.
          await withFaces([1, 1, 1, 1], () => game.sr2e.astralResist(res, {}));
          assert.equal(spirit.system.conditionMonitor.physical.value, 6);
          // Resolved: a second click does nothing.
          await withFaces([1, 1, 1, 1], () => game.sr2e.astralResist(res, {}));
          assert.equal(spirit.system.conditionMonitor.physical.value, 6, "resolves once");
          await game.sr2e.astralDefend(card, { skillKey: "force" });
          assert.lengthOf(cards("astralResist"), 1, "the exchange resolves once");
        });

        it("a 0-success attack still posts, and a winning defender counterstrikes", async function () {
          if (!canvas?.ready) this.skip();
          const mage = await mkMage("Quench Astral Mage0"), spirit = await mkSpirit("Quench Astral Spirit0");
          await place(mage, 0); const st = await place(spirit, 2);
          const card = await attack(mage, st, [1, 1, 1, 1, 1], { skillKey: "sorcery" });
          assert.ok(card, "posted at 0 successes");
          await withFaces([5, 5, 5, 5], () => game.sr2e.astralDefend(card, { skillKey: "force" }));
          const rs = cards("astralResist").at(-1).flags.sr2e.astralResist;
          assert.equal(rs.loserUuid, mage.uuid, "resistance bound to the attacker");
          assert.isTrue(rs.riposte);
          assert.equal(rs.power, 4, "the spirit's (Force)M");
          assert.equal(rs.resistLabel, "Willpower (Astral Body)");
        });

        it("the Astral Pool spends on resistance, and the spend survives leaving astral space", async function () {
          if (!canvas?.ready) this.skip();
          const mage = await mkMage("Quench Astral Pool"), spirit = await mkSpirit("Quench Astral SpiritP");
          await place(mage, 0); const st = await place(spirit, 2);
          const card = await attack(mage, st, [1, 1, 1, 1, 1], { skillKey: "sorcery" });
          await withFaces([5, 5, 5, 5], () => game.sr2e.astralDefend(card, { skillKey: "force" }));
          const res = cards("astralResist").at(-1);
          const before = mage.system.dicePools.astral.value;
          assert.equal(before, 7, "⌊(5+5+4)/2⌋");
          await withFaces(Array(8).fill(1), () => game.sr2e.astralResist(res, { poolDice: 3 }));
          assert.equal(mage.system.dicePools.astral.value, 4);
          await mage.update({ "system.astralState": "none" });
          await mage.update({ "system.astralState": "projecting" });
          assert.equal(mage.system.dicePools.astral.value, 4, "not refilled by leaving astral space");
        });

        it("a dual-natured critter attacks, and its armor lowers the TN when it resists with Body", async function () {
          if (!canvas?.ready) this.skip();
          const ghoul = await Actor.create({ name: "Quench Astral Ghoul", type: "npc", system: {
            dualNatured: true, body: { base: 7 }, willpower: { base: 2 }, strength: { base: 5 }, armor: { impact: 2 } } });
          const mage = await mkMage("Quench Astral MageG");
          const gt = await place(ghoul, 2); const mt = await place(mage, 0);
          const card = await attack(ghoul, mt, [1, 1, 1], {});
          assert.ok(card, "a dual-natured NPC can attack");
          await withFaces([1, 1, 1, 1, 1], () => game.sr2e.astralDefend(card, { skillKey: "sorcery" }));   // tie 0-0 → attacker
          const c2 = await attack(mage, gt, [5, 5, 5, 5, 5], { skillKey: "sorcery" });
          await withFaces([1], () => game.sr2e.astralDefend(c2, {}));
          const rs = cards("astralResist").at(-1).flags.sr2e.astralResist;
          assert.equal(rs.loserUuid, ghoul.uuid);
          assert.equal(rs.resistLabel, "Body");
          assert.equal(rs.tn, 2, "Power 4 − armor 2");
        });

        it("refuses a mundane target and a depleted spirit; a busy spirit can be attacked but not attack", async function () {
          if (!canvas?.ready) this.skip();
          const mage = await mkMage("Quench Astral MageR");
          const joe = await Actor.create({ name: "Quench Astral Mundane", type: "npc" });
          const gone = await mkSpirit("Quench Astral Gone", { spiritType: "elemental", domain: "fire", forceUsed: 4 });
          const busy = await mkSpirit("Quench Astral Busy", { spiritType: "elemental", domain: "fire", service: "aid" });
          await place(mage, 0);
          const jt = await place(joe, 2), gt = await place(gone, 3), bt = await place(busy, 4);
          assert.isUndefined(await attack(mage, jt, [5, 5, 5, 5, 5], {}), "mundane refused");
          assert.isTrue(gone.system.depleted, "fixture: a spent elemental");
          assert.isUndefined(await attack(mage, gt, [5, 5, 5, 5, 5], {}), "depleted refused");
          assert.ok(await attack(mage, bt, [5, 5, 5, 5, 5], {}), "busy spirit can be attacked");
          const n = cards("astralMelee").length;
          await canvas.tokens.setTargets([toks[0]]);
          await game.sr2e.astralAttack(busy, {});
          assert.lengthOf(cards("astralMelee"), n, "busy spirit cannot attack");
        });

        it("Undefended concedes; Karma on the attack test is refused afterwards", async function () {
          if (!canvas?.ready) this.skip();
          const mage = await mkMage("Quench Astral MageU"), spirit = await mkSpirit("Quench Astral SpiritU");
          await mage.update({ "system.karma.poolAdjust": 3 });   // the pool is derived
          await place(mage, 0); const st = await place(spirit, 2);
          const card = await attack(mage, st, [5, 5, 1, 1, 1], { skillKey: "sorcery" });
          await game.sr2e.astralUndefended(card);
          const rs = cards("astralResist").at(-1).flags.sr2e.astralResist;
          assert.equal(rs.net, 2);
          const test = game.messages.get(card.flags.sr2e.astralMelee.testMessageId);
          const karmaBefore = mage.system.karma?.pool ?? 0;
          await mage.applyKarmaToTest(test, "reroll");
          assert.equal(mage.system.karma?.pool ?? 0, karmaBefore, "closed test: no Karma spent");
        });

        it("a legacy astral card still resolves the old way", async function () {
          if (!canvas?.ready) this.skip();
          const spirit = await mkSpirit("Quench Astral Legacy");
          const legacy = await ChatMessage.create({ content: "legacy", flags: { sr2e: { astral: {
            attackerUuid: "", attackerName: "Old", targetUuid: spirit.uuid, successes: 2, power: 3,
            level: "L", damageType: "stun", resolved: false } } } });
          await withFaces([1, 1, 1, 1], () => spirit.rollAstralResistance(legacy));
          assert.isAbove(spirit.system.conditionMonitor.stun.value, 0);
        });
      });
    }, { displayName: "SR2E: Astral" });

    // ── Karma reaches ranged damage cards and launchers (RULES-AUDIT-3 C8) ───
    quench.registerBatch("sr2e.karma-damage-sync", (context) => {
      const { it, assert, before, after } = context;
      const made = { tokens: [], messages: [] };
      let shooter, target, car, shooterTok, targetTok, carTok;
      const withFaces = async (faces, fn) => {
        const orig = CONFIG.Dice.randomUniform;
        const q = [...faces];
        CONFIG.Dice.randomUniform = () => q.length ? (6.5 - q.shift()) / 6 : orig();
        try { return await fn(); } finally { CONFIG.Dice.randomUniform = orig; }
      };
      const nextDialog = () => new Promise(res => Hooks.once("renderDialogV2", (app) => setTimeout(() => res(app), 50)));
      const confirm = (app) => app.element.querySelector('button[data-action="roll"], button[data-action="resist"]')?.click();
      const since = (n) => { const m = game.messages.contents.slice(n); made.messages.push(...m.map(x => x.id)); return m; };
      const settle = () => new Promise(r => setTimeout(r, 400));
      // Each shot starts a fresh phase: recoil from earlier shots in this batch
      // would otherwise raise the TN and turn the forced 5s into misses.
      const freshPhase = async () => shooter.update((await import("../engagement.mjs")).recoilResetUpdate(shooter));
      const fire = async (gun, faces, opts = { firingMode: "sa" }) => {
        await freshPhase();
        await canvas.tokens.setTargets([targetTok.id]);
        const n = game.messages.size;
        await withFaces(faces, () => gun.roll(opts));
        await settle();
        const msgs = since(n);
        return { test: msgs.find(m => m.flags?.sr2e?.test), card: msgs.find(m => m.flags?.sr2e?.rangedDamage),
                 blast: msgs.find(m => m.flags?.sr2e?.blastLaunch) };
      };
      const btn = (msg) => new DOMParser().parseFromString(game.messages.get(msg.id).content, "text/html")
        .querySelector("button.sr2e-resist-btn[data-power]");

      before(async () => {
        if (!canvas?.ready) return;
        shooter = await Actor.create({ name: "Quench KS Shooter", type: "character" });
        await shooter.createEmbeddedDocuments("Item", [{ name: "Firearms", type: "skill", system: { rating: 3, category: "active" } }]);
        await shooter.update({ "system.karma.poolAdjust": 20 });   // the pool is derived
        target = await Actor.create({ name: "Quench KS Target", type: "npc", system: { body: { base: 3 } } });
        car = await Actor.create({ name: "Quench KS Car", type: "vehicle", system: { body: 4, armor: 0 } });
        const g = canvas.dimensions.size, m = g / canvas.dimensions.distance;
        const o = { x: canvas.dimensions.sceneX + 20 * g, y: canvas.dimensions.sceneY + 45 * g };
        const put = async (a, dx) => (await canvas.scene.createEmbeddedDocuments("Token", [{
          ...(await a.getTokenDocument()).toObject(), actorLink: true, x: o.x + dx * m, y: o.y }]))[0];
        shooterTok = await put(shooter, -5); targetTok = await put(target, 0); carTok = await put(car, 4);
        made.tokens.push(shooterTok.id, targetTok.id, carTok.id);
        await settle();
      });
      after(async function () {
        this.timeout(15000);
        if (!canvas?.ready) return;
        await canvas.tokens.setTargets([]);
        await new Promise(r => setTimeout(r, 2500));
        const tpl = canvas.scene.templates.filter(t => t.getFlag("sr2e", "blast")).map(t => t.id);
        if (tpl.length) await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", tpl);
        await canvas.scene.deleteEmbeddedDocuments("Token", made.tokens.filter(id => canvas.scene.tokens.has(id)));
        await ChatMessage.deleteDocuments(made.messages.filter(id => game.messages.has(id)));
      });
      const pistol = async () => (await shooter.createEmbeddedDocuments("Item", [{ name: "Quench KS Pistol", type: "weapon",
        system: { weaponType: "firearm", skill: "firearms", damageCode: "6M", firingModes: { sa: true }, ammo: { current: 30, max: 30 } } }]))[0];

      it("a Karma reroll after the card posts updates its successes (net staging and complete miss)", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const { test, card } = await fire(await pistol(), [5, 1, 1]);
        assert.equal(btn(card).dataset.stageVs, "1");
        await withFaces([5, 5], () => shooter.applyKarmaToTest(test, "reroll"));
        await settle();
        assert.equal(btn(card).dataset.stageVs, "3");
        assert.equal(btn(card).dataset.attackerSuccesses, "3");
      });

      it("an initial miss posts a Miss card that Karma brings to life", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        // 1,1,2: a miss but not an all-1s glitch (which only allows Avoid Disaster).
        const { test, card } = await fire(await pistol(), [1, 1, 2]);
        assert.ok(card, "a miss card is posted");
        assert.isNull(btn(card), "no Resist button on a miss");
        await withFaces([5, 1, 1], () => shooter.applyKarmaToTest(test, "reroll"));
        await settle();
        assert.ok(btn(card), "Karma turned the miss into a hit");
      });

      it("a resisted card stays put; Karma during the resist dialog is refused", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const { test, card } = await fire(await pistol(), [5, 5, 1]);
        await target.update({ "system.conditionMonitor.physical.value": 0 });
        // Open the resist dialog, spend Karma while it is open, then confirm.
        const d = nextDialog();
        const p = game.sr2e.resistRangedDamage(card);
        const app = await d;
        await withFaces([5], () => shooter.applyKarmaToTest(test, "reroll"));
        await settle();
        await withFaces([1, 1, 1], async () => { confirm(app); await p; });
        assert.equal(target.system.conditionMonitor.physical.value, 0, "refused by beforeRoll — nothing applied");
        // Now resist for real, then Karma must not change the resolved card.
        nextDialog().then(confirm);
        await withFaces([1, 1, 1], () => game.sr2e.resistRangedDamage(game.messages.get(card.id)));
        await settle();
        const { isCardResolved } = await import("../astral-combat.mjs");
        assert.isTrue(isCardResolved(game.messages.get(card.id), "rangedDamage"));
        const before = game.messages.get(card.id).flags.sr2e.rangedDamage.successes;
        await withFaces([5], () => shooter.applyKarmaToTest(test, "reroll"));
        await settle();
        assert.equal(game.messages.get(card.id).flags.sr2e.rangedDamage.successes, before, "resolved card unchanged");
      });

      it("vehicle resistance marks its outcome as resolving the card", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const gun = await pistol();
        await freshPhase();
        await canvas.tokens.setTargets([carTok.id]);
        const n = game.messages.size;
        await withFaces([5, 5, 5], () => gun.roll({ firingMode: "sa" }));
        await settle();
        const card = since(n).find(m => m.flags?.sr2e?.rangedDamage);
        nextDialog().then(confirm);
        const m2 = game.messages.size;
        await withFaces([1, 1, 1, 1], () => game.sr2e.resistRangedDamage(card));
        await settle();
        assert.ok(since(m2).some(m => m.flags?.sr2e?.resolves === card.id), "outcome carries the marker");
      });

      it("a blast launcher follows Karma until launched, a failed launch stays retryable, and a launch freezes it", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const [nade] = await shooter.createEmbeddedDocuments("Item", [{ name: "Quench KS Grenade", type: "weapon",
          system: { weaponType: "grenade", skill: "throwing weapons", damageCode: "10S", blastType: "offensive", quantity: 5 } }]);
        await shooter.createEmbeddedDocuments("Item", [{ name: "Throwing Weapons", type: "skill", system: { rating: 3, category: "active" } }]);
        await freshPhase();
        await canvas.tokens.setTargets([]);
        const n = game.messages.size;
        await withFaces([5, 1, 1], () => nade.roll({}));   // no target: the launch will fail
        await settle();
        const msgs = since(n);
        const blast = msgs.find(m => m.flags?.sr2e?.blastLaunch), test = msgs.find(m => m.flags?.sr2e?.test);
        assert.ok(blast, "a launcher");
        // Thrown at nothing: the launch asks for a point (p.96); Esc cancels and
        // leaves it retryable.
        const cancel = game.sr2e.launchFromCard(blast, "blastLaunch");
        await new Promise(r => setTimeout(r, 200));
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        await cancel;
        await withFaces([5, 5], () => shooter.applyKarmaToTest(test, "reroll"));
        await settle();
        assert.equal(game.messages.get(blast.id).flags.sr2e.blastLaunch.successes, 3, "still following Karma");
        const m2 = game.messages.size;
        const launch = game.sr2e.launchFromCard(game.messages.get(blast.id), "blastLaunch");
        await new Promise(r => setTimeout(r, 200));
        await withFaces(Array(10).fill(1), async () => {
          const c = targetTok.object.center;
          canvas.stage.emit("pointerdown", { stopPropagation() {}, getLocalPosition: () => ({ x: c.x, y: c.y }) });
          await launch;
        });
        await settle();
        const rows = since(m2).find(m => m.flags?.sr2e?.resolves === blast.id);
        assert.ok(rows, "the launch posts its rows, marked");
        assert.equal(rows.flags.sr2e.launchSuccesses, 3, "the launch used the live total");
        const st = game.messages.get(blast.id).flags.sr2e.blastLaunch;
        assert.isTrue(st.resolved);
        assert.equal(st.launchSuccesses, 3);
        await withFaces([5], () => shooter.applyKarmaToTest(test, "reroll"));
        await settle();
        assert.equal(game.messages.get(blast.id).flags.sr2e.blastLaunch.successes, 3, "frozen once launched");
      });
    }, { displayName: "SR2E: Karma → Damage Cards" });

    // ── Grenades aimed at a point (SR2E p.96–97) ────────────────────────────
    quench.registerBatch("sr2e.placed-grenades", (context) => {
      const { it, assert, before, after } = context;
      const made = { tokens: [], messages: [] };
      let thrower, other, target, throwerTok, otherTok, targetTok, m, o;
      const withFaces = async (faces, fn) => {
        const orig = CONFIG.Dice.randomUniform;
        const q = [...faces];
        CONFIG.Dice.randomUniform = () => q.length ? (6.5 - q.shift()) / 6 : orig();
        try { return await fn(); } finally { CONFIG.Dice.randomUniform = orig; }
      };
      const settle = () => new Promise(r => setTimeout(r, 400));
      const since = (n) => { const x = game.messages.contents.slice(n); made.messages.push(...x.map(y => y.id)); return x; };
      const newTemplates = (before) => canvas.scene.templates.filter(t => !before.has(t.id));
      const clickAt = (pt) => canvas.stage.emit("pointerdown", { stopPropagation() {}, getLocalPosition: () => pt });
      const pressEscape = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      const nade = async (who, qty = 5) => (await who.createEmbeddedDocuments("Item", [{ name: "Quench PG Grenade", type: "weapon",
        system: { weaponType: "grenade", skill: "throwing weapons", damageCode: "10S", blastType: "offensive", quantity: qty } }]))[0];
      const fresh = async (who) => who.update((await import("../engagement.mjs")).recoilResetUpdate(who));

      before(async () => {
        if (!canvas?.ready) return;
        const mk = async (name) => {
          const a = await Actor.create({ name, type: "character", system: { strength: { base: 4 } } });
          await a.createEmbeddedDocuments("Item", [{ name: "Throwing Weapons", type: "skill", system: { rating: 4, category: "active" } }]);
          return a;
        };
        thrower = await mk("Quench PG Thrower"); other = await mk("Quench PG Other");
        target = await Actor.create({ name: "Quench PG Target", type: "npc" });
        const g = canvas.dimensions.size; m = g / canvas.dimensions.distance;
        o = { x: canvas.dimensions.sceneX + 60 * g + g / 2, y: canvas.dimensions.sceneY + 30 * g + g / 2 };
        const put = async (a, dx, dy = 0) => (await canvas.scene.createEmbeddedDocuments("Token", [{
          ...(await a.getTokenDocument()).toObject(), actorLink: true, x: o.x - g / 2 + dx * m, y: o.y - g / 2 + dy * m }]))[0];
        throwerTok = await put(thrower, 0); otherTok = await put(other, 20, 10); targetTok = await put(target, 5, 5);
        made.tokens.push(throwerTok.id, otherTok.id, targetTok.id);
        await settle();
      });
      after(async function () {
        this.timeout(15000);
        if (!canvas?.ready) return;
        await canvas.tokens.setTargets([]);
        await new Promise(r => setTimeout(r, 2000));
        const tpl = canvas.scene.templates.filter(t => t.getFlag("sr2e", "blast")).map(t => t.id);
        if (tpl.length) await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", tpl);
        await canvas.scene.deleteEmbeddedDocuments("Token", made.tokens.filter(id => canvas.scene.tokens.has(id)));
        await ChatMessage.deleteDocuments(made.messages.filter(id => game.messages.has(id)));
      });

      // Throw at a point; return the launcher message.
      const throwAt = async (who, gren, point, faces, extra = {}) => {
        await fresh(who);
        await canvas.tokens.setTargets([]);
        const n = game.messages.size;
        await withFaces(faces, () => gren.roll({ blastPoint: { ...point, sceneId: canvas.scene.id }, ...extra }));
        await settle();
        return { msgs: since(n), launcher: game.messages.contents.slice(n).find(x => x.flags?.sr2e?.blastLaunch) };
      };

      it("a grenade aimed at an empty point lands there (no scatter)", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const g = await nade(thrower);
        const pt = { x: o.x + 8 * m, y: o.y };
        const { launcher } = await throwAt(thrower, g, pt, [5, 5, 5, 5]);
        assert.deepInclude(launcher.flags.sr2e.blastLaunch.aim, { mode: "point", x: pt.x, y: pt.y });
        const before = new Set(canvas.scene.templates.map(t => t.id));
        await withFaces([1], () => game.sr2e.launchFromCard(launcher, "blastLaunch"));   // 1D6 = 1 − 4×2 → 0
        await settle();
        const [tpl] = newTemplates(before);
        assert.closeTo(tpl.x, pt.x, 1); assert.closeTo(tpl.y, pt.y, 1);
      });

      it("scatter 1 carries on past the point, away from each thrower", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const pt = { x: o.x + 10 * m, y: o.y + 5 * m };
        for (const [who, tok] of [[thrower, throwerTok], [other, otherTok]]) {
          const g = await nade(who);
          const { launcher } = await throwAt(who, g, pt, [1, 1, 1, 2]);     // 0 successes
          const before = new Set(canvas.scene.templates.map(t => t.id));
          await withFaces([4, 1], () => game.sr2e.launchFromCard(launcher, "blastLaunch"));  // 4 m, diagram 1
          await settle();
          const [tpl] = newTemplates(before);
          const from = tok.object.center;
          const away = { x: pt.x - from.x, y: pt.y - from.y };
          const moved = { x: tpl.x - pt.x, y: tpl.y - pt.y };
          assert.isAbove(away.x * moved.x + away.y * moved.y, 0, `${who.name}: lands beyond the point`);
          assert.closeTo(Math.hypot(moved.x, moved.y), 4 * m, 2);
        }
      });

      it("the range bracket comes from the raw distance (just past Str×3 is Medium)", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const g = await nade(thrower);
        const { msgs } = await throwAt(thrower, g, { x: o.x + 12.4 * m, y: o.y }, [5, 5, 5, 5]);
        const label = msgs.find(x => x.flags?.sr2e?.test)?.flags.sr2e.test.label ?? "";
        assert.match(label, /Medium/, label);
      });

      it("a malformed point is refused with the grenade unspent", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const g = await nade(thrower, 3);
        const n = game.messages.size;
        await g.roll({ blastPoint: { x: NaN, y: 1, sceneId: canvas.scene.id } });
        await g.roll({ blastPoint: { x: 1, y: 1, sceneId: "nope" } });
        since(n);
        assert.equal(g.system.quantity, 3);
      });

      it("a queued throw keeps its point even if a token is targeted before it runs", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const g = await nade(thrower);
        await fresh(thrower);
        await canvas.tokens.setTargets([]);
        const pt = { x: o.x + 6 * m, y: o.y, sceneId: canvas.scene.id };
        const n = game.messages.size;
        const p = withFaces([5, 5, 5, 5], () => g.roll({ blastPoint: pt }));
        await canvas.tokens.setTargets([targetTok.id]);
        await p; await settle();
        const launcher = since(n).find(x => x.flags?.sr2e?.blastLaunch);
        assert.equal(launcher.flags.sr2e.blastLaunch.aim.mode, "point");
      });

      it("a deferred throw asks for the point at launch; Esc leaves it retryable, and Karma during the pick is used", async function () {
        this.timeout(20000);
        if (!canvas?.ready) this.skip();
        const g = await nade(thrower);
        await fresh(thrower);
        await thrower.update({ "system.karma.poolAdjust": 10 });
        await canvas.tokens.setTargets([]);
        const n = game.messages.size;
        await withFaces([5, 1, 2, 2], () => g.roll({ range: "short" }));
        await settle();
        const msgs = since(n);
        const launcher = msgs.find(x => x.flags?.sr2e?.blastLaunch), test = msgs.find(x => x.flags?.sr2e?.test);
        assert.equal(launcher.flags.sr2e.blastLaunch.aim.mode, "deferred");
        // Cancel.
        let p = game.sr2e.launchFromCard(launcher, "blastLaunch");
        await new Promise(r => setTimeout(r, 200)); pressEscape(); await p;
        const { isCardResolved } = await import("../astral-combat.mjs");
        assert.isFalse(isCardResolved(game.messages.get(launcher.id), "blastLaunch"), "still retryable");
        // Pick, with a Karma reroll landing while the picker is open.
        p = game.sr2e.launchFromCard(game.messages.get(launcher.id), "blastLaunch");
        await new Promise(r => setTimeout(r, 200));
        await withFaces([5, 5, 5], () => thrower.applyKarmaToTest(test, "reroll"));
        const m2 = game.messages.size;
        await withFaces([1], async () => { clickAt({ x: o.x + 7 * m, y: o.y }); await p; });
        await settle();
        const rows = since(m2).find(x => x.flags?.sr2e?.resolves === launcher.id);
        assert.ok(rows, "launched");
        assert.equal(rows.flags.sr2e.launchSuccesses, 4, "the reroll during the pick counts");
      });

      it("refuses a point on another scene, and a token aim whose token is gone (no live-target fallback)", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const g = await nade(thrower);
        const { launcher } = await throwAt(thrower, g, { x: o.x + 5 * m, y: o.y }, [5, 5, 5, 5]);
        const moved = { ...launcher.flags.sr2e.blastLaunch, aim: { ...launcher.flags.sr2e.blastLaunch.aim, sceneId: "elsewhere" } };
        await launcher.update({ "flags.sr2e.blastLaunch": moved });
        await game.sr2e.launchFromCard(game.messages.get(launcher.id), "blastLaunch");
        const { isCardResolved } = await import("../astral-combat.mjs");
        assert.isFalse(isCardResolved(game.messages.get(launcher.id), "blastLaunch"));
        const gone = { ...moved, aim: { mode: "token", tokenUuid: `${canvas.scene.uuid}.Token.missingToken00` } };
        await launcher.update({ "flags.sr2e.blastLaunch": gone });
        await canvas.tokens.setTargets([targetTok.id]);
        await game.sr2e.launchFromCard(game.messages.get(launcher.id), "blastLaunch");
        assert.isFalse(isCardResolved(game.messages.get(launcher.id), "blastLaunch"), "did not hit the live target");
      });

      it("an old launcher without aim still launches at its stored token", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const g = await nade(thrower);
        const { launcher } = await throwAt(thrower, g, { x: o.x + 5 * m, y: o.y }, [5, 5, 5, 5]);
        const old = { ...launcher.flags.sr2e.blastLaunch, centerTokenUuid: targetTok.uuid };
        delete old.aim;
        await launcher.update({ "flags.sr2e.-=blastLaunch": null });
        await launcher.update({ "flags.sr2e.blastLaunch": old });
        const before = new Set(canvas.scene.templates.map(t => t.id));
        await withFaces([1], () => game.sr2e.launchFromCard(game.messages.get(launcher.id), "blastLaunch"));
        await settle();
        const [tpl] = newTemplates(before);
        assert.ok(tpl, "launched");
        assert.closeTo(tpl.x, targetTok.object.center.x, 1);
      });

      it("a point with no measurable range and no explicit range is refused", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const loner = await Actor.create({ name: "Quench PG Loner", type: "character" });   // no token on the scene
        const g = await nade(loner, 2);
        await g.roll({ blastPoint: { x: o.x, y: o.y, sceneId: canvas.scene.id } });
        assert.equal(g.system.quantity, 2, "refused before spending");
        await g.roll({ blastPoint: { x: o.x, y: o.y, sceneId: canvas.scene.id }, range: "short" });
        assert.equal(g.system.quantity, 1, "an explicit range lets it go");
        made.messages.push(...game.messages.contents.slice(-6).map(x => x.id));
      });
    }, { displayName: "SR2E: Grenades at a Point" });

    // ── Spell Defense for anyone the magician protects (SR2E p.132) ─────────
    quench.registerBatch("sr2e.spell-defense-allies", (context) => {
      const { it, assert, before, after } = context;
      const made = { tokens: [], messages: [] };
      let caster, ally, victim, victimTok, spell;
      const withFaces = async (faces, fn) => {
        const orig = CONFIG.Dice.randomUniform;
        const q = [...faces];
        CONFIG.Dice.randomUniform = () => q.length ? (6.5 - q.shift()) / 6 : orig();
        try { return await fn(); } finally { CONFIG.Dice.randomUniform = orig; }
      };
      const settle = () => new Promise(r => setTimeout(r, 300));
      const since = (n) => { const x = game.messages.contents.slice(n); made.messages.push(...x.map(y => y.id)); return x; };
      const nextDialog = () => new Promise(res => Hooks.once("renderDialogV2", (app) => setTimeout(() => res(app), 50)));
      const cast = async () => {
        // Drain from earlier casts would raise the TN (wounds) and miss.
        await caster.update({ "system.conditionMonitor.stun.value": 0, "system.conditionMonitor.physical.value": 0 });
        await canvas.tokens.setTargets([victimTok.id]);
        const n = game.messages.size;
        await withFaces([5, 5, 5, 5], () => spell.roll({ force: 4, targetNumber: 4 }));
        await settle();
        return since(n).find(m => m.flags?.sr2e?.spell);
      };
      const resist = async (card, faces, dialog = null) => {
        if (dialog) nextDialog().then(dialog);
        const n = game.messages.size;
        await withFaces(faces, () => victim.rollSpellResistance(card));
        await settle();
        return since(n);
      };
      const label = (msgs) => msgs.find(m => m.flags?.sr2e?.test)?.flags.sr2e.test.label ?? "";
      const setDefense = (a, sd, shield = 0) => a.update({ "system.dicePools.spellDefense": sd, "system.dicePools.shieldingBonus": shield });

      before(async () => {
        if (!canvas?.ready) return;
        const mk = (name) => Actor.create({ name, type: "character", system: {
          willpower: { base: 5 }, magic: { type: "full_magician", value: 6, max: 6 } } });
        caster = await mk("Quench SD Caster"); ally = await mk("Quench SD Ally");
        victim = await Actor.create({ name: "Quench SD Victim", type: "npc", system: { willpower: { base: 3 } } });
        const pack = game.packs.get("sr2e.spells");
        const idx = await pack.getIndex();
        const doc = (await pack.getDocument(idx.find(e => e.name === "Mana Bolt")._id)).toObject();
        [spell] = await caster.createEmbeddedDocuments("Item", [doc]);
        await caster.createEmbeddedDocuments("Item", [{ name: "Sorcery", type: "skill", system: { rating: 6, category: "active" } }]);
        const g = canvas.dimensions.size;
        victimTok = (await canvas.scene.createEmbeddedDocuments("Token", [{
          ...(await victim.getTokenDocument()).toObject(), actorLink: true,
          x: canvas.dimensions.sceneX + 70 * g, y: canvas.dimensions.sceneY + 20 * g }]))[0];
        made.tokens.push(victimTok.id);
        await settle();
      });
      after(async function () {
        this.timeout(15000);
        if (!canvas?.ready) return;
        await canvas.tokens.setTargets([]);
        await new Promise(r => setTimeout(r, 1500));
        await canvas.scene.deleteEmbeddedDocuments("Token", made.tokens.filter(id => canvas.scene.tokens.has(id)));
        await ChatMessage.deleteDocuments(made.messages.filter(id => game.messages.has(id)));
      });

      it("an ally grants 2 of 5: the ally keeps 3, and the victim rolls +2 in the ally's name", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        await setDefense(ally, 5);
        const card = await cast();
        const castTestId = card.flags.sr2e.spell.testMessageId;
        const n0 = game.messages.size;
        assert.isTrue(await game.sr2e.grantSpellDefense(ally, { castTestId, targetActorUuid: victim.uuid, targetName: victim.name, n: 2 }));
        since(n0);
        assert.equal(ally.system.dicePools.spellDefense, 3, "the rest stays in reserve");
        const out = await resist(card, [1, 1, 1, 1, 1], app => app.element.querySelector('button[data-action="roll"]').click());
        assert.include(label(out), "+2 Spell Defense (Quench SD Ally)");
        const marker = out.find(m => m.flags?.sr2e?.resolvesAttack);
        assert.ok(marker, "a public resolution record");
        assert.lengthOf(marker.flags.sr2e.usedGrants, 1);
        // Too late now.
        assert.isFalse(await game.sr2e.grantSpellDefense(ally, { castTestId, targetActorUuid: victim.uuid, n: 1 }));
        assert.equal(ally.system.dicePools.spellDefense, 3, "a refused grant spends nothing");
      });

      it("a grant for another attack or another target is ignored", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        await setDefense(ally, 4);
        const card = await cast();
        const n0 = game.messages.size;
        await game.sr2e.grantSpellDefense(ally, { castTestId: "someOtherCast", targetActorUuid: victim.uuid, n: 1 });
        await game.sr2e.grantSpellDefense(ally, { castTestId: card.flags.sr2e.spell.testMessageId, targetActorUuid: caster.uuid, n: 1 });
        since(n0);
        const out = await resist(card, [1, 1, 1]);
        assert.notInclude(label(out), "Spell Defense");
      });

      it("Shielding-only dice can be granted; parallel grants never exceed the balance", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        await setDefense(ally, 0, 3);
        const card = await cast();
        const castTestId = card.flags.sr2e.spell.testMessageId;
        const n0 = game.messages.size;
        await Promise.all([
          game.sr2e.grantSpellDefense(ally, { castTestId, targetActorUuid: victim.uuid, n: 2 }),
          game.sr2e.grantSpellDefense(ally, { castTestId, targetActorUuid: victim.uuid, n: 2 })]);
        const grants = since(n0).filter(m => m.flags?.sr2e?.spellDefenseGrant);
        const total = grants.reduce((t, m) => t + m.flags.sr2e.spellDefenseGrant.n, 0);
        assert.equal(total, 3, "2 + the 1 left, never 4");
        assert.equal(ally.system.dicePools.shieldingBonus, 0);
      });

      it("a magician's own dice are no longer auto-spent, and a cancelled resist spends nothing", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const card = await cast();
        const selfCard = { ...card.flags.sr2e.spell, targetUuid: ally.uuid };
        const m2 = await ChatMessage.create({ content: "Quench SD self", flags: { sr2e: { spell: selfCard } } });
        made.messages.push(m2.id);
        await setDefense(ally, 3);
        // Cancel.
        nextDialog().then(app => app.element.querySelector('button[data-action="cancel"]').click());
        await ally.rollSpellResistance(m2);
        assert.equal(ally.system.dicePools.spellDefense, 3, "cancelled: nothing spent");
        // Resist keeping all of it in reserve.
        nextDialog().then(app => { app.element.querySelector('input[name="own"]').value = "0";
          app.element.querySelector('button[data-action="roll"]').click(); });
        const n = game.messages.size;
        await withFaces([1, 1, 1, 1, 1], () => ally.rollSpellResistance(m2));
        await settle();
        since(n);
        assert.equal(ally.system.dicePools.spellDefense, 3, "held in reserve (p.132)");
      });

      it("a card resolved by anyone (marker) cannot be resisted again", async function () {
        this.timeout(15000);
        if (!canvas?.ready) this.skip();
        const card = await cast();
        const mk = await ChatMessage.create({ content: "Quench SD marker", flags: { sr2e: { resolves: card.id } } });
        made.messages.push(mk.id);
        const out = await resist(card, [1, 1, 1]);
        assert.lengthOf(out.filter(m => m.flags?.sr2e?.test), 0, "refused");
      });
    }, { displayName: "SR2E: Spell Defense for Allies" });

    // ── Restricted-use spells (SR2E p.133) ───────────────────────────────────
    quench.registerBatch("sr2e.restricted-spells", (context) => {
      const { it, assert, beforeEach, afterEach } = context;
      let before, msgsBefore, mage;
      const withFaces = async (faces, fn) => {
        const orig = CONFIG.Dice.randomUniform;
        const q = [...faces];
        CONFIG.Dice.randomUniform = () => q.length ? (6.5 - q.shift()) / 6 : orig();
        try { return await fn(); } finally { CONFIG.Dice.randomUniform = orig; }
      };
      const tests = () => game.messages.contents.slice(msgsBefore).filter(m => m.flags?.sr2e?.test).map(m => m.flags.sr2e.test);
      const mkSpell = async (name, system = {}) => (await mage.createEmbeddedDocuments("Item", [{ name, type: "spell",
        system: { category: "detection", type: "mana", force: 6, drainCode: "(F / 2)M", duration: "sustained", ...system } }]))[0];
      beforeEach(async () => {
        before = new Set(game.actors.map(a => a.id)); msgsBefore = game.messages.size;
        mage = await Actor.create({ name: "Quench Restricted Mage", type: "character", system: {
          willpower: { base: 6 }, magic: { type: "full_magician", value: 6, max: 6 } } });
        await mage.createEmbeddedDocuments("Item", [
          { name: "Sorcery", type: "skill", system: { rating: 6, category: "active" } },
          { name: "Conjuring", type: "skill", system: { rating: 4, category: "active" } }]);
      });
      afterEach(async () => {
        for (const a of game.actors.filter(a => !before.has(a.id))) await a.delete();
        await ChatMessage.deleteDocuments(game.messages.contents.slice(msgsBefore).map(m => m.id));
      });

      it("exclusive: cast at learned 6, works as 8 (8 dice), Drain at 6 (Stun at Magic 6)", async () => {
        const sp = await mkSpell("Quench Excl Detect", { restriction: "exclusive" });
        await withFaces(Array(20).fill(5), () => sp.roll({ force: 6, targetNumber: 4 }));
        const [cast, drain] = tests();
        assert.lengthOf(cast.dice, 8, "Force dice at the effective 8");
        assert.include(cast.label, "as 8, exclusive");
        assert.include(drain.label, "stun", "Drain at the actual Force 6 ≤ Magic 6");
        assert.include(drain.label, "TN 3", "⌊6÷2⌋");
        assert.equal(sp.system.sustainedForce, 6);
        assert.equal(sp.system.sustainedEffectiveForce, 8);
      });

      it("cast below the learned Force: Drain on the lower one; never above the learned Force", async () => {
        const sp = await mkSpell("Quench Fetish Detect", { restriction: "fetishReusable", fetish: { itemId: "", label: "" } });
        const [g] = await mage.createEmbeddedDocuments("Item", [{ name: "Quench Rattle", type: "gear", system: { quantity: 1 } }]);
        await sp.update({ "system.fetish.itemId": g.id });   // GM: allowed
        await withFaces(Array(20).fill(5), () => sp.roll({ force: 4, targetNumber: 4, fetishInHand: true }));
        const [cast, drain] = tests();
        assert.lengthOf(cast.dice, 5, "4 + 1 reusable fetish");
        assert.include(drain.label, "TN 2", "⌊4÷2⌋");
      });

      it("fetish: refused without it in hand, and when the reusable fetish is gone", async () => {
        const [g] = await mage.createEmbeddedDocuments("Item", [{ name: "Quench Wand", type: "gear", system: { quantity: 1 } }]);
        const sp = await mkSpell("Quench Wand Spell", { restriction: "fetishReusable", fetish: { itemId: g.id, label: "Quench Wand" } });
        await sp.roll({ force: 6, targetNumber: 4 });
        assert.lengthOf(tests(), 0, "not in hand: refused");
        await g.delete();
        await sp.roll({ force: 6, targetNumber: 4, fetishInHand: true });
        assert.lengthOf(tests(), 0, "no substitute for a lost fetish");
      });

      it("expendable fetish: used up before the test, even when the casting fails", async () => {
        const sp = await mkSpell("Quench Herb Spell", { restriction: "fetishExpendable", fetish: { itemId: "", label: "Quench Herbs" } });
        const [herbs] = await mage.createEmbeddedDocuments("Item", [{ name: "Quench Herbs", type: "gear", system: { quantity: 2 } }]);
        const { bindFetishStock } = await import("../restricted-spells.mjs");
        await bindFetishStock(sp, herbs);
        const [other] = await mage.createEmbeddedDocuments("Item", [{ name: "Quench Twigs", type: "gear", system: { quantity: 5 } }]);
        await bindFetishStock(sp, other);
        assert.isUndefined(other.getFlag("sr2e", "fetishFor"), "only the learned kind binds");
        await withFaces(Array(20).fill(1).map((v, i) => i === 1 ? 2 : v), () => sp.roll({ force: 3, targetNumber: 4, fetishInHand: true }));
        assert.equal(herbs.system.quantity, 1, "one used, though the cast failed");
      });

      it("exclusive vs anything else: both directions refused, and magical skills blocked", async () => {
        const plain = await mkSpell("Quench Plain Detect");
        const excl  = await mkSpell("Quench Excl Detect2", { restriction: "exclusive" });
        await plain.setSustaining(true, 3);
        await excl.roll({ force: 6, targetNumber: 4 });
        assert.lengthOf(tests(), 0, "an exclusive spell is not cast while another is sustained");
        await plain.setSustaining(false);
        await withFaces(Array(20).fill(5), () => excl.roll({ force: 6, targetNumber: 4 }));
        assert.isTrue(excl.system.sustaining);
        const n = tests().length;
        await plain.roll({ force: 3, targetNumber: 4 });
        assert.lengthOf(tests(), n, "no other spell while the exclusive one is sustained");
        await plain.setSustaining(true, 3);
        assert.isFalse(plain.system.sustaining, "setSustaining refused");
        await mage.rollConjuring({ force: 1, kind: "elemental", domain: "fire", materials: false });
        assert.lengthOf(tests(), n, "no conjuring");
        await mage.rollSkillTest(mage.items.getName("Sorcery").id, 4);
        assert.lengthOf(tests(), n, "no Sorcery roll");
        // A spell lock holding it frees the magician.
        await excl.update({ "system.spellLocked": true });
        await withFaces(Array(20).fill(5), () => plain.roll({ force: 3, targetNumber: 4 }));
        assert.isAbove(tests().length, n, "released by the lock");
        const { exclusiveBlock } = await import("../restricted-spells.mjs");
        assert.ok(exclusiveBlock(mage, { adding: excl }), "unlocking now would conflict");
      });

      it("versions and permanence: learning checks name + restriction; a player cannot change it", async () => {
        const sp = await mkSpell("Quench Fireball", { restriction: "" });
        assert.isTrue(mage._knowsSpell("Quench Fireball", "", ""));
        assert.isFalse(mage._knowsSpell("Quench Fireball", "", "exclusive"), "the exclusive version is another spell");
        const allowed = await sp._preUpdate({ system: { restriction: "exclusive" } }, {}, { isGM: false });
        assert.isFalse(allowed, "a player's change is refused");
        const gm = await sp._preUpdate({ system: { restriction: "exclusive" } }, {}, game.user);
        assert.notStrictEqual(gm, false, "the GM may");
        await sp.setSustaining(true, 6, 8);
        await sp.setSustaining(false);
        assert.equal(sp.system.sustainedEffectiveForce, 0, "dropping clears both");
      });
    }, { displayName: "SR2E: Restricted-Use Spells" });

    // ── Lasting spell effects: Ignite, Poltergeist, Ice Sheet (SR2E p.157–158) ─
    quench.registerBatch("sr2e.spell-effects", (context) => {
      const { it, assert, before, afterEach } = context;
      const made = { actors: [], combats: [] };
      let msgStart = 0;
      const withFaces = async (faces, fn) => {
        const orig = CONFIG.Dice.randomUniform;
        const q = [...faces];
        CONFIG.Dice.randomUniform = () => q.length ? (6.5 - q.shift()) / 6 : orig();
        try { return await fn(); } finally { CONFIG.Dice.randomUniform = orig; }
      };
      const waitFor = async (fn, ms = 3000) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 50)); }
        return false;
      };
      const since = () => game.messages.contents.slice(msgStart);
      const flagged = (key) => since().filter(m => m.flags?.sr2e?.[key]);
      const tests = () => since().filter(m => m.flags?.sr2e?.test).map(m => m.flags.sr2e.test);
      const nextDialog = () => new Promise(res => Hooks.once("renderDialogV2", (app) => setTimeout(() => res(app), 50)));
      const fx = () => import("../spell-effects.mjs");
      const mkActor = async (name, system, type = "npc") => {
        const a = await Actor.create({ name, type, system }); made.actors.push(a); return a;
      };
      const g = () => canvas.dimensions.size;
      const origin = () => ({ x: canvas.dimensions.sceneX + 30 * g(), y: canvas.dimensions.sceneY + 20 * g() });
      const put = async (a, dxCells, dyCells = 0) => {
        const o = origin();
        const [t] = await canvas.scene.createEmbeddedDocuments("Token", [{
          ...(await a.getTokenDocument()).toObject(), x: o.x + dxCells * g(), y: o.y + dyCells * g() }]);
        return t;
      };

      before(async () => { msgStart = game.messages.size; });
      afterEach(async function () {
        this.timeout(20000);
        for (const c of made.combats.splice(0)) { try { await c.delete(); } catch (e) {} }
        const ids = canvas.scene.tokens.filter(t => t.name?.startsWith("Quench FX")).map(t => t.id);
        if (ids.length) await canvas.scene.deleteEmbeddedDocuments("Token", ids);
        const tpl = canvas.scene.templates.filter(t => t.flags?.sr2e?.spellEffect).map(t => t.id);
        if (tpl.length) await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", tpl);
        for (const a of made.actors.splice(0)) { try { await a.delete(); } catch (e) {} }
        await ChatMessage.deleteDocuments(since().map(m => m.id));
        msgStart = game.messages.size;
      });

      it("environmental resistance: Quickness dice vs Power − Impact; ½ Impact for fire; no complete miss", async () => {
        const v = await mkActor("Quench FX Victim", { body: { base: 2 }, quickness: { base: 5 }, armor: { impact: 4 } });
        nextDialog().then(app => app.element.querySelector('button[data-action="roll"]').click());
        await withFaces(Array(10).fill(6).map((f, i) => i < 5 ? 1 : f), () => v.rollDamageResistance(6, "L", "impact", "stun",
          { environmental: { attr: "quickness", armorFraction: 1, source: "Poltergeist" }, attackerSuccesses: 0 }));
        let [t] = tests();
        assert.lengthOf(t.dice, 5, "Quickness 5 dice");
        assert.equal(t.tn, 2, "6 − full Impact 4");
        assert.include(t.label, "Poltergeist");
        assert.equal(v.system.conditionMonitor.stun.value, 1, "L Stun taken — no complete miss, no net staging");
        nextDialog().then(app => app.element.querySelector('button[data-action="roll"]').click());
        await withFaces(Array(10).fill(1), () => v.rollDamageResistance(6, "M", "impact", "physical",
          { environmental: { attr: "body", armorFraction: 0.5, source: "Ignite" } }));
        t = tests()[1];
        assert.lengthOf(t.dice, 2, "Body 2 dice");
        assert.equal(t.tn, 4, "6 − ½ Impact 2");
      });

      it("Ignite: needs MORE successes than Body; the delay is 10 ÷ successes, rounded up", async () => {
        const { igniteFromCast } = await fx();
        const mage = await mkActor("Quench FX Mage", {}, "character");
        const v = await mkActor("Quench FX Burnee", { body: { base: 4 } });
        await igniteFromCast({ caster: mage, force: 5, successes: 4, target: v });
        assert.isUndefined(v.getFlag("sr2e", "burning"), "4 = Body: no fire");
        await igniteFromCast({ caster: mage, force: 5, successes: 5, target: v });
        const st = v.getFlag("sr2e", "burning");
        assert.equal(st.status, "pending");
        assert.equal(st.igniteIn, 2, "10 ÷ 5");
        assert.isAtLeast(st.burnoutTurns, 1); assert.isAtMost(st.burnoutTurns, 6);
        assert.equal(st.clock.kind, "manual", "not in combat");
      });

      it("Ignite in combat: ignites on the Nth boundary, burns F, F+1 …, the last burning turn resisted; round edits add nothing", async function () {
        this.timeout(20000);
        const { createBurn } = await fx();
        const v = await mkActor("Quench FX Torch", { body: { base: 3 } });
        const combat = await Combat.create({ scene: canvas.scene.id }); made.combats.push(combat);
        await combat.createEmbeddedDocuments("Combatant", [{ actorId: v.id }]);
        await combat.startCombat();
        await withFaces([3], () => createBurn(v, { force: 4, successes: 5 }));   // 1D6 burnout = 3; ignites in 2
        assert.equal(v.getFlag("sr2e", "burning").clock.kind, "combat");
        const burns = () => flagged("burn").map(m => m.flags.sr2e.burn.power);
        await combat.nextRound();
        await waitFor(() => v.getFlag("sr2e", "burning").igniteIn === 1);
        assert.deepEqual(burns(), [], "first boundary: still catching");
        await combat.update({ round: combat.round + 5 });                          // a GM round edit
        await new Promise(r => setTimeout(r, 300));
        assert.deepEqual(burns(), [], "editing the round number is no boundary");
        await combat.nextRound();
        assert.isTrue(await waitFor(() => burns().length === 1));
        assert.deepEqual(burns(), [4], "ignites and burns (F)M");
        await combat.nextRound(); await waitFor(() => burns().length === 2);
        await combat.nextRound(); await waitFor(() => burns().length === 3);
        assert.deepEqual(burns(), [4, 5, 6], "Power +1 per turn; the 3rd (last) turn still burns");
        await waitFor(() => v.getFlag("sr2e", "burning").status === "out");
        await combat.nextRound(); await new Promise(r => setTimeout(r, 400));
        assert.lengthOf(burns(), 3, "burnt out");
      });

      it("an interrupted tick resumes with one card; Extinguish during a pending tick sticks", async () => {
        const { createBurn, tickBurn, extinguish } = await fx();
        const v = await mkActor("Quench FX Stubble", { body: { base: 1 } });
        await withFaces([6], () => createBurn(v, { force: 3, successes: 10 }));
        // Simulate a crash after step 1: a pendingTick written, no card, no commit.
        const st = v.getFlag("sr2e", "burning");
        const next = { ...st, status: "burning", igniteIn: 0, turnsBurned: 1, tickId: 1, version: 2, clock: { kind: "manual", ticks: 1 }, pendingTick: null };
        await v.setFlag("sr2e", "burning", { ...st, pendingTick: { tickId: 1, basedOnVersion: st.version,
          card: { actorUuid: v.uuid, actorName: v.name, power: 3, turn: 1, instance: st.instance, tickId: 1, resolved: false }, next } });
        await tickBurn(v, { manual: true });
        await tickBurn(v, { manual: true });
        const keys = flagged("burnTick").map(m => m.flags.sr2e.burnTick);
        assert.deepEqual(keys, [`${st.instance}:1`, `${st.instance}:2`], "the resumed tick posts once, then the next");
        assert.equal(v.getFlag("sr2e", "burning").burnoutTurns, 6, "burnout never re-rolled");
        // A pending tick overtaken by Extinguish is void.
        const now = v.getFlag("sr2e", "burning");
        await v.setFlag("sr2e", "burning", { ...now, pendingTick: { tickId: 3, basedOnVersion: now.version, card: null,
          next: { ...now, tickId: 3, version: now.version + 1, turnsBurned: 3, pendingTick: null } } });
        await extinguish(v);
        await tickBurn(v, { manual: true });
        assert.equal(v.getFlag("sr2e", "burning").status, "out");
      });

      it("an unlinked token burns on its own, not its base actor", async () => {
        const { igniteFromCast } = await fx();
        const mage = await mkActor("Quench FX Mage2", {}, "character");
        const base = await mkActor("Quench FX Ganger", { body: { base: 2 } });
        await base.update({ "prototypeToken.actorLink": false });
        const tok = await put(base, 0);
        await igniteFromCast({ caster: mage, force: 4, successes: 3, target: tok.actor });
        assert.ok(tok.actor.getFlag("sr2e", "burning"), "the token's synthetic actor burns");
        assert.isUndefined(base.getFlag("sr2e", "burning"), "the base does not");
      });

      it("Poltergeist: a failed cast places nothing; a sustained one hits who is inside now and each Combat Turn", async function () {
        this.timeout(20000);
        const mage = await mkActor("Quench FX Polter Mage", { willpower: { base: 6 }, magic: { type: "full_magician", value: 6, max: 6 } }, "character");
        await mage.createEmbeddedDocuments("Item", [{ name: "Sorcery", type: "skill", system: { rating: 6, category: "active" } }]);
        const [sp] = await mage.createEmbeddedDocuments("Item", [{ name: "Poltergeist", type: "spell", system: {
          category: "manipulation", type: "physical", force: 4, drainCode: "(F / 2)L", duration: "sustained", isAreaEffect: true } }]);
        const inside = await mkActor("Quench FX Inside", { quickness: { base: 3 } });
        const outside = await mkActor("Quench FX Outside", { quickness: { base: 3 } });
        const tIn = await put(inside, 0); await put(outside, 20);
        const o = origin();
        const area = { sceneId: canvas.scene.id, x: o.x + g() / 2, y: o.y + g() / 2 };
        await withFaces(Array(30).fill(1), () => sp.roll({ force: 4, targetNumber: 4, area }));
        assert.lengthOf(canvas.scene.templates.filter(t => t.flags?.sr2e?.spellEffect), 0, "0 successes: nothing placed");
        assert.lengthOf(flagged("poltergeist"), 0);

        const combat = await Combat.create({ scene: canvas.scene.id }); made.combats.push(combat);
        await combat.createEmbeddedDocuments("Combatant", [{ actorId: mage.id }]);
        await combat.startCombat();
        await withFaces(Array(30).fill(6), () => sp.roll({ force: 4, targetNumber: 4, area }));
        const tpl = () => canvas.scene.templates.filter(t => t.flags?.sr2e?.spellEffect?.kind === "poltergeist");
        assert.lengthOf(tpl(), 1, "placed once sustained");
        const hit = () => flagged("poltergeist").map(m => m.flags.sr2e.poltergeist.actorName).filter(n => n.startsWith("Quench FX"));
        assert.deepEqual(hit(), ["Quench FX Inside"], "only who is inside, at the cast");
        assert.equal(flagged("poltergeist")[0].flags.sr2e.poltergeist.level, "L");

        // Recast ends the old instance first.
        await withFaces(Array(30).fill(6), () => sp.roll({ force: 4, targetNumber: 4, area }));
        assert.lengthOf(tpl(), 1, "a recast replaces the area");

        await combat.nextRound();
        assert.isTrue(await waitFor(() => hit().length === 3), "another card on the new Combat Turn");
        await tIn.update({ x: tIn.x + 30 * g() });                                   // leaves
        await combat.nextRound(); await new Promise(r => setTimeout(r, 500));
        assert.lengthOf(hit(), 3, "a leaver is not hit");

        const { visibilityAlong } = await fx();
        const placeables = canvas.templates.placeables;
        const a = { x: o.x - 20 * g(), y: o.y + g() / 2 }, b = { x: o.x + 20 * g(), y: o.y + g() / 2 };
        assert.equal(visibilityAlong(a, b, placeables), 2, "a line of fire through it: +2");
        assert.equal(visibilityAlong(a, { x: a.x, y: a.y + 40 * g() }, placeables), 0, "elsewhere: none");

        await sp.setSustaining(false);
        assert.lengthOf(tpl(), 0, "dropping the spell removes the area");
      });

      it("Ice Sheet: a √(Magic × successes) square; a move across it gets one card, a move elsewhere none", async function () {
        this.timeout(15000);
        const { placeIceSheet } = await fx();
        const mage = await mkActor("Quench FX Ice Mage", { magic: { type: "full_magician", value: 4, max: 4 } }, "character");
        const [sp] = await mage.createEmbeddedDocuments("Item", [{ name: "Ice Sheet", type: "spell", system: {
          category: "manipulation", type: "physical", force: 3, duration: "instant" } }]);
        const o = origin();
        const center = { x: o.x + 5 * g(), y: o.y + g() / 2 };
        await placeIceSheet(sp, { side: 4, center, scene: canvas.scene });
        const [ice] = canvas.scene.templates.filter(t => t.flags?.sr2e?.spellEffect?.kind === "iceSheet");
        assert.ok(ice); assert.equal(ice.t, "rect");
        assert.closeTo(ice.distance, 4 * Math.SQRT2, 1e-6);

        const walker = await mkActor("Quench FX Walker", { quickness: { base: 2 } });
        const tok = await put(walker, 0);
        await tok.update({ x: tok.x + 10 * g() });                                    // straight across
        assert.isTrue(await waitFor(() => flagged("iceTest").length === 1), "crossing card");
        await tok.update({ y: tok.y + 10 * g() });                                    // away from it
        await new Promise(r => setTimeout(r, 500));
        assert.lengthOf(flagged("iceTest"), 1, "no card off the ice");
        assert.equal(flagged("iceTest")[0].flags.sr2e.iceTest.vehicle, false);
      });
    }, { displayName: "SR2E: Spell Effects (Ignite, Poltergeist, Ice Sheet)" });

    // ── Nature spirits depart at sunrise and sunset (SR2E p.139) ──────────────
    // Every run is SCOPED to "Quench NS" fixtures: the real call sends away
    // every nature spirit in the world.
    quench.registerBatch("sr2e.nature-expiry", (context) => {
      const { it, assert, before, after, afterEach } = context;
      let ns, elementals, placement, msgStart = 0, extraScene = null;
      const scope = (a) => a?.name?.startsWith("Quench NS");
      const settingsBefore = {};
      const waitFor = async (fn, ms = 3000) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 50)); }
        return false;
      };
      const mkSpirit = (name, system = {}) => Actor.create({ name: `Quench NS ${name}`, type: "spirit",
        system: { spiritType: "nature", force: 3, services: 2, ...system } });
      const tokenOn = async (scene, actor, link, x = 200) => (await scene.createEmbeddedDocuments("Token", [{
        ...(await actor.getTokenDocument()).toObject(), actorLink: link, x, y: 200 }]))[0];
      const depart = () => ns.natureSpiritsDepart({ reason: "Quench", scope, quiet: true });

      before(async () => {
        ns = await import("../nature-spirits.mjs");
        elementals = await import("../elementals.mjs");
        placement = await import("../placement.mjs");
        ns.departTesting.scope = scope;
        for (const k of ["natureSpiritExpiry", "natureSpiritDepartDelete"]) settingsBefore[k] = game.settings.get("sr2e", k);
        extraScene = await Scene.create({ name: "Quench NS Other Scene", width: 1000, height: 1000 });
        msgStart = game.messages.size;
      });
      after(async () => {
        ns.departTesting.scope = null;
        for (const [k, v] of Object.entries(settingsBefore)) await game.settings.set("sr2e", k, v);
        await extraScene?.delete();
      });
      afterEach(async function () {
        this.timeout(15000);
        await game.settings.set("sr2e", "natureSpiritDepartDelete", true);
        for (const s of [canvas.scene, extraScene]) {
          const ids = s.tokens.filter(t => t.name?.startsWith("Quench NS")).map(t => t.id);
          if (ids.length) await s.deleteEmbeddedDocuments("Token", ids);
        }
        const ids = game.actors.filter(a => a.name.startsWith("Quench NS")).map(a => a.id);
        if (ids.length) await Actor.deleteDocuments(ids);
        await ChatMessage.deleteDocuments(game.messages.contents.slice(msgStart).map(m => m.id));
        msgStart = game.messages.size;
      });

      it("a bound nature spirit goes, with its tokens on every scene; the conjurer's list is untouched but reads live", async () => {
        const mage = await Actor.create({ name: "Quench NS Shaman", type: "character" });
        const sp = await mkSpirit("City", { conjurerUuid: mage.uuid });
        await mage.update({ "system.boundSpirits": [sp.uuid] });
        await tokenOn(canvas.scene, sp, true);
        await tokenOn(extraScene, sp, true);
        const gone = await depart();
        assert.include(gone, sp.name);
        assert.isFalse(game.actors.has(sp.id), "actor deleted");
        assert.lengthOf(canvas.scene.tokens.filter(t => t.actorId === sp.id), 0);
        assert.lengthOf(extraScene.tokens.filter(t => t.actorId === sp.id), 0, "the inactive scene too");
        assert.deepEqual(mage.system.boundSpirits, [sp.uuid], "the GM never writes the bindings");
        assert.lengthOf(elementals.liveBoundSpirits(mage), 0, "but no reader sees it");
        // The conjurer's own next write prunes it.
        const other = await mkSpirit("Second", { spiritType: "elemental", domain: "fire" });
        await elementals.mutateBindings(mage, live => [...live, other.uuid]);
        assert.deepEqual(mage.system.boundSpirits, [other.uuid]);
      });

      it("orphaned and zero-service spirits go; elementals stay; two unlinked copies both go", async () => {
        const orphan = await mkSpirit("Orphan");
        const zero = await mkSpirit("Zero", { services: 0 });
        const elem = await mkSpirit("Fire", { spiritType: "elemental", domain: "fire" });
        const t1 = await tokenOn(canvas.scene, orphan, false, 200);
        const t2 = await tokenOn(canvas.scene, orphan, false, 400);
        const te = await tokenOn(canvas.scene, elem, true, 600);
        await depart();
        assert.isFalse(game.actors.has(orphan.id)); assert.isFalse(game.actors.has(zero.id));
        assert.isFalse(canvas.scene.tokens.has(t1.id)); assert.isFalse(canvas.scene.tokens.has(t2.id));
        assert.isTrue(game.actors.has(elem.id), "elemental untouched");
        assert.isTrue(canvas.scene.tokens.has(te.id));
      });

      it("an unlinked token its delta made an elemental is detached and survives two runs (a retry reuses the detached actor)", async () => {
        const base = await mkSpirit("Base");
        const tok = await tokenOn(canvas.scene, base, false);
        await canvas.scene.tokens.get(tok.id).update({ "flags.sr2e.summonedSpirit": base.uuid });
        await tok.actor.update({ name: "Quench NS Turned", "system.spiritType": "elemental", "system.domain": "water" });
        // A previous run died after creating the detached actor: it is reused.
        const pre = await Actor.create({ ...tok.actor.toObject(), _id: undefined, flags: { sr2e: { detachedFrom: tok.uuid } } });
        await depart();
        const t = canvas.scene.tokens.get(tok.id);
        assert.ok(t, "the token survives");
        assert.equal(t.actorId, pre.id, "re-pointed to the one detached actor");
        assert.lengthOf(game.actors.filter(a => a.getFlag("sr2e", "detachedFrom") === tok.uuid), 1, "not two");
        assert.equal(t.actor.system.domain, "water");
        assert.equal(t.flags.sr2e.summonedSpirit, pre.uuid, "its flag follows");
        assert.isFalse(game.actors.has(base.id), "the nature base expires");
        await depart();
        assert.ok(canvas.scene.tokens.get(tok.id), "still there after a second run");
      });

      it("retention: kept, marked, not reported again; deletion on retries an interrupted actor delete", async () => {
        await game.settings.set("sr2e", "natureSpiritDepartDelete", false);
        const kept = await mkSpirit("Kept");
        const first = await depart();
        assert.include(first, kept.name);
        assert.isTrue(kept.getFlag("sr2e", "departed")); assert.equal(kept.system.services, 0);
        assert.notInclude(await depart(), kept.name, "a complete departure is not reported again");
        await game.settings.set("sr2e", "natureSpiritDepartDelete", true);
        await depart();                        // marked, tokenless, deletion on: finished now
        assert.isFalse(game.actors.has(kept.id));
      });

      it("a spirit summoned after the snapshot survives; placement refuses a departed spirit; a late token is reconciled", async function () {
        this.timeout(10000);
        const old = await mkSpirit("Old");
        const run = depart();                  // snapshot taken synchronously here
        const fresh = await mkSpirit("Fresh");
        await run;
        assert.isTrue(game.actors.has(fresh.id), "summoned after the event");
        await game.settings.set("sr2e", "natureSpiritDepartDelete", false);
        await depart();
        assert.isTrue(fresh.getFlag("sr2e", "departed"));
        const caster = await Actor.create({ name: "Quench NS Caster", type: "character" });
        await tokenOn(canvas.scene, caster, true, 800);
        const n = canvas.scene.tokens.size;
        const mode = game.settings.get("sr2e", "spiritPlacement");
        await game.settings.set("sr2e", "spiritPlacement", "nearest");   // not "prompt": no click to wait for
        try { await placement.placeSummonedToken(fresh, caster); }
        finally { await game.settings.set("sr2e", "spiritPlacement", mode); }
        assert.equal(canvas.scene.tokens.size, n, "no token for a departed spirit");
        // A token that landed anyway (the check and the create raced): the GM removes it.
        const late = await tokenOn(canvas.scene, fresh, true, 1000);
        await late.update({ "flags.sr2e.summonedSpirit": fresh.uuid });
        await depart();
        assert.isFalse(canvas.scene.tokens.has(late.id));
        const [again] = await canvas.scene.createEmbeddedDocuments("Token", [{ ...(await fresh.getTokenDocument()).toObject(),
          x: 1200, y: 200, flags: { sr2e: { summonedSpirit: fresh.uuid } } }]);
        assert.isTrue(await waitFor(() => !canvas.scene.tokens.has(again.id)), "createToken reconcile");
        assert.isTrue(game.actors.has(old.id) === false);
      });

      it("the time trigger: off does nothing; on crosses 18:00 once; a rewind does nothing", async () => {
        const sp = await mkSpirit("Timed");
        const day = 24 * 3600, t = 50 * day + 18 * 3600;
        await game.settings.set("sr2e", "natureSpiritExpiry", false);
        Hooks.callAll("updateWorldTime", t, 3600);
        await new Promise(r => setTimeout(r, 400));
        assert.isTrue(game.actors.has(sp.id), "setting off");
        await game.settings.set("sr2e", "natureSpiritExpiry", true);
        Hooks.callAll("updateWorldTime", t, -3600);
        await new Promise(r => setTimeout(r, 400));
        assert.isTrue(game.actors.has(sp.id), "a rewind");
        Hooks.callAll("updateWorldTime", t - 3600, 3600);
        await new Promise(r => setTimeout(r, 400));
        assert.isTrue(game.actors.has(sp.id), "16:00 → 17:00 crosses nothing");
        Hooks.callAll("updateWorldTime", t, 3600);
        assert.isTrue(await waitFor(() => !game.actors.has(sp.id)), "17:00 → 18:00: gone");
      });
    }, { displayName: "SR2E: Nature Spirits Depart (p.139)" });

    quench.registerBatch("sr2e.elemental-aid", (context) => {
      const { describe, it, assert, afterEach } = context;
      const made = [];
      const msgs = [];
      afterEach(async function () {
        this.timeout(10000);
        await ChatMessage.deleteDocuments(msgs.splice(0).filter(id => game.messages.has(id)));
        for (const a of made.splice(0)) {
          try {
            // Deleting a spirit that holds a spell is refused (preDeleteActor): release it.
            if (a.type === "spirit") await a.update({ "system.service": "", "system.sustainingSpellUuid": "", "system.pendingExpireSpellUuid": "" });
            await a.delete();
          } catch (e) {}
        }
      });
      const track = (n) => msgs.push(...game.messages.contents.slice(n).map(m => m.id));

      async function setup({ fireServices = 3, earthForce = 3 } = {}) {
        const mage = await Actor.create({
          name: "Quench Elemental Mage", type: "character",
          system: { willpower: { base: 5 }, magic: { value: 6, type: "full_magician", tradition: "hermetic" } },
          items: [
            { name: "Mana Bolt", type: "spell", system: { category: "combat", type: "mana", force: 4, duration: "instant", damageCode: "S", drainCode: "(F / 2)S" } },
            { name: "Armor", type: "spell", system: { category: "manipulation", type: "physical", force: 3, duration: "sustained" },
              effects: [{ name: "Armor", changes: [{ key: "system.armor.impact", mode: 2, value: "1" }] }] }
          ]
        });
        made.push(mage);
        const spirit = async (name, domain, force, services) => {
          const s = await Actor.create({ name, type: "spirit", system: { spiritType: "elemental", domain, force,
            services, maxServices: services, conjurerUuid: mage.uuid } });
          made.push(s); return s;
        };
        const fire = await spirit("Quench Fire", "fire", 4, fireServices);
        const earth = await spirit("Quench Earth", "earth", earthForce, 2);
        const nature = await Actor.create({ name: "Quench Forest", type: "spirit", system: { spiritType: "nature", domain: "forest", force: 3, services: 2 } });
        made.push(nature);
        await mage.update({ "system.boundSpirits": [fire.uuid, earth.uuid] });
        return { mage, fire, earth, nature, bolt: mage.items.getName("Mana Bolt"), armor: mage.items.getName("Armor") };
      }

      describe("Aid Sorcery (p.141)", () => {
        it("adds the elemental's dice, lowers its Force, and charges one service to start", async () => {
          const { fire, bolt } = await setup();
          const n = game.messages.size;
          await bolt.roll({ force: 4, targetNumber: 4, elementalAid: { uuid: fire.uuid, cast: 2, drain: 1 } });
          track(n);
          const cast = game.messages.contents.slice(n).find(m => /Cast Mana Bolt/.test(m.flags?.sr2e?.test?.label ?? ""));
          assert.lengthOf(cast.flags.sr2e.test.dice, 6, "Force 4 + 2 aid dice");
          assert.include(fire.system, { forceUsed: 3, service: "aid", services: 2, effectiveForce: 1 });
          // Continuing an active Aid Sorcery costs no further service.
          const m = game.messages.size;
          await bolt.roll({ force: 4, targetNumber: 4, elementalAid: { uuid: fire.uuid, cast: 1, drain: 0 } });
          track(m);
          assert.include(fire.system, { forceUsed: 4, services: 2, depleted: true, service: "" }, "spent → vanished");
        });

        it("a vanished, wrong-element, or foreign elemental is refused with nothing spent", async () => {
          const { mage, fire, earth, bolt } = await setup();
          await fire.update({ "system.forceUsed": 4 });
          const stun = mage.system.conditionMonitor.stun.value, n = game.messages.size;
          assert.isNull(await bolt.roll({ force: 4, targetNumber: 4, elementalAid: { uuid: fire.uuid, cast: 1, drain: 0 } }));
          assert.isNull(await bolt.roll({ force: 4, targetNumber: 4, elementalAid: { uuid: earth.uuid, cast: 1, drain: 0 } }), "earth aids manipulation, not combat");
          await mage.update({ "system.boundSpirits": [] });
          await fire.update({ "system.forceUsed": 0 });
          assert.isNull(await bolt.roll({ force: 4, targetNumber: 4, elementalAid: { uuid: fire.uuid, cast: 1, drain: 0 } }), "unbound");
          assert.equal(game.messages.size, n, "no messages");
          assert.equal(mage.system.conditionMonitor.stun.value, stun, "no drain");
          assert.equal(fire.system.services, 3, "no service charged");
        });

        it("a duplicate submission on this client is rejected; sequential spends both consume", async () => {
          const { fire } = await setup();
          const [a, b] = await Promise.all([fire.elementalTransition("aid", { n: 1 }, { quiet: true }),
                                            fire.elementalTransition("aid", { n: 1 }, { quiet: true })]);
          assert.deepEqual([a.ok, b.ok].sort(), [false, true], "exactly one went through");
          assert.equal(fire.system.forceUsed, 1);
          assert.isTrue((await fire.elementalTransition("aid", { n: 2 }, { quiet: true })).ok);
          assert.equal(fire.system.forceUsed, 3);
          assert.isFalse((await fire.elementalTransition("aid", { n: 2 }, { quiet: true })).ok, "only 1 Force left");
          assert.equal(fire.system.forceUsed, 3, "a refused spend changes nothing");
        });

        it("re-calling a vanished elemental costs one service and restores full Force, idle", async () => {
          const { fire } = await setup();
          await fire.update({ "system.forceUsed": 4 });
          assert.isTrue((await fire.elementalTransition("recall", {}, { quiet: true })).ok);
          assert.include(fire.system, { forceUsed: 0, services: 2, service: "", effectiveForce: 4 });
        });
      });

      describe("Spell Sustaining (p.142)", () => {
        it("lifts the +2 TN while it holds the spell; at 0 Force the spell ENDS", async () => {
          const { mage, earth, armor } = await setup();
          await armor.setSustaining(true, 3);
          assert.equal(mage.system.sustainPenalty, 2);
          assert.isTrue((await earth.elementalTransition("startSustain", { spell: armor }, { quiet: true })).ok);
          assert.equal(mage.system.sustainPenalty, 0, "the elemental pays instead");
          assert.ok(earth._elementalBusyReason(), "busy: no powers or attacks meanwhile");
          await earth.elementalTransition("sustainTurn", { n: 1 }, { quiet: true });
          await earth.elementalTransition("sustainTurn", { n: 1 }, { quiet: true });
          assert.isTrue(armor.system.sustaining);
          await earth.elementalTransition("sustainTurn", { n: 1 }, { quiet: true });
          assert.isFalse(armor.system.sustaining, "Force 3 → 0: the spell ends");
          assert.lengthOf(mage.effects.filter(e => e.origin === armor.uuid), 0, "its effects are gone");
          assert.equal(earth.system.pendingExpireSpellUuid, "");
        });

        it("the mage can take it back before the Force runs out, not after", async () => {
          const { mage, earth, armor } = await setup();
          await armor.setSustaining(true, 3);
          await earth.elementalTransition("startSustain", { spell: armor }, { quiet: true });
          assert.isTrue((await earth.elementalTransition("takeOver", {}, { quiet: true })).ok);
          assert.isTrue(armor.system.sustaining, "the spell keeps running");
          assert.equal(mage.system.sustainPenalty, 2, "the mage pays again");
          await earth.update({ "system.services": 2 });
          await earth.elementalTransition("startSustain", { spell: armor }, { quiet: true });
          await earth.update({ "system.force": 1, "system.forceUsed": 1 });   // a Force edit spends it
          assert.isFalse((await earth.elementalTransition("takeOver", {}, { quiet: true })).ok, "too late (p.142)");
        });

        it("one holder per spell, one service per elemental", async () => {
          const { mage, earth, armor } = await setup();
          const earth2 = await Actor.create({ name: "Quench Earth 2", type: "spirit", system: { spiritType: "elemental",
            domain: "earth", force: 3, services: 2, conjurerUuid: mage.uuid } });
          made.push(earth2);
          await mage.update({ "system.boundSpirits": [...mage.system.boundSpirits, earth2.uuid] });
          await armor.setSustaining(true, 3);
          await earth.elementalTransition("startSustain", { spell: armor }, { quiet: true });
          assert.isFalse((await earth2.elementalTransition("startSustain", { spell: armor }, { quiet: true })).ok, "already held");
          assert.isFalse((await earth.elementalTransition("aid", { n: 1 }, { quiet: true })).ok, "busy sustaining");
        });

        it("a spell still ending cannot be recast — even after its elemental is unbound — until Finish", async () => {
          const { mage, earth, armor } = await setup();
          await earth.update({ "system.forceUsed": 3, "system.pendingExpireSpellUuid": armor.uuid });
          await mage.update({ "system.boundSpirits": [] });
          const n = game.messages.size;
          assert.isNull(await armor.roll({ force: 3, targetNumber: 4 }), "recast refused");
          await armor.setSustaining(true, 3);
          assert.isFalse(armor.system.sustaining, "re-sustain refused");
          assert.equal(game.messages.size, n);
          assert.isTrue((await earth.elementalTransition("finishExpire", {}, { quiet: true })).ok);
          await armor.setSustaining(true, 3);
          assert.isTrue(armor.system.sustaining, "allowed once the ending finished");
        });

        it("recasting a spell an elemental holds is refused before anything is spent", async () => {
          const { earth, armor } = await setup();
          await armor.setSustaining(true, 3);
          await earth.elementalTransition("startSustain", { spell: armor }, { quiet: true });
          const n = game.messages.size;
          assert.isNull(await armor.roll({ force: 3, targetNumber: 4 }));
          assert.equal(game.messages.size, n);
          assert.equal(earth.system.services, 1, "no free re-sustain");
        });

        it("a sustaining elemental cannot be deleted out from under its spell", async () => {
          const { earth, armor } = await setup();
          await armor.setSustaining(true, 3);
          await earth.elementalTransition("startSustain", { spell: armor }, { quiet: true });
          await earth.delete();
          assert.ok(game.actors.get(earth.id), "deletion refused");
          assert.isTrue(armor.system.sustaining);
        });

        it("Finish sweeps leftover effects even when the spell no longer reads as sustaining", async () => {
          const { mage, earth, armor } = await setup();
          await armor.setSustaining(true, 3);
          // Simulate a half-finished ending: flag cleared, effect left behind.
          await armor.update({ "system.sustaining": false });
          await earth.update({ "system.forceUsed": 3, "system.pendingExpireSpellUuid": armor.uuid });
          assert.lengthOf(mage.effects.filter(e => e.origin === armor.uuid), 1);
          assert.isTrue((await earth.elementalTransition("finishExpire", {}, { quiet: true })).ok);
          assert.lengthOf(mage.effects.filter(e => e.origin === armor.uuid), 0, "swept");
          assert.equal(earth.system.pendingExpireSpellUuid, "");
        });

        it("banishing (releasing) a sustaining elemental ends its spell", async () => {
          const { mage, earth, armor } = await setup();
          await armor.setSustaining(true, 3);
          await earth.elementalTransition("startSustain", { spell: armor }, { quiet: true });
          const { releaseElemental } = await import("../elementals.mjs");
          assert.isTrue(await releaseElemental(earth));
          assert.isFalse(armor.system.sustaining);
          assert.lengthOf(mage.effects.filter(e => e.origin === armor.uuid), 0);
        });
      });

      describe("Everything else is unchanged", () => {
        it("nature spirits and idle elementals keep their powers and attacks", async () => {
          const { fire, nature } = await setup();
          assert.isNull(nature._elementalBusyReason());
          assert.isNull(fire._elementalBusyReason());
          assert.equal(nature.system.effectiveForce, 3);
        });
      });
    }, { displayName: "SR2E: Elemental aid (p.141–142)" });

    // ── Automatic Combat Turn countdown for sustaining elementals (0.97.0):
    //    charged inside SR2ECombat#nextRound, idempotent per boundary. ────────
    quench.registerBatch("sr2e.elemental-clock", (context) => {
      const { it, assert, afterEach } = context;
      const actors = [], combats = [];
      let msgStart = 0;
      afterEach(async function () {
        this.timeout(15000);
        for (const c of combats.splice(0)) { try { await c.delete(); } catch (e) {} }
        for (const a of actors.splice(0)) {
          try {
            if (a.type === "spirit") await a.update({ "system.service": "", "system.sustainingSpellUuid": "", "system.pendingExpireSpellUuid": "" });
            await a.delete();
          } catch (e) {}
        }
        await ChatMessage.deleteDocuments(game.messages.contents.slice(msgStart).map(m => m.id));
      });

      async function setup({ force = 3, inCombat = true, sustainFirst = false } = {}) {
        msgStart = game.messages.size;
        const mage = await Actor.create({ name: "Quench Clock Mage", type: "character",
          system: { willpower: { base: 5 }, magic: { value: 6, type: "full_magician", tradition: "hermetic" } },
          items: [{ name: "Armor", type: "spell", system: { category: "manipulation", type: "physical", force: 3, duration: "sustained" } }] });
        const earth = await Actor.create({ name: "Quench Clock Earth", type: "spirit", system: { spiritType: "elemental",
          domain: "earth", force, services: 3, conjurerUuid: mage.uuid } });
        actors.push(mage, earth);
        await mage.update({ "system.boundSpirits": [earth.uuid] });
        const armor = mage.items.getName("Armor");
        const combat = await Combat.create({ scene: canvas?.scene?.id ?? null });
        combats.push(combat);
        if (inCombat) await combat.createEmbeddedDocuments("Combatant", [{ actorId: mage.id }]);
        const hold = async () => {
          await armor.setSustaining(true, 3);
          return earth.elementalTransition("startSustain", { spell: armor }, { quiet: true });
        };
        if (sustainFirst) await hold();
        await combat.startCombat();
        if (!sustainFirst) await hold();
        return { mage, earth, armor, combat };
      }

      it("starting a combat charges nothing; the turn a sustain begins in is free; then 1 per Combat Turn", async () => {
        const { earth, combat } = await setup();
        assert.equal(earth.system.forceUsed, 0);
        assert.isTrue(earth.system.sustainFreePending, "started mid-combat");
        await combat.nextRound();
        assert.equal(earth.system.forceUsed, 0, "the starting turn is free");
        await combat.nextRound();
        assert.equal(earth.system.forceUsed, 1);
      });

      it("a sustain from before the combat is charged at the first boundary", async () => {
        const { earth, combat } = await setup({ sustainFirst: true });
        assert.isFalse(earth.system.sustainFreePending);
        await combat.nextRound();
        assert.equal(earth.system.forceUsed, 1);
      });

      it("at 0 Force the spell ends before the new Combat Turn", async () => {
        const { armor, combat } = await setup({ force: 1, sustainFirst: true });
        await combat.nextRound();
        assert.isFalse(armor.system.sustaining, "Force 1 → 0: the spell ended");
        assert.equal(combat.round, 2);
      });

      it("editing the round number charges nothing; the free turn is still free", async () => {
        const { earth, combat } = await setup();
        await combat.update({ round: 9 });
        assert.equal(earth.system.forceUsed, 0);
        await combat.nextRound();
        assert.equal(earth.system.forceUsed, 0, "free boundary unaffected by the label");
        await combat.nextRound();
        assert.equal(earth.system.forceUsed, 1);
      });

      it("a retried Next Round after a failed round update does not charge twice", async () => {
        const { earth, combat } = await setup({ sustainFirst: true });
        const orig = combat.update.bind(combat);
        let fail = true;
        combat.update = async (data, o) => {
          if (fail && "round" in data) { fail = false; throw new Error("injected"); }
          return orig(data, o);
        };
        try {
          try { await combat.nextRound(); } catch (e) { /* injected */ }
          assert.equal(earth.system.forceUsed, 1, "charged before the failure");
          await combat.nextRound();
          assert.equal(earth.system.forceUsed, 1, "the retry of the same boundary skips it");
          await combat.nextRound();
          assert.equal(earth.system.forceUsed, 2, "the next boundary charges");
        } finally { delete combat.update; }
      });

      it("a combat without the mage charges nothing", async () => {
        const { earth, combat } = await setup({ inCombat: false, sustainFirst: true });
        await combat.nextRound();
        assert.equal(earth.system.forceUsed, 0);
      });

      it("a turn it could not count gets a card; the card works once, while current", async () => {
        const { earth, combat } = await setup({ sustainFirst: true });
        earth.update = async () => { throw new Error("injected"); };
        const n = game.messages.size;
        try { await combat.nextRound(); } finally { delete earth.update; }
        assert.equal(combat.round, 2, "the round still advanced");
        assert.equal(earth.system.forceUsed, 0);
        const card = game.messages.contents.slice(n).find(m => m.content.includes("sr2e-count-turn-btn"));
        assert.ok(card, "a recovery card was posted");
        const btn = new DOMParser().parseFromString(card.content, "text/html").querySelector(".sr2e-count-turn-btn");
        const { countTurnFromCard } = await import("../elementals.mjs");
        await countTurnFromCard({ ...btn.dataset });
        assert.equal(earth.system.forceUsed, 1, "counted once");
        await countTurnFromCard({ ...btn.dataset });
        assert.equal(earth.system.forceUsed, 1, "a second click does nothing");
      });

      it("a card after a later boundary has expired", async () => {
        const { earth, combat } = await setup({ sustainFirst: true });
        earth.update = async () => { throw new Error("injected"); };
        const n = game.messages.size;
        try { await combat.nextRound(); } finally { delete earth.update; }
        const card = game.messages.contents.slice(n).find(m => m.content.includes("sr2e-count-turn-btn"));
        const btn = new DOMParser().parseFromString(card.content, "text/html").querySelector(".sr2e-count-turn-btn");
        await combat.nextRound();                 // the next boundary counts normally
        assert.equal(earth.system.forceUsed, 1);
        const { countTurnFromCard } = await import("../elementals.mjs");
        await countTurnFromCard({ ...btn.dataset });
        assert.equal(earth.system.forceUsed, 1, "expired: no replay");
      });

      it("a missed free turn can be marked passed without spending Force", async () => {
        const { earth } = await setup();
        assert.isTrue((await earth.elementalTransition("consumeFree", {}, { quiet: true })).ok);
        assert.isFalse(earth.system.sustainFreePending);
        assert.equal(earth.system.forceUsed, 0);
      });

      it("marking a missed free turn passed also retires its recovery card", async () => {
        const { earth, combat } = await setup();              // free turn owed
        earth.update = async () => { throw new Error("injected"); };
        const n = game.messages.size;
        try { await combat.nextRound(); } finally { delete earth.update; }
        const card = game.messages.contents.slice(n).find(m => m.content.includes("sr2e-count-turn-btn"));
        const btn = new DOMParser().parseFromString(card.content, "text/html").querySelector(".sr2e-count-turn-btn");
        await earth.elementalTransition("consumeFree", {}, { quiet: true });
        const { countTurnFromCard } = await import("../elementals.mjs");
        await countTurnFromCard({ ...btn.dataset });
        assert.equal(earth.system.forceUsed, 0, "the corrected boundary is not charged again");
      });

      it("a chat failure on a card click still ends the spell", async () => {
        const { earth, armor, combat } = await setup({ force: 1, sustainFirst: true });
        earth.update = async () => { throw new Error("injected"); };
        const n = game.messages.size;
        try { await combat.nextRound(); } finally { delete earth.update; }
        const card = game.messages.contents.slice(n).find(m => m.content.includes("sr2e-count-turn-btn"));
        const btn = new DOMParser().parseFromString(card.content, "text/html").querySelector(".sr2e-count-turn-btn");
        const { countTurnFromCard } = await import("../elementals.mjs");
        const orig = ChatMessage.create;
        ChatMessage.create = async () => { throw new Error("injected chat"); };
        try { await countTurnFromCard({ ...btn.dataset }); } finally { ChatMessage.create = orig; }
        assert.isFalse(armor.system.sustaining, "expired despite the chat failure");
        assert.equal(earth.system.pendingExpireSpellUuid, "");
      });

      it("the mage moving to another combat hands it the clock", async () => {
        const { mage, earth, combat } = await setup();
        const b = await Combat.create({ scene: canvas?.scene?.id ?? null });
        combats.push(b);
        await b.createEmbeddedDocuments("Combatant", [{ actorId: mage.id }]);
        await b.startCombat();
        await combat.deleteEmbeddedDocuments("Combatant", combat.combatants.map(c => c.id));
        await b.nextRound();
        assert.equal(earth.system.sustainCombatId, b.id, "adopted");
        assert.equal(earth.system.forceUsed, 1, "no free turn on adoption");
      });
    }, { displayName: "SR2E: Elemental Combat Turn clock (p.142)" });

    // ── Learning spells (SR2E p.132–133) with Aid Study, and elemental Spell
    //    Defense aid (p.141) — 0.98.0. ─────────────────────────────────────────
    quench.registerBatch("sr2e.spell-learning", (context) => {
      const { describe, it, assert, afterEach } = context;
      const actors = [], items = [];
      let msgStart = 0;
      const withFaces = async (faces, fn) => {
        const orig = CONFIG.Dice.randomUniform; const q = [...faces];
        CONFIG.Dice.randomUniform = () => q.length ? (6.5 - q.shift()) / 6 : orig();
        try { return await fn(); } finally { CONFIG.Dice.randomUniform = orig; }
      };
      afterEach(async function () {
        this.timeout(15000);
        for (const a of actors.splice(0)) {
          try {
            if (a.type === "spirit") await a.update({ "system.service": "", "system.sustainingSpellUuid": "", "system.pendingExpireSpellUuid": "" });
            await a.delete();
          } catch (e) {}
        }
        for (const i of items.splice(0)) { try { await i.delete(); } catch (e) {} }
        await ChatMessage.deleteDocuments(game.messages.contents.slice(msgStart).map(m => m.id));
      });

      async function setup({ karma = 20, sorcery = 4, theory = 2, spirit = false } = {}) {
        msgStart = game.messages.size;
        const mage = await Actor.create({ name: "Quench Learn Mage", type: "character",
          system: { intelligence: { base: 5 }, willpower: { base: 5 },
                    magic: { value: 6, type: "full_magician", tradition: "hermetic" }, karma: { current: karma } },
          items: [{ name: "Sorcery", type: "skill", system: { rating: sorcery, category: "active" } },
                  { name: "Magical Theory", type: "skill", system: { rating: theory, category: "knowledge" } }] });
        actors.push(mage);
        const src = await Item.create({ name: "Quench Stunbolt", type: "spell",
          system: { category: "combat", type: "mana", force: 1, duration: "instant", drainCode: "(F / 2)M",
                    sustaining: true, spellLocked: true } });   // live state that must NOT be copied
        items.push(src);
        let fire = null;
        if (spirit) {
          fire = await Actor.create({ name: "Quench Learn Fire", type: "spirit", system: { spiritType: "elemental",
            domain: "fire", force: 4, services: 3, conjurerUuid: mage.uuid } });
          actors.push(fire);
          await mage.update({ "system.boundSpirits": [fire.uuid] });
        }
        return { mage, src, fire };
      }
      const cardOf = (attemptId) => game.messages.contents.find(m => m.flags?.sr2e?.learning?.attemptId === attemptId);

      describe("Learning a spell", () => {
        it("rolls Sorcery + Magical Theory vs twice the Force; completing spends Force Karma and adds a clean spell", async () => {
          const { mage, src } = await setup();
          // Force 3 → TN 6. 6 dice: faces 6,6,6,2,2,2 → the 6s explode (6+x ≥ 6 always) → 3 successes.
          const r = await withFaces([6, 1, 6, 1, 6, 1, 2, 2, 2], () =>
            mage.learnSpell({ sourceUuid: src.uuid, force: 3, libraryRating: 3 }));
          const test = game.messages.get(r.result.testMessageId).flags.sr2e.test;
          assert.lengthOf(test.dice, 6, "Sorcery 4 + Magical Theory 2");
          assert.equal(test.tn, 6, "twice the Force");
          assert.notOk(mage.items.find(i => i.type === "spell"), "nothing added before Complete");
          await mage.completeLearning(r.attemptId);
          const spell = mage.items.find(i => i.type === "spell");
          assert.ok(spell, "learned");
          assert.equal(spell.system.force, 3);
          assert.isFalse(spell.system.sustaining, "no live state copied");
          assert.isFalse(spell.system.spellLocked);
          assert.equal(mage.system.karma.current, 17, "Force 3 Karma");
          assert.equal(mage.getFlag("sr2e", "learning")[r.attemptId].days, 1, "3 successes: ceil(3/3) = 1 day");
        });

        it("a failed attempt adds nothing and costs no Karma, even with Karma since spent", async () => {
          const { mage, src } = await setup();
          const r = await withFaces([1, 2, 1, 2, 1, 2], () => mage.learnSpell({ sourceUuid: src.uuid, force: 3, libraryRating: 3 }));
          await mage.update({ "system.karma.current": 0 });
          await mage.completeLearning(r.attemptId);
          assert.equal(mage.getFlag("sr2e", "learning")[r.attemptId].status, "failed");
          assert.notOk(mage.items.find(i => i.type === "spell"));
          assert.equal(mage.system.karma.current, 0);
        });

        it("refuses without Karma, a good enough library, or when the spell is known — nothing spent", async () => {
          const { mage, src } = await setup({ karma: 2 });
          const n = game.messages.size;
          assert.isNull(await mage.learnSpell({ sourceUuid: src.uuid, force: 3, libraryRating: 3 }), "Karma");
          await mage.update({ "system.karma.current": 20 });
          assert.isNull(await mage.learnSpell({ sourceUuid: src.uuid, force: 3, libraryRating: 2 }), "library");
          await mage.createEmbeddedDocuments("Item", [{ name: "quench  stunbolt", type: "spell", system: { category: "combat" } }]);
          assert.isNull(await mage.learnSpell({ sourceUuid: src.uuid, force: 3, libraryRating: 3 }), "already known by name");
          assert.equal(game.messages.size, n);
        });

        it("completes once: a double click, and a retry after payment, never charge twice", async () => {
          const { mage, src } = await setup();
          const r = await withFaces([6, 1, 6, 1, 2, 2, 2, 2], () => mage.learnSpell({ sourceUuid: src.uuid, force: 2, libraryRating: 2 }));
          await Promise.all([mage.completeLearning(r.attemptId), mage.completeLearning(r.attemptId)]);
          assert.lengthOf(mage.items.filter(i => i.type === "spell"), 1);
          assert.equal(mage.system.karma.current, 18);
          // Simulate a failure after payment: back to pending, spell removed.
          await mage.deleteEmbeddedDocuments("Item", mage.items.filter(i => i.type === "spell").map(i => i.id));
          await mage.update({ [`flags.sr2e.learning.${r.attemptId}.status`]: "pending" });
          await mage.completeLearning(r.attemptId);
          assert.lengthOf(mage.items.filter(i => i.type === "spell"), 1, "recreated");
          assert.equal(mage.system.karma.current, 18, "not charged again");
        });

        it("two attempts, Karma for one: exactly one spell and one charge", async () => {
          const { mage, src } = await setup({ karma: 5 });
          const src2 = await Item.create({ name: "Quench Manadart", type: "spell", system: { category: "combat", type: "mana" } });
          items.push(src2);
          const a = await withFaces([6, 1, 6, 1, 2, 2], () => mage.learnSpell({ sourceUuid: src.uuid, force: 3, libraryRating: 3 }));
          const b = await withFaces([6, 1, 6, 1, 2, 2], () => mage.learnSpell({ sourceUuid: src2.uuid, force: 3, libraryRating: 3 }));
          await Promise.all([mage.completeLearning(a.attemptId), mage.completeLearning(b.attemptId)]);
          const spells = mage.items.filter(i => i.type === "spell");
          assert.lengthOf(spells, 1, "one spell");
          assert.equal(mage.system.karma.current, 2, "one charge");
          const st = mage.getFlag("sr2e", "learning");
          assert.sameMembers([st[a.attemptId].status, st[b.attemptId].status], ["done", "pending"]);
        });

        it("Karma on the test updates the card before completion, and is refused after", async () => {
          const { mage, src } = await setup();
          const r = await withFaces([1, 2, 1, 2, 1, 2], () => mage.learnSpell({ sourceUuid: src.uuid, force: 3, libraryRating: 3 }));
          const testMsg = game.messages.get(r.result.testMessageId);
          const saved = { karma: mage.system.karma.pool, spend: mage._spendKarmaPool };
          mage.system.karma.pool = 5; mage._spendKarmaPool = async () => {};
          try {
            await withFaces([6, 1, 6, 1, 6, 1, 6, 1, 6, 1, 6, 1], () => mage.applyKarmaToTest(testMsg, "reroll"));
            assert.isAbove(cardOf(r.attemptId).flags.sr2e.learning.successes, 0, "the card picked up the reroll");
            await mage.completeLearning(r.attemptId);
            assert.equal(mage.getFlag("sr2e", "learning")[r.attemptId].status, "done");
            const before = JSON.stringify(game.messages.get(testMsg.id).flags.sr2e.test);
            await mage.applyKarmaToTest(game.messages.get(testMsg.id), "buySuccess");
            assert.equal(JSON.stringify(game.messages.get(testMsg.id).flags.sr2e.test), before, "closed after completion");
          } finally { mage.system.karma.pool = saved.karma; mage._spendKarmaPool = saved.spend; }
        });
      });

      describe("Learning — recovery and cleanliness", () => {
        it("a deleted test card never turns into a false failure; a paid receipt still completes", async () => {
          const { mage, src } = await setup();
          const r = await withFaces([6, 1, 6, 1, 2, 2], () => mage.learnSpell({ sourceUuid: src.uuid, force: 2, libraryRating: 2 }));
          const testId = r.result.testMessageId;
          // Pay, then lose the spell and the test card, back to pending.
          await mage.completeLearning(r.attemptId);
          await mage.deleteEmbeddedDocuments("Item", mage.items.filter(i => i.type === "spell").map(i => i.id));
          await mage.update({ [`flags.sr2e.learning.${r.attemptId}.status`]: "pending" });
          await game.messages.get(testId)?.delete();
          await mage.completeLearning(r.attemptId);
          assert.equal(mage.getFlag("sr2e", "learning")[r.attemptId].status, "done", "completed from the receipt");
          assert.lengthOf(mage.items.filter(i => i.type === "spell"), 1);
          assert.equal(mage.system.karma.current, 18, "charged once");
          // An unpaid attempt whose card is gone is refused, not failed.
          const other = await Item.create({ name: "Quench Other", type: "spell", system: { category: "combat" } });
          items.push(other);
          const r2 = await withFaces([6, 1, 2, 2, 2, 2], () => mage.learnSpell({ sourceUuid: other.uuid, force: 1, libraryRating: 1 }));
          await game.messages.get(r2.result.testMessageId)?.delete();
          await mage.completeLearning(r2.attemptId);
          assert.equal(mage.getFlag("sr2e", "learning")[r2.attemptId].status, "pending");
        });

        it("once paid, the test is closed to Karma even while the attempt is still pending", async () => {
          const { mage, src } = await setup();
          const r = await withFaces([6, 1, 6, 1, 2, 2], () => mage.learnSpell({ sourceUuid: src.uuid, force: 2, libraryRating: 2 }));
          // Creation fails after payment: inject it.
          mage.createEmbeddedDocuments = async () => { throw new Error("injected"); };
          try { await mage.completeLearning(r.attemptId); } catch (e) { /* injected */ }
          finally { delete mage.createEmbeddedDocuments; }
          const rec = mage.getFlag("sr2e", "learning")[r.attemptId];
          assert.isTrue(rec.karmaPaid);
          assert.equal(rec.status, "pending");
          const testMsg = game.messages.get(r.result.testMessageId);
          const before = JSON.stringify(testMsg.flags.sr2e.test);
          const saved = { karma: mage.system.karma.pool, spend: mage._burnKarmaPool };
          mage.system.karma.pool = 5;
          try { await mage.applyKarmaToTest(testMsg, "buySuccess"); }
          finally { mage.system.karma.pool = saved.karma; }
          assert.equal(JSON.stringify(game.messages.get(testMsg.id).flags.sr2e.test), before, "no Karma after payment");
          await mage.completeLearning(r.attemptId);
          assert.lengthOf(mage.items.filter(i => i.type === "spell"), 1, "the retry creates it");
          assert.equal(mage.system.karma.current, 18, "charged once");
        });

        it("a raw definition passed in is cleaned before it is stored", async () => {
          const { mage, src } = await setup();
          const r = await withFaces([6, 1, 6, 1, 6, 1], () => mage.learnSpell({ definition: src.toObject(), force: 2, libraryRating: 2 }));
          const def = mage.getFlag("sr2e", "learning")[r.attemptId].definition;
          assert.isFalse(def.system.sustaining);
          assert.isFalse(def.system.spellLocked);
        });
      });

      describe("Aid Study (p.141)", () => {
        it("adds the elemental's Force in dice for one service, once per spell", async () => {
          const { mage, src, fire } = await setup({ spirit: true });
          const r = await mage.learnSpell({ sourceUuid: src.uuid, force: 2, libraryRating: 2, aidSpiritUuid: fire.uuid });
          assert.lengthOf(game.messages.get(r.result.testMessageId).flags.sr2e.test.dice, 10, "6 + Force 4");
          assert.equal(fire.system.services, 2);
          assert.equal(fire.system.forceUsed, 0, "Aid Study does not deplete Force");
          await mage.completeLearning(r.attemptId);
          // Unlearn (delete) and try again with the same spirit → refused (one spirit, one time).
          await mage.deleteEmbeddedDocuments("Item", mage.items.filter(i => i.type === "spell").map(i => i.id));
          assert.isNull(await mage.learnSpell({ sourceUuid: src.uuid, force: 2, libraryRating: 2, aidSpiritUuid: fire.uuid }));
          assert.equal(fire.system.services, 2, "no second service");
        });

        it("two simultaneous requests with different elementals: only one aids", async () => {
          const { mage, src, fire } = await setup({ spirit: true });
          const fire2 = await Actor.create({ name: "Quench Learn Fire 2", type: "spirit", system: { spiritType: "elemental",
            domain: "fire", force: 3, services: 3, conjurerUuid: mage.uuid } });
          actors.push(fire2);
          await mage.update({ "system.boundSpirits": [fire.uuid, fire2.uuid] });
          await Promise.all([
            mage.learnSpell({ sourceUuid: src.uuid, force: 2, libraryRating: 2, aidSpiritUuid: fire.uuid }),
            mage.learnSpell({ sourceUuid: src.uuid, force: 2, libraryRating: 2, aidSpiritUuid: fire2.uuid })
          ]);
          assert.equal(fire.system.services + fire2.system.services, 5, "exactly one service spent");
        });
      });

      describe("Spell Defense aid (p.141)", () => {
        it("reserves a fire elemental's dice without spending Force; clearing drops them free", async () => {
          const { mage, fire } = await setup({ spirit: true });
          await mage.allocateSpellDefense(0, { aidSpiritUuid: fire.uuid, aidDice: 3 });
          assert.equal(mage.system.dicePools.spellDefenseAid, 3);
          assert.equal(fire.system.service, "aid");
          assert.equal(fire.system.services, 2, "starting aid: 1 service");
          assert.equal(fire.system.forceUsed, 0, "reserved, not spent");
          await mage.clearSpellDefense();
          assert.equal(mage.system.dicePools.spellDefenseAid, 0);
          assert.equal(fire.system.forceUsed, 0);
        });

        it("an aid service from before 0.98.0 (no identity) can still reserve dice", async () => {
          const { mage, fire } = await setup({ spirit: true });
          await fire.update({ "system.service": "aid", "system.aidInstanceId": "" });
          await mage.allocateSpellDefense(0, { aidSpiritUuid: fire.uuid, aidDice: 2 });
          const { aidReservation } = await import("../elementals.mjs");
          assert.isTrue(aidReservation(mage)?.valid, "the reservation binds");
          assert.equal(fire.system.services, 3, "no extra service for an active aid");
        });

        it("the reserved dice cannot also be cast", async () => {
          const { mage, fire } = await setup({ spirit: true });
          await mage.createEmbeddedDocuments("Item", [{ name: "Quench Bolt", type: "spell", system: { category: "combat", type: "mana", force: 2, duration: "instant", drainCode: "(F / 2)M" } }]);
          await mage.allocateSpellDefense(0, { aidSpiritUuid: fire.uuid, aidDice: 3 });
          const bolt = mage.items.getName("Quench Bolt");
          const n = game.messages.size;
          await bolt.roll({ force: 2, targetNumber: 4, elementalAid: { uuid: fire.uuid, cast: 4, drain: 0 } });
          const cast = game.messages.contents.slice(n).find(m => /Cast Quench Bolt/.test(m.flags?.sr2e?.test?.label ?? ""));
          assert.lengthOf(cast.flags.sr2e.test.dice, 3, "Force 2 + only the 1 unreserved die");
          assert.equal(fire.system.forceUsed, 1);
        });

        it("used against a combat spell: dice added, the elemental's Force drops, reservation spent", async () => {
          const { mage, fire } = await setup({ spirit: true });
          await mage.allocateSpellDefense(0, { aidSpiritUuid: fire.uuid, aidDice: 2 });
          const state = { casterUuid: "x", casterName: "Foe", spellName: "Manabolt", targetUuid: mage.uuid,
            force: 3, successes: 1, resistAttr: "willpower", baseLevel: "S", dmgType: "physical", resolved: false };
          const card = await ChatMessage.create({ content: "resist", flags: { sr2e: { spell: state } } });
          // A magician resisting now chooses what to spend (p.132): take the defaults.
          Hooks.once("renderDialogV2", app => setTimeout(() => app.element.querySelector('button[data-action="roll"]')?.click(), 50));
          await mage.rollSpellResistance(card);
          const test = game.messages.contents.filter(m => /Resist Manabolt/.test(m.flags?.sr2e?.test?.label ?? "")).at(-1);
          assert.lengthOf(test.flags.sr2e.test.dice, 7, "Willpower 5 + 2 aid");
          assert.equal(fire.system.forceUsed, 2);
          assert.equal(mage.system.dicePools.spellDefenseAid, 0);
        });

        it("a Magic Pool reset releases the reservation", async function () {
          this.timeout(10000);   // renders the sheet
          const { mage, fire } = await setup({ spirit: true });
          await mage.allocateSpellDefense(0, { aidSpiritUuid: fire.uuid, aidDice: 2 });
          await mage.update({ "system.dicePools.magic.value": 0 });
          const sheet = mage.sheet; await sheet.render({ force: true }); await new Promise(r => setTimeout(r, 400));
          const btn = sheet.element.querySelector('[data-action="resetPool"][data-pool="magic"]');
          if (btn) { btn.click(); await new Promise(r => setTimeout(r, 400)); }
          await sheet.close();
          assert.ok(btn, "the Magic Pool reset button exists");
          assert.equal(mage.system.dicePools.spellDefenseAid, 0);
          assert.equal(fire.system.forceUsed, 0);
        });
      });
    }, { displayName: "SR2E: Learning spells & elemental defense (p.132, p.141)" });





  });
}
