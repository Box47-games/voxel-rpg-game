/**
 * ToolWheel — the touch menu behind the HUD's Tools button (panel 'tools').
 * A ring of the big screens (Bag, Craft, Build catalog, Plan, Settlement)
 * around a close button, and a strip of blocks underneath: tap one to hold it
 * (then tap the world to place it), or the hand to empty your hands.
 * Spells keep their own wand button.
 */

import React from 'react';
import { Package, Hammer, Pickaxe, MapPin, Users, X } from 'lucide-react';
import useGameStore from '../../stores/useGameStore';
import { BlockProperties } from '../../systems/chunks/blockTypes';
import { HOTBAR_BLOCKS, countPlaceable } from '../../data/blockDrops';
import './ToolWheel.css';

const RING = [
  { id: 'bag', label: 'Bag', Icon: Package, color: '#4f8cf7', run: (st) => st.togglePanel('inventory') },
  { id: 'craft', label: 'Craft', Icon: Hammer, color: '#f2c14e', run: (st) => st.togglePanel('crafting') },
  { id: 'build', label: 'Build', Icon: Pickaxe, color: '#ffb02e', run: (st) => st.openCatalog() },
  { id: 'plan', label: 'Plan', Icon: MapPin, color: '#ff8c1a', run: (st) => st.enterMode('plan') },
  { id: 'settlement', label: 'Settlement', Icon: Users, color: '#5cc36b', run: (st) => st.togglePanel('settlement') },
];

const rgb = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;

export default function ToolWheel() {
  const open = useGameStore((s) => s.openPanel === 'tools');
  const held = useGameStore((s) => s.selectedBlockType);
  const materials = useGameStore((s) => s.inventory?.materials);
  if (!open) return null;

  const st = useGameStore.getState;
  const close = () => st().closePanels();
  const pick = (blockType) => {
    st().setSelectedBlockType(blockType);
    close();
  };
  const strip = held != null && !HOTBAR_BLOCKS.includes(held) ? [...HOTBAR_BLOCKS, held] : HOTBAR_BLOCKS;

  return (
    <div className="tw-backdrop" onClick={close}>
      <div className="tw" role="dialog" aria-label="Tools" onClick={(e) => e.stopPropagation()}>
        <div className="tw-ring">
          {RING.map(({ id, label, Icon, color, run }, i) => {
            // Evenly round the circle, starting at the top
            const angle = -Math.PI / 2 + (i * 2 * Math.PI) / RING.length;
            return (
              <button
                key={id}
                type="button"
                className="tw-item"
                style={{
                  '--tw': color,
                  '--x': `${Math.cos(angle).toFixed(3)}`,
                  '--y': `${Math.sin(angle).toFixed(3)}`,
                }}
                onClick={() => run(st())}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
          <button type="button" className="tw-close" onClick={close} aria-label="Close tools">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="tw-blocks vx-panel" role="group" aria-label="Hold a block">
          <button
            type="button"
            className={`tw-block tw-block--hand${held == null ? ' tw-block--held' : ''}`}
            aria-pressed={held == null}
            aria-label="Empty hand"
            onClick={() => pick(null)}
          >
            ✋
          </button>
          {strip.map((type) => {
            const props = BlockProperties[type];
            const count = countPlaceable(type, materials);
            return (
              <button
                key={type}
                type="button"
                className={`tw-block${held === type ? ' tw-block--held' : ''}${count > 0 ? '' : ' tw-block--empty'}`}
                style={{ background: rgb(props.color) }}
                aria-pressed={held === type}
                aria-label={`${props.name} (${count})`}
                onClick={() => pick(type)}
              >
                <span className="tw-block__count">{count}</span>
              </button>
            );
          })}
        </div>
        <p className="tw-hint">Pick a block, then tap where it goes. Hold a block on screen to mine it.</p>
      </div>
    </div>
  );
}
