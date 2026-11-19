/**
 * NPCPanel — detail view for one settler (E next to an NPC; E, Escape or X closes).
 */

import React, { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useGameStore from '../../stores/useGameStore';
import FramedPanel from './FramedPanel';
import { artUrl } from './art';
import { getBuildingById } from '../../data/buildings';
import { isSettled } from '../../modules/settlement/housing';
import { getScheduleBlock, getTimeOfDay } from '../../modules/settlement/schedule';
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
  WORKING_FARM: 'Tending the farm',
  WORKING_CHOP: 'Felling a tree',
  WORKING_FORAGE: 'Picking berries',
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

/** "Lives in a Wooden Shelter", "Homeless — sleeps by the campfire", or null before joining. */
export function describeHome(npc, constructionSites) {
  if (!isSettled(npc)) return null;
  if (npc.homeId) {
    const site = constructionSites?.find((c) => c.id === npc.homeId);
    const building = site ? getBuildingById(site.buildingId) : null;
    if (building) return `Lives in a ${building.name}`;
  }
  return 'Homeless — sleeps by the campfire';
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
    home: describeHome(npc, s.constructionSites),
    schedule: isSettled(npc) ? getScheduleBlock(getTimeOfDay(s.worldTime), npc.personality).label : null,
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

function Bar({ label, value, critical, color = '#5b9ae8' }) {
  const low = value < critical;
  return (
    <div className="npc-bar">
      <div className={`npc-bar__label${low ? ' fp__bad' : ''}`}>
        <span>{label}</span>
        <span className="fp__num">{value}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        className="vx-nbar fp__nbar-sm"
        style={{ '--c': low ? '#d9473f' : color }}
      >
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export default function NPCPanel() {
  const data = useGameStore(useShallow(selectPanelData));
  const closePanel = useGameStore((s) => s.closeNPCPanel);

  // The settler left or the save was reloaded
  useEffect(() => {
    if (data.missing) closePanel();
  }, [data.missing, closePanel]);

  // Esc closes this panel through the store's backOut (PauseMenu)

  if (!data.id || data.missing) return null;

  const mood = describeMood(data.happiness, data.unhappyDays);
  const traits = [
    data.personality && capitalize(data.personality),
    data.preferredJob && `prefers ${data.preferredJob} work`,
  ].filter(Boolean).join(' · ');

  const portrait = artUrl('portraits', `settler-${data.preferredJob}`) || artUrl('portraits', 'settler-gatherer');

  return (
    <FramedPanel title={data.name} label={`Settler ${data.name}`} onClose={closePanel} width={400}>
      <div className="npc-top">
        {portrait && <img className="npc-top__portrait" src={portrait} alt="" />}
        <div className="npc-top__text">
          {traits && <div className="fp__sub">{traits}</div>}
          <div>
            {data.activity}
            {data.schedule && <span className="fp__dim"> · {data.schedule}</span>}
          </div>
          {data.home && <div className={data.home.startsWith('Homeless') ? 'fp__warn' : 'fp__muted'}>{data.home}</div>}
          {mood && <div className="fp__bad">{mood}</div>}
        </div>
      </div>

      <h3 className="fp__h">Needs</h3>
      <Bar label="Food" value={data.hunger} critical={NPC_HUNGER_CRITICAL} color="#e0913a" />
      <Bar label="Rest" value={data.rest} critical={NPC_REST_CRITICAL} color="#8a55d8" />
      <Bar label="Social" value={data.social} critical={NPC_SOCIAL_CRITICAL} color="#d872c9" />
      <Bar label="Happiness" value={data.happiness} critical={NPC_LEAVE_HAPPINESS_THRESHOLD} color="#6cbf4a" />

      <h3 className="fp__h">Skills</h3>
      <Bar label="Gathering" value={data.gathering} critical={0} />
      <Bar label="Mining" value={data.mining} critical={0} />
      <Bar label="Building" value={data.building} critical={0} />
      <Bar label="Combat" value={data.combat} critical={0} />
    </FramedPanel>
  );
}
