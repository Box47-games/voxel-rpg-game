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

const barColor = (frac) => (frac <= 0 ? '#d9473f' : frac < 0.25 ? '#e0913a' : '#e8b443');

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
    <div className="tool-durability" onClick={(e) => e.stopPropagation()}>
      <div className="tool-durability__label">
        <span className={isBroken(item) ? 'bad' : undefined}>{isBroken(item) ? 'Broken' : 'Durability'}</span>
        <span>{left} / {item.maxDurability}</span>
      </div>
      <div
        className="vx-nbar"
        role="meter"
        aria-label="Durability"
        aria-valuemin={0}
        aria-valuemax={item.maxDurability}
        aria-valuenow={left}
        style={{ '--c': barColor(frac) }}
      >
        <i style={{ width: `${frac * 100}%` }} />
      </div>
      {!compact && cost && (
        <button
          type="button"
          className="vx-pbtn vx-pbtn--sm vx-pbtn--block"
          disabled={!affordable}
          title={affordable ? `Costs ${costText}` : `Needs ${costText}`}
          onClick={() => useGameStore.getState().repairTool(target)}
        >
          Repair ({costText})
        </button>
      )}
    </div>
  );
}
