/**
 * hotbarDrag.js — Drag a block or piece from the Bag onto a hotbar slot.
 * Pointer events, so mouse and touch work the same way:
 *  - mouse: press and move a few pixels to start dragging
 *  - touch: press and hold briefly, then move (a quick swipe still scrolls)
 * Drop targets are elements with data-hotbar-slot="<index>". Dragging a slot
 * onto another swaps them; dropping a slot outside [data-hotbar-row] clears it.
 */

import useGameStore from '../../stores/useGameStore';
import { hotbarAllows } from '../../data/blockDrops';

const MOUSE_START_PX = 6;
const TOUCH_HOLD_MS = 220;
const TOUCH_SLOP_PX = 10;

let lastDragEnd = 0;

/** True right after a drag ended: lets the click that follows a drop be ignored. */
export const justDragged = () => Date.now() - lastDragEnd < 250;

function makeGhost(src) {
  const ghost = document.createElement('div');
  ghost.className = 'hotbar-ghost';
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    ghost.appendChild(img);
  }
  document.body.appendChild(ghost);
  return ghost;
}

function slotAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const slot = el?.closest?.('[data-hotbar-slot]');
  return slot ? Number(slot.dataset.hotbarSlot) : null;
}

function inHotbarRow(x, y) {
  return !!document.elementFromPoint(x, y)?.closest?.('[data-hotbar-row]');
}

/**
 * Start watching a press that may become a drag.
 * @param {PointerEvent} event - the pointerdown
 * @param {{ key: string, icon: string, fromSlot?: number }} what
 */
export function beginHotbarDrag(event, { key, icon, fromSlot = null }) {
  if (event.button != null && event.button !== 0) return;
  if (!key || !hotbarAllows(key)) return;
  const touch = event.pointerType === 'touch';
  const startX = event.clientX;
  const startY = event.clientY;
  // When the finger went down (event time, not handling time: a busy frame can
  // run the hold timer before queued moves are handled)
  const downAt = event.timeStamp ?? performance.now();
  let dragging = false;
  let ghost = null;
  let hover = null;
  let holdTimer = null;

  const markHover = (index) => {
    if (hover === index) return;
    document.querySelectorAll('[data-hotbar-slot].is-drop').forEach((n) => n.classList.remove('is-drop'));
    hover = index;
    if (index != null) document.querySelector(`[data-hotbar-slot="${index}"]`)?.classList.add('is-drop');
  };

  const start = (x, y) => {
    dragging = true;
    ghost = makeGhost(icon);
    move(x, y);
  };

  const move = (x, y) => {
    if (!ghost) return;
    // Beside the pointer (above the finger on touch) so the slot underneath stays visible
    ghost.style.transform = touch ? `translate(${x - 26}px, ${y - 78}px)` : `translate(${x + 10}px, ${y + 10}px)`;
    markHover(slotAt(x, y));
  };

  // Pointer (mouse/pen) and touch both end up here with page coordinates
  const moveTo = (x, y, e) => {
    const dist = Math.hypot(x - startX, y - startY);
    // Moved before the hold time was up (by the event's own clock): a swipe,
    // even if a slow frame already let the hold timer start a drag
    if (touch && dist > TOUCH_SLOP_PX && e.timeStamp - downAt < TOUCH_HOLD_MS) {
      cleanup();
      return;
    }
    if (!dragging) {
      if (touch) {
        // Moved before the hold finished: it's a scroll, not a drag
        if (dist > TOUCH_SLOP_PX) cleanup();
        return;
      }
      if (dist < MOUSE_START_PX) return;
      start(x, y);
    }
    if (touch && e.cancelable) e.preventDefault(); // keep the Bag from scrolling under the finger
    move(x, y);
  };

  const drop = (x, y) => {
    if (dragging) {
      const store = useGameStore.getState();
      const target = slotAt(x, y);
      if (target != null) {
        if (fromSlot != null) store.swapHotbarSlots(fromSlot, target);
        else store.setHotbarSlot(target, key);
      } else if (fromSlot != null && !inHotbarRow(x, y)) {
        store.setHotbarSlot(fromSlot, null); // dragged out of the hotbar
      }
      lastDragEnd = Date.now();
    }
    cleanup();
  };

  // Mouse and pen: pointer events
  const onPointerMove = (e) => moveTo(e.clientX, e.clientY, e);
  const onPointerUp = (e) => drop(e.clientX, e.clientY);
  // Touch: touch events, which keep coming while the page scrolls (pointer
  // events stop), so a swipe is seen as a swipe and a drag can stop the scroll
  const onTouchMove = (e) => {
    const t = e.touches[0];
    if (t) moveTo(t.clientX, t.clientY, e);
  };
  const onTouchEnd = (e) => {
    const t = e.changedTouches[0];
    if (t) drop(t.clientX, t.clientY);
    else cleanup();
  };

  function cleanup() {
    clearTimeout(holdTimer);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', cleanup);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', cleanup);
    markHover(null);
    ghost?.remove();
    ghost = null;
    dragging = false;
  }

  if (touch) {
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', cleanup);
    holdTimer = setTimeout(() => start(startX, startY), TOUCH_HOLD_MS);
  } else {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', cleanup);
  }
}
