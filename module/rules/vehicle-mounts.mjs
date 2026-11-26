/**
 * Core-book weapon mounts on vehicles (SR2E p.251–253; the chargen app's Garage, sr2e-chargen docs/PLAN-garage.md).
 * Pure: no Foundry. Pages rendered 2026-11-26.
 *
 * p.251: "Hardpoints accept any heavy weapon or special weapons designed for vehicles. They halve the recoil modifier
 * for the weapon. Firmpoints accept any firearm smaller than a heavy weapon. They also provide 1 point of recoil
 * compensation. Weapons must be purchased separately. Adaptation of a weapon for a vehicle mount doubles its cost."
 * Built-in weapons ("incorporated into their structure … may not be changed") stay in the vehicle's description.
 */

/**
 * Mount points by core vehicle id, as each description prints them. `upTo`: the description says "can mount" /
 * "up to" / "one or two" — the points are optional and the most allowed is the number; otherwise the vehicle "has"
 * them. `pointCost`: a price printed per point (only the Scorpion prints one).
 * Not listed (none): every other core vehicle, the Hughes WK-2 Stallion included — its "armed (two hardpoints, two
 * firmpoints) military variants" (p.252) are a different vehicle from the one the catalog sells.
 */
export const MOUNT_POINTS = Object.freeze({
  c9330e180d1d7e0e: { name: "Harley Scorpion", page: 251, hardpoints: 0, firmpoints: 3, upTo: true, pointCost: 1000 },
  "110ead2a77979424": { name: "Aztechnology Nightrunner", page: 252, hardpoints: 0, firmpoints: 2, upTo: true },
  "52bb0a006726360c": { name: "Ares Dragon", page: 252, hardpoints: 2, firmpoints: 0, upTo: true },
  "582bad720d7f5015": { name: "EFA Variants", page: 253, hardpoints: 4, firmpoints: 0 },
  "913f2b70879869b5": { name: "GMC Banshee", page: 253, hardpoints: 4, firmpoints: 0 },
  f904e4d2fabf90f9: { name: "GMC Beachcraft Patroller", page: 253, hardpoints: 2, firmpoints: 0 },
  "7b98667b901c2e26": { name: "GMC Riverine", page: 253, hardpoints: 4, firmpoints: 0 },
  "3bb96b417ee5e828": { name: "Northrup Yellowjacket", page: 253, hardpoints: 2, firmpoints: 0, upTo: true },
  "4a3cebff8313eca1": { name: "Federated-Boeing Eagle", page: 253, hardpoints: 6, firmpoints: 0 },
  e72a772620bc937d: { name: "Hunter (drone)", page: 253, hardpoints: 0, firmpoints: 2 },
  "5af822ac2cddf8b8": { name: "Patrol Vehicle (drone)", page: 253, hardpoints: 1, firmpoints: 1 }
});

/** The heavy weapons in the core catalog that fire from a mount (p.255 Heavy Weapons, p.234 the Panther). Missiles and
 *  rockets are the launcher's ammunition, not mountable weapons; the under-barrel grenade launcher is an accessory. */
export const HARDPOINT_WEAPONS = Object.freeze({
  "3a53febec6132e84": "Generic MMG",
  ee9947f739c2cac6: "Generic HMG",
  "85d3807a401d11c0": "Panther Assault Cannon",
  "23e8dcd986f176eb": "Missile/Rocket Launcher"
});

/** The launcher's ammunition (p.255), carried as cargo on a vehicle. */
export const LAUNCHER_MUNITIONS = Object.freeze({
  f678090421b247b4: "Anti-Personnel Missile", d33fe747d94e22eb: "Anti-Personnel Rocket",
  "64d1f53fa35c8d71": "Anti-Vehicle Missile", b0e020f45d5c884a: "Anti-Vehicle Rocket",
  "78ae7600f07b2a2b": "High-Explosive Missile", "52b9bec9fe94e9a7": "High-Explosive Rocket"
});

/** Where a weapon may go: "hardpoint", "firmpoint" or null. A firmpoint takes "any firearm smaller than a heavy
 *  weapon" (p.251): a `firearm` weapon. `id` is the weapon's catalog id; `weaponType` its system field. */
export function mountKindFor({ id, weaponType }) {
  if (Object.hasOwn(HARDPOINT_WEAPONS, id)) return "hardpoint";
  if (weaponType === "firearm") return "firmpoint";
  return null;
}

/** The mount points of a vehicle (by its catalog id): `{ hardpoints, firmpoints, upTo, pointCost, page }`, all zero
 *  for a vehicle whose description prints none. */
export function mountPointsOf(vehicleId) {
  const m = MOUNT_POINTS[vehicleId];
  return m ? { hardpoints: m.hardpoints, firmpoints: m.firmpoints, upTo: !!m.upTo, pointCost: m.pointCost ?? 0, page: m.page }
    : { hardpoints: 0, firmpoints: 0, upTo: false, pointCost: 0, page: null };
}

/** A mounted weapon's price: twice its list price ("Adaptation of a weapon for a vehicle mount doubles its cost"). */
export const mountedWeaponCost = (listPrice) => 2 * Math.max(0, Number(listPrice) || 0);
