/**
 * BuildCatalog — the B panel: everything you can build, in two tabs.
 *   Blocks:    every placeable block with its cost; picking one puts it in hand.
 *   Buildings: blueprints; picking one starts placement.
 * Open/close goes through the store (togglePanel('buildings') / openCatalog),
 * so it follows the one-panel rule and Esc backs out of it.
 */

import React, { useEffect } from 'react';
import useGameStore from '../../stores/useGameStore';
import { BUILDINGS } from '../../data/buildings';
import { BlockProperties } from '../../systems/chunks/blockTypes';
import { isTouchDevice } from '../../utils/deviceDetection';
import {
  PLACEABLE_BLOCKS,
  getPlacementCost,
  countPlaceable,
} from '../../data/blockDrops';
import './BuildCatalog.css';

const TABS = [
  { id: 'blocks', label: 'Blocks', key: '1' },
  { id: 'buildings', label: 'Buildings', key: '2' },
];

const MATERIAL_COLORS = {
  wood: '#a0683a',
  stone: '#8d8f94',
  iron: '#c9ccd2',
  coal: '#3a3a3a',
  dirt: '#8a5a35',
  sand: '#d9c58b',
  snow: '#eef3f7',
  clay: '#b0715a',
  ice: '#9fd3ee',
};

const rgbToCSS = ([r, g, b]) =>
  `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

function Cost({ cost, materials }) {
  return (
    <span className="bc-cost">
      {Object.entries(cost).map(([mat, qty]) => {
        const have = materials?.[mat] || 0;
        return (
          <span
            key={mat}
            className={`bc-cost__item${have >= qty ? '' : ' bc-cost__item--short'}`}
          >
            <span
              className="bc-cost__swatch"
              style={{ background: MATERIAL_COLORS[mat] || '#888' }}
              aria-hidden="true"
            />
            {have}/{qty} {mat}
          </span>
        );
      })}
    </span>
  );
}

function BlocksTab({ materials, selected, onPick }) {
  return (
    <div className="bc-grid bc-grid--blocks">
      {PLACEABLE_BLOCKS.map((type) => {
        const props = BlockProperties[type];
        const count = countPlaceable(type, materials);
        return (
          <button
            key={type}
            type="button"
            className={`bc-block${selected === type ? ' bc-block--held' : ''}`}
            aria-pressed={selected === type}
            onClick={() => onPick(type)}
          >
            <span
              className="bc-block__swatch"
              style={{ background: rgbToCSS(props.color) }}
              aria-hidden="true"
            >
              <span className="bc-block__count">{count}</span>
            </span>
            <span className="bc-block__name">{props.name}</span>
            <Cost cost={getPlacementCost(type)} materials={materials} />
          </button>
        );
      })}
    </div>
  );
}

function BuildingCard({ building, materials, onPlace }) {
  const canAfford = Object.entries(building.cost).every(
    ([mat, qty]) => (materials?.[mat] || 0) >= qty
  );
  const { housing = 0, attractiveness = 0 } = building.effects || {};
  return (
    <div className="bc-card">
      <div className="bc-card__name">{building.name}</div>
      <div className="bc-card__desc">{building.description}</div>
      <Cost cost={building.cost} materials={materials} />
      <div className="bc-card__meta">
        {housing > 0 && <span>+{housing} housing</span>}
        {attractiveness > 0 && <span>+{attractiveness} appeal</span>}
        <span>
          {building.size.width}×{building.size.depth}×{building.size.height}
        </span>
      </div>
      <button
        type="button"
        className={`vx-btn vx-btn--block${canAfford ? ' vx-btn--primary' : ''}`}
        disabled={!canAfford}
        onClick={() => onPlace(building.id)}
      >
        {canAfford ? 'Place' : 'Need materials'}
      </button>
    </div>
  );
}

/** Placing a building happens in plan mode (raised camera); afterwards you keep planning. */
function placeFromCatalog(id) {
  const st = useGameStore.getState();
  if (!st.planMode) {
    if (document.pointerLockElement) document.exitPointerLock();
    st.enterMode('plan');
  }
  useGameStore.getState().startPlacingBuilding(id);
}

export default function BuildCatalog() {
  const isOpen = useGameStore((s) => s.activeBuildingCatalog);
  const tab = useGameStore((s) => s.catalogTab);
  const materials = useGameStore((s) => s.inventory?.materials);
  const selected = useGameStore((s) => s.selectedBlockType);

  // B toggles the catalog; 1/2 switch tabs while it is open
  useEffect(() => {
    const handleKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const st = useGameStore.getState();
      if (e.code === 'KeyB') {
        st.togglePanel('buildings');
        return;
      }
      if (!st.activeBuildingCatalog) return;
      const t = TABS.find((x) => x.key === e.key);
      if (t) {
        // Swallow the number so the hotbar doesn't also change the held block
        e.stopImmediatePropagation();
        st.setCatalogTab(t.id);
      }
    };
    // Capture phase so the tab keys beat the hotbar's number-key handler
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, []);

  if (!isOpen) return null;

  const st = useGameStore.getState;
  const close = () => st().closePanels();

  return (
    <div className="bc-backdrop" onClick={close}>
      <div
        className="bc-panel vx-panel"
        role="dialog"
        aria-label="Build catalog"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bc-header">
          <h2 className="vx-heading bc-title">Build</h2>
          <div className="bc-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`bc-tab${tab === t.id ? ' bc-tab--active' : ''}`}
                onClick={() => st().setCatalogTab(t.id)}
              >
                {t.label}
                <kbd className="vx-key bc-tab__key">{t.key}</kbd>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="vx-btn vx-btn--ghost bc-close"
            onClick={close}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="bc-body" role="tabpanel">
          {tab === 'buildings' ? (
            <div className="bc-grid">
              {BUILDINGS.filter((b) => !b.upgradeOnly).map((b) => (
                <BuildingCard
                  key={b.id}
                  building={b}
                  materials={materials}
                  onPlace={placeFromCatalog}
                />
              ))}
            </div>
          ) : (
            <BlocksTab
              materials={materials}
              selected={selected}
              onPick={(type) => st().pickBlock(type)}
            />
          )}
        </div>

        <footer className="bc-footer">
          {tab === 'buildings'
            ? 'Pick a blueprint to place it from the plan view (P). Settlers build it.'
            : `Pick a block to hold it, then ${isTouchDevice() ? 'tap' : 'right-click'} to place. Corner number: how many you can afford.`}
          <span className="bc-footer__keys">
            <kbd className="vx-key">B</kbd> / <kbd className="vx-key">Esc</kbd>{' '}
            close
          </span>
        </footer>
      </div>
    </div>
  );
}
