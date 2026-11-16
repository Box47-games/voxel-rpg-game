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
import { describeActivity } from './NPCPanel';
import {
  summarizePopulation,
  summarizeResources,
  summarizeBuildings,
  getAlerts,
} from '../../modules/settlement/settlementSummary';
import { isSettled } from '../../modules/settlement/housing';

const REFRESH_MS = 1000;
const TABS = [
  { id: 'population', label: 'Population', icon: '👥' },
  { id: 'resources', label: 'Resources', icon: '📦' },
  { id: 'buildings', label: 'Buildings', icon: '🏠' },
  { id: 'alerts', label: 'Alerts', icon: '⚠️' },
];
const ALERT_COLORS = { danger: '#ff6b6b', warning: '#ffb347', info: '#8ab4ff' };

const C = {
  panel: 'rgba(10, 10, 20, 0.95)',
  border: '#4488ff',
  text: '#eee',
  dim: '#999',
  rowAlt: 'rgba(255,255,255,0.04)',
};

function snapshot() {
  const s = useGameStore.getState();
  return {
    settlement: s.settlement,
    zones: s.zones,
    constructionSites: s.constructionSites,
  };
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth <= 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return mobile;
}

function HappinessBar({ value }) {
  const v = Math.round(value);
  const color = v < 20 ? '#ff4444' : v < 40 ? '#ffaa00' : '#44cc44';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 60, height: 7, background: '#222', borderRadius: 4, overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', width: `${Math.max(0, Math.min(100, v))}%`, height: '100%', background: color }} />
      </span>
      <span style={{ minWidth: 24, textAlign: 'right' }}>{v}</span>
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
      style={{ textAlign: align, padding: '6px 8px', cursor: 'pointer', color: sort.key === key ? '#88aaff' : C.dim, fontWeight: 'normal', whiteSpace: 'nowrap' }}
      aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
    >
      {label}{sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Stat label="Settlers" value={`${pop.count} / ${pop.cap}`} />
        <Stat label="Beds" value={`${pop.beds}${pop.homeless ? ` (${pop.homeless} homeless)` : ''}`} />
        <Stat label="Happiness" value={pop.avgHappiness == null ? '—' : <HappinessBar value={pop.avgHappiness} />} />
      </div>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 12 }}>{pop.immigration}</div>

      {npcs.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 13 }}>No settlers yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {header('name', 'Name')}
                {header('activity', 'Doing')}
                {header('happiness', 'Happiness', 'right')}
                {header('home', 'Home')}
              </tr>
            </thead>
            <tbody>
              {npcs.map((npc, i) => (
                <tr
                  key={npc.id}
                  onClick={() => onSelectNPC(npc.id)}
                  style={{ background: i % 2 ? C.rowAlt : 'transparent', cursor: 'pointer' }}
                  title="Show details"
                >
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{npc.fullName}</td>
                  <td style={{ padding: '6px 8px', color: C.dim }}>{describeActivity(npc.state, npc.carryingItem)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    {!isSettled(npc) ? '—' : compact ? Math.round(npc.happiness || 0) : <HappinessBar value={npc.happiness || 0} />}
                  </td>
                  <td style={{ padding: '6px 8px', color: npc.homeId ? C.dim : '#ffb347' }}>
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
    return <div style={{ color: C.dim, fontSize: 13 }}>No stockpiles yet. Create a Stockpile zone (Z) so settlers have somewhere to store goods.</div>;
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Stat label="Stockpiles" value={res.stockpiles} />
        <Stat label="Storage used" value={`${res.used} / ${res.capacity}`} />
        <Stat label="Food" value={res.food} />
      </div>
      {res.items.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 13 }}>The stockpiles are empty.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {res.items.map((item, i) => (
              <tr key={item.material} style={{ background: i % 2 ? C.rowAlt : 'transparent' }}>
                <td style={{ padding: '6px 8px', textTransform: 'capitalize' }}>
                  {item.material.replace(/_/g, ' ')}{item.isFood ? <span style={{ color: '#44cc44', fontSize: 11 }}> food</span> : null}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{item.amount}</td>
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
    return <div style={{ color: C.dim, fontSize: 13 }}>No buildings yet. Open the building catalog with B.</div>;
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: '#88aaff', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>Completed</div>
      {b.completed.length === 0 ? <div style={{ color: C.dim, fontSize: 13 }}>None yet.</div> : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {b.completed.map((c) => <Stat key={c.name} label={c.name} value={c.count} />)}
        </div>
      )}
      <div style={{ fontSize: 12, color: '#88aaff', textTransform: 'uppercase', letterSpacing: 1, margin: '12px 0 6px' }}>Under construction</div>
      {b.inProgress.length === 0 ? <div style={{ color: C.dim, fontSize: 13 }}>Nothing being built.</div> : b.inProgress.map((site) => {
        const missing = Object.entries(site.missing);
        return (
          <div key={site.id} style={{ marginBottom: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{site.name}</span>
              <span style={{ color: C.dim }}>
                {site.status === 'BUILDING' ? `${Math.round(site.progress * 100)}% built` : 'Collecting materials'}
              </span>
            </div>
            {site.status === 'PLACED' && missing.length > 0 && (
              <div style={{ color: C.dim, fontSize: 12 }}>
                Needs {missing.map(([m, n]) => `${n} ${m.replace(/_/g, ' ')}`).join(', ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AlertsTab({ alerts }) {
  if (alerts.length === 0) return <div style={{ color: '#44cc44', fontSize: 13 }}>All quiet. Nothing needs your attention.</div>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {alerts.map((a, i) => (
        <li key={i} style={{ padding: '8px 10px', marginBottom: 6, borderLeft: `3px solid ${ALERT_COLORS[a.level]}`, background: C.rowAlt, fontSize: 13 }}>
          {a.text}
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '8px 10px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 16, marginTop: 2 }}>{value}</div>
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
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? 0 : 16, boxSizing: 'border-box',
      }}
    >
      <div
        role="dialog"
        aria-label="Settlement dashboard"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.panel, color: C.text, fontFamily: 'monospace',
          border: isMobile ? 'none' : `2px solid ${C.border}`, borderRadius: isMobile ? 0 : 8,
          width: '100%', maxWidth: isMobile ? '100%' : 720,
          height: isMobile ? '100%' : 'min(560px, 85vh)',
          display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #333' }}>
          <span style={{ fontSize: 18, fontWeight: 'bold', color: C.border }}>Settlement</span>
          <button
            onClick={close}
            aria-label="Close"
            style={{ background: '#333', color: '#fff', border: '1px solid #555', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 14 }}
          >
            X
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', flex: 1, minHeight: 0 }}>
          <div
            role="tablist"
            style={{
              display: 'flex', flexDirection: isMobile ? 'row' : 'column',
              borderRight: isMobile ? 'none' : '1px solid #333', borderBottom: isMobile ? '1px solid #333' : 'none',
              padding: 8, gap: 4, flexShrink: 0, overflowX: 'auto',
            }}
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: tab === t.id ? 'rgba(68,136,255,0.25)' : 'transparent',
                  color: tab === t.id ? '#fff' : C.dim,
                  border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace', whiteSpace: 'nowrap',
                  // Phones: four equal columns, icon over a small label
                  ...(isMobile
                    ? { flex: 1, padding: '6px 2px', fontSize: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }
                    : { padding: '8px 10px', fontSize: 13, textAlign: 'left' }),
                }}
              >
                <span style={isMobile ? { fontSize: 16 } : undefined}>{t.icon}</span>{isMobile ? '' : ' '}{t.label}
                {t.id === 'alerts' && alerts.length > 0 && (
                  <span style={{ marginLeft: 6, background: ALERT_COLORS[alerts[0].level], color: '#111', borderRadius: 8, padding: '0 6px', fontSize: 11 }}>
                    {alerts.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16, minWidth: 0 }}>
            {tab === 'population' && <PopulationTab data={data} onSelectNPC={selectNPC} compact={isMobile} />}
            {tab === 'resources' && <ResourcesTab data={data} />}
            {tab === 'buildings' && <BuildingsTab data={data} />}
            {tab === 'alerts' && <AlertsTab alerts={alerts} />}
          </div>
        </div>

        <div style={{ padding: '8px 16px', borderTop: '1px solid #333', fontSize: 12, color: C.dim }}>
          {alerts[0]?.text ? `Tip: ${alerts[0].text}` : 'Press N to close'}
        </div>
      </div>
    </div>
  );
}
