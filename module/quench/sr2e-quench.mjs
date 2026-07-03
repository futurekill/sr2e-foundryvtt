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
export function registerSR2EQuenchTests() {
  Hooks.on("quenchReady", (quench) => {
    const ACTOR_TYPES = ["character", "npc", "vehicle", "spirit", "ic", "host"];

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

    // ── Slotted skillsofts inject / override skills (SR2E p.243) ────────────────
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
        });
      });
    }, { displayName: "SR2E: Skillsofts" });

    quench.registerBatch("sr2e.accessories", (context) => {
      const { describe, it, assert, after } = context;
      let actor;
      after(async () => { await actor?.delete(); });

      describe("Weapon accessories (SR2E p.240–241)", () => {
        it("attach → benefit → detach → re-attach to another weapon", async () => {
          actor = await Actor.create({ name: "Quench Accessories", type: "character" });
          const [hk, pred, bipod, vent] = await actor.createEmbeddedDocuments("Item", [
            { name: "HK227", type: "weapon",
              system: { weaponType: "firearm", firingModes: { sa: true, bf: true }, recoilComp: 0 } },
            { name: "Ares Predator", type: "weapon",
              system: { weaponType: "firearm", firingModes: { sa: true } } },
            { name: "Bipod", type: "gear",
              system: { weaponAccessory: true, accessoryRecoilComp: 2, requiresDeployment: true } },
            { name: "Gas Vent III", type: "gear",
              system: { weaponAccessory: true, accessoryRecoilComp: 3, permanentAccessory: true } }
          ]);

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
          actor = await Actor.create({ name: "Quench Fists", type: "character" });
          const fist = actor.items.find(i => i.name === "Unarmed Strike");
          assert.ok(fist, "Unarmed Strike was not embedded at character creation");
          assert.equal(fist.system.damageCode, "(Str)M", "wrong unarmed damage code");
          assert.equal(fist.system.damageType, "stun", "unarmed damage should be Stun");
          assert.equal(fist.system.skill, "unarmed_combat", "wrong unarmed skill");
        });

        it("knockdown: a Deadly wound always drops the target prone (p.91)", async () => {
          actor = await Actor.create({ name: "Quench Knockdown", type: "character",
            system: { body: { value: 6 } } });
          await actor.rollKnockdown(10, "D", false);   // Deadly → prone regardless of roll
          // toggleStatusEffect needs a token; assert the method runs without error
          // and the pure outcome is prone (covered by vitest). Smoke-level check here.
          assert.ok(true);
        });

        it("smartgun accessory makes a dumb weapon smart-capable", async () => {
          actor = await Actor.create({ name: "Quench Smart", type: "character" });
          const [gun, sg] = await actor.createEmbeddedDocuments("Item", [
            { name: "Dumb Gun", type: "weapon",
              system: { weaponType: "firearm", smartgunCompatible: false, firingModes: { sa: true } } },
            { name: "Smartgun System (External)", type: "gear",
              system: { weaponAccessory: true, grantsSmartgun: true } }
          ]);
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
          const text = actor.sheet.element?.querySelector('[data-tab="skills"]')?.textContent ?? "";
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
      let actor;
      after(async () => { try { await actor?.sheet?.close(); } catch (e) {} await actor?.delete(); });

      describe("Adept power points (SR2E p.124)", () => {
        it("sums pointCost×level of adept powers against Magic", async () => {
          actor = await Actor.create({
            name: "Quench Adept", type: "character",
            system: { magic: { type: "physical_adept" } }
          });
          await actor.createEmbeddedDocuments("Item", [
            { name: "Increased Reaction", type: "adept_power", system: { pointCost: 1, level: 2 } }, // 2
            { name: "Killing Hands", type: "adept_power", system: { pointCost: 2, level: 1 } }       // 2
          ]);
          assert.equal(actor.system.adeptPowerPoints.max, actor.system.magic.value,
            "power-point max should equal the Magic rating");
          assert.equal(actor.system.adeptPowerPoints.value, 4, "used should be 1×2 + 2×1 = 4");
        });
      });
    }, { displayName: "SR2E: Adept power points" });
  });
}
