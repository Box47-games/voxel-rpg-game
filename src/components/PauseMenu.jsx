/**
 * PauseMenu — F10 to toggle. Freezes gameplay and shows a centered overlay.
 * Blocks all game input while open via capture-phase key handler.
 * Includes Save and Load buttons using the Game3DSaveManager singleton.
 */

import React, { useState, useEffect, useCallback } from 'react';
import useGameStore from '../stores/useGameStore';
import { game3DSaveManager } from '../persistence/Game3DSaveManager';
import './PauseMenu.css';

const PauseMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const pause = useCallback(() => {
    const state = useGameStore.getState();
    if (state.gameState !== 'playing') return;
    useGameStore.setState({
      gameState: 'paused',
      worldTime: { ...state.worldTime, paused: true },
    });
    // Release pointer lock so cursor is available
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    setIsOpen(true);
    setStatusMsg(null);
  }, []);

  const resume = useCallback(() => {
    const state = useGameStore.getState();
    if (state.gameState !== 'paused') return;
    useGameStore.setState({
      gameState: 'playing',
      worldTime: { ...state.worldTime, paused: false },
    });
    setIsOpen(false);
    setStatusMsg(null);
  }, []);

  const handleSave = useCallback(async () => {
    setStatusMsg({ text: 'Saving...', color: '#aeaa9c' });
    try {
      const store = useGameStore;
      const chunkManager = useGameStore.getState()._chunkManager;
      const result = await game3DSaveManager.saveGame(store, chunkManager, 'default');
      if (result.success) {
        setStatusMsg({ text: 'Game saved!', color: '#5cc36b' });
      } else {
        setStatusMsg({ text: result.message, color: '#ff7b72' });
      }
    } catch (err) {
      setStatusMsg({ text: 'Save failed: ' + err.message, color: '#ff7b72' });
    }
  }, []);

  const handleLoad = useCallback(async () => {
    setStatusMsg({ text: 'Loading...', color: '#aeaa9c' });
    try {
      const store = useGameStore;
      const chunkManager = useGameStore.getState()._chunkManager;
      const result = await game3DSaveManager.loadGame(store, chunkManager, 'default');
      if (result.success) {
        setStatusMsg({ text: 'Game loaded!', color: '#5cc36b' });
        // Close menu after brief delay so user sees success message
        setTimeout(() => {
          const state = useGameStore.getState();
          useGameStore.setState({
            gameState: 'playing',
            worldTime: { ...state.worldTime, paused: false },
          });
          setIsOpen(false);
          setStatusMsg(null);
        }, 600);
      } else {
        setStatusMsg({ text: result.message, color: '#ff7b72' });
      }
    } catch (err) {
      setStatusMsg({ text: 'Load failed: ' + err.message, color: '#ff7b72' });
    }
  }, []);

  // Capture-phase key handler — blocks all game input while open
  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'F10') {
        // Don't toggle if in a text field
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (isOpen) {
          if (useGameStore.getState().feedbackOpen) return;
          resume();
        } else {
          pause();
        }
        return;
      }

      // Esc backs out one step (placement, panel, mode); with nothing left, it pauses
      if (!isOpen && e.key === 'Escape') {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!useGameStore.getState().backOut()) pause();
        return;
      }

      if (!isOpen) return;

      // Escape also closes (the feedback form first, if it's open)
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (useGameStore.getState().feedbackOpen) useGameStore.getState().setFeedbackOpen(false);
        else resume();
        return;
      }

      // Block all other keys from reaching game handlers
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isOpen, pause, resume]);

  // Block mouse events on the overlay so clicks don't pass through
  useEffect(() => {
    if (!isOpen) return;
    const blockMouse = (e) => {
      // Only block events on the overlay itself, not the buttons
      if (e.target.closest('[data-pause-button], [data-feedback-form]')) return;
      e.stopPropagation();
    };
    // Capture phase blocks mouse from reaching the canvas
    for (const evt of ['mousedown', 'mouseup', 'mousemove', 'click', 'contextmenu', 'wheel']) {
      window.addEventListener(evt, blockMouse, true);
    }
    return () => {
      for (const evt of ['mousedown', 'mouseup', 'mousemove', 'click', 'contextmenu', 'wheel']) {
        window.removeEventListener(evt, blockMouse, true);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="pause-menu" role="dialog" aria-modal="true" aria-labelledby="pause-menu-title">
      <div className="pause-menu__panel vx-panel">
        <h2 id="pause-menu-title" className="pause-menu__title vx-heading">
          Paused
        </h2>

        <div className="pause-menu__buttons">
          <button type="button" data-pause-button className="vx-btn vx-btn--primary vx-btn--block" onClick={resume}>
            Resume
          </button>
          <button type="button" data-pause-button className="vx-btn vx-btn--block" onClick={handleSave}>
            Save Game
          </button>
          <button type="button" data-pause-button className="vx-btn vx-btn--block" onClick={handleLoad}>
            Load Game
          </button>
          <button
            type="button"
            data-pause-button
            className="vx-btn vx-btn--ghost vx-btn--block"
            onClick={() => useGameStore.getState().setFeedbackOpen(true)}
          >
            Send Feedback
          </button>
        </div>

        {statusMsg && (
          <p className="pause-menu__status" style={{ color: statusMsg.color }} role="status">
            {statusMsg.text}
          </p>
        )}

        <p className="pause-menu__hint">
          <kbd className="vx-key">F10</kbd> or <kbd className="vx-key">Esc</kbd> to resume
        </p>
      </div>
    </div>
  );
};

export default PauseMenu;
