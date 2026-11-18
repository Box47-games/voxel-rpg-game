/**
 * BlockHotbar - the block hotbar. On desktop it is always shown in Play:
 * slot 0 is the empty hand (mine and fight; right-click places nothing),
 * 1-9/0 pick a block. Pressing the selected block's key again returns to the hand.
 * Touch has no hotbar: blocks are picked from the tool wheel and placed with
 * a tap on the world.
 */

import React, { useEffect, useRef } from 'react';
import useGameStore from '../../stores/useGameStore';
import { BlockProperties, BlockTypes } from '../../systems/chunks/blockTypes';
import { artUrl } from './art';
import './BlockHotbar.css';
import { isTouchDevice } from '../../utils/deviceDetection';
import { getPlacementCost, countPlaceable, HOTBAR_BLOCKS } from '../../data/blockDrops';


/**
 * Convert RGB array [0-1] to CSS color
 */
function rgbToCSS(rgb) {
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

const BLOCK_NAME = Object.fromEntries(Object.entries(BlockTypes).map(([name, id]) => [id, name]));

/** Isometric block icon (or the campfire) for a block type, else null. */
function blockArt(blockType) {
  const name = BLOCK_NAME[blockType];
  return artUrl('blocks', name) || artUrl('misc', name?.toLowerCase());
}

export function BlockHotbar() {
  const selectedBlockType = useGameStore((state) => state.selectedBlockType);
  const zoneMode = useGameStore((state) => state.zoneMode || state.planMode); // planning: no mining or placing
  const placingBuildingId = useGameStore((state) => state.placingBuildingId);
  const playing = useGameStore((state) => state.gameState === 'playing');
  const materials = useGameStore((state) => state.inventory.materials);
  const setSelectedBlockType = useGameStore(
    (state) => state.setSelectedBlockType
  );
  const isMobile = useRef(isTouchDevice());

  // Keyboard shortcuts (number keys for block selection only)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Number keys to select blocks (when not focused on input)
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')
        return;

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = useGameStore.getState();
      if (st.zoneMode || st.planMode || st.placingBuildingId) return; // number keys mean something else there
      if (e.key === '`' || e.key === '~') return;
      const keyIndex = parseInt(e.key, 10);
      if (Number.isNaN(keyIndex)) return;
      // 1-9 then 0 for the tenth slot
      const slot = keyIndex === 0 ? HOTBAR_BLOCKS.length : keyIndex;
      if (slot < 1 || slot > HOTBAR_BLOCKS.length) return;
      const block = HOTBAR_BLOCKS[slot - 1];
      setSelectedBlockType(st.selectedBlockType === block ? null : block);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelectedBlockType]);

  // Desktop only, in Play. Hidden while planning or placing a building.
  if (isMobile.current || !playing) return null; // not on the title, death or pause screens
  if (zoneMode || placingBuildingId) return null;

  const blocks =
    HOTBAR_BLOCKS.includes(selectedBlockType) || selectedBlockType == null
      ? HOTBAR_BLOCKS
      : [...HOTBAR_BLOCKS, selectedBlockType]; // picked from the catalog (B)

  return (
    <div className="vx-block-hotbar vx-block-hotbar--desktop">
      <div className="hotbar vx-hudpanel">
        <button
          type="button"
          className={`hotbar__slot hotbar__slot--hand${selectedBlockType == null ? ' is-selected' : ''}`}
          aria-pressed={selectedBlockType == null}
          aria-label="Empty hand"
          onClick={() => setSelectedBlockType(null)}
          title="Empty hand: mine and fight; right-click places nothing (press the selected block's key again)"
        >
          <img src={artUrl('ui', 'hand')} alt="" />
        </button>
        {blocks.map((blockType, index) => {
          const keyLabel = index < HOTBAR_BLOCKS.length ? String((index + 1) % 10) : 'B';
          const props = BlockProperties[blockType];
          const isSelected = selectedBlockType === blockType;
          const placeable = countPlaceable(blockType, materials);
          const cost = getPlacementCost(blockType) || {};
          const costText = Object.entries(cost)
            .map(([m, q]) => `${q} ${m}`)
            .join(', ');
          const url = blockArt(blockType);

          return (
            <button
              key={blockType}
              type="button"
              className={`hotbar__slot${isSelected ? ' is-selected' : ''}${placeable > 0 ? '' : ' is-empty'}`}
              aria-pressed={isSelected}
              aria-label={`${props.name}, ${placeable}`}
              onClick={() => setSelectedBlockType(isSelected ? null : blockType)}
              title={`${props.name} (${keyLabel}): costs ${costText || 'n/a'}`}
            >
              {url ? (
                <img src={url} alt="" />
              ) : (
                <span className="hotbar__swatch" style={{ background: rgbToCSS(props.color) }} />
              )}
              <span className="hotbar__count">{placeable}</span>
              <span className="hotbar__key">{keyLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="hotbar__hint">
        <span>Hold left-click to mine</span>
        <span className="hotbar__sep" aria-hidden="true">·</span>
        <span>{selectedBlockType == null ? 'Pick a block (1-0) to place' : 'Right-click to place'}</span>
      </div>
    </div>
  );
}

export default BlockHotbar;
