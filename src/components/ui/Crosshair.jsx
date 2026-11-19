/**
 * Crosshair - Simple crosshair for first-person mode
 *
 * Desktop: Shows crosshair in first-person mode, hint when not
 * Mobile: Shows tap-to-target hint (no crosshair needed)
 */

import React, { useState, useEffect } from 'react';
import useGameStore from '../../stores/useGameStore';
import { isTouchDevice } from '../../utils/deviceDetection';
import './Crosshair.css';

const Crosshair = () => {
  const firstPerson = useGameStore((state) => state.camera.firstPerson);
  // The hint is for play: not over the start screen, and its 6 s start when play does
  const playing = useGameStore((state) => state.gameState === 'playing');
  const [isMobile, setIsMobile] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);

  // Check for mobile on mount
  useEffect(() => {
    setIsMobile(isTouchDevice());
  }, []);

  // Auto-dismiss all hints after 6 seconds
  useEffect(() => {
    if (isMobile || firstPerson || !playing) return;
    setHintDismissed(false);
    const timer = setTimeout(() => setHintDismissed(true), 6000);
    return () => clearTimeout(timer);
  }, [isMobile, firstPerson, playing]);

  // Mobile: no crosshair or hint needed (controls hint is in GameUI)
  if (isMobile) {
    return null;
  }

  // Desktop third-person: show brief toast hint, then auto-dismiss
  if (!firstPerson) {
    if (hintDismissed || !playing) return null;
    return (
      <div className="vx-hudpanel crosshair-hint" role="status">
        <div className="crosshair-hint__title">Press <kbd className="vx-key">V</kbd> for first-person</div>
        <div className="crosshair-hint__sub">V to toggle · WASD to move · drag to look</div>
      </div>
    );
  }

  // Desktop first-person: a pixel crosshair (four arms and a dot, dark outline)
  return (
    <div className="crosshair" aria-hidden="true">
      <i className="crosshair__arm crosshair__arm--t" />
      <i className="crosshair__arm crosshair__arm--b" />
      <i className="crosshair__arm crosshair__arm--l" />
      <i className="crosshair__arm crosshair__arm--r" />
      <i className="crosshair__dot" />
    </div>
  );
};

export default Crosshair;
