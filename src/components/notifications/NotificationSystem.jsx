/**
 * NotificationSystem.jsx - Animated notification system
 *
 * Notification Types:
 * - Achievement (Blue) - Achievement unlocked
 * - Raid (Red) - Raid warning/approaching
 * - LevelUp (Purple) - NPC level up
 * - Success (Green) - General success
 * - Warning (Yellow) - Warnings
 * - Info (Blue) - Information
 *
 * Features:
 * - Slide in from top-right
 * - Pulsing glow border
 * - Auto-dismiss after 5 seconds
 * - Stack multiple notifications
 * - Click to dismiss
 */

import React, { useState, useEffect } from 'react';
import { TOAST_MAX_VISIBLE, TOAST_MAX_VISIBLE_SHORT } from '../../data/tuning';
import Notification from './Notification';
import './NotificationSystem.css';

let notificationId = 0;

const SHORT_SCREEN = '(max-height: 500px)';

/** Short screens (phones held sideways) show one toast at a time; the rest wait. */
function useMaxVisible() {
  const query = () => typeof window !== 'undefined' && window.matchMedia?.(SHORT_SCREEN).matches;
  const [short, setShort] = useState(query);
  useEffect(() => {
    const check = () => setShort(query());
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return short ? TOAST_MAX_VISIBLE_SHORT : TOAST_MAX_VISIBLE;
}

function NotificationSystem() {
  const [notifications, setNotifications] = useState([]);
  const maxVisible = useMaxVisible();

  // Expose global function to add notifications
  useEffect(() => {
    window.addNotification = (notification) => {
      const id = ++notificationId;
      const newNotification = {
        id,
        ...notification,
        timestamp: Date.now()
      };

      // Queued: each toast's timer starts when it is shown (Notification.jsx)
      setNotifications(prev => [...prev, newNotification]);
    };

    return () => {
      delete window.addNotification;
    };
  }, []);

  const dismissNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="notification-system">
      {notifications.slice(0, maxVisible).map((notification, index) => (
        <Notification
          key={notification.id}
          notification={notification}
          index={index}
          onDismiss={() => dismissNotification(notification.id)}
        />
      ))}
    </div>
  );
}

export default NotificationSystem;

// Helper functions for common notification types
export const showAchievementNotification = (title, description, reward) => {
  if (window.addNotification) {
    window.addNotification({
      type: 'achievement',
      title,
      description,
      reward,
      icon: '🏆'
    });
  }
};

export const showRaidNotification = (raidType, wave, totalWaves, difficulty) => {
  if (window.addNotification) {
    window.addNotification({
      type: 'raid',
      title: 'RAID APPROACHING!',
      description: `${raidType} - Wave ${wave}/${totalWaves}`,
      extra: `Difficulty: ${difficulty}`,
      icon: '⚔️',
      duration: 7000
    });
  }
};

export const showLevelUpNotification = (npcName, level, statsGained) => {
  if (window.addNotification) {
    window.addNotification({
      type: 'levelup',
      title: 'LEVEL UP!',
      description: `${npcName} reached Level ${level}`,
      extra: statsGained,
      icon: '✨'
    });
  }
};

export const showSuccessNotification = (title, description) => {
  if (window.addNotification) {
    window.addNotification({
      type: 'success',
      title,
      description,
      icon: '✓'
    });
  }
};

export const showWarningNotification = (title, description) => {
  if (window.addNotification) {
    window.addNotification({
      type: 'warning',
      title,
      description,
      icon: '⚠️'
    });
  }
};

export const showInfoNotification = (title, description) => {
  if (window.addNotification) {
    window.addNotification({
      type: 'info',
      title,
      description,
      icon: 'ℹ️'
    });
  }
};
