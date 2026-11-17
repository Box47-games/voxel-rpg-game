/**
 * PlanHUD — the Plan mode (P) overlay: a tool bar (zone painters, delete,
 * building blueprints) along the bottom and a settlement overview at the side.
 * The raised camera itself lives in Player.jsx; zone drawing in
 * ZoneInteraction and building placement in BuildingPlacement.
 *
 * Keys while planning: 1-4 pick a zone tool, 5+ pick a blueprint,
 * Esc steps back (placement → plan → play), P leaves.
 */

import React, { useEffect, useMemo, useState } from 'react';
import useGameStore from '../../stores/useGameStore';
import { ZoneType, ZONE_COLORS } from '../../data/zoneTypes';
import { ZONE_MAX_COUNT } from '../../data/tuning';
import { BUILDINGS } from '../../data/buildings';
import { isTouchDevice } from '../../utils/deviceDetection';
import {
  summarizePopulation,
  summarizeResources,
  summarizeBuildings,
  getAlerts,
} from '../../modules/settlement/settlementSummary';
import './PlanHUD.css';

export const DELETE_TOOL = '__DELETE__';

const ZONE_TOOLS = [
  { type: ZoneType.MINING, label: 'Mining', icon: '⛏' },
  { type: ZoneType.STOCKPILE, label: 'Stockpile', icon: '📦' },
  { type: ZoneType.FARMING, label: 'Farm', icon: '🌱' },
  { type: DELETE_TOOL, label: 'Remove', icon: '🗑' },
];

const BLUEPRINTS = BUILDINGS.filter((b) => !b.upgradeOnly);
const ALERT_COLORS = { danger: '#ff6b6b', warning: '#ffb347', info: '#8ab4ff' };
const REFRESH_MS = 1000;

const canAfford = (building, materials) =>
  Object.entries(building.cost).every(([m, q]) => (materials?.[m] || 0) >= q);

const costText = (cost) =>
  Object.entries(cost)
    .map(([m, q]) => `${q} ${m}`)
    .join(', ');

function selectTool(type) {
  const st = useGameStore.getState();
  st.clearZoneDrag?.();
  st.setZoneMode(true, type);
}

function selectBlueprint(id) {
  const st = useGameStore.getState();
  if (st.placingBuildingId === id) st.cancelPlacingBuilding();
  else st.startPlacingBuilding(id);
}

/** Settlement at a glance, refreshed once a second (settlers move every frame). */
function PlanOverview() {
  const [data, setData] = useState(() => snapshot());
  useEffect(() => {
    const id = setInterval(() => setData(snapshot()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  const pop = useMemo(
    () => summarizePopulation(data.settlement, data.constructionSites),
    [data]
  );
  const res = useMemo(() => summarizeResources(data.zones), [data]);
  const build = useMemo(
    () => summarizeBuildings(data.constructionSites),
    [data]
  );
  const alerts = useMemo(() => getAlerts(data), [data]);
  const founded = !!data.settlement.settlementCenter;

  return (
    <aside className="plan-overview vx-panel" aria-label="Settlement overview">
      <h3 className="plan-overview__title vx-heading">Settlement</h3>
      {!founded ? (
        <p className="plan-overview__empty">
          No settlement yet. Light a campfire to found one.
        </p>
      ) : (
        <>
          <dl className="plan-overview__stats">
            <dt>Settlers</dt>
            <dd>
              {pop.count} / {pop.cap}
            </dd>
            <dt>Beds</dt>
            <dd>
              {pop.beds}
              {pop.homeless > 0 && (
                <span className="plan-overview__warn">
                  {' '}
                  · {pop.homeless} homeless
                </span>
              )}
            </dd>
            <dt>Food</dt>
            <dd
              className={
                res.food === 0 && pop.count > 0
                  ? 'plan-overview__warn'
                  : undefined
              }
            >
              {res.food}
            </dd>
            <dt>Storage</dt>
            <dd>
              {res.stockpiles
                ? `${res.used} / ${res.capacity}`
                : 'no stockpile'}
            </dd>
            <dt>Zones</dt>
            <dd>
              {data.zones.length} / {ZONE_MAX_COUNT}
            </dd>
          </dl>

          {build.inProgress.length > 0 && (
            <div className="plan-overview__section">
              <div className="plan-overview__label">Under construction</div>
              <ul className="plan-overview__sites">
                {build.inProgress.slice(0, 4).map((site) => (
                  <li key={site.id}>
                    <span>{site.name}</span>
                    <span className="plan-overview__dim">
                      {site.status === 'BUILDING'
                        ? `${Math.round(site.progress * 100)}%`
                        : Object.keys(site.missing).length
                          ? `needs ${costText(site.missing)}`
                          : 'waiting'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {alerts.length > 0 && (
            <ul className="plan-overview__alerts">
              {alerts.slice(0, 3).map((a, i) => (
                <li key={i} style={{ '--alert': ALERT_COLORS[a.level] }}>
                  {a.text}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <button
        type="button"
        className="vx-btn vx-btn--ghost vx-btn--block plan-overview__more"
        onClick={() => useGameStore.getState().togglePanel('settlement')}
      >
        Details <kbd className="vx-key">N</kbd>
      </button>
    </aside>
  );
}

function snapshot() {
  const s = useGameStore.getState();
  return {
    settlement: s.settlement,
    zones: s.zones,
    constructionSites: s.constructionSites,
  };
}

export default function PlanHUD() {
  const planMode = useGameStore((s) => s.planMode);
  const zoneMode = useGameStore((s) => s.zoneMode);
  const zoneTool = useGameStore((s) => s.zoneTypeToPlace);
  const placingId = useGameStore((s) => s.placingBuildingId);
  const zoneCount = useGameStore((s) => s.zones.length);
  const materials = useGameStore((s) => s.inventory?.materials);
  const [touch] = useState(isTouchDevice);

  // Number keys pick tools while planning
  useEffect(() => {
    const onKey = (e) => {
      const st = useGameStore.getState();
      if (!st.planMode || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const n = parseInt(e.key, 10);
      if (Number.isNaN(n) || n < 1) return;
      if (n <= ZONE_TOOLS.length) selectTool(ZONE_TOOLS[n - 1].type);
      else if (n - ZONE_TOOLS.length <= BLUEPRINTS.length)
        selectBlueprint(BLUEPRINTS[n - ZONE_TOOLS.length - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!planMode) return null;

  const placing = placingId ? BLUEPRINTS.find((b) => b.id === placingId) : null;
  let hint;
  if (placing) {
    hint = touch
      ? `${placing.name}: tap a spot, tap it again to place`
      : `${placing.name}: click to place · right-click or Esc to cancel`;
    const short = Object.fromEntries(
      Object.entries(placing.cost)
        .map(([m, q]) => [m, q - (materials?.[m] || 0)])
        .filter(([, q]) => q > 0)
    );
    if (Object.keys(short).length) hint += ` · short ${costText(short)}: settlers haul it from a stockpile`;
  } else if (zoneTool === DELETE_TOOL) {
    hint = touch ? 'Tap a zone to remove it' : 'Click a zone to remove it';
  } else {
    hint = touch
      ? 'Tap two corners to mark a zone'
      : 'Drag (or click two corners) to mark a zone · right-click a zone to remove it';
  }

  return (
    <>
      <PlanOverview />
      <div className="plan-bar" role="toolbar" aria-label="Plan tools">
        <div className="plan-bar__frame vx-panel">
          <div className="plan-bar__row">
            <div className="plan-bar__group" aria-label="Zones">
              {ZONE_TOOLS.map((t, i) => {
                const active = zoneMode && zoneTool === t.type;
                const color =
                  t.type === DELETE_TOOL ? '#d9473f' : ZONE_COLORS[t.type].fill;
                return (
                  <button
                    key={t.type}
                    type="button"
                    className={`plan-tool${active ? ' plan-tool--active' : ''}`}
                    style={{ '--tool': color }}
                    aria-pressed={active}
                    aria-label={t.label}
                    onClick={() => selectTool(t.type)}
                    title={`${t.label} (${i + 1})`}
                  >
                    <span className="plan-tool__icon" aria-hidden="true">
                      {t.icon}
                    </span>
                    <span className="plan-tool__label plan-tool__label--zone">
                      {t.label}
                    </span>
                    {!touch && <kbd className="plan-tool__key">{i + 1}</kbd>}
                  </button>
                );
              })}
            </div>
            <div className="plan-bar__divider" aria-hidden="true" />
            <div className="plan-bar__group" aria-label="Buildings">
              {BLUEPRINTS.map((b, i) => {
                const active = placingId === b.id;
                const ok = canAfford(b, materials);
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`plan-tool plan-tool--building${active ? ' plan-tool--active' : ''}${ok ? '' : ' plan-tool--short'}`}
                    style={{ '--tool': '#f2c14e' }}
                    aria-pressed={active}
                    onClick={() => selectBlueprint(b.id)}
                    title={`${b.name} — ${costText(b.cost)}${ok ? '' : ' (short: settlers haul the rest from a stockpile)'}`}
                  >
                    <span className="plan-tool__label">{b.name}</span>
                    {!touch && i + ZONE_TOOLS.length + 1 <= 9 && (
                      <kbd className="plan-tool__key">
                        {i + ZONE_TOOLS.length + 1}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            className="vx-btn vx-btn--danger plan-bar__exit"
            onClick={() => useGameStore.getState().enterMode('play')}
            aria-label="Leave plan mode"
          >
            ✕
          </button>
        </div>
        <div className="plan-bar__hint">
          {hint}
          <span className="plan-bar__count">
            {zoneCount}/{ZONE_MAX_COUNT} zones
          </span>
        </div>
      </div>
    </>
  );
}
