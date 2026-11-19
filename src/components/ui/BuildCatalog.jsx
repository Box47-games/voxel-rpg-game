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
  placementByVolume,
} from '../../data/blockDrops';
import useBuildingLocks from '../../hooks/useBuildingLocks';
import './BuildCatalog.css';
import { blocksAvailable, formatBlocks } from '../../data/pieces';
import { artUrl, materialArt } from './art';
import { blockArt } from './BlockHotbar';

const TABS = [
  { id: 'blocks', label: 'Blocks', key: '1', icon: 'grid' },
  { id: 'buildings', label: 'Buildings', key: '2', icon: 'home' },
];

/** Cost chips with material icons. byVolume: planks, slabs and cubes count toward blocks. */
function Cost({ cost, materials, byVolume = true }) {
  return (
    <span className="bc-cost">
      {Object.entries(cost).map(([mat, qty]) => {
        const have = byVolume ? blocksAvailable(materials, mat) : materials?.[mat] || 0;
        const icon = materialArt(mat);
        return (
          <span key={mat} className={`bc-cost__item${have >= qty ? '' : ' bc-cost__item--short'}`}>
            {icon && <img src={icon} alt="" width="16" height="16" />}
            {formatBlocks(have)}/{qty} {mat}
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
            className={`bc-block${selected === type ? ' bc-block--held' : ''}${count ? '' : ' bc-block--none'}`}
            aria-pressed={selected === type}
            onClick={() => onPick(type)}
          >
            <span className="vx-slot bc-block__slot" aria-hidden="true">
              {blockArt(type) && <img src={blockArt(type)} alt="" />}
              <span className="vx-slot__qty bc-block__count">{count}</span>
            </span>
            <span className="bc-block__text">
              <span className="bc-block__name">{props.name}</span>
              <Cost cost={getPlacementCost(type)} materials={materials} byVolume={placementByVolume(type)} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BuildingCard({ building, materials, onPlace, lock }) {
  const canAfford = Object.entries(building.cost).every(
    ([mat, qty]) => blocksAvailable(materials, mat) >= qty - 1e-9
  );
  const { housing = 0, attractiveness = 0 } = building.effects || {};
  const picture = artUrl('buildings', building.id);
  return (
    <div className={`vx-parch bc-card${lock ? ' bc-card--locked' : ''}`}>
      <div className="bc-card__top">
        {picture && <img className="bc-card__pic" src={picture} alt="" />}
        <div className="bc-card__head">
          <div className="bc-card__name">{building.name}</div>
          <div className="bc-card__meta">
            {housing > 0 && <span>+{housing} housing</span>}
            {attractiveness > 0 && <span>+{attractiveness} appeal</span>}
            <span>{building.size.width}×{building.size.depth}×{building.size.height}</span>
          </div>
        </div>
      </div>
      <div className="bc-card__desc">{building.description}</div>
      <Cost cost={building.cost} materials={materials} />
      {lock ? (
        <div className="bc-card__lock" role="note">
          <span className="vx-tag vx-tag--lock">
            <img src={artUrl('ui', 'lock')} alt="" /> Locked
          </span>
          <span>
            {lock.reason}
            {lock.progress && <span className="bc-card__progress"> ({lock.progress})</span>}
          </span>
        </div>
      ) : (
        <button
          type="button"
          className={`vx-pbtn vx-pbtn--block${canAfford ? ' vx-pbtn--green' : ''}`}
          onClick={() => onPlace(building.id)}
          title={
            canAfford
              ? 'You pay the cost when you place it'
              : 'You pay what you carry; settlers haul the rest from a stockpile'
          }
        >
          {canAfford ? 'Place' : 'Place (short)'}
        </button>
      )}
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
  const locks = useBuildingLocks(isOpen);
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
    <div className="vx-overlay bc-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section className="vx-frame bc-panel" role="dialog" aria-label="Build catalog">
        <h2 className="vx-sign-title bc-title">Build</h2>
        <header className="bc-header">
          <div className="bc-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className="vx-tab"
                onClick={() => st().setCatalogTab(t.id)}
              >
                <img src={artUrl('ui', t.icon)} alt="" />
                {t.label}
                <kbd className="vx-key bc-tab__key">{t.key}</kbd>
              </button>
            ))}
          </div>
          <button type="button" className="vx-tab bc-close" onClick={close} aria-label="Close">
            <img src={artUrl('ui', 'close')} alt="" width="16" height="16" />
          </button>
        </header>

        <div className="bc-body" role="tabpanel">
          {tab === 'buildings' ? (
            <div className="bc-grid">
              {BUILDINGS.filter((b) => !b.upgradeOnly)
                .sort((a, b) => !!locks[a.id] - !!locks[b.id]) // open ones first
                .map((b) => (
                <BuildingCard
                  key={b.id}
                  building={b}
                  materials={materials}
                  lock={locks[b.id]}
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
      </section>
    </div>
  );
}
