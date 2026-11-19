/**
 * SettlementDashboard — Settlement overview (N key or the HUD button):
 * population and settlers, stockpile resources, buildings, and alerts.
 *
 * Always mounted so the N key works; renders nothing while closed. While open
 * it re-reads the store once a second (settler positions change every frame,
 * so a subscription would re-render constantly).
 */

import React, { useEffect, useMemo, useState } from 'react';
import useGameStore from '../../stores/useGameStore';
import FramedPanel from './FramedPanel';
import { useIsMobile } from './BagFrame';
import { artUrl, materialArt } from './art';
import { isTouchDevice } from '../../utils/deviceDetection';
import { describeActivity } from './NPCPanel';
import {
  summarizePopulation,
  summarizeResources,
  summarizeBuildings,
  getAlerts,
} from '../../modules/settlement/settlementSummary';
import { isSettled } from '../../modules/settlement/housing';
import { formatBlocks } from '../../data/pieces';

const REFRESH_MS = 1000;
const TABS = [
  { id: 'population', label: 'Population', icon: 'people' },
  { id: 'resources', label: 'Resources', icon: 'box' },
  { id: 'buildings', label: 'Buildings', icon: 'home' },
  { id: 'alerts', label: 'Alerts', icon: 'alert' },
];
const ALERT_COLORS = { danger: '#d9473f', warning: '#e8b443', info: '#5b9ae8' };
const ALERT_TAG = { danger: 'vx-tag--need', warning: 'vx-tag--lock', info: 'vx-tag--info' };

function snapshot() {
  const s = useGameStore.getState();
  return {
    settlement: s.settlement,
    zones: s.zones,
    constructionSites: s.constructionSites,
  };
}

function HappinessBar({ value }) {
  const v = Math.round(value);
  const color = v < 20 ? '#d9473f' : v < 40 ? '#e8b443' : '#6cbf4a';
  return (
    <span className="dash-happy">
      <span className="vx-nbar fp__nbar-sm" style={{ '--c': color }}><i style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></span>
      <span className="fp__num">{v}</span>
    </span>
  );
}

const SORTS = {
  name: (a, b) => (a.fullName || '').localeCompare(b.fullName || ''),
  activity: (a, b) => describeActivity(a.state, a.carryingItem).localeCompare(describeActivity(b.state, b.carryingItem)),
  happiness: (a, b) => (a.happiness || 0) - (b.happiness || 0),
  home: (a, b) => Number(!!b.homeId) - Number(!!a.homeId),
};

function PopulationTab({ data, onSelectNPC, compact }) {
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const pop = useMemo(() => summarizePopulation(data.settlement, data.constructionSites), [data]);
  const npcs = useMemo(() => {
    const list = [...data.settlement.npcs];
    list.sort((a, b) => SORTS[sort.key](a, b) * sort.dir);
    return list;
  }, [data, sort]);

  const header = (key, label, align = 'left') => (
    <th
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}
      style={{ textAlign: align, opacity: sort.key === key ? 1 : 0.7 }}
      aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
    >
      {label}{sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div>
      <div className="fp__tiles">
        {/* Before a campfire founds the settlement there's no cap to count against */}
        <Stat label="Settlers" value={data.settlement?.settlementCenter ? `${pop.count} / ${pop.cap}` : '—'} />
        <Stat label="Beds" value={`${pop.beds}${pop.homeless ? ` (${pop.homeless} homeless)` : ''}`} />
        <Stat label="Happiness" value={pop.avgHappiness == null ? '—' : <HappinessBar value={pop.avgHappiness} />} />
      </div>
      <p className="fp__muted">{pop.immigration}</p>

      {npcs.length === 0 ? (
        <p className="fp__muted">No settlers yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="fp__table">
            <thead>
              <tr>
                {header('name', 'Name')}
                {header('activity', 'Doing')}
                {header('happiness', 'Happiness', 'right')}
                {header('home', 'Home')}
              </tr>
            </thead>
            <tbody>
              {npcs.map((npc) => (
                <tr key={npc.id} className="is-click" onClick={() => onSelectNPC(npc.id)} title="Show details">
                  <td style={{ whiteSpace: 'nowrap' }}>{npc.fullName}</td>
                  <td className="fp__muted">{describeActivity(npc.state, npc.carryingItem)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {!isSettled(npc) ? '—' : compact ? Math.round(npc.happiness || 0) : <HappinessBar value={npc.happiness || 0} />}
                  </td>
                  <td className={npc.homeId || !isSettled(npc) ? 'fp__muted' : 'fp__warn'}>
                    {isSettled(npc) ? (npc.homeId ? 'Housed' : 'Homeless') : 'Arriving'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResourcesTab({ data }) {
  const res = useMemo(() => summarizeResources(data.zones), [data]);
  if (res.stockpiles === 0) {
    return <p className="fp__muted">No stockpiles yet. Create a Stockpile zone (Z) so settlers have somewhere to store goods.</p>;
  }
  return (
    <div>
      <div className="fp__tiles" style={{ marginBottom: 10 }}>
        <Stat label="Stockpiles" value={res.stockpiles} />
        <Stat label="Storage used" value={`${res.used} / ${res.capacity}`} />
        <Stat label="Food" value={res.food} />
      </div>
      {res.items.length === 0 ? (
        <p className="fp__muted">The stockpiles are empty.</p>
      ) : (
        <table className="fp__table">
          <tbody>
            {res.items.map((item) => (
              <tr key={item.material}>
                <td style={{ textTransform: 'capitalize' }}>
                  <span className="dash-mat">
                    {materialArt(item.material) && <img src={materialArt(item.material)} alt="" width="20" height="20" />}
                    {item.material.replace(/_/g, ' ')}
                    {item.isFood ? <span className="vx-tag vx-tag--ready vx-tag--sm">food</span> : null}
                  </span>
                </td>
                <td className="fp__num" style={{ textAlign: 'right' }}>{item.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BuildingsTab({ data }) {
  const b = useMemo(() => summarizeBuildings(data.constructionSites), [data]);
  if (b.completed.length === 0 && b.inProgress.length === 0) {
    return <p className="fp__muted">No buildings yet. Open the building catalog with B.</p>;
  }
  return (
    <div>
      <h3 className="fp__h" style={{ marginTop: 0 }}>Completed</h3>
      {b.completed.length === 0 ? <p className="fp__muted">None yet.</p> : (
        <div className="fp__tiles" style={{ marginBottom: 6 }}>
          {b.completed.map((c) => <Stat key={c.name} label={c.name} value={c.count} />)}
        </div>
      )}
      <h3 className="fp__h">Under construction</h3>
      {b.inProgress.length === 0 ? <p className="fp__muted">Nothing being built.</p> : b.inProgress.map((site) => {
        const missing = Object.entries(site.missing);
        return (
          <div key={site.id} className="fp__row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{site.name}</span>
              <span className="fp__muted">
                {`${Math.round(site.progress * 100)}% built`}{site.stage === 'waiting' ? (site.progress > 0 ? ', paused' : ', waiting') : ''}
              </span>
            </div>
            {missing.length > 0 && (
              <div className="fp__sub">
                Still needs {missing.map(([m, n]) => `${formatBlocks(n)} ${m.replace(/_/g, ' ')}`).join(', ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AlertsTab({ alerts }) {
  if (alerts.length === 0) return <p className="fp__good">All quiet. Nothing needs your attention.</p>;
  return (
    <ul className="dash-alerts">
      {alerts.map((a, i) => (
        <li key={i} className="fp__well" style={{ borderLeftColor: ALERT_COLORS[a.level] }}>
          <span className={`vx-tag vx-tag--sm ${ALERT_TAG[a.level] || 'vx-tag--info'}`}>{a.level}</span>
          <span>{a.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }) {
  return (
    <div className="fp__tile">
      <div className="fp__tile-label">{label}</div>
      <div className="fp__tile-value">{value}</div>
    </div>
  );
}

export default function SettlementDashboard() {
  const open = useGameStore((s) => s.settlementDashboardOpen);
  const toggle = useGameStore((s) => s.toggleSettlementDashboard);
  const close = useGameStore((s) => s.closeSettlementDashboard);
  const isMobile = useIsMobile();
  const [tab, setTab] = useState('population');
  const [data, setData] = useState(null);

  // N toggles (not while typing in a field); Esc is handled centrally (backOut)
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, close]);

  useEffect(() => {
    if (!open) return undefined;
    setData(snapshot());
    const id = setInterval(() => setData(snapshot()), REFRESH_MS);
    return () => clearInterval(id);
  }, [open]);

  const alerts = useMemo(() => (data ? getAlerts(data) : []), [data]);

  if (!open || !data) return null;

  const selectNPC = (id) => {
    close();
    useGameStore.getState().setActiveNPC(id);
  };

  return (
    <FramedPanel
      title="Settlement"
      label="Settlement dashboard"
      onClose={close}
      modal
      width={760}
      className="dash"
      header={(
        <div role="tablist" className="fp__tabs dash__tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className="vx-tab"
              onClick={() => setTab(t.id)}
            >
              <img src={artUrl('ui', t.icon)} alt="" width="16" height="16" />
              {t.label}
              {t.id === 'alerts' && alerts.length > 0 && (
                <span className={`vx-tag vx-tag--sm ${ALERT_TAG[alerts[0].level] || 'vx-tag--info'}`}>{alerts.length}</span>
              )}
            </button>
          ))}
        </div>
      )}
      footer={alerts[0]?.text ? `Tip: ${alerts[0].text}` : isTouchDevice() ? 'Tap ✕ to close' : 'Press N or Esc to close'}
    >
      {tab === 'population' && <PopulationTab data={data} onSelectNPC={selectNPC} compact={isMobile} />}
      {tab === 'resources' && <ResourcesTab data={data} />}
      {tab === 'buildings' && <BuildingsTab data={data} />}
      {tab === 'alerts' && <AlertsTab alerts={alerts} />}
    </FramedPanel>
  );
}
