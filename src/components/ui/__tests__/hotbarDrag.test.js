import useGameStore, { selectHotbar } from '../../../stores/useGameStore';
import { beginHotbarDrag, justDragged } from '../hotbarDrag';

const s = () => useGameStore.getState();

// A hotbar row with 4 slots and a spot outside it; elementFromPoint maps x to them
let row; let outside;
function layout() {
  document.body.innerHTML = '';
  row = document.createElement('div');
  row.setAttribute('data-hotbar-row', '');
  for (let i = 0; i < 4; i++) {
    const el = document.createElement('div');
    el.setAttribute('data-hotbar-slot', String(i));
    row.appendChild(el);
  }
  outside = document.createElement('div');
  document.body.append(row, outside);
  // x 0-399: slot floor(x/100); x ≥ 1000: outside the row
  document.elementFromPoint = (x) => (x >= 1000 ? outside : x < 400 ? row.children[Math.floor(x / 100)] : row);
}

const ev = (type, props) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v });
  return e;
};
const touchAt = (type, x, y, timeStamp) =>
  ev(type, { touches: type === 'touchend' ? [] : [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }], timeStamp });

describe('hotbar drag and drop', () => {
  beforeEach(() => {
    s().reset();
    layout();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  test('mouse: drag a material onto a slot', () => {
    beginHotbarDrag({ pointerType: 'mouse', button: 0, clientX: 500, clientY: 500 }, { key: 'clay', icon: '' });
    window.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 20 }));
    window.dispatchEvent(ev('pointerup', { clientX: 350, clientY: 20 }));
    expect(selectHotbar(s())).toEqual(['wood', 'stone', 'dirt', 'clay']);
    expect(justDragged()).toBe(true);
  });

  test('mouse: a click without moving is not a drag', () => {
    beginHotbarDrag({ pointerType: 'mouse', button: 0, clientX: 350, clientY: 20 }, { key: 'clay', icon: '' });
    window.dispatchEvent(ev('pointerup', { clientX: 352, clientY: 21 }));
    expect(selectHotbar(s())[3]).toBeNull();
  });

  test('mouse: drag a slot onto another swaps; out of the row clears', () => {
    beginHotbarDrag({ pointerType: 'mouse', button: 0, clientX: 50, clientY: 20 }, { key: 'wood', icon: '', fromSlot: 0 });
    window.dispatchEvent(ev('pointermove', { clientX: 250, clientY: 20 }));
    window.dispatchEvent(ev('pointerup', { clientX: 250, clientY: 20 }));
    expect(selectHotbar(s())).toEqual(['dirt', 'stone', 'wood', null]);
    beginHotbarDrag({ pointerType: 'mouse', button: 0, clientX: 150, clientY: 20 }, { key: 'stone', icon: '', fromSlot: 1 });
    window.dispatchEvent(ev('pointermove', { clientX: 1200, clientY: 20 }));
    window.dispatchEvent(ev('pointerup', { clientX: 1200, clientY: 20 }));
    expect(selectHotbar(s())).toEqual(['dirt', null, 'wood', null]);
  });

  test('touch: press and hold, then drag onto a slot', () => {
    beginHotbarDrag({ pointerType: 'touch', clientX: 500, clientY: 500, timeStamp: 0 }, { key: 'stone_slab', icon: '' });
    vi.advanceTimersByTime(250);
    window.dispatchEvent(touchAt('touchmove', 340, 20, 300));
    window.dispatchEvent(touchAt('touchend', 340, 20, 350));
    expect(selectHotbar(s())[3]).toBe('stone_slab');
  });

  test('touch: a quick swipe scrolls instead of dragging', () => {
    beginHotbarDrag({ pointerType: 'touch', clientX: 500, clientY: 500, timeStamp: 0 }, { key: 'clay', icon: '' });
    window.dispatchEvent(touchAt('touchmove', 470, 480, 40));
    vi.advanceTimersByTime(250);
    window.dispatchEvent(touchAt('touchend', 50, 20, 300));
    expect(selectHotbar(s())).toEqual(['wood', 'stone', 'dirt', null]);
  });

  test('touch: a swipe is still a swipe when a slow frame ran the hold timer first', () => {
    beginHotbarDrag({ pointerType: 'touch', clientX: 500, clientY: 500, timeStamp: 0 }, { key: 'clay', icon: '' });
    vi.advanceTimersByTime(250); // the timer runs before the queued move is handled...
    window.dispatchEvent(touchAt('touchmove', 470, 480, 60)); // ...but the finger moved at 60 ms
    window.dispatchEvent(touchAt('touchend', 50, 20, 300));
    expect(selectHotbar(s())).toEqual(['wood', 'stone', 'dirt', null]);
  });

  test('items and food cannot be dragged in', () => {
    beginHotbarDrag({ pointerType: 'mouse', button: 0, clientX: 500, clientY: 500 }, { key: 'berry', icon: '' });
    window.dispatchEvent(ev('pointermove', { clientX: 350, clientY: 20 }));
    window.dispatchEvent(ev('pointerup', { clientX: 350, clientY: 20 }));
    expect(selectHotbar(s())[3]).toBeNull();
  });
});
