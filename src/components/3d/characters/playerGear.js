/**
 * playerGear.js — What the player's equipment looks like on the body.
 *
 * playerGearLook(equipment, riftsClosed) turns the equipped items into look
 * fields for buildHumanoidModel: the tool or weapon in hand (kind + tier),
 * worn helmet, armour, gloves, boots and shield (each a tier), and the cape
 * earned by closing the first rift. Items are matched by their recipe id
 * ("ironPickaxe", "leatherArmor"), so loot named the same way works too.
 */

/** Tier → [main, highlight] colours for metal, wood and leather gear. */
export const GEAR_TIERS = {
  wood: ['#8a6239', '#a8794a'],
  stone: ['#8f949c', '#b3b8bf'],
  leather: ['#7a5634', '#9a7048'],
  iron: ['#c8ced6', '#e8edf2'],
  steel: ['#8fa6bd', '#cfe0ef'],
  crystal: ['#6fd0f5', '#c4f1ff'],
};

/** The cape earned by sealing the first rift: rift violet. */
export const EARNED_CAPE = '#5b2e8a';

const TIER_WORDS = [
  ['crystal', 'crystal'],
  ['steel', 'steel'],
  ['iron', 'iron'],
  ['stone', 'stone'],
  ['leather', 'leather'],
  ['wooden', 'wood'],
  ['wood', 'wood'],
];

function itemKey(item) {
  return String(item?.recipeId || item?.id || item?.name || '').toLowerCase();
}

/** The gear tier an item is made of (iron when its name doesn't say). */
export function gearTier(item) {
  const key = itemKey(item);
  for (const [word, tier] of TIER_WORDS) if (key.includes(word)) return tier;
  return 'iron';
}

/** What a hand item is: 'sword', 'club', 'axe', 'pick', or null. */
export function heldKind(item) {
  const key = itemKey(item);
  if (!key) return null;
  if (key.includes('pickaxe') || key.includes('pick')) return 'pick';
  if (key.includes('axe')) return 'axe';
  if (key.includes('club')) return 'club';
  if (key.includes('sword') || key.includes('blade') || item?.type === 'weapon') return 'sword';
  return null;
}

/**
 * Look fields for the player's gear. Every value is a string or null so the
 * look stays a flat, cacheable key (see humanoidModel's lookKey).
 */
export function playerGearLook(equipment = {}, riftsClosed = 0) {
  const weapon = equipment?.weapon || null;
  const kind = heldKind(weapon);
  return {
    heldKind: kind,
    heldTier: kind ? gearTier(weapon) : null,
    helmetTier: equipment?.helmet ? gearTier(equipment.helmet) : null,
    armorTier: equipment?.armor ? gearTier(equipment.armor) : null,
    glovesTier: equipment?.gloves ? gearTier(equipment.gloves) : null,
    bootsTier: equipment?.boots ? gearTier(equipment.boots) : null,
    shieldTier: equipment?.offhand ? gearTier(equipment.offhand) : null,
    cape: riftsClosed > 0 ? EARNED_CAPE : null,
  };
}

/**
 * Store selector: a short string that changes only when the visible gear
 * does, so the player model rebuilds on equip, not every frame.
 */
export function selectPlayerGearKey(state) {
  const g = playerGearLook(state.equipment, state.riftsClosed || 0);
  return Object.values(g).map((v) => v || '-').join('|');
}

/** Turn a key from selectPlayerGearKey back into look fields. */
export function gearLookFromKey(key) {
  const [heldKind, heldTier, helmetTier, armorTier, glovesTier, bootsTier, shieldTier, cape] =
    key.split('|').map((v) => (v === '-' ? null : v));
  return { heldKind, heldTier, helmetTier, armorTier, glovesTier, bootsTier, shieldTier, cape };
}

/** The tool bone a hand item shows on (humanoidModel), or null for bare hands. */
export function heldBone(kind) {
  return { sword: 'toolSword', club: 'toolClub', axe: 'toolAxe', pick: 'toolPick' }[kind] || null;
}
