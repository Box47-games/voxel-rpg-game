/**
 * GameUI.jsx — The HTML overlay: the start screen while gameState is
 * 'intro', and the HUD while playing.
 *
 * HUD layout:
 *  - top left: level/XP and vitals (health, mana, stamina, hunger, rage)
 *  - top right: clock with a day-cycle strip, gold, potions, combat stats
 *  - top center: build/plan mode badge
 *  - bottom left: action bar (inventory, crafting, build, zones, settlement)
 * Styles live in GameUI.css on top of the shared styles/voxel-ui.css.
 */

import React, { useState, useEffect } from 'react';
import { isTool, isBroken, getDurability } from '../systems/tools/toolDurability';
import {
  Heart,
  Zap,
  Package,
  Activity,
  Flame,
  Hammer,
  Pickaxe,
  MapPin,
  Users,
  Drumstick,
  Coins,
  FlaskConical,
  Sun,
  Moon,
  Sword,
  Shield,
  Home,
} from 'lucide-react';
import useGameStore, { selectPlayerStats } from '../stores/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { getTotalStats } from '../utils/equipmentStats';
import { isTouchDevice } from '../utils/deviceDetection';
import StatBarWithTooltip from './ui/StatBarWithTooltip';
import StartScreen from './ui/StartScreen';
import { useStatBreakdown } from '../hooks/useStatBreakdown';
import { SUNRISE_START, SUNRISE_END, SUNSET_START, SUNSET_END } from '../data/tuning';
import './GameUI.css';

const pad2 = (n) => String(n).padStart(2, '0');

// The clock strip: night, sunrise, day, sunset, night across one day
const pct = (t) => `${(t * 100).toFixed(1)}%`;
const DAY_STRIP = `linear-gradient(90deg,
  #1d2550 0%, #1d2550 ${pct(SUNRISE_START)},
  #e98a5a ${pct((SUNRISE_START + SUNRISE_END) / 2)},
  #79c3ee ${pct(SUNRISE_END)}, #79c3ee ${pct(SUNSET_START)},
  #e9785a ${pct((SUNSET_START + SUNSET_END) / 2)},
  #1d2550 ${pct(SUNSET_END)}, #1d2550 100%)`;

function pressKey(key) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

function togglePlanMode() {
  if (document.pointerLockElement) document.exitPointerLock();
  useGameStore.getState().enterMode('plan');
}

/** One square button on the action bar. */
const ActionSlot = ({ icon: Icon, label, hotkey, color, active = false, compact, onClick }) => (
  <button
    type="button"
    className={`hud-slot${active ? ' hud-slot--active' : ''}`}
    style={{ '--slot': color }}
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={`${label} [${hotkey}]`}
  >
    <Icon className="hud-slot__icon" aria-hidden="true" />
    {!compact && <span className="hud-slot__label">{label}</span>}
    {!compact && <kbd className="hud-slot__key">{hotkey}</kbd>}
  </button>
);

/** Clock with a strip showing where in the day/night cycle we are. */
const Clock = ({ worldTime, compact }) => {
  const dayFraction = ((worldTime.hour ?? 0) * 60 + (worldTime.minute ?? 0)) / 1440;
  const twilight = worldTime.period === 'dawn' || worldTime.period === 'dusk';
  const TimeIcon = worldTime.isNight ? Moon : Sun;
  return (
    <div className="hud-clock">
      <div className="hud-clock__row">
        <TimeIcon
          className="hud-clock__icon"
          style={{ color: worldTime.isNight ? '#a9b4ff' : twilight ? '#ffaa66' : '#ffd43b' }}
          aria-hidden="true"
        />
        <span className="hud-clock__day">Day {worldTime.dayNumber}</span>
        <span className="hud-clock__time">
          {pad2(worldTime.hour)}:{pad2(worldTime.minute)}
        </span>
      </div>
      {!compact && (
        <div className="hud-clock__strip" style={{ background: DAY_STRIP }} aria-hidden="true">
          <span className="hud-clock__marker" style={{ left: `${dayFraction * 100}%` }} />
        </div>
      )}
    </div>
  );
};

const GameUI = () => {
  const player = useGameStore(useShallow(selectPlayerStats));
  const equipment = useGameStore((state) => state.equipment);
  const gold = useGameStore((state) => state.inventory.gold);
  const potions = useGameStore((state) => state.inventory.potions);
  const gameState = useGameStore((state) => state.gameState);
  const hunger = useGameStore((state) => state.hunger);
  const shelter = useGameStore((state) => state.shelter);
  const tool = useGameStore((state) => state.equipment.weapon);
  const worldTime = useGameStore((state) => state.worldTime);
  const buildMode = useGameStore((state) => state.buildMode);
  const planMode = useGameStore((state) => state.planMode);
  const toggleBuildMode = useGameStore((state) => state.toggleBuildMode);
  const catalogOpen = useGameStore((state) => state.activeBuildingCatalog);
  const [isMobile, setIsMobile] = useState(false);
  const [isTouch] = useState(isTouchDevice);
  const statBreakdowns = useStatBreakdown();

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (gameState === 'intro') {
    return <StartScreen isMobile={isMobile} />;
  }

  if (gameState !== 'playing') {
    return null;
  }

  const totalStats = getTotalStats(player, equipment);
  const inMode = buildMode || planMode;
  const hidePanelSlots = isMobile && inMode; // save room for the hotbars
  const xpFraction = player.xpToNext > 0 ? Math.min(1, player.xp / player.xpToNext) : 0;

  const hudClass = [
    'hud',
    isMobile && 'hud--compact',
    isTouch && 'hud--touch',
    inMode && 'hud--mode',
    !isTouch && !inMode && 'hud--hotbar', // desktop block hotbar is always up in Play
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={hudClass} data-testid="game-ui">
      {/* Build / plan mode badge: names the mode and how to leave it */}
      {inMode && (
        <div className="hud-mode-badge" style={{ '--chip': buildMode ? '#ffb02e' : '#ff8c1a' }}>
          {buildMode ? <Pickaxe aria-hidden="true" /> : <MapPin aria-hidden="true" />}
          {buildMode ? 'Build mode' : 'Plan mode'}
          {!isTouch && <span className="hud-mode-badge__exit">{buildMode ? 'Tab' : 'P'} / Esc to leave</span>}
        </div>
      )}

      {/* Top left: level and vitals */}
      <section className="hud-vitals vx-panel" aria-label="Player status">
        <div className="hud-level">
          <span className="hud-level__badge" aria-label={`Level ${player.level}`}>
            {player.level}
          </span>
          <div className="hud-level__body">
            <div className="hud-level__label">
              <span>Level {player.level}</span>
              {!isMobile && (
                <span className="hud-level__xp">
                  {player.xp} / {player.xpToNext} XP
                </span>
              )}
            </div>
            <div
              className="vx-bar vx-bar--thin"
              style={{ '--bar': 'var(--vx-xp)', '--fill': `${xpFraction * 100}%` }}
            >
              <div className="vx-bar__fill" />
            </div>
          </div>
        </div>

        <StatBarWithTooltip
          icon={<Heart />}
          iconColor="#e5484d"
          label="Health"
          current={player.health}
          max={player.maxHealth}
          statName="health"
          breakdown={statBreakdowns.health}
          isMobile={isMobile}
          low={player.health / player.maxHealth < 0.25}
        />
        <StatBarWithTooltip
          icon={<Zap />}
          iconColor="#4f8cf7"
          label="Mana"
          current={player.mana}
          max={player.maxMana}
          statName="mana"
          breakdown={statBreakdowns.mana}
          isMobile={isMobile}
        />
        {!isMobile && (
          <StatBarWithTooltip
            icon={<Activity />}
            iconColor="#5cc36b"
            label="Stamina"
            current={player.stamina}
            max={player.maxStamina}
            statName="stamina"
            breakdown={statBreakdowns.stamina}
          />
        )}
        <StatBarWithTooltip
          icon={<Drumstick />}
          iconColor="#e0913a"
          label="Hunger"
          current={hunger.current}
          max={hunger.max}
          isMobile={isMobile}
          low={hunger.current < 20}
        />
        {!isMobile && (
          <StatBarWithTooltip
            icon={<Flame />}
            iconColor="#ff6a2b"
            label="Rage"
            current={player.rage}
            max={player.maxRage}
            glow={player.rage >= player.maxRage}
          />
        )}

        {!shelter.isExposed && (
          <span
            className="vx-chip hud-shelter"
            style={{ '--chip': shelter.isFullShelter ? '#5cc36b' : '#f2c14e' }}
            title="Shelter: faster health and stamina regen, slower hunger, no rift spawns close by"
          >
            <Home aria-hidden="true" />
            {shelter.isFullShelter ? 'Sheltered' : 'Partial shelter'}
          </span>
        )}

        {isTool(tool) && (
          <span
            className="vx-chip hud-tool"
            style={{ '--chip': isBroken(tool) ? '#ff6b6b' : '#a0aec0' }}
            title={`${tool.name}: ${getDurability(tool)} / ${tool.maxDurability} uses left`}
          >
            <Pickaxe aria-hidden="true" />
            {isBroken(tool) ? `${tool.name} broken` : `${getDurability(tool)}/${tool.maxDurability}`}
          </span>
        )}
      </section>

      {/* Top right: clock and purse */}
      <section className="hud-info vx-panel" aria-label="Time and supplies">
        <Clock worldTime={worldTime} compact={isMobile} />
        <div className="hud-info__row">
          <span className="hud-info__stat hud-info__stat--gold" title="Gold">
            <Coins aria-hidden="true" />
            {gold}
          </span>
          <span className="hud-info__stat hud-info__stat--potion" title="Potions">
            <FlaskConical aria-hidden="true" />
            {potions}
          </span>
        </div>
        {!isMobile && (
          <div className="hud-info__row hud-info__row--combat">
            <span className="hud-info__stat" title="Total damage">
              <Sword aria-hidden="true" />
              {totalStats.damage}
            </span>
            <span className="hud-info__stat" title="Total defense">
              <Shield aria-hidden="true" />
              {totalStats.defense}
            </span>
          </div>
        )}
      </section>

      {/* Bottom left: action bar */}
      <nav className="hud-actions" aria-label="Menus">
        {!hidePanelSlots && (
          <ActionSlot icon={Package} label="Inventory" hotkey="I" color="#4f8cf7" compact={isMobile} onClick={() => pressKey('i')} />
        )}
        {!hidePanelSlots && (
          <ActionSlot icon={Hammer} label="Crafting" hotkey="C" color="#f2c14e" compact={isMobile} onClick={() => pressKey('c')} />
        )}
        {isTouch ? (
          // Touch still mines/places through build mode (until the context button)
          <ActionSlot icon={Pickaxe} label="Build" hotkey="Tab" color="#ffb02e" active={buildMode} compact={isMobile} onClick={toggleBuildMode} />
        ) : (
          // Desktop mines and places in Play, so Build opens the catalog (blocks + buildings)
          <ActionSlot
            icon={Pickaxe}
            label="Build"
            hotkey="B"
            color="#ffb02e"
            active={catalogOpen}
            compact={isMobile}
            onClick={() => useGameStore.getState().togglePanel('buildings')}
          />
        )}
        <ActionSlot icon={MapPin} label="Plan" hotkey="P" color="#ff8c1a" active={planMode} compact={isMobile} onClick={togglePlanMode} />
        {!hidePanelSlots && (
          <ActionSlot
            icon={Users}
            label="Settlement"
            hotkey="N"
            color="#5cc36b"
            compact={isMobile}
            onClick={() => useGameStore.getState().toggleSettlementDashboard()}
          />
        )}
      </nav>
    </div>
  );
};

export default GameUI;
