/**
 * World migration framework.
 *
 * When a schema change needs existing world data rewritten, register a
 * migration in MIGRATIONS below. On world load (GM client only, see the
 * ready hook in sr2e.mjs) every migration newer than the world's stamped
 * version runs over all world actors, world items, and unlinked token
 * actors, then the world is stamped with the current system version.
 *
 * IMPORTANT — reading old data: migrations receive each document's SOURCE
 * data (doc.toObject()). Fields removed from the schema survive in the
 * source until the document is next saved, which is why migrations run at
 * startup before anything else writes. Read the dead field from the source,
 * write the replacement via the returned update object.
 *
 * System compendia never need runtime migration — update packs-src/ and
 * rebuild instead (npm run build-packs).
 *
 * Migration entry shape:
 *   {
 *     version: "0.5.1",        // first system version that needs this change
 *     migrateActor(source) {   // optional; return update object or null
 *       if (source.type !== "character") return null;
 *       return { "system.newField": source.system.oldField ?? 0 };
 *     },
 *     migrateItem(source) {    // optional; covers world items AND embedded
 *       return null;           // items on actors (use parent-agnostic logic)
 *     }
 *   }
 */

/**
 * Every character can always punch: (Str)M Stun with the Unarmed Combat
 * skill (SR2E Melee Weapons table p.255, p.100–101). Embedded at character
 * creation (preCreateActor hook in sr2e.mjs) and backfilled onto existing
 * characters by the 0.26.0 migration (GitHub #3).
 */
export const UNARMED_STRIKE_DATA = {
  name: "Unarmed Strike",
  type: "weapon",
  img: "icons/skills/melee/unarmed-punch-fist.webp",
  system: {
    weaponType: "melee", skill: "unarmed_combat",
    damageCode: "(Str)M", damageType: "stun",
    concealability: 0, reach: 0, cost: 0,
    notes: "SR2E Melee Weapons table (p.255), p.100–101: unarmed attacks do (Str)M Stun, resolved as opposed melee with the Unarmed Combat skill. Adepts with Killing Hands replace the damage per their power."
  }
};

/** Ordered list of migrations. Append new entries; never reorder. */
const MIGRATIONS = [
  // 0.9.8 — PCs must use LINKED prototype tokens. Characters created before the
  // link default was added drop unlinked tokens on the canvas, so karma/damage
  // spent on a dragged-out token never reaches the sidebar actor. Link them.
  // (Does not relink tokens already placed on scenes — re-drag those.)
  {
    version: "0.9.8",
    migrateActor(source) {
      if (source.type !== "character") return null;
      if (source.prototypeToken?.actorLink) return null;
      return { "prototypeToken.actorLink": true };
    }
  },

  // 0.26.0 — Firearm accessory rework (SR2E p.240–241 verified):
  //  * Smartgun System items used the dead `requiresSmartgun` flag; they now
  //    GRANT smartgun capability to the attached weapon (`grantsSmartgun`).
  //  * Gyro mounts modelled as flat recoil comp become `gyroRating` (the
  //    rating also eats attacker movement modifiers, p.90).
  {
    version: "0.26.0",
    // Every character gets the default Unarmed Strike — (Str)M Stun with the
    // Unarmed Combat skill (Melee Weapons table p.255; GitHub #3). New
    // characters get it via the preCreateActor hook in sr2e.mjs.
    addItems(source) {
      if (source.type !== "character") return null;
      if ((source.items ?? []).some(i => i.name === "Unarmed Strike")) return null;
      return [UNARMED_STRIKE_DATA];
    },
    migrateItem(source) {
      if (source.type === "gear" && source.system?.weaponAccessory) {
        const update = {};
        if (source.system.requiresSmartgun && /smartgun/i.test(source.name)) {
          update["system.grantsSmartgun"] = true;
        }
        if (/^gyro mount/i.test(source.name) && (source.system.accessoryRecoilComp ?? 0) >= 5) {
          update["system.gyroRating"] = source.system.accessoryRecoilComp;
          update["system.accessoryRecoilComp"] = 0;
        }
        return Object.keys(update).length ? update : null;
      }

      // Cyberware audit fixes (core p.90/247/260/261): older compendium copies
      // of Smartlink carried no TN mod, Wired Reflexes lacked its +2 Reaction
      // per level, and several items had wrong essence costs (GitHub #4).
      if (source.type === "cyberware") {
        // Muscle Replacement/Augmentation: Quickness bonus must not feed
        // Reaction (SR2E p.249). Flag existing world copies.
        if (/muscle (replacement|augmentation)/i.test(source.name) &&
            !source.system?.noReactionBonus) {
          return { "system.noReactionBonus": true };
        }
        if (/^smartlink$/i.test(source.name) && !(source.system?.combatTnMod < 0)) {
          return { "system.combatTnMod": -2 };
        }
        if (/^wired reflexes/i.test(source.name) &&
            (source.system?.attributeMods?.reaction ?? 0) === 0) {
          const lvl = Math.max(1, source.system?.rating ?? 1);
          return {
            "system.attributeMods.reaction": 2 * lvl,
            "system.attributeMods.initiativeDice": lvl
          };
        }
        // Flat essence corrections (headware table p.260, bodyware p.261).
        // Rating-table items (VCR, Skillwires, Filtration) self-correct from
        // their ratingStats rows and are not listed here.
        const ESSENCE_FIX = {
          "chipjack": 0.2, "radio (headware)": 0.75, "radio receiver (headware)": 0.4,
          "cyberear replacement": 0.3, "ear modification": 0.1,
          "ear cosmetic modification": 0, "damper": 0.1,
          "high frequency hearing": 0.2, "low frequency hearing": 0.2,
          "low-light vision": 0.2, "retinal duplication": 0.1, "cortex bomb": 0,
          "data lock": 0.2, "fingertip compartment": 0.1, "hand razors": 0.1,
          "retractable razors": 0.2, "retractable spur": 0.3, "voice modulator": 0.2
        };
        const fix = ESSENCE_FIX[source.name?.toLowerCase()];
        if (fix !== undefined && source.system?.essenceCost !== fix) {
          return { "system.essenceCost": fix };
        }
      }
      return null;
    }
  },

  // 0.29.15 — normalize a legacy magic.type. Older imported/pregen data used
  // "adept" for what the schema now calls "physical_adept"; the invalid value
  // fails validation (Support → Document Issues) and stops the adept-power-point
  // logic from firing for that actor.
  {
    version: "0.29.15",
    migrateActor(source) {
      if (source.system?.magic?.type === "adept") {
        return { "system.magic.type": "physical_adept" };
      }
      return null;
    }
  },
  {
    // Skillwire Plus is now an explicit flag (system.skillwirePlus), not inferred
    // from the item name. Auto-flag any cyberware already named "…Skillwire…Plus…"
    // so existing characters keep their doubled ActiveSoft budget without a manual
    // edit. (A plain "Skillwires" the player MEANT as Plus still needs the box —
    // no migration can read that intent.)
    version: "0.52.0",
    migrateItem(source) {
      if (source.type === "cyberware" && !source.system?.skillwirePlus
          && /skillwire/i.test(source.name ?? "") && /plus/i.test(source.name ?? "")) {
        return { "system.skillwirePlus": true };
      }
      return null;
    }
  },

  {
    // Projectile Weapons Table corrections (SR2 p.96). The throwing rows were
    // imported with the wrong price AND damage, and the Bow was flattened to a
    // single 400¥/(Str+2)M entry — which also read the WIELDER's Strength, so a
    // troll hit harder with a weak bow. Bows now carry the Strength Minimum
    // they were bought at and derive both price and damage from it.
    //
    // Each fix is gated on the old wrong value, so a GM's deliberate house
    // price or a custom bow is left alone.
    version: "0.53.0",
    migrateItem(source) {
      if (source.type !== "weapon") return null;
      const sys = source.system ?? {};
      const name = source.name ?? "";

      // Bow: recover the Str Min the player actually paid for (400¥ → Str Min 4).
      // Gate on the mis-imported bow's EXACT old state (flat 400¥ + (Str+2)M) so
      // a GM's homebrew bow with a custom price/damage is left untouched — the
      // comment above promised this, but the name-only gate didn't deliver it.
      const wasMisImported = Number(sys.cost) === 400
        && /^\(Str\s*\+\s*2\)M$/i.test((sys.damageCode ?? "").trim());
      if (/\bbow\b/i.test(name) && !/crossbow/i.test(name)
          && !(sys.costPerStrengthMin > 0) && wasMisImported) {
        const strMin = Math.max(1, Math.round((Number(sys.cost) || 100) / 100));
        return {
          "system.strengthMinimum": sys.strengthMinimum || strMin,
          "system.costPerStrengthMin": 100,
          "system.strMinDamageBonus": 2,
          // prepareDerivedData recomputes both from Str Min; these keep the
          // stored source coherent for anything reading it raw.
          "system.cost": 100 * (sys.strengthMinimum || strMin),
          "system.damageCode": `${(sys.strengthMinimum || strMin) + 2}M`
        };
      }

      // Throwing weapons: flat price, (Str)L damage.
      const THROWN = { "shuriken": 30, "throwing knife": 20 };
      const book = THROWN[name.toLowerCase()];
      if (book !== undefined) {
        const update = {};
        if (Number(sys.cost) === 50) update["system.cost"] = book;      // the bad import
        if (/^\(Str\+1\)[LM]$/i.test(sys.damageCode ?? "")) update["system.damageCode"] = "(Str)L";
        return Object.keys(update).length ? update : null;
      }
      return null;
    }
  }
];

/* -------------------------------------------- */

/**
 * Does this world need migration work?
 * @param {string} lastMigrated - The stamped version ("" for never stamped).
 * @returns {object[]} The pending migrations, oldest first.
 */
export function pendingMigrations(lastMigrated) {
  const since = lastMigrated || "0.0.0";
  return MIGRATIONS
    .filter(m => foundry.utils.isNewerVersion(m.version, since))
    .sort((a, b) => (foundry.utils.isNewerVersion(a.version, b.version) ? 1 : -1));
}

/**
 * Build the update object for one document by running it through every
 * pending migration in order.
 * @param {object[]} migrations
 * @param {Document} doc
 * @param {"Actor"|"Item"} kind
 * @returns {object|null} Merged update data, or null when nothing to change.
 */
function migrateDocumentData(migrations, doc, kind) {
  const source = doc.toObject();
  const update = {};
  for (const m of migrations) {
    const fn = kind === "Actor" ? m.migrateActor : m.migrateItem;
    if (!fn) continue;
    const changes = fn(source);
    if (changes) foundry.utils.mergeObject(update, changes);
  }
  return foundry.utils.isEmpty(update) ? null : update;
}

/**
 * Migrate one actor: its own data plus its embedded items.
 * @returns {Promise<boolean>} Whether anything was updated.
 */
async function migrateActor(migrations, actor) {
  let changed = false;

  const actorUpdate = migrateDocumentData(migrations, actor, "Actor");
  if (actorUpdate) {
    await actor.update(actorUpdate, { diff: false });
    changed = true;
  }

  const itemUpdates = [];
  for (const item of actor.items) {
    const u = migrateDocumentData(migrations, item, "Item");
    if (u) itemUpdates.push({ _id: item.id, ...u });
  }
  if (itemUpdates.length) {
    await actor.updateEmbeddedDocuments("Item", itemUpdates, { diff: false });
    changed = true;
  }

  // Optional per-migration item ADDITIONS (e.g. backfilling the default
  // Unarmed Strike): addItems(source) returns an array of item data to embed.
  const newItems = [];
  const source = actor.toObject();
  for (const m of migrations) {
    if (m.addItems) newItems.push(...(m.addItems(source) ?? []));
  }
  if (newItems.length) {
    await actor.createEmbeddedDocuments("Item", newItems);
    changed = true;
  }
  return changed;
}

/**
 * Run all pending migrations over the world. GM client only.
 * Per-document failures are logged and skipped so one corrupt document
 * cannot abort the rest of the migration.
 */
export async function migrateWorld() {
  const stamped = game.settings.get("sr2e", "systemMigrationVersion");
  const pending = pendingMigrations(stamped);

  if (pending.length === 0) {
    // Nothing to do — stamp fresh/current worlds so future upgrades know
    // their starting point.
    if (stamped !== game.system.version) {
      await game.settings.set("sr2e", "systemMigrationVersion", game.system.version);
    }
    return;
  }

  ui.notifications.info(
    `SR2E | Migrating world data to system version ${game.system.version} — please don't close the world.`,
    { permanent: true }
  );
  console.log(`SR2E | Running ${pending.length} migration(s):`,
    pending.map(m => m.version).join(", "));
  let errors = 0;

  // World actors (and their embedded items)
  for (const actor of game.actors) {
    try { await migrateActor(pending, actor); }
    catch (err) { errors++; console.error(`SR2E | Migration failed for Actor "${actor.name}":`, err); }
  }

  // World items
  for (const item of game.items) {
    try {
      const u = migrateDocumentData(pending, item, "Item");
      if (u) await item.update(u, { diff: false });
    }
    catch (err) { errors++; console.error(`SR2E | Migration failed for Item "${item.name}":`, err); }
  }

  // Unlinked token actors on every scene (their deltas hold old-schema data)
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor) continue;
      try { await migrateActor(pending, token.actor); }
      catch (err) {
        errors++;
        console.error(`SR2E | Migration failed for Token "${token.name}" in Scene "${scene.name}":`, err);
      }
    }
  }

  await game.settings.set("sr2e", "systemMigrationVersion", game.system.version);
  ui.notifications.clear?.();
  if (errors > 0) {
    ui.notifications.warn(
      `SR2E | Migration finished with ${errors} error(s) — see the console (F12) for details.`,
      { permanent: true }
    );
  } else {
    ui.notifications.info(`SR2E | World migrated to system version ${game.system.version}.`);
  }
}
