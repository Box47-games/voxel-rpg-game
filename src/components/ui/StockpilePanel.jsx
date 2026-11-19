/**
 * StockpilePanel — Deposit/withdraw UI for stockpile zones.
 * Renders as an HTML overlay when activeStockpileZoneId is set.
 */

import React, { useCallback } from 'react';
import useGameStore from '../../stores/useGameStore';
import FramedPanel, { NotchedBar } from './FramedPanel';
import { materialArt } from './art';
import { materialName } from '../../data/pieces';

// Ordered list of materials to display
const MATERIAL_ORDER = [
  'wood', 'wood_plank', 'stone', 'stone_slab', 'iron', 'coal', 'dirt', 'dirt_cube', 'sand', 'sand_cube',
  'snow', 'snow_cube', 'clay', 'clay_cube',
  'gold_ore', 'leather', 'crystal', 'berry', 'vegetable', 'seed', 'meat', 'bone', 'fiber',
];

const MATERIAL_COLORS = {
  wood: '#8B4513', stone: '#808080', iron: '#C0C0C0', coal: '#333333',
  dirt: '#654321', sand: '#F4A460', clay: '#CC7744', gold_ore: '#FFD700',
  leather: '#8B6914', crystal: '#88CCFF', berry: '#CC2244', meat: '#E8967A',
  bone: '#F5F5DC', fiber: '#98FB98', vegetable: '#FF8C00', seed: '#C8B560',
  wood_plank: '#C99358', stone_slab: '#9A9EA6', dirt_cube: '#7A5232', sand_cube: '#E3CC8E',
  snow: '#F4F8FA', snow_cube: '#E4EEF2', clay_cube: '#A9B4C2',
};

function MaterialRow({ material, stockpileQty, playerQty, zoneId }) {
  const deposit = useGameStore((s) => s.depositToStockpile);
  const withdraw = useGameStore((s) => s.withdrawFromStockpile);
  const icon = materialArt(material);
  const btn = 'vx-pbtn vx-pbtn--stone fp__mini';

  return (
    <div className="fp__row sp-row">
      <span className="sp-row__name">
        {icon
          ? <img src={icon} alt="" width="20" height="20" />
          : <span className="fp__swatch" style={{ background: MATERIAL_COLORS[material] || '#888' }} />}
        <span>{materialName(material, 2)}</span>
      </span>
      <span className="fp__num fp__dim sp-row__bag" title="In your bag">bag {playerQty}</span>
      <span className="sp-row__btns" aria-label={`Put ${materialName(material, 2)} in`}>
        <button type="button" className={btn} onClick={() => deposit(zoneId, material, 1)} disabled={playerQty < 1}>+1</button>
        <button type="button" className={btn} onClick={() => deposit(zoneId, material, 10)} disabled={playerQty < 10}>+10</button>
        <button type="button" className={btn} onClick={() => deposit(zoneId, material, playerQty)} disabled={playerQty < 1}>All&rarr;</button>
      </span>
      <span className="fp__num sp-row__qty" title="In the stockpile">{stockpileQty}</span>
      <span className="sp-row__btns" aria-label={`Take ${materialName(material, 2)} out`}>
        <button type="button" className={btn} onClick={() => withdraw(zoneId, material, stockpileQty)} disabled={stockpileQty < 1}>&larr;All</button>
        <button type="button" className={btn} onClick={() => withdraw(zoneId, material, 10)} disabled={stockpileQty < 10}>-10</button>
        <button type="button" className={btn} onClick={() => withdraw(zoneId, material, 1)} disabled={stockpileQty < 1}>-1</button>
      </span>
    </div>
  );
}

export default function StockpilePanel() {
  const activeZoneId = useGameStore((s) => s.activeStockpileZoneId);
  const zones = useGameStore((s) => s.zones);
  const materials = useGameStore((s) => s.inventory?.materials);
  const closePanel = useGameStore((s) => s.closeStockpilePanel);
  const depositToStockpile = useGameStore((s) => s.depositToStockpile);
  const withdrawFromStockpile = useGameStore((s) => s.withdrawFromStockpile);

  const zone = activeZoneId ? zones.find(z => z.id === activeZoneId) : null;
  const storage = zone?.storage;
  const items = storage?.items || {};
  const capacity = storage?.capacity || 0;
  const usedCapacity = storage?.usedCapacity || 0;

  // Esc closes this panel through the store's backOut (PauseMenu)

  // Deposit all
  const handleDepositAll = useCallback(() => {
    if (!materials || !activeZoneId) return;
    for (const mat of MATERIAL_ORDER) {
      const qty = materials[mat] || 0;
      if (qty > 0) depositToStockpile(activeZoneId, mat, qty);
    }
  }, [activeZoneId, materials, depositToStockpile]);

  // Withdraw all
  const handleWithdrawAll = useCallback(() => {
    if (!activeZoneId) return;
    for (const mat of MATERIAL_ORDER) {
      const qty = items[mat] || 0;
      if (qty > 0) withdrawFromStockpile(activeZoneId, mat, qty);
    }
  }, [activeZoneId, items, withdrawFromStockpile]);

  if (!activeZoneId || !storage) return null;

  const fillPct = capacity > 0 ? Math.min(1, usedCapacity / capacity) : 0;

  // Build visible materials list — only show where either player or stockpile has >0
  const visibleMaterials = MATERIAL_ORDER.filter(mat =>
    (items[mat] || 0) > 0 || (materials?.[mat] || 0) > 0
  );

  return (
    <FramedPanel
      title="Stockpile"
      onClose={closePanel}
      width={700}
      header={<span className="fp__sub">Capacity {usedCapacity} / {capacity}</span>}
      footer="Press E or Esc to close"
    >
      <NotchedBar value={fillPct} color={fillPct > 0.9 ? '#d9473f' : fillPct > 0.7 ? '#e8b443' : '#6cbf4a'} label="Capacity" />

      <div className="fp__btns">
        <button type="button" className="vx-pbtn vx-pbtn--green" onClick={handleDepositAll}>Deposit All</button>
        <button type="button" className="vx-pbtn vx-pbtn--stone" onClick={handleWithdrawAll}>Withdraw All</button>
      </div>

      <div className="fp__rows">
        {visibleMaterials.length === 0 ? (
          <p className="fp__muted fp__center">No materials to show. Gather resources first!</p>
        ) : (
          visibleMaterials.map((mat) => (
            <MaterialRow
              key={mat}
              material={mat}
              stockpileQty={items[mat] || 0}
              playerQty={materials?.[mat] || 0}
              zoneId={activeZoneId}
            />
          ))
        )}
      </div>
    </FramedPanel>
  );
}
