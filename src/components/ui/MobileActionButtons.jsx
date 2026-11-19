/**
 * MobileActionButtons.jsx — On-screen action buttons for touch devices.
 *
 * Provides Jump, Sprint, Interact (E), and Dodge buttons that inject
 * virtual key states into the keyboard system. Only renders on touch devices.
 */

import React, { useCallback, useRef } from 'react';
import { isTouchDevice } from '../../utils/deviceDetection';
import { setVirtualKey } from '../../hooks/useKeyboard';
import useGameStore from '../../stores/useGameStore';
import { artUrl } from './art';

const GAP = 6;

const containerStyle = {
  position: 'fixed',
  // Stack vertically on the right edge, starting well above the SpellWheel button
  // SpellWheel is at bottom ~80px, 56px tall → top at ~136px
  // We start at 150px to leave clear gap
  bottom: `max(150px, calc(130px + env(safe-area-inset-bottom, 0px)))`,
  right: `max(8px, env(safe-area-inset-right, 0px))`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: GAP,
  zIndex: 950,
  pointerEvents: 'auto',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};


const MobileActionButtons = () => {
  const jumpTimeout = useRef(null);
  const isTouch = isTouchDevice();

  const handleJump = useCallback(() => {
    setVirtualKey('jump', true);
    clearTimeout(jumpTimeout.current);
    jumpTimeout.current = setTimeout(() => setVirtualKey('jump', false), 50);
  }, []);

  const handleInteract = useCallback(() => {
    // Call the E-key useBlock handler
    const store = useGameStore.getState();
    if (store.useBlock) {
      store.useBlock();
    }
  }, []);

  const handleDodge = useCallback(() => {
    // Simulate rapid double-tap space for dodge roll
    setVirtualKey('jump', true);
    setTimeout(() => {
      setVirtualKey('jump', false);
      setTimeout(() => {
        setVirtualKey('jump', true);
        setTimeout(() => setVirtualKey('jump', false), 50);
      }, 50);
    }, 50);
  }, []);

  if (!isTouch) return null;

  return (
    <div style={containerStyle}>
      <button type="button" className="vx-tbtn" onTouchStart={(e) => { e.preventDefault(); handleJump(); }} onClick={handleJump} aria-label="Jump">
        <img src={artUrl('ui', 'jump')} alt="" />
      </button>
      <button type="button" className="vx-tbtn" style={{ '--c': '#7a5a2a' }} onTouchStart={(e) => { e.preventDefault(); handleInteract(); }} onClick={handleInteract} aria-label="Interact">
        E
      </button>
      <button type="button" className="vx-tbtn" onTouchStart={(e) => { e.preventDefault(); handleDodge(); }} onClick={handleDodge} aria-label="Dodge">
        <img src={artUrl('ui', 'dash')} alt="" />
      </button>
    </div>
  );
};

export default React.memo(MobileActionButtons);
