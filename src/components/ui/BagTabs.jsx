/**
 * BagTabs — the tab strip that makes Inventory, Craft and Repair one "Bag"
 * screen. Each tab is its own panel ('inventory' | 'crafting' | 'repair');
 * they share a frame, so switching tabs swaps the contents in place.
 */

import React from 'react';
import { Package, Hammer, Wrench } from 'lucide-react';
import useGameStore from '../../stores/useGameStore';

export const BAG_TABS = [
  { id: 'inventory', label: 'Inventory', key: 'I', Icon: Package, color: '#4dabf7' },
  { id: 'crafting', label: 'Craft', key: 'C', Icon: Hammer, color: '#ffd700' },
  { id: 'repair', label: 'Repair', key: null, Icon: Wrench, color: '#f59f00' },
];

export default function BagTabs({ active, isMobile }) {
  return (
    <div
      role="tablist"
      aria-label="Bag"
      style={{
        display: 'flex',
        gap: 4,
        padding: isMobile ? '6px 10px 0' : '8px 24px 0',
        borderBottom: '2px solid #4a5568',
        background: '#1a202c',
        flexShrink: 0,
      }}
    >
      {BAG_TABS.map(({ id, label, key, Icon, color }) => {
        const selected = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => {
              if (!selected) useGameStore.getState().togglePanel(id);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flex: isMobile ? 1 : 'none',
              justifyContent: 'center',
              minHeight: 40,
              padding: '8px 14px',
              marginBottom: -2,
              background: selected ? '#2d3748' : 'transparent',
              color: selected ? color : '#a0aec0',
              border: '2px solid',
              borderColor: selected ? '#4a5568 #4a5568 #2d3748' : 'transparent',
              borderRadius: '6px 6px 0 0',
              fontWeight: 'bold',
              fontSize: isMobile ? '0.9rem' : '1rem',
              cursor: selected ? 'default' : 'pointer',
              touchAction: 'manipulation',
            }}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
            {key && !isMobile && (
              <kbd className="vx-key" style={{ fontSize: 10, marginLeft: 2 }}>
                {key}
              </kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}
