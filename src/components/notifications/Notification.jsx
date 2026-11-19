/**
 * Notification.jsx — one toast: a thin wood-framed stone strip with a
 * coloured icon tile. Slides in from the right; click to dismiss.
 *
 * Icon: `art: { group, id }` picks generated art, `icon` names a UI symbol
 * (src/assets/art/ui), and otherwise the type's symbol is used.
 */

import React, { useState, useEffect } from 'react';
import { artUrl } from '../ui/art';
import { TOAST_DURATION_MS } from '../../data/tuning';
import './Notification.css';

/** Icon art and tile colour per toast type */
const TYPE_ART = {
  achievement: { art: ['ui', 'trophy'], tile: '#5a4314' },
  raid: { art: ['ui', 'swords'], tile: '#6a1f1a' },
  levelup: { art: ['ui', 'levelUp'], tile: '#4a2a78' },
  success: { art: ['ui', 'check'], tile: '#24501a' },
  warning: { art: ['ui', 'warning'], tile: '#6a4a10' },
  error: { art: ['ui', 'alert'], tile: '#6a1f1a' },
  info: { art: ['ui', 'info'], tile: '#1f3f6a' },
};

function Notification({ notification, index, onDismiss }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const { type = 'info', title, description, message, extra, reward, icon, art } = notification;
  const look = TYPE_ART[type] || TYPE_ART.info;
  const iconUrl = (art && artUrl(art.group, art.id)) || (icon && artUrl('ui', icon)) || artUrl(...look.art);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 250);
  };

  // Slide in, then auto-dismiss `duration` ms after it was shown
  useEffect(() => {
    const show = setTimeout(() => setIsVisible(true), 50);
    const duration = notification.duration || TOAST_DURATION_MS;
    const hide = duration > 0 ? setTimeout(handleDismiss, duration) : null;
    return () => {
      clearTimeout(show);
      if (hide) clearTimeout(hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`notification notification-${type}${isVisible ? ' visible' : ''}${isExiting ? ' exiting' : ''}`}
      style={{ '--i': index }}
      role="status"
      onClick={handleDismiss}
    >
      <div className="notification-icon" style={{ background: look.tile }}>
        <img src={iconUrl} alt="" />
      </div>

      <div className="notification-content">
        <h3 className="notification-title">{title}</h3>
        {(description || message) && <p className="notification-description">{description || message}</p>}
        {extra && <p className="notification-extra">{extra}</p>}
        {reward && <div className="notification-reward">{reward}</div>}
      </div>

      <button
        type="button"
        className="notification-close"
        onClick={(e) => {
          e.stopPropagation();
          handleDismiss();
        }}
        aria-label="Dismiss notification"
      >
        <img src={artUrl('ui', 'close')} alt="" />
      </button>
    </div>
  );
}

export default Notification;
