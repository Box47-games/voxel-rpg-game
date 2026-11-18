/**
 * BagFrame — the shared frame of the Bag's tabs (Inventory, Craft, Repair):
 * a wood-framed stone panel with a hanging "Bag" sign, the tab strip, a close
 * button and an optional footer. Clicking the backdrop closes it on desktop.
 */

import React, { useEffect, useState } from 'react';
import useGameStore from '../../stores/useGameStore';
import BagTabs from './BagTabs';
import { artUrl } from './art';
import './Bag.css';

const MOBILE_WIDTH = 768;
const MOBILE_HEIGHT = 500; // phones held sideways

const isSmallScreen = () => window.innerWidth <= MOBILE_WIDTH || window.innerHeight <= MOBILE_HEIGHT;

/** True on phones (narrow, or short when held sideways); updates on resize. */
export function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && isSmallScreen());
  useEffect(() => {
    const check = () => setMobile(isSmallScreen());
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return mobile;
}

export default function BagFrame({ active, label, headerExtra = null, footer = null, children }) {
  const isMobile = useIsMobile();
  const close = () => useGameStore.getState().closePanels();
  return (
    <div
      className="vx-overlay bag-overlay"
      onClick={(e) => {
        if (!isMobile && e.target === e.currentTarget) close();
      }}
    >
      <section role="dialog" aria-label={label} className={`vx-frame bag${isMobile ? ' vx-frame--thin bag--mobile' : ''}`}>
        <h2 className="vx-sign-title bag__title">Bag</h2>
        <header className="bag__head">
          <BagTabs active={active} isMobile={isMobile} />
          <div className="bag__spacer" />
          {headerExtra}
          <button type="button" className="vx-tab bag__close" onClick={close} aria-label="Close">
            <img src={artUrl('ui', 'close')} alt="" width="16" height="16" />
          </button>
        </header>
        <div className="bag__body">{children}</div>
        {footer && !isMobile && <footer className="bag__foot">{footer}</footer>}
      </section>
    </div>
  );
}
