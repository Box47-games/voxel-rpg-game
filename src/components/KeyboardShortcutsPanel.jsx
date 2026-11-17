/**
 * KeyboardShortcutsPanel.jsx - Comprehensive keyboard shortcuts help panel
 *
 * Features:
 * - Floating panel with all key assignments
 * - Press ? to toggle
 * - Categorized shortcuts across all game systems
 * - Scrollable grid layout
 */

import React, { useState, useEffect } from 'react';
import './KeyboardShortcutsPanel.css';

// Only keys that are actually bound (see useKeyboard.js and the components named)
const shortcuts = {
  movement: {
    title: 'Movement',
    keys: [
      { key: 'W A S D', description: 'Move' },
      { key: 'Space', description: 'Jump (double-tap: dodge)' },
      { key: 'Shift', description: 'Sprint' },
      { key: 'E', description: 'Interact: harvest, pick up, settler / site / stockpile details, close a rift' },
      { key: 'V', description: 'First-person view on / off' },
    ],
  },
  camera: {
    title: 'Camera',
    keys: [
      { key: 'Right-drag', description: 'Turn the camera' },
      { key: 'Wheel', description: 'Zoom (in plan mode: raise / lower the camera)' },
    ],
  },
  combat: {
    title: 'Combat & Spells',
    keys: [
      { key: 'Click enemy', description: 'Attack (casts your chosen spell, or melee)' },
      { key: 'Q (hold)', description: 'Spell wheel: choose the spell your clicks cast' },
      { key: 'Right-hold / Alt', description: 'Block (hold the right button still, empty hand)' },
      { key: 'H', description: 'Drink a health potion' },
    ],
  },
  building: {
    title: 'Blocks & Building',
    keys: [
      { key: 'Hold click', description: 'Mine the block under the cursor' },
      { key: '1 \u2013 9, 0', description: 'Pick a block (same key again: empty hand)' },
      { key: 'Right-click', description: 'Place the picked block' },
      { key: 'B', description: 'Build catalog: blocks and buildings (1 / 2 switch tabs)' },
      { key: 'P', description: 'Plan mode: zones and buildings from above' },
      { key: '1 \u2013 9 (plan)', description: 'Pick a zone tool (1\u20134) or blueprint (5+)' },
      { key: 'Right-click (placing)', description: 'Cancel placing a building' },
    ],
  },
  menus: {
    title: 'Screens',
    keys: [
      { key: 'I', description: 'Bag: Inventory tab (Craft and Repair are tabs too)' },
      { key: 'C', description: 'Bag: Craft tab' },
      { key: 'N', description: 'Settlement overview' },
      { key: 'Esc', description: 'Back out one step (placement \u2192 screen \u2192 mode), then pause' },
      { key: 'F10', description: 'Pause menu (save / load)' },
      { key: '?', description: 'This help screen' },
    ],
  },
  debug: {
    title: 'Debug (dev builds or ?debug=1)',
    keys: [
      { key: 'F3', description: 'Dev overlay: open / mini / close' },
      { key: 'F4', description: 'Dev overlay: settlement tab' },
      { key: '`', description: 'QA test tracker' },
    ],
  },
};

function KeyboardShortcutsPanel({ isOpen, onClose }) {
  const [internalOpen, setInternalOpen] = useState(isOpen || false);

  useEffect(() => {
    setInternalOpen(isOpen);
  }, [isOpen]);

  // Listen for ? key to toggle
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === '?' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        const newState = !internalOpen;
        setInternalOpen(newState);
        if (onClose && newState === false) {
          onClose();
        }
      }
      if (e.key === 'Escape' && internalOpen) {
        setInternalOpen(false);
        if (onClose) {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [internalOpen, onClose]);

  if (!internalOpen) {
    return null;
  }

  const handleClose = () => {
    setInternalOpen(false);
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="keyboard-shortcuts-panel-overlay" onClick={handleClose}>
      <div className="keyboard-shortcuts-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="shortcuts-header">
          <h2 className="shortcuts-title">Key Assignments</h2>
          <button className="shortcuts-close" onClick={handleClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="shortcuts-content">
          {Object.entries(shortcuts).map(([id, category]) => (
            <div key={id} className="shortcuts-section">
              <h3 className="shortcuts-category">{category.title}</h3>
              <div className="shortcuts-list">
                {category.keys.map((shortcut, index) => (
                  <div key={index} className="shortcut-item">
                    <kbd className="shortcut-key">{shortcut.key}</kbd>
                    <span className="shortcut-desc">{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="shortcuts-footer">
          <p>Press <kbd>?</kbd> anytime to toggle this panel</p>
        </div>
      </div>
    </div>
  );
}

export default KeyboardShortcutsPanel;
