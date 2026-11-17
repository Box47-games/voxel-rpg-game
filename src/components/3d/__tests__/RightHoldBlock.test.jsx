import '../testSetup';
import React from 'react';
import { render } from '@testing-library/react';
import useGameStore from '../../../stores/useGameStore';
import { useKeyboard } from '../../../hooks/useKeyboard';
import CameraRotateControls from '../CameraRotateControls';
import { RIGHT_HOLD_BLOCK_MS } from '../../../data/tuning';

// Read the shared key state the Player reads (keys.block)
let keys;
function KeyProbe() {
  keys = useKeyboard();
  return null;
}

// The mock canvas is detached, so capture the mousedown handler it registers
let canvasHandlers;
beforeEach(() => {
  canvasHandlers = {};
  const orig = HTMLCanvasElement.prototype.addEventListener;
  vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener').mockImplementation(function (type, fn, opts) {
    canvasHandlers[type] = fn;
    return orig.call(this, type, fn, opts);
  });
  vi.useFakeTimers();
  useGameStore.getState().reset();
  useGameStore.setState({ gameState: 'playing' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const rightDown = (x = 100, y = 100) => canvasHandlers.mousedown({ button: 2, clientX: x, clientY: y, preventDefault() {} });
const move = (x, y) => document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
const rightUp = () => document.dispatchEvent(new MouseEvent('mouseup', { button: 2 }));

describe('right-mouse hold blocks (desktop)', () => {
  test('holding still with an empty hand raises the guard until release', () => {
    render(<><KeyProbe /><CameraRotateControls /></>);
    rightDown();
    vi.advanceTimersByTime(RIGHT_HOLD_BLOCK_MS - 20);
    expect(!!keys.block).toBe(false);
    vi.advanceTimersByTime(40);
    expect(keys.block).toBe(true);
    rightUp();
    expect(keys.block).toBe(false);
  });

  test('a drag is the camera, not a block', () => {
    render(<><KeyProbe /><CameraRotateControls /></>);
    rightDown(100, 100);
    move(160, 100);
    vi.advanceTimersByTime(RIGHT_HOLD_BLOCK_MS * 2);
    expect(!!keys.block).toBe(false);
    rightUp();
  });

  test('with a block in hand (right-click places) or while planning, no block', () => {
    render(<><KeyProbe /><CameraRotateControls /></>);
    useGameStore.setState({ selectedBlockType: 1 });
    rightDown();
    vi.advanceTimersByTime(RIGHT_HOLD_BLOCK_MS * 2);
    expect(!!keys.block).toBe(false);
    rightUp();
    useGameStore.setState({ selectedBlockType: null });
    useGameStore.getState().enterMode('plan');
    rightDown();
    vi.advanceTimersByTime(RIGHT_HOLD_BLOCK_MS * 2);
    expect(!!keys.block).toBe(false);
    rightUp();
  });

  test('Tab and Z no longer change modes; P does', () => {
    render(<KeyProbe />);
    const press = (code) => document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    press('Tab');
    press('KeyZ');
    expect(useGameStore.getState().planMode).toBe(false);
    press('KeyP');
    expect(useGameStore.getState().planMode).toBe(true);
  });
});
