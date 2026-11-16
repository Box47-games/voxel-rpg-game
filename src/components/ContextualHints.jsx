import React, { useState, useEffect, useRef } from 'react';
import useGameStore from '../stores/useGameStore';
import { VOXEL_SIZE } from '../systems/chunks/coordinates';
import { isUsableBlock } from '../data/blockUseActions';
import { isTouchDevice } from '../utils/deviceDetection';
import { findNearestNPC } from '../utils/npcQueries';
import { NPC_INTERACT_RANGE, IMMIGRATION_MAX_NPCS } from '../data/tuning';
import { getHomes, getPopulationCap } from '../modules/settlement/housing';

/**
 * ContextualHints - Shows context-sensitive control hints
 */
const ContextualHints = () => {
  const [currentHint, setCurrentHint] = useState(null);
  const shownHintsRef = useRef(new Set()); // Use ref to avoid stale closure in interval
  const hintCooldowns = useRef(new Map()); // id → timestamp of last show
  const currentHintRef = useRef(null); // Ref mirrors currentHint to avoid stale closures
  const hintTimeoutRef = useRef(null); // Active timeout handle
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
      text: 'Press I to open inventory',
      condition: () => gameState === 'playing',
      priority: 2,
      delay: 8000,
      duration: 4000,
      showOnce: true,
      desktopOnly: true,
    },
    {
      id: 'attack',
      text: 'Click on enemies to attack',
      condition: () => gameState === 'playing',
      priority: 3,
      delay: 15000,
      duration: 4000,
      showOnce: true,
      desktopOnly: true,
    },
    {
      id: 'blocks',
      text: 'Hold left-click to mine blocks; pick a block (1-9) and right-click to place',
      condition: () => gameState === 'playing',
      priority: 4,
      delay: 25000,
      duration: 5000,
      showOnce: true,
      desktopOnly: true,
    },
    {
      id: 'sprint',
      text: 'Hold SHIFT to sprint',
      condition: () => gameState === 'playing',
      priority: 5,
      delay: 40000,
      duration: 3000,
      showOnce: true,
      desktopOnly: true,
    },
    {
      id: 'lowHealth',
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
      text: 'Hold Q to pick a spell, then click enemies to cast it. Attacks cost 5 mana.',
      condition: () => gameState === 'playing',
      priority: 5,
      delay: 20000,
      duration: 5000,
      showOnce: true,
      desktopOnly: true,
    },
    {
      id: 'firstPerson',
      text: 'Press V to toggle first-person mode',
      condition: () => gameState === 'playing',
      priority: 6,
      delay: 60000,
      duration: 4000,
      showOnce: true,
      desktopOnly: true,
    },
    {
      id: 'hungerWarning',
      text: 'You\'re getting hungry! Mine berry bushes or craft food.',
      condition: () => hunger.current < 40 && hunger.current > 0,
      priority: 9,
      duration: 5000,
      showOnce: false,
      cooldown: 60000,
    },
    {
      id: 'nightWarning',
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
      id: 'use-key',
      text: 'Press E to pick up items or harvest bushes',
      condition: () => gameState === 'playing',
      priority: 5,
      delay: 30000,
      duration: 5000,
      showOnce: true,
      desktopOnly: true,
    },
    {
      id: 'berry-bush-nearby',
      text: 'Press E to harvest berries',
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
      cooldown: 30000,
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
      text: 'Out of beds! Build a Wooden Shelter (B) so more settlers can move in.',
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
      text: 'Press E next to a settler to see what they need.',
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
      // Don't check while a hint is currently displayed (use ref for fresh value)
      if (currentHintRef.current) return;

      const now = Date.now();
      for (const hint of hints.sort((a, b) => a.priority - b.priority)) {
        // Skip keyboard-specific hints on touch devices
        if (hint.desktopOnly && isTouch) continue;

        // Skip if already shown and showOnce
        if (hint.showOnce && shownHintsRef.current.has(hint.id)) continue;

        // Check cooldown for repeating hints
        if (hint.cooldown) {
          const lastShown = hintCooldowns.current.get(hint.id) || 0;
          if (now - lastShown < hint.cooldown) continue;
        }

        // Check condition
        if (!hint.condition()) continue;

        // Check delay
        if (hint.delay && now - startTime < hint.delay) continue;

        // Show hint
        hintCooldowns.current.set(hint.id, now);
        currentHintRef.current = hint;
        setCurrentHint(hint);
        shownHintsRef.current.add(hint.id);

        // Hide after duration
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
        hintTimeoutRef.current = setTimeout(() => {
          currentHintRef.current = null;
          setCurrentHint(null);
          hintTimeoutRef.current = null;
        }, hint.duration);

        break;
      }
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
        // Portrait touch screens: clear the action bar above the joystick
        bottom: isTouchDevice() && window.innerHeight > window.innerWidth
          ? 'calc(264px + env(safe-area-inset-bottom, 0px))'
          : 'calc(220px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'calc(100vw - 32px)',
        padding: '10px 20px',
        borderLeft: '4px solid var(--vx-gold)',
        fontSize: '15px',
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
