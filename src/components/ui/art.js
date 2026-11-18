/**
 * art.js — URLs of the generated art in src/assets/art (npm run art) by the
 * game's own ids: recipe ids for items, material keys, BlockTypes names,
 * spell ids, STATUS_EFFECTS keys, building ids and the UI symbol names.
 */

const files = import.meta.glob('../../assets/art/*/*.{svg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const URLS = {};
for (const [path, url] of Object.entries(files)) {
  const [, group, id] = path.match(/art\/([^/]+)\/([^/]+)\.(?:svg|png)$/) || [];
  if (group) URLS[`${group}/${id}`] = url;
}

// Inventory keys that differ from the icon ids
const MATERIAL_ALIASES = { berries: 'berry', seeds: 'seed', gold: 'gold_ore', herb: 'fiber', vegetable: 'berry', mushroom: 'berry' };

/** URL of one generated image, or null. */
export function artUrl(group, id) {
  return URLS[`${group}/${id}`] || null;
}

/** Icon for a crafted item (its id is the recipe id). */
export function itemArt(item) {
  if (!item) return null;
  return artUrl('items', item.id) || artUrl('items', item.recipeId);
}

// Building materials are held as blocks (and pieces): show the block
const BLOCK_ART = { wood: 'WOOD', stone: 'STONE', dirt: 'DIRT', sand: 'SAND', snow: 'SNOW', clay: 'CLAY' };

/** Icon for an inventory material key: a piece, a block, or a material. */
export function materialArt(key) {
  return (
    artUrl('pieces', key) ||
    artUrl('blocks', BLOCK_ART[key]) ||
    artUrl('materials', key) ||
    artUrl('materials', MATERIAL_ALIASES[key])
  );
}

/** Slot border class for an item's rarity. */
export function rarityClass(item) {
  const name = (item?.rarity?.name || '').toLowerCase();
  return name && name !== 'common' ? `r-${name}` : '';
}

/** Readable name colors for each rarity on parchment (the game's bright ones wash out). */
export const RARITY_INK = {
  Common: '#3a2410',
  Uncommon: '#2d6a1c',
  Rare: '#1f4f9e',
  Epic: '#6a2fb0',
  Legendary: '#9a5a08',
};
