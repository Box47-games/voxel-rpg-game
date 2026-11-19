/**
 * BuildingPanel — E key panel for a building: deliver materials to a
 * construction site (with builder and ETA once building), or, for a completed
 * building, see what it does and who lives there, and demolish it.
 */

import React, { useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useGameStore from '../../stores/useGameStore';
import FramedPanel, { NotchedBar } from './FramedPanel';
import { materialArt } from './art';
import { getBuildingById } from '../../data/buildings';
import { getTask } from '../../systems/settlement/TaskAssignmentEngine';
import {
  getConstructionEta,
  siteStage,
  needsMaterials,
  nextCellShortfall,
  getDemolishRefund,
  getFarmsPoweredBy,
  getUpgradeProblem,
} from '../../modules/settlement/buildingInfo';
import { isSettled } from '../../modules/settlement/housing';
import { blocksAvailable, formatBlocks } from '../../data/pieces';

const MATERIAL_COLORS = {
  wood: '#8B4513', stone: '#808080', iron: '#C0C0C0', coal: '#333333',
};

// Tag per stage: a site builds as materials arrive, so it can be waiting part way
const STAGE_BADGE = {
  waiting: { text: 'WAITING', tag: 'vx-tag--lock', bar: '#e8b443' },
  building: { text: 'BUILDING', tag: 'vx-tag--info', bar: '#5b9ae8' },
  complete: { text: 'COMPLETE', tag: 'vx-tag--ready', bar: '#6cbf4a' },
};

function MaterialDeliveryRow({ material, required, delivered, playerQty, siteId }) {
  const deliverToConstruction = useGameStore((s) => s.deliverToConstruction);
  const remaining = required - delivered;
  const canDeliver = remaining > 0 && playerQty > 0;
  const icon = materialArt(material);

  return (
    <div className="fp__row bd-row">
      {icon
        ? <img src={icon} alt="" width="20" height="20" />
        : <span className="fp__swatch" style={{ background: MATERIAL_COLORS[material] || '#888' }} />}
      <span className="fp__grow" style={{ textTransform: 'capitalize' }}>{material}</span>
      <span className={`fp__num ${delivered >= required ? 'fp__good' : 'fp__warn'}`}>{formatBlocks(delivered)}/{required}</span>
      <span className="fp__num fp__dim" title="In your bag">bag {formatBlocks(playerQty)}</span>
      <span className="bd-row__btns">
        <button type="button" className="vx-pbtn vx-pbtn--stone fp__mini" onClick={() => deliverToConstruction(siteId, material, 1)} disabled={!canDeliver}>+1</button>
        <button type="button" className="vx-pbtn vx-pbtn--stone fp__mini" onClick={() => deliverToConstruction(siteId, material, 10)} disabled={!canDeliver || playerQty < 10}>+10</button>
        <button type="button" className="vx-pbtn vx-pbtn--stone fp__mini" onClick={() => deliverToConstruction(siteId, material, remaining)} disabled={!canDeliver}>All&rarr;</button>
      </span>
    </div>
  );
}

/** "Aldric Vane" if a settler is building this site, else null (primitive for cheap selection). */
const selectBuilder = (siteId) => (s) => {
  if (!siteId) return null;
  const npc = s.settlement?.npcs?.find((n) => n.state === 'WORKING_BUILD' && getTask(n.currentTaskId)?.siteId === siteId);
  return npc ? `${npc.fullName}|${npc.skills?.building || 0.5}` : null;
};

/** ["id|name", ...] of settlers living here (useShallow compares the strings). */
const selectResidents = (siteId) => (s) =>
  (s.settlement?.npcs || []).filter((n) => n.homeId && n.homeId === siteId).map((n) => `${n.id}|${n.fullName}`);

function formatEta(seconds) {
  if (seconds == null) return null;
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))}s`;
  return `~${Math.round(seconds / 60)} min`;
}

const formatMaterials = (obj) =>
  Object.entries(obj).map(([m, n]) => `${n} ${m.replace(/_/g, ' ')}`).join(', ');

const selectSettledCount = (s) => (s.settlement?.npcs || []).filter(isSettled).length;

function UpgradeSection({ site, building }) {
  const settledCount = useGameStore(selectSettledCount);
  const constructionSites = useGameStore((s) => s.constructionSites);
  const { upgrade } = building;
  const target = getBuildingById(upgrade.to);
  const cm = useGameStore.getState()._chunkManager;
  const problem = getUpgradeProblem(site, {
    constructionSites,
    settledCount,
    getBlock: cm ? (x, y, z) => cm.getBlock(x, y, z) : null,
  });

  const start = () => {
    const store = useGameStore.getState();
    const why = store.upgradeBuilding(site.id);
    store.addPickupText(why || `Upgrade to ${target.name} started: deliver the materials`, why ? '#ff6666' : '#44aaff');
  };

  const from = building.effects || {};
  const to = target.effects || {};
  return (
    <div className="fp__well">
      <h3 className="fp__h">Upgrade to {target.name}</h3>
      <div className="fp__muted">
        Beds {from.housing || 0} → {to.housing || 0}, attractiveness +{from.attractiveness || 0} → +{to.attractiveness || 0}
      </div>
      <div className="fp__muted" style={{ marginBottom: 8 }}>
        Costs {formatMaterials(upgrade.cost)}; needs {upgrade.settlers} settler{upgrade.settlers === 1 ? '' : 's'}
      </div>
      {problem && <div className="fp__warn" style={{ marginBottom: 8 }}>{problem}</div>}
      <button type="button" className="vx-pbtn vx-pbtn--green vx-pbtn--block" onClick={start} disabled={!!problem}>
        Upgrade
      </button>
    </div>
  );
}

function CompletedBuilding({ site, building, onDemolished }) {
  const residents = useGameStore(useShallow(selectResidents(site.id)));
  const zones = useGameStore((s) => s.zones);
  const [confirming, setConfirming] = useState(false);
  const effects = building.effects || {};
  const refund = getDemolishRefund(building);
  const farms = effects.enablesFarming ? getFarmsPoweredBy(site, zones) : [];

  const openResident = (id) => {
    const store = useGameStore.getState();
    store.closeConstructionPanel();
    store.setActiveNPC(id);
  };

  return (
    <>
      <p className="fp__muted" style={{ margin: 0 }}>{building.description}</p>

      <div className="fp__rows">
        {effects.housing > 0 && (
          <div className="fp__row" style={{ flexWrap: 'wrap' }}>
            <span className="fp__grow">
              Beds: {residents.length} / {effects.housing}
              {residents.length === 0 && <span className="fp__dim"> (empty)</span>}
            </span>
            {residents.length > 0 && (
              <div className="fp__chips" style={{ width: '100%' }}>
                {residents.map((r) => {
                  const [id, name] = r.split('|');
                  return (
                    <button key={id} type="button" className="vx-pbtn vx-pbtn--stone fp__mini" onClick={() => openResident(id)}>
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {effects.enablesFarming && (
          <div className="fp__row">
            {farms.length === 0
              ? 'No farm yet: create a Farm zone (Z) next to this plot'
              : `Powers ${farms.length} farm${farms.length === 1 ? '' : 's'}`}
          </div>
        )}

        {effects.attractiveness > 0 && (
          <div className="fp__row">Attractiveness +{effects.attractiveness}</div>
        )}
      </div>

      {building.upgrade && <UpgradeSection site={site} building={building} />}

      {!confirming ? (
        <button type="button" className="vx-pbtn vx-pbtn--red vx-pbtn--block" onClick={() => setConfirming(true)}>
          Demolish
        </button>
      ) : (
        <div className="fp__well fp__well--danger">
          <p style={{ margin: '0 0 8px' }}>
            Demolish the {building.name}?
            {Object.keys(refund).length > 0 && ` You get back ${formatMaterials(refund)}.`}
            {residents.length > 0 && ` ${residents.length} settler${residents.length === 1 ? ' loses their' : 's lose their'} bed.`}
          </p>
          <div className="fp__btns">
            <button type="button" className="vx-pbtn vx-pbtn--red" onClick={() => onDemolished(useGameStore.getState().demolishBuilding(site.id))}>
              Demolish
            </button>
            <button type="button" className="vx-pbtn vx-pbtn--stone" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function BuildingPanel() {
  const activeSiteId = useGameStore((s) => s.activeConstructionSiteId);
  const constructionSites = useGameStore((s) => s.constructionSites);
  const materials = useGameStore((s) => s.inventory?.materials);
  const closePanel = useGameStore((s) => s.closeConstructionPanel);
  const deliverToConstruction = useGameStore((s) => s.deliverToConstruction);
  const removeConstructionSite = useGameStore((s) => s.removeConstructionSite);
  const addPickupText = useGameStore((s) => s.addPickupText);

  const site = activeSiteId ? constructionSites.find(s => s.id === activeSiteId) : null;
  const building = site ? getBuildingById(site.buildingId) : null;
  const builder = useGameStore(selectBuilder(activeSiteId));

  // Esc closes this panel through the store's backOut (PauseMenu)

  const handleDemolished = useCallback((refund) => {
    if (!refund) return;
    const back = formatMaterials(refund);
    addPickupText(back ? `Demolished: got back ${back}` : 'Demolished', '#ffaa00');
  }, [addPickupText]);

  // Deliver all materials at once
  const handleDeliverAll = useCallback(() => {
    if (!site || !materials || !activeSiteId) return;
    for (const [mat, required] of Object.entries(site.materialsRequired)) {
      const delivered = site.materialsDelivered[mat] || 0;
      const remaining = required - delivered;
      const available = blocksAvailable(materials, mat); // planks and slabs count
      if (remaining > 0 && available > 0) {
        deliverToConstruction(activeSiteId, mat, Math.min(remaining, available));
      }
    }
  }, [activeSiteId, site, materials, deliverToConstruction]);

  // Cancel construction
  const handleCancel = useCallback(() => {
    if (!activeSiteId) return;
    const wasUpgrade = !!site?.upgradeFrom;
    removeConstructionSite(activeSiteId);
    addPickupText(wasUpgrade ? 'Upgrade canceled — materials returned' : 'Construction canceled — materials returned', '#ffaa00');
  }, [activeSiteId, site?.upgradeFrom, removeConstructionSite, addPickupText]);

  if (!activeSiteId || !site || !building) return null;

  // One bar: how much is built. It builds as materials arrive.
  const stage = siteStage(site);
  const badge = STAGE_BADGE[stage];
  const blockPct = site.status === 'COMPLETE' ? 1 : site.totalBlocks > 0 ? site.blocksPlaced / site.totalBlocks : 0;
  const stillNeeded = needsMaterials(site);
  const short = stage === 'waiting' ? nextCellShortfall(site) : null;
  const shortText = short && Object.keys(short).length
    ? Object.entries(short).map(([m, n]) => `${formatBlocks(n)} ${m}`).join(', ')
    : null;

  return (
    <FramedPanel
      title={building.name}
      onClose={closePanel}
      width={480}
      header={(
        <>
          <span className={`vx-tag ${badge.tag}`}>{badge.text}</span>
          {site.upgradeFrom && site.status !== 'COMPLETE' && (
            <span className="fp__sub">upgrading the {getBuildingById(site.upgradeFrom)?.name}</span>
          )}
        </>
      )}
      footer="Press E or Esc to close"
    >
      <div>
        <div className="fp__sub" style={{ marginBottom: 4 }}>
          {site.status === 'COMPLETE' ? 'Complete!' : `Built: ${site.blocksPlaced}/${site.totalBlocks}`}
        </div>
        <NotchedBar value={blockPct} color={badge.bar} label="Built" />
      </div>

      {/* Material delivery: while anything is still to come (building goes on meanwhile) */}
      {stillNeeded && (
        <>
          <div className="fp__rows">
            {Object.entries(site.materialsRequired).map(([mat, req]) => (
              <MaterialDeliveryRow
                key={mat}
                material={mat}
                required={req}
                delivered={site.materialsDelivered[mat] || 0}
                playerQty={blocksAvailable(materials, mat)}
                siteId={activeSiteId}
              />
            ))}
          </div>
          <button type="button" className="vx-pbtn vx-pbtn--green vx-pbtn--block" onClick={handleDeliverAll}>
            Deliver All
          </button>
        </>
      )}

      {stage === 'waiting' && shortText && (
        <p className="fp__warn fp__center" style={{ margin: 0 }}>
          {site.blocksPlaced > 0 ? 'Paused' : 'Not started'}: the next {site.blocksPlaced > 0 ? 'piece' : 'block'} needs {shortText} more
        </p>
      )}

      {stage === 'building' && (() => {
        const [builderName, skill] = builder ? builder.split('|') : [null, null];
        const eta = formatEta(getConstructionEta(site, builder ? Number(skill) : null));
        return (
          <div className="fp__center">
            <div className="fp__info">Building as materials arrive ({site.blocksPlaced}/{site.totalBlocks} placed){eta ? `, ${eta} left` : ''}</div>
            <div className="fp__sub">
              {builderName ? `Builder: ${builderName}` : 'No settler building it: it builds itself slowly'}
            </div>
          </div>
        );
      })()}

      {site.status === 'COMPLETE' && (
        <CompletedBuilding site={site} building={building} onDemolished={handleDemolished} />
      )}

      {/* Cancel button (only for non-complete sites) */}
      {site.status !== 'COMPLETE' && !(site.upgradeFrom && site.status !== 'PLACED') && (
        <button type="button" className="vx-pbtn vx-pbtn--red vx-pbtn--block" onClick={handleCancel}>
          {site.upgradeFrom ? 'Cancel upgrade' : 'Cancel Construction'}
        </button>
      )}
    </FramedPanel>
  );
}
