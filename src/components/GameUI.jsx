/**
 * GameUI.jsx — The HTML overlay: the start screen while gameState is
 * 'intro', and the HUD while playing.
 *
 * HUD layout:
 *  - top left: level/XP and vitals (health, mana, stamina, hunger, rage)
 *  - top right: clock with a day-cycle strip, gold, potions, combat stats
 *  - top center: plan mode badge
 *  - bottom left: action bar (desktop: Bag, Build, Plan, Settlement; touch: Tools)
 * Styles live in GameUI.css on top of the shared styles/voxel-ui.css.
 */

import React, { useState, useEffect } from 'react';
import { isTool, isBroken, getDurability } from '../systems/tools/toolDurability';
import useGameStore, { selectPlayerStats } from '../stores/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { getTotalStats } from '../utils/equipmentStats';
import { isTouchDevice } from '../utils/deviceDetection';
import StatBarWithTooltip from './ui/StatBarWithTooltip';
import { artUrl } from './ui/art';
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

/** Wear colour: gold when fresh, orange when worn, red when nearly broken. */
function toolColor(tool) {
  const f = getDurability(tool) / tool.maxDurability;
  return f > 0.5 ? '#e8b443' : f > 0.2 ? '#e0913a' : '#d9473f';
}

function pressKey(key) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

function togglePlanMode() {
  if (document.pointerLockElement) document.exitPointerLock();
  useGameStore.getState().enterMode('plan');
}

/** A pixel icon from assets/art, sized by CSS. */
const Art = ({ group = 'ui', id, className }) => <img className={className} src={artUrl(group, id)} alt="" aria-hidden="true" />;

/** One square button on the action bar. */
const ActionSlot = ({ icon, label, hotkey, color, active = false, compact, onClick }) => (
  <button
    type="button"
    className={`hud-slot${active ? ' hud-slot--active' : ''}`}
    style={{ '--slot': color }}
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={hotkey ? `${label} [${hotkey}]` : label}
  >
    <span className="hud-slot__tile"><Art id={icon} className="hud-slot__icon" /></span>
    {!compact && <span className="hud-slot__label">{label}</span>}
    {!compact && hotkey && <kbd className="hud-slot__key">{hotkey}</kbd>}
  </button>
);

/** Clock with a strip showing where in the day/night cycle we are. */
const Clock = ({ worldTime, compact }) => {
  const dayFraction = ((worldTime.hour ?? 0) * 60 + (worldTime.minute ?? 0)) / 1440;
  const twilight = worldTime.period === 'dawn' || worldTime.period === 'dusk';

  return (
    <div className="hud-clock">
      <div className="hud-clock__row">
        <span
          className="hud-clock__icon vx-icontile"
          style={{ '--tile': worldTime.isNight ? '#2a2f6a' : twilight ? '#8a4a2a' : '#8a6a14' }}
        >
          <Art id={worldTime.isNight ? 'moon' : 'sun'} />
        </span>
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
  const planMode = useGameStore((state) => state.planMode);
  const toolsOpen = useGameStore((state) => state.openPanel === 'tools');
  const bagOpen = useGameStore((state) => ['inventory', 'crafting', 'repair'].includes(state.openPanel));
  const catalogOpen = useGameStore((state) => state.activeBuildingCatalog);
  // Start screen: narrow screens only. HUD: also phones held sideways (short).
  const [isMobile, setIsMobile] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isTouch] = useState(isTouchDevice);
  const statBreakdowns = useStatBreakdown();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
      setIsCompact(window.innerWidth <= 768 || window.innerHeight <= 500);
    };
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
  const inMode = planMode;
  const xpFraction = player.xpToNext > 0 ? Math.min(1, player.xp / player.xpToNext) : 0;

  const hudClass = [
    'hud',
    isCompact && 'hud--compact',
    isTouch && 'hud--touch',
    inMode && 'hud--mode',
    !isTouch && !inMode && 'hud--hotbar', // desktop block hotbar is always up in Play
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={hudClass} data-testid="game-ui">
      {/* Plan mode badge: names the mode and how to leave it */}
      {inMode && (
        <div className="hud-mode-badge" style={{ '--chip': '#ff8c1a' }}>
          <Art id="mapPin" />
          Plan mode
          {!isTouch && <span className="hud-mode-badge__exit">P / Esc to leave</span>}
        </div>
      )}

      {/* Top left: level and vitals */}
      <section className="hud-vitals vx-hudpanel" aria-label="Player status">
        <div className="hud-level">
          <span className="hud-level__badge vx-medal" aria-label={`Level ${player.level}`}>
            {player.level}
          </span>
          <div className="hud-level__body">
            <div className="hud-level__label">
              <span>Level {player.level}</span>
              {!isCompact && (
                <span className="hud-level__xp">
                  {player.xp} / {player.xpToNext} XP
                </span>
              )}
            </div>
            <div className="hud-level__bar vx-nbar" style={{ '--c': '#b98cff' }} aria-hidden="true">
              <i style={{ width: `${xpFraction * 100}%` }} />
            </div>
          </div>
        </div>

        <StatBarWithTooltip
          art="health"
          iconColor="#e5484d"
          label="Health"
          current={player.health}
          max={player.maxHealth}
          statName="health"
          breakdown={statBreakdowns.health}
          isMobile={isCompact}
          low={player.health / player.maxHealth < 0.25}
        />
        <StatBarWithTooltip
          art="mana"
          iconColor="#4f8cf7"
          label="Mana"
          current={player.mana}
          max={player.maxMana}
          statName="mana"
          breakdown={statBreakdowns.mana}
          isMobile={isCompact}
        />
        {!isCompact && (
          <StatBarWithTooltip
            art="stamina"
            iconColor="#5cc36b"
            label="Stamina"
            current={player.stamina}
            max={player.maxStamina}
            statName="stamina"
            breakdown={statBreakdowns.stamina}
          />
        )}
        <StatBarWithTooltip
          art="hunger"
          iconColor="#e0913a"
          label="Hunger"
          current={hunger.current}
          max={hunger.max}
          isMobile={isCompact}
          low={hunger.current < 20}
        />
        {!isCompact && (
          <StatBarWithTooltip
            art="rage"
            iconColor="#ff6a2b"
            label="Rage"
            current={player.rage}
            max={player.maxRage}
            glow={player.rage >= player.maxRage}
          />
        )}

        {!shelter.isExposed && (
          <span
            className={`vx-tag hud-shelter ${shelter.isFullShelter ? 'vx-tag--ready' : 'vx-tag--lock'}`}
            title="Shelter: faster health and stamina regen, slower hunger, no rift spawns close by"
          >
            <Art id="home" />
            {shelter.isFullShelter ? 'Sheltered' : 'Partial shelter'}
          </span>
        )}

        {isTool(tool) && (
          <span
            className={`hud-tool${isBroken(tool) ? ' is-broken' : ''}`}
            title={`${tool.name}: ${getDurability(tool)} / ${tool.maxDurability} uses left`}
          >
            <Art group="items" id={tool.id} className="hud-tool__icon" />
            {isBroken(tool) ? (
              <span className="hud-tool__broken">{tool.name} broken</span>
            ) : (
              <span className="hud-tool__bar vx-nbar" style={{ '--c': toolColor(tool) }} aria-label={`${getDurability(tool)} of ${tool.maxDurability} uses left`}>
                <i style={{ width: `${(getDurability(tool) / tool.maxDurability) * 100}%` }} />
              </span>
            )}
          </span>
        )}
      </section>

      {/* Top right: clock and purse */}
      <section className="hud-info vx-hudpanel" aria-label="Time and supplies">
        <Clock worldTime={worldTime} compact={isCompact} />
        <div className="hud-info__row">
          <span className="hud-info__stat hud-info__stat--gold" title="Gold">
            <Art group="misc" id="coin" />
            {gold}
          </span>
          <span className="hud-info__stat hud-info__stat--potion" title="Potions">
            <Art group="items" id="healthPotion" />
            {potions}
          </span>
        </div>
        {!isCompact && (
          <div className="hud-info__row hud-info__row--combat">
            <span className="hud-info__stat" title="Total damage">
              <Art id="sword" />
              {totalStats.damage}
            </span>
            <span className="hud-info__stat" title="Total defense">
              <Art id="shield" />
              {totalStats.defense}
            </span>
          </div>
        )}
      </section>

      {/* Bottom left: action bar. Touch: one Tools button opens the tool wheel */}
      <nav className="hud-actions vx-hudpanel" aria-label="Menus">
        {isTouch ? (
          <ActionSlot
            icon="grid"
            label="Tools"
            color="#f2c14e"
            active={toolsOpen}
            compact={isCompact}
            onClick={() => useGameStore.getState().togglePanel('tools')}
          />
        ) : (
          <>
            {/* Bag: Inventory, Craft and Repair are tabs of one screen (C opens Craft directly) */}
            <ActionSlot
              icon="bag"
              label="Bag"
              hotkey="I"
              color="#4f8cf7"
              active={bagOpen}
              compact={isCompact}
              onClick={() => pressKey('i')}
            />
            {/* Desktop mines and places in Play, so Build opens the catalog (blocks + buildings) */}
            <ActionSlot
              icon="hammer"
              label="Build"
              hotkey="B"
              color="#ffb02e"
              active={catalogOpen}
              compact={isCompact}
              onClick={() => useGameStore.getState().togglePanel('buildings')}
            />
            <ActionSlot icon="mapPin" label="Plan" hotkey="P" color="#ff8c1a" active={planMode} compact={isCompact} onClick={togglePlanMode} />
            <ActionSlot
              icon="people"
              label="Settlement"
              hotkey="N"
              color="#5cc36b"
              compact={isCompact}
              onClick={() => useGameStore.getState().toggleSettlementDashboard()}
            />
          </>
        )}
      </nav>
    </div>
  );
};

export default GameUI;
