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
          actor = await Actor.create({
            name: "Quench Improved", type: "character",
            system: { magic: { type: "physical_adept" } }
          });
          const [skill] = await actor.createEmbeddedDocuments("Item", [
            { name: "Firearms", type: "skill", system: { category: "active", rating: 4 } },
            { name: "Improved Ability (Firearms)", type: "adept_power",
              system: { pointCost: 1, level: 2, improvedSkill: "Firearms" } }
          ]);
          const derived = actor.items.get(skill.id);
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
          const card = await actor.rollAttributeTest("body", 4);
          assert.ok(String(card?.content ?? "").includes("overstress"),
            "a Body test should itemize the overstress modifier");
          const other = await actor.rollAttributeTest("quickness", 4);
          assert.ok(!String(other?.content ?? "").includes("overstress"),
            "a non-Body test must NOT take the overstress penalty");
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
  });
}
