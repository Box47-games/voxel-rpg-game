/**
 * StatBarWithTooltip.jsx — A HUD vital (health, mana, ...): icon tile plus a
 * segmented bar with the value inside. Hovering shows the stat breakdown
 * when one is given.
 */

import React, { useState } from 'react';
import StatTooltip from './StatTooltip';
import './StatBarWithTooltip.css';

const StatBarWithTooltip = ({
  icon,
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
      <span className="stat-bar-icon" aria-hidden="true">
        {icon}
      </span>
      <div
        className={`stat-bar-track vx-bar${low ? ' vx-bar--low' : ''}`}
        style={{ '--fill': `${percentage}%`, boxShadow: glow ? `0 0 10px ${color}` : undefined }}
      >
        <div className="vx-bar__fill stat-bar-fill" />
        <span className="stat-bar-value">
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
