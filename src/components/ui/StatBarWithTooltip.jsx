/**
 * StatBarWithTooltip.jsx — A HUD vital (health, mana, ...): a pixel icon
 * tile plus a notched bar with the value inside. Hovering shows the stat
 * breakdown when one is given. `art` names an icon in assets/art/hud.
 */

import React, { useState } from 'react';
import StatTooltip from './StatTooltip';
import { artUrl } from './art';
import './StatBarWithTooltip.css';

const StatBarWithTooltip = ({
  icon,
  art,
  iconColor,
  label,
  current,
  max,
  gradientColors,
  statName,
  breakdown,
  isMobile = false,
  low = false,
  glow = false,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const color = iconColor || gradientColors?.[0] || '#ffffff';
  const percentage = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const canHover = !isMobile && !!breakdown;

  return (
    <div
      className={`stat-bar-container${isMobile ? ' stat-bar-container--compact' : ''}`}
      data-has-breakdown={canHover ? 'true' : 'false'}
      style={{ '--bar': color }}
      onMouseEnter={() => canHover && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      role="meter"
      aria-label={label || statName}
      aria-valuenow={Math.round(current)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <span className="stat-bar-icon vx-icontile" aria-hidden="true">
        {art && artUrl('hud', art) ? <img src={artUrl('hud', art)} alt="" /> : icon}
      </span>
      <div
        className={`stat-bar-track vx-nbar${low ? ' is-low' : ''}${glow ? ' is-full' : ''}`}
        style={{ '--c': color }}
      >
        <i className="stat-bar-fill" style={{ width: `${percentage}%` }} />
        <span className="stat-bar-value vx-nbar__text">
          {Math.round(current)} / {Math.round(max)}
        </span>
      </div>

      {showTooltip && breakdown && (
        <StatTooltip stat={statName} value={max} breakdown={breakdown} position="right" />
      )}
    </div>
  );
};

export default StatBarWithTooltip;
