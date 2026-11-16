/**
 * BlockHotbar - the block hotbar. On desktop it is always shown in Play:
 * slot 0 is the empty hand (mine and fight; right-click places nothing),
 * 1-9/0 pick a block. Pressing the selected block's key again returns to the hand.
 * Touch keeps it inside build mode until the context button lands.
 */

import React, { useEffect, useRef } from 'react';
import useGameStore from '../../stores/useGameStore';
import { BlockTypes, BlockProperties } from '../../systems/chunks/blockTypes';
import { isTouchDevice } from '../../utils/deviceDetection';
import { getPlacementCost } from '../../data/blockDrops';

/** How many of a block the player can afford to place right now. */
function countPlaceable(blockType, materials) {
  const cost = getPlacementCost(blockType);
  if (!cost) return 0;
  let count = Infinity;
  for (const [mat, qty] of Object.entries(cost)) {
    count = Math.min(count, Math.floor((materials?.[mat] || 0) / qty));
  }
  return Number.isFinite(count) ? count : 0;
}

// Blocks available in the hotbar
const HOTBAR_BLOCKS = [
  BlockTypes.DIRT,
  BlockTypes.GRASS,
  BlockTypes.STONE,
  BlockTypes.SAND,
  BlockTypes.SNOW,
  BlockTypes.WOOD,
  BlockTypes.LEAVES,
  BlockTypes.GRAVEL,
  BlockTypes.COAL_ORE,
  BlockTypes.CAMPFIRE,
];

/**
 * Convert RGB array [0-1] to CSS color
 */
function rgbToCSS(rgb) {
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

export function BlockHotbar() {
  const selectedBlockType = useGameStore((state) => state.selectedBlockType);
  const blockPlacementMode = useGameStore((state) => state.blockPlacementMode);
  const buildMode = useGameStore((state) => state.buildMode);
  const zoneMode = useGameStore((state) => state.zoneMode);
  const placingBuildingId = useGameStore((state) => state.placingBuildingId);
  const materials = useGameStore((state) => state.inventory.materials);
  const setSelectedBlockType = useGameStore(
    (state) => state.setSelectedBlockType
  );
  const toggleBlockPlacementMode = useGameStore(
    (state) => state.toggleBlockPlacementMode
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
      if (st.zoneMode || st.placingBuildingId) return; // number keys mean something else there
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

  // Desktop: always in Play. Touch: only in build mode. Hidden while zoning or placing a building.
  if (isMobile.current && !buildMode) return null;
  if (zoneMode || placingBuildingId) return null;

  const exitBuildMode = () => useGameStore.getState().setBuildMode(false);

  return (
    <div
      className={`vx-block-hotbar${isMobile.current ? '' : ' vx-block-hotbar--desktop'}`}
      style={{
        ...styles.container,
        ...(isMobile.current
          ? {
              bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
              maxWidth: '95vw',
            }
          : {}),
      }}
    >
      {/* Mobile: action row with mode toggle + exit */}
      {isMobile.current && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            width: '100%',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            className={`vx-btn${blockPlacementMode ? ' vx-btn--primary' : ''}`}
            style={{ minWidth: '100px' }}
            onClick={toggleBlockPlacementMode}
          >
            {blockPlacementMode ? 'Place' : 'Mine'}
          </button>
          <button
            type="button"
            className="vx-btn vx-btn--danger"
            onClick={exitBuildMode}
            aria-label="Exit build mode"
          >
            ✕ Exit
          </button>
        </div>
      )}

      {/* Block slots */}
      <div
        className="vx-panel"
        style={{
          ...styles.slots,
          ...(isMobile.current ? { overflowX: 'auto', maxWidth: '90vw' } : {}),
        }}
      >
        <button
          type="button"
          aria-pressed={selectedBlockType == null}
          aria-label="Empty hand"
          style={{
            ...styles.slot,
            ...styles.handSlot,
            width: isMobile.current ? '40px' : '48px',
            height: isMobile.current ? '40px' : '48px',
            minWidth: isMobile.current ? '40px' : '48px',
            outline:
              selectedBlockType == null
                ? '2px solid var(--vx-gold-light)'
                : 'none',
            outlineOffset: '2px',
            transform: selectedBlockType == null ? 'translateY(-4px)' : 'none',
            position: 'relative',
          }}
          onClick={() => setSelectedBlockType(null)}
          title="Empty hand — mine and fight; right-click places nothing (press the selected block's key again)"
        >
          <span style={styles.handIcon} aria-hidden="true">
            ✋
          </span>
        </button>
        {HOTBAR_BLOCKS.map((blockType, index) => {
          const props = BlockProperties[blockType];
          const isSelected = selectedBlockType === blockType;
          const slotSize = isMobile.current ? '40px' : '48px';
          const placeable = countPlaceable(blockType, materials);
          const cost = getPlacementCost(blockType) || {};
          const costText = Object.entries(cost)
            .map(([m, q]) => `${q} ${m}`)
            .join(', ');

          return (
            <button
              key={blockType}
              type="button"
              aria-pressed={isSelected}
              style={{
                ...styles.slot,
                width: slotSize,
                height: slotSize,
                minWidth: slotSize,
                backgroundColor: rgbToCSS(props.color),
                outline: isSelected ? '2px solid var(--vx-gold-light)' : 'none',
                outlineOffset: '2px',
                transform: isSelected ? 'translateY(-4px)' : 'none',
                opacity: placeable > 0 ? 1 : 0.4,
                position: 'relative',
              }}
              onClick={() =>
                setSelectedBlockType(isSelected ? null : blockType)
              }
              title={`${props.name} (${(index + 1) % 10}) — costs ${costText || 'n/a'}`}
            >
              <span style={styles.countBadge}>{placeable}</span>
              <span style={styles.keyHint}>{(index + 1) % 10}</span>
            </button>
          );
        })}
      </div>

      {/* Instructions */}
      <div style={styles.instructions}>
        {isMobile.current ? (
          <span>Tap to {blockPlacementMode ? 'place' : 'mine'}</span>
        ) : (
          <>
            <span>Hold left-click to mine</span>
            <span style={styles.separator}>|</span>
            <span>
              {selectedBlockType == null
                ? 'Pick a block (1-0) to place'
                : 'Right-click to place'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    zIndex: 100,
    pointerEvents: 'auto',
  },
  slots: {
    display: 'flex',
    gap: '6px',
    padding: '8px',
  },
  slot: {
    width: '48px',
    height: '48px',
    border: '2px solid var(--vx-edge)',
    borderRadius: '2px',
    // Beveled like a block: lit top, shaded bottom
    boxShadow:
      'inset 0 4px 0 rgba(255,255,255,0.3), inset 0 -5px 0 rgba(0,0,0,0.3), inset 4px 0 0 rgba(255,255,255,0.08)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: '4px',
    transition: 'transform 0.1s',
  },
  handSlot: {
    backgroundColor: 'rgba(20, 18, 14, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handIcon: {
    fontSize: '20px',
    lineHeight: 1,
  },
  countBadge: {
    position: 'absolute',
    top: '3px',
    left: '4px',
    fontFamily: 'var(--vx-font-ui)',
    fontSize: '11px',
    color: '#fff',
    textShadow: '1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000',
    fontWeight: 'bold',
  },
  keyHint: {
    fontFamily: 'var(--vx-font-ui)',
    fontSize: '10px',
    color: '#fff',
    textShadow: '1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000',
    fontWeight: 'bold',
  },
  instructions: {
    fontSize: '12px',
    color: 'var(--vx-text)',
    textShadow: '0 1px 2px #000, 0 0 4px #000',
    display: 'flex',
    gap: '8px',
  },
  separator: {
    color: '#666',
  },
};

export default BlockHotbar;
