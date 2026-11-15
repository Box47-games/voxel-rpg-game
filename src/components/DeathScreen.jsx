/**
 * DeathScreen.jsx
 * Death screen overlay shown when player health reaches 0
 * Shows death cause and respawn with penalties
 */

import React from 'react';
import './DeathScreen.css';

/** A voxel skull, drawn on a 9×9 grid. */
const SKULL = [
  '..xxxxx..',
  '.xxxxxxx.',
  'xxxxxxxxx',
  'xx..x..xx',
  'xx..x..xx',
  'xxxx.xxxx',
  '.xxx.xxx.',
  '..x.x.x..',
  '..xxxxx..',
];

const VoxelSkull = () => (
  <svg className="death-screen-skull" viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
    {SKULL.flatMap((row, y) =>
      [...row].map((c, x) =>
        c === 'x' ? <rect key={`${x},${y}`} x={x} y={y} width="1" height="1" fill={y < 3 ? '#f4efe1' : '#d8d1bd'} /> : null
      )
    )}
  </svg>
);

const DeathScreen = ({ onRespawn, deathCause }) => {
  return (
    <div className="death-screen-overlay" role="alertdialog" aria-labelledby="death-screen-title">
      <div className="death-screen-content">
        <VoxelSkull />
        <h1 id="death-screen-title" className="death-screen-title">You died</h1>
        {deathCause && <p className="death-screen-cause">{deathCause}</p>}
        <p className="death-screen-message">Your adventure has come to an end...</p>

        <div className="death-screen-actions">
          <button type="button" className="vx-btn vx-btn--primary vx-btn--lg respawn-button" onClick={onRespawn}>
            Respawn
          </button>
        </div>

        <p className="death-screen-hint">You will respawn at 50% health with 50% of materials lost</p>
      </div>
    </div>
  );
};

export default DeathScreen;
