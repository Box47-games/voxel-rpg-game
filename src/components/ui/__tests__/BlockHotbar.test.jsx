import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import useGameStore from '../../../stores/useGameStore';
import { BlockTypes } from '../../../systems/chunks/blockTypes';
import BlockHotbar from '../BlockHotbar';

vi.mock('../../../utils/deviceDetection', () => ({ isTouchDevice: () => false }));

const press = (key) => act(() => { fireEvent.keyDown(window, { key }); });

describe('BlockHotbar (modeless, desktop)', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  test('starts on the empty hand and shows in Play without build mode', () => {
    expect(useGameStore.getState().selectedBlockType).toBeNull();
    expect(useGameStore.getState().buildMode).toBe(false);
    render(<BlockHotbar />);
    expect(screen.getByRole('button', { name: 'Empty hand' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('number keys pick a block; the same key again returns to the hand', () => {
    render(<BlockHotbar />);
    press('1');
    expect(useGameStore.getState().selectedBlockType).toBe(BlockTypes.DIRT);
    press('3');
    expect(useGameStore.getState().selectedBlockType).toBe(BlockTypes.STONE);
    press('3');
    expect(useGameStore.getState().selectedBlockType).toBeNull();
    press('0');
    expect(useGameStore.getState().selectedBlockType).toBe(BlockTypes.CAMPFIRE);
  });

  test('clicking the hand slot clears the block', () => {
    render(<BlockHotbar />);
    press('2');
    fireEvent.click(screen.getByRole('button', { name: 'Empty hand' }));
    expect(useGameStore.getState().selectedBlockType).toBeNull();
  });

  test('hidden, and number keys ignored, while zoning or placing a building', () => {
    const { container } = render(<BlockHotbar />);
    act(() => { useGameStore.setState({ zoneMode: true }); });
    expect(container).toBeEmptyDOMElement();
    press('1');
    expect(useGameStore.getState().selectedBlockType).toBeNull();
    act(() => { useGameStore.setState({ zoneMode: false, placingBuildingId: 'wooden_shelter' }); });
    expect(container).toBeEmptyDOMElement();
  });
});
