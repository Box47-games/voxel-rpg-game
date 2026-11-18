/**
 * BagHotbar — the hotbar's 4 slots inside the Bag (Inventory tab). Drag a
 * block or piece from Materials onto a slot; drag slots to swap them, or out
 * of the row to clear one. Keys 1-4 pick the slots in play.
 */

import React from 'react';
import useGameStore, { selectHotbar } from '../../stores/useGameStore';
import { materialArt, artUrl } from './art';
import { materialName } from '../../data/pieces';
import { beginHotbarDrag } from './hotbarDrag';

export default function BagHotbar() {
  const hotbar = useGameStore(selectHotbar);
  const materials = useGameStore((s) => s.inventory.materials);

  return (
    <div className="bag-hotbar" data-hotbar-row>
      <div className="inv__row">
        <h3 className="vx-h">Hotbar</h3>
        <span className="inv__count">Drag blocks here · keys 1–{hotbar.length}</span>
      </div>
      <div className="bag-hotbar__slots">
        {hotbar.map((key, i) => (
          <div
            key={i}
            className={`vx-slot bag-hotbar__slot${key ? '' : ' is-ghost'}`}
            data-hotbar-slot={i}
            role="group"
            aria-label={key ? `Hotbar slot ${i + 1}: ${materialName(key)}` : `Hotbar slot ${i + 1}: empty`}
            title={key ? `${materialName(key)}: drag to move, or out to clear` : 'Drag a block or piece here'}
            onPointerDown={key ? (e) => beginHotbarDrag(e, { key, icon: materialArt(key), fromSlot: i }) : undefined}
          >
            <span className="bag-hotbar__key">{i + 1}</span>
            {key ? (
              <>
                <img src={materialArt(key)} alt="" />
                <span className="vx-slot__qty">{materials?.[key] || 0}</span>
                <button
                  type="button"
                  className="bag-hotbar__clear"
                  aria-label={`Clear hotbar slot ${i + 1}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => useGameStore.getState().setHotbarSlot(i, null)}
                >
                  <img src={artUrl('ui', 'close')} alt="" />
                </button>
              </>
            ) : (
              <img src={artUrl('ui', 'box')} alt="" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
