/**
 * BlockHotbar - UI for selecting block types and toggling placement mode
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
  const materials = useGameStore((state) => state.inventory.materials);
  const setSelectedBlockType = useGameStore((state) => state.setSelectedBlockType);
  const toggleBlockPlacementMode = useGameStore((state) => state.toggleBlockPlacementMode);
  const isMobile = useRef(isTouchDevice());

  // Keyboard shortcuts (number keys for block selection only)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Number keys to select blocks (when not focused on input)
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const keyIndex = parseInt(e.key, 10);
      if (keyIndex >= 1 && keyIndex <= HOTBAR_BLOCKS.length) {
        setSelectedBlockType(HOTBAR_BLOCKS[keyIndex - 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelectedBlockType]);

  // Only show when build mode is active
  if (!buildMode) return null;

  const exitBuildMode = () => useGameStore.getState().setBuildMode(false);

  return (
    <div style={{
      ...styles.container,
      ...(isMobile.current ? { bottom: '10px', maxWidth: '95vw' } : {}),
    }}>
      {/* Mobile: action row with mode toggle + exit */}
      {isMobile.current && (
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          width: '100%',
          justifyContent: 'center',
        }}>
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
        {HOTBAR_BLOCKS.map((blockType, index) => {
          const props = BlockProperties[blockType];
          const isSelected = selectedBlockType === blockType;
          const slotSize = isMobile.current ? '40px' : '48px';
          const placeable = countPlaceable(blockType, materials);
          const cost = getPlacementCost(blockType) || {};
          const costText = Object.entries(cost).map(([m, q]) => `${q} ${m}`).join(', ');

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
              onClick={() => setSelectedBlockType(blockType)}
              title={`${props.name} (${index + 1}) — costs ${costText || 'n/a'}`}
            >
              <span style={styles.countBadge}>{placeable}</span>
              <span style={styles.keyHint}>{index + 1}</span>
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
            <span>Right-click to place</span>
            <span style={styles.separator}>|</span>
            <span>Tab to exit</span>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
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
    boxShadow: 'inset 0 4px 0 rgba(255,255,255,0.3), inset 0 -5px 0 rgba(0,0,0,0.3), inset 4px 0 0 rgba(255,255,255,0.08)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: '4px',
    transition: 'transform 0.1s',
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
