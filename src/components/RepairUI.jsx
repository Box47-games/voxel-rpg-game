/**
 * RepairUI — the Bag's Repair tab: every tool you own (equipped or in the
 * bag) with its wear and a repair button. Same frame as Inventory and Craft.
 */

import React, { useEffect, useState } from 'react';
import { X, Wrench } from 'lucide-react';
import useGameStore from '../stores/useGameStore';
import BagTabs from './ui/BagTabs';
import ToolDurability from './ui/ToolDurability';
import { isTool, isBroken, getDurability } from '../systems/tools/toolDurability';

const SLOT_NAMES = { weapon: 'Equipped', offhand: 'Off hand' };

/** Tools the player owns, most worn first. */
export function listTools(equipment, items) {
  const tools = [];
  for (const [slot, item] of Object.entries(equipment || {})) {
    if (isTool(item)) tools.push({ item, target: { slot }, where: SLOT_NAMES[slot] || slot });
  }
  (items || []).forEach((item, index) => {
    if (isTool(item)) tools.push({ item, target: { index }, where: 'In bag' });
  });
  const wear = (t) => getDurability(t.item) / t.item.maxDurability;
  return tools.sort((a, b) => wear(a) - wear(b));
}

export default function RepairUI() {
  const isOpen = useGameStore((s) => s.openPanel === 'repair');
  const equipment = useGameStore((s) => s.equipment);
  const items = useGameStore((s) => s.inventory.items);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!isOpen) return null;
  const close = () => useGameStore.getState().closePanels();
  const tools = listTools(equipment, items);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        zIndex: 2000,
        display: 'flex',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : 20,
      }}
      onClick={(e) => {
        if (!isMobile && e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-label="Repair"
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRadius: isMobile ? 0 : 20,
          maxWidth: isMobile ? '100%' : 1200,
          width: '100%',
          maxHeight: isMobile ? '100%' : '90vh',
          // Same height as the Inventory and Craft tabs so switching doesn't jump
          height: isMobile ? '100%' : '90vh',
          overflow: 'hidden',
          border: isMobile ? 'none' : '2px solid #4a5568',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: isMobile ? '15px 20px' : '20px 30px',
            borderBottom: '2px solid #4a5568',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(90deg, #2d3748, #1a202c)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 15 }}>
            <Wrench size={isMobile ? 24 : 32} color="#f59f00" />
            <h2 style={{ margin: 0, color: '#f59f00', fontSize: isMobile ? '1.3rem' : '2rem' }}>Repair</h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={isMobile ? 20 : 24} color="#fff" />
          </button>
        </div>
        <BagTabs active="repair" isMobile={isMobile} />

        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 15 : 24 }}>
          {tools.length === 0 ? (
            <p style={{ color: '#a0aec0', margin: 0 }}>
              No tools yet. Craft a pickaxe or axe in the Craft tab; worn tools show up here.
            </p>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              {tools.map(({ item, target, where }) => (
                <li
                  key={target.slot ?? `i${target.index}`}
                  style={{
                    background: '#2d3748',
                    border: `2px solid ${isBroken(item) ? '#ff6b6b' : '#4a5568'}`,
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: '#fff', fontWeight: 'bold' }}>{item.name}</span>
                    <span style={{ color: '#a0aec0', fontSize: '0.8rem' }}>{where}</span>
                  </div>
                  <ToolDurability item={item} target={target} />
                </li>
              ))}
            </ul>
          )}
          <p style={{ color: '#718096', fontSize: '0.8rem', marginTop: 16, marginBottom: 0 }}>
            Repairing costs half the tool&apos;s crafting materials. Broken tools mine like bare hands until repaired.
          </p>
        </div>
      </div>
    </div>
  );
}
