/**
 * InteractPrompt — "E  Stockpile" under the crosshair area when the use key
 * would open something (stockpile, construction site, building, settler).
 * Touch players get the same text for the E button. Polls a few times a
 * second (the player moves every frame; see interactTarget.js).
 */

import React, { useEffect, useState } from 'react';
import useGameStore from '../../stores/useGameStore';
import { isTouchDevice } from '../../utils/deviceDetection';
import { findInteractTarget } from '../../systems/interaction/interactTarget';

const POLL_MS = 250;
const VERB = { stockpile: 'open', site: 'deliver to', building: 'inspect', settler: 'talk to' };

export default function InteractPrompt() {
  const [target, setTarget] = useState(null);
  const [touch] = useState(isTouchDevice);

  useEffect(() => {
    const id = setInterval(() => {
      const s = useGameStore.getState();
      const busy = s.gameState !== 'playing' || s.planMode || s.placingBuildingId || s.openPanel
        || s.activeStockpileZoneId || s.activeConstructionSiteId || s.activeNPCId
        || s.settlementDashboardOpen || s.activeBuildingCatalog;
      const next = busy ? null : findInteractTarget(s, s.player.position);
      setTarget((prev) => (prev?.id === next?.id && prev?.kind === next?.kind ? prev : next));
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (!target) return null;
  return (
    <div className="vx-panel" role="status" style={styles.box}>
      <kbd style={styles.key}>E</kbd>
      <span>
        {touch ? 'Tap E to ' : ''}
        {VERB[target.kind]} <strong>{target.label}</strong>
      </span>
    </div>
  );
}

const styles = {
  box: {
    position: 'fixed',
    left: '50%',
    top: '58%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    fontFamily: 'var(--vx-font-ui)',
    fontSize: '13px',
    color: 'var(--vx-text)',
    zIndex: 90,
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  },
  key: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '22px',
    height: '22px',
    border: '2px solid var(--vx-gold)',
    borderRadius: '3px',
    fontWeight: 700,
    color: 'var(--vx-gold-light)',
    fontFamily: 'inherit',
  },
};
