/**
 * MobileTouchTutorial.jsx — One-time card teaching touch controls.
 *
 * Shows the first time a touch-device player starts playing (not over the
 * title screen) and remembers dismissal in localStorage. Tap to dismiss.
 */

import React, { useState, useEffect } from 'react';
import { isTouchDevice } from '../../utils/deviceDetection';
import useGameStore from '../../stores/useGameStore';

const STORAGE_KEY = 'mobileTutorialSeen';

const TIPS = [
  { icon: '🕹️', text: 'Use the joystick (bottom-left) to move' },
  { icon: '🏃', text: 'Push joystick to edge to sprint' },
  { icon: '⚔️', text: 'Tap enemies to attack' },
  { icon: '🪄', text: 'Tap ground to cast spells' },
  { icon: '🔄', text: 'Drag to rotate camera' },
  { icon: '🔍', text: 'Pinch to zoom in/out' },
  { icon: '⛏️', text: 'Long-press blocks to mine' },
];

function alreadySeen() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'rgba(8, 10, 16, 0.7)',
    cursor: 'pointer',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  card: {
    width: 'min(340px, 100%)',
    padding: '20px 20px 16px',
  },
  title: {
    marginBottom: 16,
    fontSize: '1.15rem',
    textTransform: 'uppercase',
    color: 'var(--vx-gold)',
    textAlign: 'center',
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    fontSize: 15,
    lineHeight: 1.35,
  },
  icon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
    flexShrink: 0,
  },
  dismiss: {
    marginTop: 16,
    fontSize: 13,
    textAlign: 'center',
    color: 'var(--vx-text-dim)',
  },
};

const MobileTouchTutorial = () => {
  const playing = useGameStore((s) => s.gameState === 'playing');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (playing && isTouchDevice() && !alreadySeen()) setVisible(true);
  }, [playing]);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Private mode: the card just comes back next time
    }
    setVisible(false);
  };

  if (!visible || !playing) return null;

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-labelledby="touch-tutorial-title"
      onClick={dismiss}
      onTouchStart={(e) => { e.preventDefault(); dismiss(); }}
    >
      <div className="vx-panel" style={styles.card}>
        <h2 id="touch-tutorial-title" className="vx-heading" style={styles.title}>
          Touch controls
        </h2>
        <ul style={styles.list}>
          {TIPS.map((tip) => (
            <li key={tip.text} style={styles.item}>
              <span style={styles.icon} aria-hidden="true">{tip.icon}</span>
              <span>{tip.text}</span>
            </li>
          ))}
        </ul>
        <div style={styles.dismiss}>Tap anywhere to start playing</div>
      </div>
    </div>
  );
};

export default React.memo(MobileTouchTutorial);
