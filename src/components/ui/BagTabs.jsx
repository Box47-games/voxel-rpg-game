/**
 * BagTabs — the tab strip that makes Inventory, Craft and Repair one "Bag"
 * screen. Each tab is its own panel ('inventory' | 'crafting' | 'repair');
 * they share a frame (BagFrame), so switching tabs swaps the contents in place.
 */

import React from 'react';
import useGameStore from '../../stores/useGameStore';

export const BAG_TABS = [
  { id: 'inventory', label: 'Inventory', key: 'I' },
  { id: 'crafting', label: 'Craft', key: 'C' },
  { id: 'repair', label: 'Repair', key: null },
];

export default function BagTabs({ active, isMobile }) {
  return (
    <div role="tablist" aria-label="Bag" className="bag__tabs">
      {BAG_TABS.map(({ id, label, key }) => {
        const selected = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            className="vx-tab"
            aria-selected={selected}
            onClick={() => {
              if (!selected) useGameStore.getState().togglePanel(id);
            }}
          >
            {label}
            {key && !isMobile && <kbd className="vx-key">{key}</kbd>}
          </button>
        );
      })}
    </div>
  );
}
