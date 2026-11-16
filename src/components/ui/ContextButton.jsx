/**
 * ContextButton — the touch "do it" button. Its icon follows what's in front
 * of the player, most urgent first:
 *   Attack (an enemy within range) → Use (harvest a bush close by) →
 *   Place (a block in hand and a spot in front) → Mine (a block in front).
 * Tap acts; holding repeats (attacks) or keeps mining. Because this button
 * mines, a drag on the screen is always the camera.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Sword, Pickaxe, Hand, Box } from 'lucide-react';
import useGameStore from '../../stores/useGameStore';
import { isTouchDevice } from '../../utils/deviceDetection';
import { attackToward, findNearestEnemy } from '../../systems/combat/playerAttack';
import { BlockProperties } from '../../systems/chunks/blockTypes';
import { TOUCH_ATTACK_RANGE, TOUCH_ATTACK_REPEAT_MS } from '../../data/tuning';
import './ContextButton.css';

const POLL_MS = 150;

const KINDS = {
  attack: { label: 'Attack', Icon: Sword, color: '#e5484d' },
  use: { label: 'Use', Icon: Hand, color: '#5cc36b' },
  place: { label: 'Place', Icon: Box, color: '#4f8cf7' },
  mine: { label: 'Mine', Icon: Pickaxe, color: '#f2c14e' },
  none: { label: '', Icon: Hand, color: '#77756c' },
};

/** What the button would do right now. Exported for tests. */
export function getContextKind(store) {
  if (findNearestEnemy(store, TOUCH_ATTACK_RANGE)) return 'attack';
  if (store.touchAim === 'use') return 'use';
  if (store.touchAim === 'block' || store.touchAim === 'use') {
    return store.selectedBlockType != null ? 'place' : 'mine';
  }
  return 'none';
}

/** Run the action for `kind` once. Returns true if something happened. */
export function runContextAction(kind) {
  const store = useGameStore.getState();
  if (kind === 'attack') {
    const target = findNearestEnemy(store, TOUCH_ATTACK_RANGE);
    if (!target) return false;
    const [x, y, z] = target.position;
    return attackToward(store, { x, y: y + 1, z }) !== null;
  }
  if (kind === 'use') return !!store._touchActions?.harvest();
  if (kind === 'place') return !!store._touchActions?.place();
  if (kind === 'mine') return !!store._touchActions?.startMine();
  return false;
}

export default function ContextButton() {
  const [touch] = useState(isTouchDevice);
  const [kind, setKind] = useState('none');
  const hidden = useGameStore(
    (s) => s.gameState !== 'playing' || s.planMode || !!s.placingBuildingId
  );
  const heldBlock = useGameStore((s) => s.selectedBlockType);
  const holding = useRef(null); // { kind, timer }

  useEffect(() => {
    if (!touch) return undefined;
    const id = setInterval(() => {
      // Don't flip the icon under a held finger
      if (holding.current) return;
      const next = getContextKind(useGameStore.getState());
      setKind((k) => (k === next ? k : next));
    }, POLL_MS);
    return () => clearInterval(id);
  }, [touch]);

  const release = () => {
    const h = holding.current;
    if (!h) return;
    clearInterval(h.timer);
    if (h.kind === 'mine') useGameStore.getState()._touchActions?.stopMine();
    holding.current = null;
  };

  useEffect(() => release, []);

  if (!touch || hidden) return null;

  const onPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    release();
    // Decide fresh at the moment of the press
    const now = getContextKind(useGameStore.getState());
    setKind(now);
    runContextAction(now);
    holding.current = {
      kind: now,
      timer: now === 'attack' ? setInterval(() => runContextAction('attack'), TOUCH_ATTACK_REPEAT_MS) : null,
    };
  };

  const { label, Icon, color } = KINDS[kind];
  const blockColor = kind === 'place' && heldBlock != null ? BlockProperties[heldBlock]?.color : null;

  return (
    <button
      type="button"
      className={`ctx-btn${kind === 'none' ? ' ctx-btn--idle' : ''}`}
      style={{ '--ctx': color }}
      aria-label={label || 'Nothing to do here'}
      data-kind={kind}
      onPointerDown={onPointerDown}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {blockColor ? (
        <span
          className="ctx-btn__block"
          style={{ background: `rgb(${blockColor.map((c) => Math.round(c * 255)).join(',')})` }}
          aria-hidden="true"
        />
      ) : (
        <Icon className="ctx-btn__icon" aria-hidden="true" />
      )}
      {label && <span className="ctx-btn__label">{label}</span>}
    </button>
  );
}
