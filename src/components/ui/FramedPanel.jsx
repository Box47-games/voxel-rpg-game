/**
 * FramedPanel — the shared frame of the settlement panels (settler,
 * stockpile, building) and the Settlement dashboard: a wood-framed stone
 * panel with a hanging sign title, a header row, a close tab and a footer.
 * Phones get a thin frame with the title inline.
 */

import React from 'react';
import { useIsMobile } from './BagFrame';
import { artUrl } from './art';
import './FramedPanel.css';

export default function FramedPanel({
  title, label, onClose, header = null, footer = null, width = 460, modal = false, className = '', children,
}) {
  const isMobile = useIsMobile();
  return (
    <div
      className={`fp-overlay${modal ? ' fp-overlay--modal' : ''}`}
      onClick={modal ? (e) => { if (e.target === e.currentTarget) onClose?.(); } : undefined}
    >
      <section
        role="dialog"
        aria-label={label || title}
        className={`vx-frame fp${isMobile ? ' fp--mobile' : ''} ${className}`}
        style={{ '--fp-width': `${width}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="vx-sign-title fp__title">{title}</h2>
        <header className="fp__head">
          <div className="fp__head-main">{header}</div>
          {onClose && (
            <button type="button" className="vx-tab fp__close" onClick={onClose} aria-label="Close">
              <img src={artUrl('ui', 'close')} alt="" width="16" height="16" />
            </button>
          )}
        </header>
        <div className="fp__body">{children}</div>
        {footer && <footer className="fp__foot">{footer}</footer>}
      </section>
    </div>
  );
}

/** A notched progress bar (0..1) in a colour. */
export function NotchedBar({ value, color = '#e8b443', small = false, label }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className={`vx-nbar${small ? ' fp__nbar-sm' : ''}`} style={{ '--c': color }} role="progressbar"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
