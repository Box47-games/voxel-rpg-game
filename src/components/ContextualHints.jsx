import React, { useState, useEffect, useRef } from 'react';
import useGameStore from '../stores/useGameStore';
import { VOXEL_SIZE } from '../systems/chunks/coordinates';
import { isUsableBlock } from '../data/blockUseActions';
import { isTouchDevice } from '../utils/deviceDetection';
import { findNearestNPC } from '../utils/npcQueries';
import { NPC_INTERACT_RANGE, IMMIGRATION_MAX_NPCS } from '../data/tuning';
import { getHomes, getPopulationCap } from '../modules/settlement/housing';
import { getSpellById } from '../data/spells';
import { pickHint } from '../systems/hints/hintScheduler';
import { HINT_MIN_GAP_MS } from '../data/tuning';

/**
 * ContextualHints - Shows context-sensitive control hints, one at a time with
 * a quiet gap between them (hintScheduler). Urgent ones (low health, hunger,
 * nightfall) may cut in. Shown at the top of the screen, off the play area.
 */
const ContextualHints = () => {
  const [currentHint, setCurrentHint] = useState(null);
  const shownHintsRef = useRef(new Set()); // Use ref to avoid stale closure in interval
  const hintCooldowns = useRef(new Map()); // id → timestamp of last show
  const currentHintRef = useRef(null); // Ref mirrors currentHint to avoid stale closures
  const hintTimeoutRef = useRef(null); // Active timeout handle
  const lastEndedAtRef = useRef(-Infinity); // when the last hint went away
  const gameState = useGameStore((state) => state.gameState);
  const playerHealth = useGameStore((state) => state.player.health);
  const playerMaxHealth = useGameStore((state) => state.player.maxHealth);
  const potions = useGameStore((state) => state.inventory.potions);
  const hunger = useGameStore((state) => state.hunger);
  const worldTime = useGameStore((state) => state.worldTime);
  const shelter = useGameStore((state) => state.shelter);

  const isTouch = isTouchDevice();

  // Define hints with conditions
  const hints = [
    {
      id: 'movement',
      text: 'WASD to move, SPACE to jump',
      condition: () => gameState === 'playing',
      priority: 1,
      duration: 5000,
      showOnce: true,
      desktopOnly: true,
    },
    {
      id: 'inventory',
      text: 'Press I to open your bag (items, crafting, repairs)',
      condition: () => gameState === 'playing',
      priority: 2,
      delay: 8000,
      duration: 4000,
      showOnce: true,
      desktopOnly: true,
    },
    {
      id: 'blocks',
      text: 'Hold left-click to mine blocks; pick a block (1-0) and right-click to place',
      condition: () => gameState === 'playing',
      priority: 4,
      delay: 25000,
      duration: 5000,
      showOnce: true,
      desktopOnly: true,
    },
    {
      id: 'lowHealth',
      urgent: true,
      text: 'Low health! Press H to use a potion',
      desktopOnly: true,
      condition: () => playerHealth < playerMaxHealth * 0.3 && potions > 0,
      priority: 10,
      duration: 4000,
      showOnce: false,
      cooldown: 30000,
    },
    {
      id: 'spells',
      text: (() => {
        const spell = getSpellById(useGameStore.getState().activeSpellId);
        return `Click enemies to attack. Hold Q to pick a spell${spell ? ` (${spell.name}: ${spell.manaCost} mana)` : ''}.`;
      })(),
      condition: () => gameState === 'playing',
      priority: 3,
      delay: 20000,
      duration: 5000,
      showOnce: true,
      desktopOnly: true,
    },
    {
      id: 'hungerWarning',
      urgent: true,
      text: 'You\'re getting hungry! Harvest berry bushes or craft food.',
      condition: () => hunger.current < 40 && hunger.current > 0,
      priority: 9,
      duration: 5000,
      showOnce: false,
      cooldown: 60000,
    },
    {
      id: 'nightWarning',
      urgent: true,
      text: 'Night is falling — monsters become more dangerous!',
      condition: () => worldTime.period === 'dusk',
      priority: 8,
      duration: 5000,
      showOnce: false,
      cooldown: 120000,
    },
    {
      id: 'shelterHint',
      text: 'Build walls and a roof: shelter heals you faster and keeps rift spawns away.',
      condition: () => worldTime.isNight && shelter.isExposed,
      priority: 7,
      duration: 5000,
      showOnce: true,
    },
    {
      id: 'berry-bush-nearby',
      text: isTouch ? 'Tap a berry bush to harvest it' : 'Press E to harvest berries',
      condition: () => {
        if (gameState !== 'playing') return false;
        const s = useGameStore.getState();
        const cm = s._chunkManager;
        if (!cm) return false;
        const p = s.player.position;
        const pvx = Math.floor(p[0] / VOXEL_SIZE);
        const pvy = Math.floor(p[1] / VOXEL_SIZE);
        const pvz = Math.floor(p[2] / VOXEL_SIZE);
        for (let dy = -1; dy <= 2; dy++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
              const wx = (pvx + dx) * VOXEL_SIZE + VOXEL_SIZE / 2;
              const wy = (pvy + dy) * VOXEL_SIZE + VOXEL_SIZE / 2;
              const wz = (pvz + dz) * VOXEL_SIZE + VOXEL_SIZE / 2;
              if (isUsableBlock(cm.getBlock(wx, wy, wz))) return true;
            }
          }
        }
        return false;
      },
      priority: 11,
      duration: 4000,
      showOnce: false,
      cooldown: 600000,
    },
    // ── Settlement hints ──────────────────────────────────
    {
      id: 'campfire-hint',
      text: 'Place a CAMPFIRE to attract settlers to your location!',
      condition: () => {
        if (gameState !== 'playing') return false;
        const s = useGameStore.getState();
        return !s.settlement.settlementCenter;
      },
      priority: 12,
      delay: 60000,
      duration: 6000,
      showOnce: true,
    },
    {
      id: 'housing-needed',
      text: 'Out of beds! Place a Wooden Shelter (Plan mode, or B) so more settlers can move in.',
      condition: () => {
        if (gameState !== 'playing') return false;
        const s = useGameStore.getState();
        if (!s.settlement.settlementCenter) return false;
        const cap = getPopulationCap(getHomes(s.constructionSites));
        return cap < IMMIGRATION_MAX_NPCS && s.settlement.npcs.length >= cap;
      },
      priority: 13,
      duration: 5000,
      showOnce: false,
      cooldown: 120000,
    },
    {
      id: 'farm-needs-seeds',
      text: 'Your farm needs seeds. Berry bushes drop them: pick some (settlers forage too) and keep them in a stockpile.',
      condition: () => {
        if (gameState !== 'playing') return false;
        const s = useGameStore.getState();
        const empty = s.zones.some((z) => z.type === 'FARMING' && z.farmTiles?.some((t) => t.plantedAt == null));
        const seeds = (s.inventory.materials.seed || 0) + s.zones.reduce((n, z) => n + (z.storage?.items?.seed || 0), 0);
        return empty && seeds === 0;
      },
      priority: 13,
      duration: 6000,
      showOnce: false,
      cooldown: 300000,
    },
    {
      id: 'npc-hungry',
      text: 'A settler is hungry! Ensure your food supply.',
      condition: () => {
        if (gameState !== 'playing') return false;
        const s = useGameStore.getState();
        return s.settlement.npcs.some(n => n.hunger < 30 && n.state !== 'EATING');
      },
      priority: 14,
      duration: 5000,
      showOnce: false,
      cooldown: 60000,
    },
    {
      id: 'settlement-growing',
      text: 'Your settlement is growing! More settlers will arrive as it improves.',
      condition: () => {
        if (gameState !== 'playing') return false;
        return useGameStore.getState().settlement.npcs.length >= 3;
      },
      priority: 15,
      duration: 5000,
      showOnce: true,
    },
    {
      id: 'npc-inspect',
      text: isTouch ? 'Tap a settler to see what they need.' : 'Press E next to a settler to see what they need.',
      condition: () => {
        if (gameState !== 'playing') return false;
        const s = useGameStore.getState();
        const settled = s.settlement.npcs.filter(n => n.state !== 'APPROACHING' && n.state !== 'LEAVING');
        return findNearestNPC(settled, s.player.position, NPC_INTERACT_RANGE * 2) !== null;
      },
      priority: 15,
      duration: 5000,
      showOnce: true,
    },
    // ── Rift closing hints ────────────────────────────────
    {
      id: 'rift-closable',
      text: 'Press E near an empty rift to begin closing it!',
      condition: () => {
        if (gameState !== 'playing') return false;
        const s = useGameStore.getState();
        const rm = s._riftManager;
        if (!rm) return false;
        const pp = s.player.position;
        return rm.rifts.some(r =>
          r.state === 'ACTIVE' &&
          r.spawnedMonsterIds.length === 0 &&
          Math.sqrt((r.x - pp[0]) ** 2 + (r.z - pp[2]) ** 2) < 16
        );
      },
      priority: 10,
      duration: 5000,
      showOnce: true,
    },
    {
      id: 'rift-closing-defend',
      text: 'Stay near the rift to speed up purification. Defend the anchor!',
      condition: () => {
        if (gameState !== 'playing') return false;
        const s = useGameStore.getState();
        const rm = s._riftManager;
        if (!rm) return false;
        return rm.rifts.some(r => r.state === 'CLOSING');
      },
      priority: 9,
      duration: 6000,
      showOnce: true,
    },
    // ── Companion hints ───────────────────────────────────
    {
      id: 'companion-nearby',
      text: 'You sense someone nearby... investigate the rift to the north.',
      condition: () => {
        if (gameState !== 'playing') return false;
        const s = useGameStore.getState();
        // Show when companion story manager would trigger discovery
        return !s.companion.active && s.settlement.settlementCenter;
      },
      priority: 11,
      delay: 120000,
      duration: 6000,
      showOnce: true,
    },
    {
      id: 'companion-bonding',
      text: 'Your companion looks stronger today. Stay close to deepen your bond.',
      condition: () => {
        if (gameState !== 'playing') return false;
        const s = useGameStore.getState();
        return s.companion.active && s.companion.bondLevel >= 25 && s.companion.bondLevel < 50;
      },
      priority: 14,
      duration: 5000,
      showOnce: true,
    },
  ];

  // Keep ref in sync with state
  useEffect(() => {
    currentHintRef.current = currentHint;
  }, [currentHint]);

  useEffect(() => {
    if (gameState !== 'playing') {
      setCurrentHint(null);
      currentHintRef.current = null;
      return;
    }

    const startTime = Date.now();

    const checkHints = () => {
      const now = Date.now();
      const visible = hints.filter((h) => !(h.desktopOnly && isTouch));
      const hint = pickHint(visible, {
        now,
        startedAt: startTime,
        current: currentHintRef.current,
        lastEndedAt: lastEndedAtRef.current,
        shown: shownHintsRef.current,
        lastShown: hintCooldowns.current,
        minGap: HINT_MIN_GAP_MS,
      });
      if (!hint) return;

      hintCooldowns.current.set(hint.id, now);
      currentHintRef.current = hint;
      setCurrentHint(hint);
      shownHintsRef.current.add(hint.id);

      // Hide after duration; the gap to the next ordinary hint starts then
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = setTimeout(() => {
        currentHintRef.current = null;
        lastEndedAtRef.current = Date.now();
        setCurrentHint(null);
        hintTimeoutRef.current = null;
      }, hint.duration);
    };

    const interval = setInterval(checkHints, 2000);
    // Delay initial check to avoid first-frame flash
    const initialTimeout = setTimeout(checkHints, 500);

    return () => {
      clearInterval(interval);
      clearTimeout(initialTimeout);
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    };
  }, [gameState]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentHint || gameState !== 'playing' || playerHealth <= 0) return null;

  return (
    <div
      className="vx-panel"
      role="status"
      style={{
        position: 'fixed',
        // Top centre, between the stat panel and the clock: off the play area
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'max-content',
        maxWidth: 'min(440px, calc(100vw - 32px))',
        padding: '8px 16px',
        borderLeft: `4px solid ${currentHint.urgent ? 'var(--vx-red, #e5484d)' : 'var(--vx-gold)'}`,
        fontSize: '14px',
        fontWeight: 600,
        textAlign: 'center',
        zIndex: 100,
        pointerEvents: 'none',
        animation: 'fadeIn 0.3s ease-in-out',
      }}
    >
      {currentHint.text}
    </div>
  );
};

export default ContextualHints;
