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
    migrateItem(source) {
      if (source.type !== "gear" || !source.system?.weaponAccessory) return null;
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
