/**
 * ToolWheel — the touch menu behind the HUD's Tools button (panel 'tools').
 * A ring of the big screens (Bag, Craft, Build catalog, Plan, Settlement)
 * around a close button, and the hotbar underneath (the same 4 slots the
 * player fills in the Bag): tap one to hold it (then tap the world to place
 * it), or the hand to empty your hands.
 * Spells keep their own wand button.
 */

import React from 'react';
import useGameStore, { selectHotbar } from '../../stores/useGameStore';
import { BlockProperties } from '../../systems/chunks/blockTypes';
import { countPlaceable, blockForMaterial } from '../../data/blockDrops';
import { materialName } from '../../data/pieces';
import { artUrl, materialArt } from './art';
import { blockArt } from './BlockHotbar';
import './ToolWheel.css';

const RING = [
  // Same icons as the HUD's mode buttons
  { id: 'bag', label: 'Bag', icon: 'bag', color: '#3d6fd0', run: (st) => st.togglePanel('inventory') },
  { id: 'craft', label: 'Craft', icon: 'wrench', color: '#a8711f', run: (st) => st.togglePanel('crafting') },
  { id: 'build', label: 'Build', icon: 'hammer', color: '#b8792a', run: (st) => st.openCatalog() },
  { id: 'plan', label: 'Plan', icon: 'mapPin', color: '#c9661a', run: (st) => st.enterMode('plan') },
  { id: 'settlement', label: 'Settlement', icon: 'people', color: '#3f8a3a', run: (st) => st.togglePanel('settlement') },
];

export default function ToolWheel() {
  const open = useGameStore((s) => s.openPanel === 'tools');
  const held = useGameStore((s) => s.selectedBlockType);
  const heldSlot = useGameStore((s) => s.heldSlot);
  const hotbar = useGameStore(selectHotbar);
  const materials = useGameStore((s) => s.inventory?.materials);
  if (!open) return null;

  const st = useGameStore.getState;
  const close = () => st().closePanels();
  const holdSlot = (i) => {
    if (st().heldSlot !== i) st().holdSlot(i);
    close();
  };
  const emptyHand = () => {
    st().holdSlot(null);
    close();
  };
  const catalogBlock = heldSlot == null && held != null ? held : null; // picked from Build

  return (
    <div className="tw-backdrop" onClick={close}>
      <div className="tw" role="dialog" aria-label="Tools" onClick={(e) => e.stopPropagation()}>
        <div className="tw-ring">
          {RING.map(({ id, label, icon, color, run }, i) => {
            // Evenly round the circle, starting at the top
            const angle = -Math.PI / 2 + (i * 2 * Math.PI) / RING.length;
            return (
              <button
                key={id}
                type="button"
                className="vx-tbtn tw-item"
                style={{
                  '--c': color,
                  '--x': `${Math.cos(angle).toFixed(3)}`,
                  '--y': `${Math.sin(angle).toFixed(3)}`,
                }}
                onClick={() => run(st())}
              >
                <img src={artUrl('ui', icon)} alt="" />
                <span className="vx-tbtn__label">{label}</span>
              </button>
            );
          })}
          <button type="button" className="vx-tbtn tw-close" style={{ '--c': '#b8392f' }} onClick={close} aria-label="Close tools">
            <img src={artUrl('ui', 'close')} alt="" />
          </button>
        </div>

        <div className="tw-blocks vx-panel" role="group" aria-label="Hold a block">
          <button
            type="button"
            className={`tw-block tw-block--hand${held == null && heldSlot == null ? ' tw-block--held' : ''}`}
            aria-pressed={held == null && heldSlot == null}
            aria-label="Empty hand"
            onClick={emptyHand}
          >
            <img src={artUrl('ui', 'hand')} alt="" />
          </button>
          {hotbar.map((key, i) => {
            if (!key) {
              return (
                <button key={i} type="button" className="tw-block tw-block--unset" aria-label={`Slot ${i + 1}: empty`} onClick={() => { close(); st().togglePanel('inventory'); }}>
                  <span className="tw-block__count">{i + 1}</span>
                </button>
              );
            }
            const block = blockForMaterial(key);
            const count = block != null ? countPlaceable(block, materials) : materials?.[key] || 0;
            return (
              <button
                key={i}
                type="button"
                className={`tw-block${heldSlot === i ? ' tw-block--held' : ''}${count > 0 ? '' : ' tw-block--empty'}`}
                aria-pressed={heldSlot === i}
                aria-label={`${materialName(key)} (${count})`}
                onClick={() => holdSlot(i)}
              >
                <img src={materialArt(key)} alt="" />
                <span className="tw-block__count">{count}</span>
              </button>
            );
          })}
          {catalogBlock != null && (
            <button
              type="button"
              className="tw-block tw-block--held"
              aria-pressed="true"
              aria-label={`${BlockProperties[catalogBlock]?.name} (${countPlaceable(catalogBlock, materials)})`}
              onClick={close}
            >
              <img src={blockArt(catalogBlock)} alt="" />
              <span className="tw-block__count">{countPlaceable(catalogBlock, materials)}</span>
            </button>
          )}
        </div>
        <p className="tw-hint">Pick a slot, then tap where it goes. Fill the slots in your Bag. Hold a block on screen to mine it.</p>
      </div>
    </div>
  );
}
