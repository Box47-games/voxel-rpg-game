/**
 * ToolDurability — a tool's wear bar, and a Repair button when it is worn.
 */
import React from 'react';
import useGameStore from '../../stores/useGameStore';
import {
  isTool,
  isBroken,
  getDurability,
  getRepairCost,
  canAffordRepair,
} from '../../systems/tools/toolDurability';

const barColor = (frac) => (frac <= 0 ? '#ff6b6b' : frac < 0.25 ? '#f59f00' : '#51cf66');

/**
 * @param {Object} props
 * @param {Object} props.item - The tool
 * @param {Object} props.target - What to repair: { slot } or { index }
 * @param {boolean} [props.compact] - Bar only, no repair button
 */
export default function ToolDurability({ item, target, compact = false }) {
  const materials = useGameStore((s) => s.inventory.materials);
  if (!isTool(item)) return null;

  const left = getDurability(item);
  const frac = left / item.maxDurability;
  const cost = getRepairCost(item);
  const affordable = canAffordRepair(item, materials);
  const costText = cost ? Object.entries(cost).map(([m, n]) => `${n} ${m}`).join(', ') : '';

  return (
    <div className="tool-durability" style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: isBroken(item) ? '#ff6b6b' : '#a0aec0' }}>
        <span>{isBroken(item) ? 'Broken' : 'Durability'}</span>
        <span>{left} / {item.maxDurability}</span>
      </div>
      <div
        role="meter"
        aria-label="Durability"
        aria-valuemin={0}
        aria-valuemax={item.maxDurability}
        aria-valuenow={left}
        style={{ height: 5, background: '#1a202c', borderRadius: 3, overflow: 'hidden', marginTop: 2 }}
      >
        <div style={{ width: `${frac * 100}%`, height: '100%', background: barColor(frac) }} />
      </div>
      {!compact && cost && (
        <button
          type="button"
          disabled={!affordable}
          title={affordable ? `Costs ${costText}` : `Needs ${costText}`}
          onClick={() => useGameStore.getState().repairTool(target)}
          style={{
            marginTop: 6,
            width: '100%',
            padding: '6px 8px',
            minHeight: 32,
            fontSize: '0.8rem',
            background: affordable ? '#f2c14e' : '#4a5568',
            color: affordable ? '#171c27' : '#a0aec0',
            border: 'none',
            borderRadius: 4,
            cursor: affordable ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
            touchAction: 'manipulation',
          }}
        >
          Repair ({costText})
        </button>
      )}
    </div>
  );
}
