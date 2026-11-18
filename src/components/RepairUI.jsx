/**
 * RepairUI — the Bag's Repair tab: every tool you own (equipped or in the
 * bag) with its wear and a repair button. Same frame as Inventory and Craft.
 */

import React from 'react';
import useGameStore from '../stores/useGameStore';
import BagFrame from './ui/BagFrame';
import { itemArt, rarityClass } from './ui/art';
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

  if (!isOpen) return null;
  const tools = listTools(equipment, items);

  return (
    <BagFrame active="repair" label="Repair">
      {tools.length === 0 ? (
        <p className="bag__empty">No tools yet. Craft a pickaxe or axe in the Craft tab; worn tools show up here.</p>
      ) : (
        <ul className="repair__list">
          {tools.map(({ item, target, where }) => {
            const url = itemArt(item);
            return (
              <li key={target.slot ?? `i${target.index}`} className={`vx-parch repair__item${isBroken(item) ? ' is-broken' : ''}`}>
                <div className={`vx-slot ${rarityClass(item)}`}>
                  {url ? <img src={url} alt="" /> : <span className="vx-slot__emoji" aria-hidden="true">{item.icon}</span>}
                </div>
                <div className="repair__text">
                  <div className="detail__name">{item.name}</div>
                  <div className="repair__where">{isBroken(item) ? 'Broken' : where}</div>
                  <ToolDurability item={item} target={target} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="bag__note">Repairing costs half the tool&apos;s crafting materials. Broken tools mine like bare hands until repaired.</p>
    </BagFrame>
  );
}
