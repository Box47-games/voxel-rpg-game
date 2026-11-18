/**
 * InventoryUI — the Bag's Inventory tab: equipment around a portrait of your
 * character, the item and material grids, and a parchment card for whatever
 * is selected (equip, unequip, use, eat; stat changes; tool wear).
 * Opened with I; the frame and tabs come from BagFrame.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useGameStore, { selectPlayerStats, selectHotbar } from '../stores/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import ToolDurability from './ui/ToolDurability';
import BagFrame from './ui/BagFrame';
import { artUrl, itemArt, materialArt, rarityClass, RARITY_INK } from './ui/art';
import { materialName, pieceInfo, isBuildingMaterial, PIECES } from '../data/pieces';
import { hotbarAllows } from '../data/blockDrops';
import BagHotbar from './ui/BagHotbar';
import { beginHotbarDrag, justDragged } from './ui/hotbarDrag';
import { ITEM_TYPES } from '../data/craftingRecipes';
import { compareStatsWithItem, formatStatDifference } from '../utils/EquipmentStatsIntegration';
import { FOOD_BERRY_RESTORE, FOOD_RAW_MEAT_RESTORE, FOOD_BERRY_HEAL, FOOD_RAW_MEAT_HEAL, FOOD_VEGETABLE_RESTORE, FOOD_VEGETABLE_HEAL } from '../data/tuning';

/** Materials the player can eat directly from inventory */
const EDIBLE_MATERIALS = {
  berry: { restore: FOOD_BERRY_RESTORE, heal: FOOD_BERRY_HEAL, label: 'Eat' },
  vegetable: { restore: FOOD_VEGETABLE_RESTORE, heal: FOOD_VEGETABLE_HEAL, label: 'Eat' },
  meat: { restore: FOOD_RAW_MEAT_RESTORE, heal: FOOD_RAW_MEAT_HEAL, label: 'Eat raw' },
};

const SLOT_FOR_TYPE = {
  [ITEM_TYPES.WEAPON]: 'weapon',
  [ITEM_TYPES.TOOL]: 'weapon',
  [ITEM_TYPES.ARMOR]: 'armor',
  [ITEM_TYPES.HELMET]: 'helmet',
  [ITEM_TYPES.GLOVES]: 'gloves',
  [ITEM_TYPES.BOOTS]: 'boots',
  [ITEM_TYPES.AMULET]: 'amulet',
  [ITEM_TYPES.OFFHAND]: 'offhand',
};

// Equipment around the portrait; the faded icon shows what goes where
const LEFT_SLOTS = [
  { slot: 'helmet', name: 'Helmet', ghost: ['items', 'ironHelmet'] },
  { slot: 'armor', name: 'Armor', ghost: ['items', 'ironArmor'] },
  { slot: 'gloves', name: 'Gloves', ghost: ['ui', 'gloves'] },
  { slot: 'boots', name: 'Boots', ghost: ['ui', 'boots'] },
  { slot: 'amulet', name: 'Amulet', ghost: ['ui', 'ring'] },
];
const RIGHT_SLOTS = [
  { slot: 'weapon', name: 'Weapon', ghost: ['items', 'ironSword'] },
  { slot: 'offhand', name: 'Off-hand', ghost: ['items', 'woodenShield'] },
  { slot: 'ring1', name: 'Ring', ghost: ['items', 'ironRing'] },
  { slot: 'ring2', name: 'Ring', ghost: ['items', 'ironRing'] },
];
const MIN_ITEM_SLOTS = 12; // two rows; the hotbar and materials sit below

// Blocks first, each followed by its pieces (wood, planks, stone, slabs, ...), then the rest
const BUILDING_ORDER = Object.keys(PIECES).flatMap((base) => [base, PIECES[base].key]);
const materialOrder = (key) => {
  const i = BUILDING_ORDER.indexOf(key);
  return i === -1 ? BUILDING_ORDER.length : i;
};

/** Size in units (a block is 2×2×2): "4×1×1" etc. */
const SHAPE_SIZE = { plank: '4×1×1', slab: '2×1×2', cube: '1×1×1' };

const titleCase = (stat) => stat.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
const fmt = (v) => (typeof v === 'number' ? +v.toFixed(1) : v);

/** An item's picture: generated art, else its emoji. */
function ItemPicture({ item }) {
  const url = itemArt(item);
  return url ? <img src={url} alt="" /> : <span className="vx-slot__emoji" aria-hidden="true">{item.icon}</span>;
}

function EquipSlot({ def, item, selected, onSelect }) {
  if (!item) {
    return (
      <div className="vx-slot is-ghost" title={`${def.name}: empty`} aria-label={`${def.name}: empty`} role="img">
        <img src={artUrl(...def.ghost)} alt="" />
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`vx-slot ${rarityClass(item)}${selected ? ' is-selected' : ''}`}
      aria-label={`${def.name}: ${item.name}`}
      title={item.name}
      onClick={() => onSelect({ kind: 'equipped', slot: def.slot, item })}
    >
      <ItemPicture item={item} />
    </button>
  );
}

const InventoryUI = () => {
  // Open state lives in the store: one panel at a time, Esc handled centrally
  const isOpen = useGameStore((state) => state.openPanel === 'inventory');
  const [selection, setSelection] = useState(null); // { kind: 'item'|'equipped'|'material', ... }

  const inventory = useGameStore((state) => state.inventory);
  const equipment = useGameStore((state) => state.equipment);
  const equipItemWithStats = useGameStore((state) => state.equipItemWithStats);
  const unequipItemWithStats = useGameStore((state) => state.unequipItemWithStats);
  const removeItem = useGameStore((state) => state.removeItem);
  const consumeItem = useGameStore((state) => state.consumeItem);
  const eatMaterial = useGameStore((state) => state.eatMaterial);
  const character = useGameStore((state) => state.character);
  const player = useGameStore(useShallow(selectPlayerStats));
  const hunger = useGameStore((state) => state.hunger);

  const materials = inventory.materials || {};
  const selectedItem = selection?.kind === 'item' || selection?.kind === 'equipped' ? selection.item : null;

  const getSlotForItem = useCallback((item) => {
    if (item.type === ITEM_TYPES.RING) return equipment.ring1 ? 'ring2' : 'ring1';
    return SLOT_FOR_TYPE[item.type] || null;
  }, [equipment.ring1]);

  // How player stats would change if the selected bag item were equipped
  const statComparison = useMemo(() => {
    if (selection?.kind !== 'item' || selectedItem.type === ITEM_TYPES.CONSUMABLE) return null;
    const slot = getSlotForItem(selectedItem);
    if (!slot) return null;
    try {
      return compareStatsWithItem(equipment, slot, selectedItem, character, player);
    } catch (error) {
      console.warn('[InventoryUI] Failed to calculate stat comparison:', error);
      return null;
    }
  }, [selection, selectedItem, equipment, character, player, getSlotForItem]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'i' || e.key === 'I') useGameStore.getState().togglePanel('inventory');
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Drop a selection that no longer exists (equipped, eaten, used up)
  useEffect(() => {
    if (!selection) return;
    if (selection.kind === 'item' && !inventory.items.includes(selection.item)) setSelection(null);
    if (selection.kind === 'equipped' && equipment[selection.slot] !== selection.item) setSelection(null);
    if (selection.kind === 'material' && !(materials[selection.key] > 0)) setSelection(null);
  }, [selection, inventory.items, equipment, materials]);

  if (!isOpen) return null;

  const handleEquipItem = (item) => {
    const slot = getSlotForItem(item);
    if (!slot) return;
    // Whatever is in the slot goes back into the bag
    const currentlyEquipped = equipment[slot];
    if (currentlyEquipped) useGameStore.getState().addItem(currentlyEquipped);
    removeItem(item.craftedAt ?? item.id);
    equipItemWithStats(slot, item);
    setSelection({ kind: 'equipped', slot, item });
  };

  const handleUnequipItem = (slot, item) => {
    unequipItemWithStats(slot);
    useGameStore.getState().addItem(item);
    setSelection({ kind: 'item', item });
  };

  const handleUseConsumable = (item) => {
    consumeItem(item);
    setSelection(null);
  };

  const ownedMaterials = Object.entries(materials)
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => materialOrder(a) - materialOrder(b));
  const emptySlots = Math.max(0, MIN_ITEM_SLOTS - inventory.items.length);
  const isSelected = (item) => selectedItem === item;

  return (
    <BagFrame
      active="inventory"
      label="Inventory"
      footer={(
        <>
          <span><kbd className="vx-key">I</kbd> or <kbd className="vx-key">Esc</kbd> close</span>
          <span>Double-click an item to equip or use it</span>
        </>
      )}
    >
      <div className="inv">
        {/* Equipment around your character */}
        <div className="inv__col inv__gear">
          <h3 className="vx-h">Equipment</h3>
          <div className="inv__doll">
            <div className="inv__doll-col">
              {LEFT_SLOTS.map((def) => (
                <EquipSlot key={def.slot} def={def} item={equipment[def.slot]} selected={isSelected(equipment[def.slot])} onSelect={setSelection} />
              ))}
            </div>
            <div className="inv__niche">
              <img src={artUrl('portraits', 'player')} alt="Your character" />
            </div>
            <div className="inv__doll-col">
              {RIGHT_SLOTS.map((def) => (
                <EquipSlot key={def.slot} def={def} item={equipment[def.slot]} selected={isSelected(equipment[def.slot])} onSelect={setSelection} />
              ))}
            </div>
          </div>
          <h3 className="vx-h" style={{ marginTop: 4 }}>Stats</h3>
          <div className="inv__stats">
            <div className="vx-stat"><span className="vx-stat__label">Damage</span><span className="vx-stat__dots" /><strong>{fmt(player.damage ?? 0)}</strong></div>
            <div className="vx-stat"><span className="vx-stat__label">Defense</span><span className="vx-stat__dots" /><strong>{fmt(player.defense ?? 0)}</strong></div>
            <div className="vx-stat"><span className="vx-stat__label">Crit chance</span><span className="vx-stat__dots" /><strong>{fmt(player.critChance ?? 0)}%</strong></div>
            <div className="vx-stat"><span className="vx-stat__label">Speed</span><span className="vx-stat__dots" /><strong>{fmt(player.speed ?? 0)}</strong></div>
          </div>
        </div>

        {/* Items and materials */}
        <div className="inv__col">
          <div className="inv__row">
            <h3 className="vx-h">Items</h3>
            <span className="inv__count">{inventory.items.length} items</span>
          </div>
          <div className="inv__grid">
            {inventory.items.map((item, index) => (
              <button
                key={item.craftedAt || index}
                type="button"
                className={`vx-slot ${rarityClass(item)}${isSelected(item) ? ' is-selected' : ''}`}
                aria-label={item.name}
                title={item.name}
                onClick={() => setSelection({ kind: 'item', item })}
                onDoubleClick={() => (item.type === ITEM_TYPES.CONSUMABLE ? handleUseConsumable(item) : handleEquipItem(item))}
              >
                <ItemPicture item={item} />
              </button>
            ))}
            {Array.from({ length: emptySlots }, (_, i) => (
              <div key={`empty${i}`} className="vx-slot" aria-hidden="true" />
            ))}
          </div>
          {inventory.items.length === 0 && (
            <p className="bag__empty">No items yet. Craft some in the Craft tab.</p>
          )}

          <BagHotbar />

          <h3 className="vx-h" style={{ marginTop: 8 }}>Materials</h3>
          {ownedMaterials.length === 0 ? (
            <p className="bag__empty">No materials yet. Mine blocks and fell trees to gather them.</p>
          ) : (
            <div className="inv__grid">
              {ownedMaterials.map(([key, amount]) => (
                <button
                  key={key}
                  type="button"
                  className={`vx-slot${selection?.kind === 'material' && selection.key === key ? ' is-selected' : ''}${hotbarAllows(key) ? ' is-draggable' : ''}`}
                  aria-label={`${materialName(key, amount)}, ${amount}`}
                  title={hotbarAllows(key) ? `${materialName(key)}: drag to the hotbar` : materialName(key)}
                  onPointerDown={hotbarAllows(key) ? (e) => beginHotbarDrag(e, { key, icon: materialArt(key) }) : undefined}
                  onClick={() => { if (!justDragged()) setSelection({ kind: 'material', key }); }}
                >
                  {materialArt(key) ? <img src={materialArt(key)} alt="" /> : <span className="vx-slot__emoji">?</span>}
                  <span className="vx-slot__qty">{amount}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected thing */}
        <aside className="vx-parch detail" aria-label="Selected">
          {selectedItem ? (
            <ItemDetail
              item={selectedItem}
              equippedSlot={selection.kind === 'equipped' ? selection.slot : null}
              index={inventory.items.indexOf(selectedItem)}
              statComparison={statComparison}
              onEquip={handleEquipItem}
              onUnequip={handleUnequipItem}
              onUse={handleUseConsumable}
            />
          ) : selection?.kind === 'material' ? (
            <MaterialDetail
              materialKey={selection.key}
              amount={materials[selection.key] || 0}
              hungerFull={hunger.current >= hunger.max}
              onEat={eatMaterial}
            />
          ) : (
            <p className="detail__empty">Select an item or material to see it here.</p>
          )}
        </aside>
      </div>
    </BagFrame>
  );
};

function ItemDetail({ item, equippedSlot, index, statComparison, onEquip, onUnequip, onUse }) {
  const consumable = item.type === ITEM_TYPES.CONSUMABLE;
  const comparing = statComparison && Object.keys(statComparison).length > 0;
  return (
    <>
      <div className="detail__top">
        <div className={`vx-slot ${rarityClass(item)}`}><ItemPicture item={item} /></div>
        <div>
          <h3 className="detail__name" style={{ color: RARITY_INK[item.rarity?.name] || 'var(--vx-ink)' }}>{item.name}</h3>
          <div className="detail__sub">{[item.rarity?.name, item.type].filter(Boolean).join(' ')}{item.quality ? ` · ${item.quality}` : ''}</div>
        </div>
      </div>
      {item.description && <p className="detail__desc">{item.description}</p>}

      {comparing ? (
        <div className="detail__rows">
          <h4 className="vx-h">If equipped</h4>
          {Object.entries(statComparison).map(([stat, diff]) => {
            const formatted = formatStatDifference(stat, diff);
            return (
              <div key={stat} className="vx-stat">
                <span>{titleCase(stat)}</span>
                <span className="vx-stat__dots" />
                <span>{fmt(diff.current)} → <strong className={diff.isPositive ? 'good' : 'bad'}>{fmt(diff.new)}</strong> ({formatted.text})</span>
              </div>
            );
          })}
        </div>
      ) : item.stats && (
        <div className="detail__rows">
          {Object.entries(item.stats).map(([stat, value]) => (
            <div key={stat} className="vx-stat">
              <span>{titleCase(stat)}</span>
              <span className="vx-stat__dots" />
              <strong className="good">+{fmt(value)}</strong>
            </div>
          ))}
        </div>
      )}

      <ToolDurability item={item} target={equippedSlot ? { slot: equippedSlot } : { index }} />
      <div className="detail__fill" />
      <div className="detail__actions">
        {equippedSlot ? (
          <button type="button" className="vx-pbtn vx-pbtn--stone vx-pbtn--block" onClick={() => onUnequip(equippedSlot, item)}>Unequip</button>
        ) : consumable ? (
          <button type="button" className="vx-pbtn vx-pbtn--green vx-pbtn--block" onClick={() => onUse(item)}>Use</button>
        ) : (
          <button type="button" className="vx-pbtn vx-pbtn--block" onClick={() => onEquip(item)}>Equip</button>
        )}
      </div>
    </>
  );
}

/** Put the selected material in a hotbar slot without dragging (tap 1-4). */
function HotbarAssign({ materialKey }) {
  const hotbar = useGameStore(selectHotbar);
  return (
    <div className="detail__rows">
      <h4 className="vx-h">Put in hotbar</h4>
      <div className="hotbar-assign">
        {hotbar.map((key, i) => (
          <button
            key={i}
            type="button"
            className={`vx-pbtn vx-pbtn--sm${key === materialKey ? '' : ' vx-pbtn--stone'}`}
            aria-pressed={key === materialKey}
            aria-label={`Put ${materialName(materialKey).toLowerCase()} in hotbar slot ${i + 1}`}
            onClick={() => useGameStore.getState().setHotbarSlot(i, key === materialKey ? null : materialKey)}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "2 stone slabs" / "8 dirt cubes": how many of a piece make a block. */
const BLOCK_PER = (piece) => `${8 / piece.units} ${piece.name.toLowerCase()}s`;

function MaterialDetail({ materialKey, amount, hungerFull, onEat }) {
  const edible = EDIBLE_MATERIALS[materialKey];
  const piece = pieceInfo(materialKey);
  const url = materialArt(materialKey);
  return (
    <>
      <div className="detail__top">
        <div className="vx-slot">{url && <img src={url} alt="" />}</div>
        <div>
          <h3 className="detail__name">{materialName(materialKey)}</h3>
          <div className="detail__sub">{piece ? `Piece · ${SHAPE_SIZE[piece.shape]}` : isBuildingMaterial(materialKey) ? 'Block · 2×2×2' : 'Material'}</div>
        </div>
      </div>
      <div className="vx-stat"><span>In your bag</span><span className="vx-stat__dots" /><strong>{amount}</strong></div>
      {piece && (
        <p className="detail__desc">
          {BLOCK_PER(piece)} make a {materialName(piece.base).toLowerCase()}. Combine them in Craft → Pieces to place
          a full block. Buildings and recipes take pieces as they are.
        </p>
      )}
      {isBuildingMaterial(materialKey) && (
        <p className="detail__desc">
          Place it from the hotbar, or split it into {BLOCK_PER(PIECES[materialKey])} in Craft → Pieces.
        </p>
      )}
      {edible && (
        <div className="vx-stat"><span>Eating restores</span><span className="vx-stat__dots" /><strong className="good">+{edible.restore} food, +{edible.heal} HP</strong></div>
      )}
      {hotbarAllows(materialKey) && <HotbarAssign materialKey={materialKey} />}
      <div className="detail__fill" />
      {edible && (
        <button
          type="button"
          className="vx-pbtn vx-pbtn--green vx-pbtn--block"
          disabled={hungerFull}
          title={hungerFull ? 'Not hungry' : undefined}
          onClick={() => onEat(materialKey, edible.restore, edible.heal)}
        >
          {hungerFull ? 'Not hungry' : `${edible.label} (+${edible.heal} HP)`}
        </button>
      )}
    </>
  );
}

export default InventoryUI;
