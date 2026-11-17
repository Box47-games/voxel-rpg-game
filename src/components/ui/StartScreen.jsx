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
  [['Click'], 'Attack, mine'],
  [['1–0'], 'Pick block'],
  [['Right-click'], 'Place block'],
  [['I'], 'Bag: items, craft, repair'],
  [['B'], 'Build catalog'],
  [['P'], 'Plan settlement'],
  [['Right-drag'], 'Look around'],
  [['Q'], 'Spell wheel'],
  [['Right-hold'], 'Block'],
  [['E'], 'Interact'],
  [['F10'], 'Pause & save'],
  [['?'], 'All controls'],
];

const TOUCH_CONTROLS = [
  [['Stick'], 'Move'],
  [['Drag'], 'Look around'],
  [['Tap'], 'Attack / cast'],
  [['⚔'], 'Act: attack, mine, place'],
  [['▦'], 'Tools: bag, build, plan'],
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

/** The Riftholm mark: the app icon's rift island without its background. */
export function RiftMark({ size = 64 }) {
  return (
    <img
      className="start-screen__mark"
      src={`${import.meta.env.BASE_URL}icons/rift-mark.svg`}
      width={Math.round((size * 344) / 368)}
      height={size}
      alt=""
      draggable={false}
    />
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
          <RiftMark size={isMobile ? 64 : 96} />
          <h1 className="start-screen__title">
            <span className="start-screen__title-top">Rift</span>
            <span className="start-screen__title-bottom">holm</span>
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
