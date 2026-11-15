/**
 * StartScreen.jsx — The title screen, shown while gameState === 'intro'.
 *
 * The live world renders behind it. Offers Continue (when the default save
 * slot has a save) and Start Game, plus a short controls card. Enter picks
 * the highlighted (first) option.
 */

import React, { useCallback, useEffect, useState } from 'react';
import useGameStore from '../../stores/useGameStore';
import { game3DSaveManager } from '../../persistence/Game3DSaveManager';
import './StartScreen.css';

const SAVE_SLOT = 'default';

const DESKTOP_CONTROLS = [
  [['W', 'A', 'S', 'D'], 'Move'],
  [['Space'], 'Jump'],
  [['Shift'], 'Sprint'],
  [['Click'], 'Attack / mine'],
  [['Right-drag'], 'Look around'],
  [['Ctrl'], 'Spell wheel'],
  [['Tab'], 'Build'],
  [['E'], 'Interact'],
  [['F10'], 'Pause & save'],
  [['?'], 'All controls'],
];

const TOUCH_CONTROLS = [
  [['Stick'], 'Move'],
  [['Drag'], 'Look around'],
  [['Tap'], 'Attack'],
  [['Hold'], 'Mine'],
  [['Pinch'], 'Zoom'],
  [['🪄'], 'Spell wheel'],
];

/** Start playing from whatever state the store is in. */
export function beginPlay() {
  const store = useGameStore.getState();
  store.setGameState('playing');
  store.updateWorldTime({ paused: false });
}

function formatSavedAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? `today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** A grass block, drawn isometrically. */
export function GrassBlockMark({ size = 64 }) {
  return (
    <svg
      className="start-screen__mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* dirt sides */}
      <polygon points="4,18 32,32 32,62 4,48" fill="#7a4e2c" />
      <polygon points="60,18 60,48 32,62 32,32" fill="#5e3b20" />
      {/* grass overhang */}
      <polygon points="4,18 32,32 32,40 4,26" fill="#4f9a34" />
      <polygon points="60,18 60,26 32,40 32,32" fill="#3c7c27" />
      {/* drips */}
      <polygon points="10,25 14,27 14,31 10,29" fill="#4f9a34" />
      <polygon points="22,31 26,33 26,36 22,34" fill="#4f9a34" />
      <polygon points="42,33 46,31 46,35 42,37" fill="#3c7c27" />
      <polygon points="52,28 56,26 56,29 52,31" fill="#3c7c27" />
      {/* top */}
      <polygon points="32,4 60,18 32,32 4,18" fill="#6cbf4a" />
      <polygon points="32,4 46,11 32,18 18,11" fill="#7fd05a" />
      {/* specks */}
      <rect x="12" y="38" width="3" height="3" fill="#5e3b20" />
      <rect x="22" y="46" width="3" height="3" fill="#94653d" />
      <rect x="44" y="44" width="3" height="3" fill="#4a2e18" />
      <rect x="50" y="36" width="3" height="3" fill="#7a4e2c" />
      {/* outline */}
      <polygon
        points="32,4 60,18 60,48 32,62 4,48 4,18"
        fill="none"
        stroke="#06080d"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const StartScreen = ({ isMobile = false }) => {
  const [save, setSave] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const worldReady = useGameStore((s) => !!s._chunkManager);

  // Look for a save to continue
  useEffect(() => {
    let alive = true;
    game3DSaveManager
      .listSaves()
      .then((saves) => {
        if (alive) setSave(saves.find((s) => s.slot === SAVE_SLOT) || null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const handleContinue = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const chunkManager = useGameStore.getState()._chunkManager;
      const result = await game3DSaveManager.loadGame(useGameStore, chunkManager, SAVE_SLOT);
      if (result.success) {
        beginPlay();
        return;
      }
      setError(result.message || 'Could not load the save.');
    } catch (err) {
      setError(`Could not load the save: ${err.message}`);
    }
    setLoading(false);
  }, [loading]);

  const canContinue = !!save && worldReady && !loading;

  // Enter starts the first option
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Enter' || e.repeat) return;
      e.preventDefault();
      if (save) {
        if (canContinue) handleContinue();
      } else {
        beginPlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, canContinue, handleContinue]);

  const controls = isMobile ? TOUCH_CONTROLS : DESKTOP_CONTROLS;

  return (
    <div className={`start-screen${isMobile ? ' start-screen--compact' : ''}`} data-testid="start-screen">
      <div className="start-screen__shade" aria-hidden="true" />

      <main className="start-screen__menu">
        <header className="start-screen__brand">
          <GrassBlockMark size={isMobile ? 52 : 76} />
          <h1 className="start-screen__title">
            <span className="start-screen__title-top">Voxel</span>
            <span className="start-screen__title-bottom">RPG</span>
          </h1>
        </header>
        <p className="start-screen__tagline">Carve the land. Raise a settlement. Close the rifts.</p>

        <nav className="start-screen__buttons" aria-label="Main menu">
          {save && (
            <button
              type="button"
              className="vx-btn vx-btn--primary vx-btn--lg vx-btn--block start-screen__continue"
              onClick={handleContinue}
              disabled={!canContinue}
            >
              <span>{loading ? 'Loading…' : 'Continue'}</span>
              <small className="start-screen__save-info">
                Lv {save.playerLevel}
                {formatSavedAt(save.savedAt) && ` · ${formatSavedAt(save.savedAt)}`}
              </small>
            </button>
          )}
          <button
            type="button"
            className={`vx-btn vx-btn--lg vx-btn--block${save ? '' : ' vx-btn--primary'}`}
            onClick={beginPlay}
            disabled={loading}
          >
            {save ? 'New Game' : 'Start Game'}
          </button>
          {error && (
            <p className="start-screen__error" role="alert">
              {error}
            </p>
          )}
        </nav>

        <section className="start-screen__controls vx-panel" aria-label="Controls">
          <h2 className="start-screen__section-title">Controls</h2>
          <ul>
            {controls.map(([keys, action]) => (
              <li key={action}>
                <span className="start-screen__keys">
                  {keys.map((k) => (
                    <kbd key={k} className="vx-key">
                      {k}
                    </kbd>
                  ))}
                </span>
                <span className="start-screen__action">{action}</span>
              </li>
            ))}
          </ul>
        </section>

        {!isMobile && (
          <details className="start-screen__tip">
            <summary>Low frame rate?</summary>
            <p>
              Turn on hardware acceleration in your browser. In Chrome: Settings → System →
              &ldquo;Use graphics acceleration when available&rdquo;, then restart Chrome.
            </p>
          </details>
        )}
      </main>

      {!isMobile && (
        <footer className="start-screen__footer">
          Press <kbd className="vx-key">Enter</kbd> to {save ? 'continue' : 'start'}
        </footer>
      )}
    </div>
  );
};

export default StartScreen;
