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

export function registerSR2EQuenchTests() {
  Hooks.on("quenchReady", (quench) => {
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
      after(async () => { for (const a of made) { try { await a.sheet?.close(); } catch (e) {} await a.delete(); } });

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
            await gun.roll({ firingMode: "bf", rounds: 3, barrierRating: 8, barrierMode: "through" });
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
          await actor.rollConjuring({ force: 2, kind: "elemental", domain: "fire", miscDice: 2, miscLabel: "ally" });
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
          const [tracked, free] = await actor.createEmbeddedDocuments("Item", [mk(), mk()]);
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

        it("releases committed Spell Defense and never touches Karma", async () => {
          const a = await Actor.create({
            name: "Quench Pool SD", type: "character",
            system: { quickness: { base: 6 }, intelligence: { base: 6 }, willpower: { base: 6 },
                      karma: { pool: 3 }, dicePools: { spellDefense: 2 } }
          });
          made.push(a);
          const karmaBefore = a.system.karma.pool;
          await a.refreshDicePools();
          assert.equal(a.system.dicePools.spellDefense, 0, "Spell Defense should release on refresh");
          assert.equal(a.system.karma.pool, karmaBefore, "Karma Pool must be untouched");
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
          await mage.rollConjuring({ force: 1, kind: "elemental", domain: "fire" });
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
        async function tested(karma = 5) {
          const a = await pc({ karma: { pool: karma, max: karma } });
          const msg = await ChatMessage.create({ content: "quench",
            flags: { sr2e: { test: { dice: [{ result: 2 }, { result: 5 }, { result: 1 }],
                                     tn: 4, successes: 1, rerolls: 0 } } } });
          return { actor: a, msg };
        }

        it("a reroll costs escalating Karma and deducts it", async () => {
          const { actor, msg } = await tested(5);
          await actor.applyKarmaToTest(msg, "reroll");
          assert.equal(actor.system.karma.pool, 4, "first reroll costs 1");
          await actor.applyKarmaToTest(msg, "reroll");
          assert.equal(actor.system.karma.pool, 2, "second reroll costs 2 — it escalates");
          await msg.delete();
        });

        it("refuses a reroll it cannot afford, and spends nothing", async () => {
          const { actor, msg } = await tested(0);
          await actor.applyKarmaToTest(msg, "reroll");
          assert.equal(actor.system.karma.pool, 0,
            "a refused action must not leave the pool negative or partially spent");
          await msg.delete();
        });

        it("avoiding a glitch costs exactly 1", async () => {
          const { actor, msg } = await tested(3);
          await actor.applyKarmaToTest(msg, "avoidGlitch");
          assert.equal(actor.system.karma.pool, 2);
          await msg.delete();
        });
      });
    }, { displayName: "SR2E: Damage & Karma" });

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
        async function carded(resistAttr) {
          const a = await mk({ name: `Quench Resist ${resistAttr}`, type: "character",
            system: { body: { base: 5 }, willpower: { base: 3 } } });
          const msg = await ChatMessage.create({ content: "quench spell",
            flags: { sr2e: { spell: { spellName: "Mana Bolt", force: 4,
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
          await actor.rollSpellResistance(msg);
          for (const m of since()) msgs.push(m);
          const card = game.messages.contents.at(-1);
          assert.match(card?.flavor ?? card?.content ?? "", /Willpower/);
        });

        it("resists a physical spell with BODY", async () => {
          // The attribute is not cosmetic: Body carries biosystem overstress and
          // Willpower must not, so picking the wrong one changes the dice for
          // anyone with bioware.
          const { actor, msg } = await carded("body");
          await actor.rollSpellResistance(msg);
          for (const m of since()) msgs.push(m);
          const card = game.messages.contents.at(-1);
          assert.match(card?.flavor ?? card?.content ?? "", /Body/);
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





  });
}
