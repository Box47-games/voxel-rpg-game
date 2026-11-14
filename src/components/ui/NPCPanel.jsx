/**
 * NPCPanel — detail view for one settler (E next to an NPC; E, Escape or X closes).
 */

import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useGameStore from '../../stores/useGameStore';
import {
  NPC_HUNGER_CRITICAL,
  NPC_REST_CRITICAL,
  NPC_SOCIAL_CRITICAL,
  NPC_LEAVE_HAPPINESS_THRESHOLD,
  NPC_LEAVE_WARNING_DAYS,
  NPC_LEAVE_DEPARTURE_DAYS,
} from '../../data/tuning';

const ACTIVITY_LABELS = {
  APPROACHING: 'Arriving at the settlement',
  EVALUATING: 'Looking around, deciding whether to stay',
  IDLE: 'Taking a break',
  WANDERING: 'Wandering around',
  EATING: 'Eating',
  SLEEPING: 'Sleeping',
  SOCIALIZING: 'Chatting with neighbours',
  WORKING_MINE: 'Mining',
  WORKING_BUILD: 'Building',
  LEAVING: 'Leaving the settlement',
};

/** Human-readable description of what an NPC is doing. */
export function describeActivity(state, carrying) {
  if (state === 'WORKING_HAUL') {
    return carrying
      ? `Hauling ${carrying.amount} ${carrying.material.replace(/_/g, ' ')}`
      : 'Fetching materials';
  }
  return ACTIVITY_LABELS[state] || (state ? state.toLowerCase().replace(/_/g, ' ') : 'Unknown');
}

/** Mood line, or null when the settler is content. */
export function describeMood(happiness, unhappyDays) {
  if (unhappyDays >= NPC_LEAVE_WARNING_DAYS) {
    const daysLeft = Math.max(0, NPC_LEAVE_DEPARTURE_DAYS - unhappyDays);
    return daysLeft > 0
      ? `Unhappy — may leave in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
      : 'Unhappy — about to leave';
  }
  if (happiness < NPC_LEAVE_HAPPINESS_THRESHOLD) return 'Unhappy';
  return null;
}

// Rounded, position-free slice so the panel doesn't re-render every frame
const selectPanelData = (s) => {
  const id = s.activeNPCId;
  if (!id) return { id: null };
  const npc = s.settlement?.npcs?.find((n) => n.id === id);
  if (!npc) return { id, missing: true };
  const carrying = npc.carryingItem;
  return {
    id,
    name: npc.fullName || 'Settler',
    personality: npc.personality || null,
    preferredJob: npc.preferredJob || null,
    activity: describeActivity(npc.state, carrying),
    hunger: Math.round(npc.hunger ?? 0),
    rest: Math.round(npc.rest ?? 0),
    social: Math.round(npc.social ?? 0),
    happiness: Math.round(npc.happiness ?? 0),
    unhappyDays: npc.unhappyDays ?? 0,
    gathering: Math.round((npc.skills?.gathering ?? 0) * 100),
    mining: Math.round((npc.skills?.mining ?? 0) * 100),
    building: Math.round((npc.skills?.building ?? 0) * 100),
    combat: Math.round((npc.skills?.combat ?? 0) * 100),
  };
};

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function Bar({ label, value, critical, color = '#4488ff' }) {
  const low = value < critical;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: low ? '#ff7777' : '#aaa' }}>
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ width: '100%', height: 7, background: '#222', borderRadius: 4, overflow: 'hidden' }}
      >
        <div style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: '100%',
          background: low ? '#ff4444' : color,
          borderRadius: 4,
        }} />
      </div>
    </div>
  );
}

const sectionTitle = { fontSize: 12, color: '#88aaff', textTransform: 'uppercase', letterSpacing: 1, margin: '12px 0 6px' };

export default function NPCPanel() {
  const data = useGameStore(useShallow(selectPanelData));
  const closePanel = useGameStore((s) => s.closeNPCPanel);

  // The settler left or the save was reloaded
  useEffect(() => {
    if (data.missing) closePanel();
  }, [data.missing, closePanel]);

  useEffect(() => {
    if (!data.id) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closePanel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [data.id, closePanel]);

  if (!data.id || data.missing) return null;

  const mood = describeMood(data.happiness, data.unhappyDays);
  const traits = [
    data.personality && capitalize(data.personality),
    data.preferredJob && `prefers ${data.preferredJob} work`,
  ].filter(Boolean).join(' · ');

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
        aria-label={`Settler ${data.name}`}
        style={{
          background: 'rgba(10, 10, 20, 0.92)',
          border: '2px solid #4488ff',
          borderRadius: 8,
          padding: 16,
          width: '100%',
          maxWidth: 360,
          maxHeight: '80vh',
          overflowY: 'auto',
          boxSizing: 'border-box',
          color: '#eee',
          fontFamily: 'monospace',
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#4488ff' }}>{data.name}</div>
            {traits && <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{traits}</div>}
          </div>
          <button
            onClick={closePanel}
            aria-label="Close"
            style={{
              background: '#333', color: '#fff', border: '1px solid #555',
              borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
              fontFamily: 'monospace', fontSize: 14,
            }}
          >
            X
          </button>
        </div>

        <div style={{ marginTop: 10, fontSize: 14 }}>{data.activity}</div>
        {mood && <div style={{ marginTop: 4, fontSize: 13, color: '#ff7777' }}>{mood}</div>}

        <div style={sectionTitle}>Needs</div>
        <Bar label="Food" value={data.hunger} critical={NPC_HUNGER_CRITICAL} color="#ffcc00" />
        <Bar label="Rest" value={data.rest} critical={NPC_REST_CRITICAL} color="#8844cc" />
        <Bar label="Social" value={data.social} critical={NPC_SOCIAL_CRITICAL} color="#ff88ff" />
        <Bar label="Happiness" value={data.happiness} critical={NPC_LEAVE_HAPPINESS_THRESHOLD} color="#44cc44" />

        <div style={sectionTitle}>Skills</div>
        <Bar label="Gathering" value={data.gathering} critical={0} />
        <Bar label="Mining" value={data.mining} critical={0} />
        <Bar label="Building" value={data.building} critical={0} />
        <Bar label="Combat" value={data.combat} critical={0} />
      </div>
    </div>
  );
}
