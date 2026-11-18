/**
 * BlockHotbar — the desktop hotbar in Play: the empty hand, then the 4 slots
 * the player fills from the Bag (drag blocks and pieces there; keys 1-4,
 * the same key again = back to the hand). A block picked from the Build
 * catalog (B) that isn't in a slot shows as an extra slot.
 * Touch has no hotbar: the tool wheel shows the same slots.
 */

import React, { useEffect } from 'react';
import useGameStore, { selectHotbar } from '../../stores/useGameStore';
import { BlockProperties, BlockTypes } from '../../systems/chunks/blockTypes';
import { isTouchDevice } from '../../utils/deviceDetection';
import { getPlacementCost, countPlaceable, blockForMaterial } from '../../data/blockDrops';
import { materialName, isPieceKey } from '../../data/pieces';
import { artUrl, materialArt } from './art';
import './BlockHotbar.css';

const BLOCK_NAME = Object.fromEntries(Object.entries(BlockTypes).map(([name, id]) => [id, name]));

/** Isometric block icon (or the campfire) for a block type, else null. */
export function blockArt(blockType) {
  const name = BLOCK_NAME[blockType];
  return artUrl('blocks', name) || artUrl('misc', name?.toLowerCase());
}

/** Cost text for a block: "2 wood". */
const costText = (blockType) =>
  Object.entries(getPlacementCost(blockType) || {}).map(([m, q]) => `${q} ${m}`).join(', ') || 'n/a';

/** Keys 1-4 hold a hotbar slot (desktop and touch keyboards). */
export function useHotbarKeys() {
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = useGameStore.getState();
      if (st.zoneMode || st.planMode || st.placingBuildingId) return; // number keys mean something else there
      const n = parseInt(e.key, 10);
      const slots = selectHotbar(st).length;
      if (Number.isNaN(n) || n < 1 || n > slots) return;
      st.holdSlot(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function BlockHotbar() {
  const hotbar = useGameStore(selectHotbar);
  const heldSlot = useGameStore((s) => s.heldSlot);
  const selectedBlockType = useGameStore((s) => s.selectedBlockType);
  const zoneMode = useGameStore((s) => s.zoneMode || s.planMode); // planning: no mining or placing
  const placingBuildingId = useGameStore((s) => s.placingBuildingId);
  const playing = useGameStore((s) => s.gameState === 'playing');
  const materials = useGameStore((s) => s.inventory.materials);
  useHotbarKeys();

  // Desktop only, in Play. Hidden while planning or placing a building.
  if (isTouchDevice() || !playing) return null;
  if (zoneMode || placingBuildingId) return null;

  const handHeld = heldSlot == null && selectedBlockType == null;
  // A catalog block (campfire, gravel, ...) in hand that no slot holds
  const catalogBlock = heldSlot == null && selectedBlockType != null ? selectedBlockType : null;
  const heldKey = heldSlot != null ? hotbar[heldSlot] : null;
  const hint =
    heldKey && isPieceKey(heldKey)
      ? `${materialName(heldKey, 2)} can't be placed yet: combine them in Craft`
      : handHeld
        ? hotbar.some(Boolean) ? `Pick a slot (1-${hotbar.length}) to place` : 'Drag blocks into the hotbar in your Bag (I)'
        : 'Right-click to place';

  return (
    <div className="vx-block-hotbar vx-block-hotbar--desktop">
      <div className="hotbar vx-hudpanel">
        <button
          type="button"
          className={`hotbar__slot hotbar__slot--hand${handHeld ? ' is-selected' : ''}`}
          aria-pressed={handHeld}
          aria-label="Empty hand"
          onClick={() => useGameStore.getState().holdSlot(null)}
          title="Empty hand: mine and fight (press the held slot's key again)"
        >
          <img src={artUrl('ui', 'hand')} alt="" />
        </button>
        {hotbar.map((key, i) => {
          const held = heldSlot === i;
          if (!key) {
            return (
              <button
                key={i}
                type="button"
                className={`hotbar__slot is-unset${held ? ' is-selected' : ''}`}
                aria-label={`Slot ${i + 1}: empty`}
                title="Empty: drag a block here in your Bag (I)"
                onClick={() => useGameStore.getState().holdSlot(i)}
              >
                <span className="hotbar__key">{i + 1}</span>
              </button>
            );
          }
          const block = blockForMaterial(key);
          const count = block != null ? countPlaceable(block, materials) : materials?.[key] || 0;
          return (
            <button
              key={i}
              type="button"
              className={`hotbar__slot${held ? ' is-selected' : ''}${count > 0 ? '' : ' is-empty'}${block == null ? ' is-piece' : ''}`}
              aria-pressed={held}
              aria-label={`Slot ${i + 1}: ${materialName(key)}, ${count}`}
              title={block != null ? `${materialName(key)} (${i + 1}): costs ${costText(block)}` : `${materialName(key)} (${i + 1}): can't be placed yet`}
              onClick={() => useGameStore.getState().holdSlot(i)}
            >
              <img src={materialArt(key)} alt="" />
              <span className="hotbar__count">{count}</span>
              <span className="hotbar__key">{i + 1}</span>
            </button>
          );
        })}
        {catalogBlock != null && (
          <button
            type="button"
            className={`hotbar__slot is-selected${countPlaceable(catalogBlock, materials) > 0 ? '' : ' is-empty'}`}
            aria-pressed="true"
            aria-label={`${BlockProperties[catalogBlock]?.name}, ${countPlaceable(catalogBlock, materials)}`}
            title={`${BlockProperties[catalogBlock]?.name} (from Build): costs ${costText(catalogBlock)}`}
            onClick={() => useGameStore.getState().holdSlot(null)}
          >
            <img src={blockArt(catalogBlock)} alt="" />
            <span className="hotbar__count">{countPlaceable(catalogBlock, materials)}</span>
            <span className="hotbar__key">B</span>
          </button>
        )}
      </div>

      <div className="hotbar__hint">
        <span>Hold left-click to mine</span>
        <span className="hotbar__sep" aria-hidden="true">·</span>
        <span>{hint}</span>
      </div>
    </div>
  );
}

export default BlockHotbar;
