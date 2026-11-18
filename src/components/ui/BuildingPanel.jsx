/**
 * BuildingPanel — E key panel for a building: deliver materials to a
 * construction site (with builder and ETA once building), or, for a completed
 * building, see what it does and who lives there, and demolish it.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useGameStore from '../../stores/useGameStore';
import { getBuildingById } from '../../data/buildings';
import { getTask } from '../../systems/settlement/TaskAssignmentEngine';
import {
  getConstructionEta,
  getDemolishRefund,
  getFarmsPoweredBy,
  getUpgradeProblem,
} from '../../modules/settlement/buildingInfo';
import { isSettled } from '../../modules/settlement/housing';
import { blocksAvailable, formatBlocks } from '../../data/pieces';

const MATERIAL_COLORS = {
  wood: '#8B4513', stone: '#808080', iron: '#C0C0C0', coal: '#333333',
};

const STATUS_COLORS = {
  PLACED: '#ffaa00',
  BUILDING: '#44aaff',
  COMPLETE: '#44ff44',
};

function MaterialDeliveryRow({ material, required, delivered, playerQty, siteId }) {
  const deliverToConstruction = useGameStore((s) => s.deliverToConstruction);
  const remaining = required - delivered;

  const btnStyle = (enabled) => ({
    padding: '4px 8px',
    minWidth: 36,
    background: enabled ? '#444' : '#2a2a2a',
    color: enabled ? '#fff' : '#666',
    border: '1px solid #555',
    borderRadius: 3,
    cursor: enabled ? 'pointer' : 'default',
    fontFamily: 'monospace',
    fontSize: 13,
    touchAction: 'manipulation',
  });

  const canDeliver = remaining > 0 && playerQty > 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid #333' }}>
      <div style={{
        width: 14, height: 14, borderRadius: 2,
        background: MATERIAL_COLORS[material] || '#888',
        flexShrink: 0,
      }} />
      <div style={{ width: 60, fontWeight: 'bold', textTransform: 'capitalize', fontSize: 13 }}>
        {material}
      </div>
      <div style={{ width: 65, textAlign: 'right', fontSize: 12, color: delivered >= required ? '#44ff44' : '#ffaa00' }}>
        {formatBlocks(delivered)}/{required}
      </div>
      <div style={{ width: 45, textAlign: 'right', color: '#aaa', fontSize: 12 }}>
        inv:{formatBlocks(playerQty)}
      </div>

      <button style={btnStyle(canDeliver)} onClick={() => deliverToConstruction(siteId, material, 1)} disabled={!canDeliver}>+1</button>
      <button style={btnStyle(canDeliver && playerQty >= 10)} onClick={() => deliverToConstruction(siteId, material, 10)} disabled={!canDeliver || playerQty < 10}>+10</button>
      <button style={btnStyle(canDeliver)} onClick={() => deliverToConstruction(siteId, material, remaining)} disabled={!canDeliver}>All&rarr;</button>
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
    <div style={{ marginTop: 12, padding: 8, border: '1px solid #345', borderRadius: 4, fontSize: 13 }}>
      <div style={{ color: '#88aaff', marginBottom: 4 }}>Upgrade to {target.name}</div>
      <div style={{ color: '#aaa', fontSize: 12 }}>
        Beds {from.housing || 0} → {to.housing || 0}, attractiveness +{from.attractiveness || 0} → +{to.attractiveness || 0}
      </div>
      <div style={{ color: '#aaa', fontSize: 12, marginBottom: 8 }}>
        Costs {formatMaterials(upgrade.cost)}; needs {upgrade.settlers} settler{upgrade.settlers === 1 ? '' : 's'}
      </div>
      {problem && <div style={{ color: '#ffb347', fontSize: 12, marginBottom: 8 }}>{problem}</div>}
      <button
        onClick={start}
        disabled={!!problem}
        style={{
          width: '100%', padding: '6px 0', borderRadius: 4, fontFamily: 'monospace', fontSize: 13, touchAction: 'manipulation',
          background: problem ? '#2a2a2a' : '#2a3a5a', color: problem ? '#666' : '#9cf',
          border: '1px solid #456', cursor: problem ? 'default' : 'pointer',
        }}
      >
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

  const row = { fontSize: 13, padding: '4px 0', borderBottom: '1px solid #333' };
  return (
    <div>
      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>{building.description}</div>

      {effects.housing > 0 && (
        <div style={row}>
          Beds: {residents.length} / {effects.housing}
          {residents.length === 0 ? <span style={{ color: '#888' }}> (empty)</span> : (
            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {residents.map((r) => {
                const [id, name] = r.split('|');
                return (
                  <button
                    key={id}
                    onClick={() => openResident(id)}
                    style={{ background: '#223', color: '#9cf', border: '1px solid #345', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12 }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {effects.enablesFarming && (
        <div style={row}>
          {farms.length === 0
            ? 'No farm yet: create a Farm zone (Z) next to this plot'
            : `Powers ${farms.length} farm${farms.length === 1 ? '' : 's'}`}
        </div>
      )}

      {effects.attractiveness > 0 && (
        <div style={row}>Attractiveness +{effects.attractiveness}</div>
      )}

      {building.upgrade && <UpgradeSection site={site} building={building} />}

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          style={{ marginTop: 12, width: '100%', padding: '6px 0', background: '#4a2a2a', color: '#ff8888', border: '1px solid #6a4a4a', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', fontSize: 13, touchAction: 'manipulation' }}
        >
          Demolish
        </button>
      ) : (
        <div style={{ marginTop: 12, padding: 8, border: '1px solid #6a4a4a', borderRadius: 4, fontSize: 13 }}>
          <div style={{ marginBottom: 8 }}>
            Demolish the {building.name}?
            {Object.keys(refund).length > 0 && ` You get back ${formatMaterials(refund)}.`}
            {residents.length > 0 && ` ${residents.length} settler${residents.length === 1 ? ' loses their' : 's lose their'} bed.`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onDemolished(useGameStore.getState().demolishBuilding(site.id))}
              style={{ flex: 1, padding: '6px 0', background: '#7a2a2a', color: '#fff', border: '1px solid #a44', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace' }}
            >
              Demolish
            </button>
            <button
              onClick={() => setConfirming(false)}
              style={{ flex: 1, padding: '6px 0', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace' }}
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
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

  // Close on Escape key
  useEffect(() => {
    if (!activeSiteId) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closePanel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeSiteId, closePanel]);

  // Auto-close and notify when the last material arrives (PLACED → BUILDING),
  // not when the panel is opened on a site that is already being built
  const prevStatus = useRef(null);
  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = site ? `${activeSiteId}:${site.status}` : null;
    if (site?.status === 'BUILDING' && prev === `${activeSiteId}:PLACED`) {
      addPickupText('Construction started!', '#44aaff');
      closePanel();
    }
  }, [site, site?.status, activeSiteId, addPickupText, closePanel]);

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

  // Calculate overall delivery progress
  let totalRequired = 0;
  let totalDelivered = 0;
  for (const [mat, req] of Object.entries(site.materialsRequired)) {
    totalRequired += req;
    totalDelivered += Math.min(site.materialsDelivered[mat] || 0, req);
  }
  const deliveryPct = totalRequired > 0 ? totalDelivered / totalRequired : 0;

  // Block progress for BUILDING status
  const blockPct = site.totalBlocks > 0 ? site.blocksPlaced / site.totalBlocks : 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        pointerEvents: 'none',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div
        role="dialog"
        aria-label={building.name}
        style={{
          background: 'rgba(10, 10, 20, 0.92)',
          border: '2px solid #4488ff',
          borderRadius: 8,
          padding: 16,
          width: '100%',
          maxWidth: 480,
          boxSizing: 'border-box',
          overflowY: 'auto',
          maxHeight: '80vh',
          color: '#eee',
          fontFamily: 'monospace',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: 16, fontWeight: 'bold', color: '#4488ff' }}>{building.name}</span>
            {site.upgradeFrom && site.status !== 'COMPLETE' && (
              <span style={{ marginLeft: 6, fontSize: 11, color: '#aaa' }}>
                upgrading the {getBuildingById(site.upgradeFrom)?.name}
              </span>
            )}
            <span style={{
              marginLeft: 8,
              fontSize: 11,
              padding: '2px 6px',
              borderRadius: 3,
              background: STATUS_COLORS[site.status] || '#555',
              color: '#000',
              fontWeight: 'bold',
            }}>
              {site.status}
            </span>
          </div>
          <button
            onClick={closePanel}
            style={{
              background: '#333', color: '#fff', border: '1px solid #555',
              borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
              fontFamily: 'monospace', fontSize: 14,
            }}
          >
            X
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 3 }}>
            {site.status === 'PLACED' ? `Materials: ${totalDelivered}/${totalRequired}` :
             site.status === 'BUILDING' ? `Blocks: ${site.blocksPlaced}/${site.totalBlocks}` :
             'Complete!'}
          </div>
          <div style={{ width: '100%', height: 8, background: '#222', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${(site.status === 'BUILDING' ? blockPct : deliveryPct) * 100}%`,
              height: '100%',
              background: site.status === 'COMPLETE' ? '#44ff44' : site.status === 'BUILDING' ? '#44aaff' : '#ffaa00',
              borderRadius: 4,
              transition: 'width 0.2s',
            }} />
          </div>
        </div>

        {/* Material delivery (only for PLACED status) */}
        {site.status === 'PLACED' && (
          <>
            <div style={{ overflowY: 'auto', maxHeight: '40vh' }}>
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

            {/* Bulk deliver */}
            <button
              onClick={handleDeliverAll}
              style={{
                marginTop: 8, padding: '6px 0', background: '#2a4a2a', color: '#88ff88',
                border: '1px solid #4a6a4a', borderRadius: 4, cursor: 'pointer',
                fontFamily: 'monospace', fontSize: 13, touchAction: 'manipulation',
              }}
            >
              Deliver All
            </button>
          </>
        )}

        {site.status === 'BUILDING' && (() => {
          const [builderName, skill] = builder ? builder.split('|') : [null, null];
          const eta = formatEta(getConstructionEta(site, builder ? Number(skill) : null));
          return (
            <div style={{ padding: 10, color: '#44aaff', fontSize: 13, textAlign: 'center' }}>
              <div>Construction in progress ({site.blocksPlaced}/{site.totalBlocks} blocks){eta ? `, ${eta} left` : ''}</div>
              <div style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>
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
          <button
            onClick={handleCancel}
            style={{
              marginTop: 8, padding: '6px 0', background: '#4a2a2a', color: '#ff8888',
              border: '1px solid #6a4a4a', borderRadius: 4, cursor: 'pointer',
              fontFamily: 'monospace', fontSize: 13, touchAction: 'manipulation',
            }}
          >
            {site.upgradeFrom ? 'Cancel upgrade' : 'Cancel Construction'}
          </button>
        )}

        {/* Footer */}
        <div style={{ marginTop: 8, fontSize: 11, color: '#666', textAlign: 'center' }}>
          Press E or Escape to close
        </div>
      </div>
    </div>
  );
}
