/**
 * ContextButton — the touch attack button (bottom right). A tap swings the
 * equipped weapon at the nearest enemy in range (or straight ahead); holding
 * keeps swinging. It never mines or places: on touch you hold a block on
 * screen to mine it and tap to place (see BlockInteraction), and spells keep
 * their own wand button.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Sword } from 'lucide-react';
import useGameStore from '../../stores/useGameStore';
import { isTouchDevice } from '../../utils/deviceDetection';
import { meleeToward, findNearestEnemy } from '../../systems/combat/playerAttack';
import { TOUCH_ATTACK_RANGE, TOUCH_ATTACK_REPEAT_MS } from '../../data/tuning';
import './ContextButton.css';

/** One melee swing: at the nearest enemy in range, else the way the player faces. */
export function swingNow() {
  const store = useGameStore.getState();
  const target = findNearestEnemy(store, TOUCH_ATTACK_RANGE);
  const point = target ? { x: target.position[0], y: target.position[1], z: target.position[2] } : null;
  return meleeToward(store, point);
}

export default function ContextButton() {
  const [touch] = useState(isTouchDevice);
  const hidden = useGameStore(
    (s) => s.gameState !== 'playing' || s.planMode || !!s.placingBuildingId
  );
  const timer = useRef(null);

  const release = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => release, []);

  if (!touch || hidden) return null;

  const onPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    release();
    swingNow();
    timer.current = setInterval(swingNow, TOUCH_ATTACK_REPEAT_MS);
  };

  return (
    <button
      type="button"
      className="ctx-btn"
      style={{ '--ctx': '#e5484d' }}
      aria-label="Attack"
      data-kind="attack"
      onPointerDown={onPointerDown}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Sword className="ctx-btn__icon" aria-hidden="true" />
      <span className="ctx-btn__label">Attack</span>
    </button>
  );
}
