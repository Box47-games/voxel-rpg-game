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
    useGameStore.setState({ gameState: 'playing' });
  });

  test('hidden on the title screen', () => {
    useGameStore.setState({ gameState: 'intro' });
    const { container } = render(<BlockHotbar />);
    expect(container).toBeEmptyDOMElement();
  });

  test('starts on the empty hand and shows in Play without build mode', () => {
    expect(useGameStore.getState().selectedBlockType).toBeNull();
    render(<BlockHotbar />);
    expect(screen.getByRole('button', { name: 'Empty hand' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('keys 1-4 hold a slot; the same key again returns to the hand', () => {
    render(<BlockHotbar />);
    press('1');
    expect(useGameStore.getState().selectedBlockType).toBe(BlockTypes.WOOD);
    press('2');
    expect(useGameStore.getState().selectedBlockType).toBe(BlockTypes.STONE);
    expect(useGameStore.getState().heldSlot).toBe(1);
    press('2');
    expect(useGameStore.getState().selectedBlockType).toBeNull();
    expect(useGameStore.getState().heldSlot).toBeNull();
    press('5'); // only 4 slots
    expect(useGameStore.getState().heldSlot).toBeNull();
  });

  test('a slot holding pieces puts that piece in hand; R turns it', () => {
    act(() => useGameStore.getState().setHotbarSlot(3, 'stone_slab'));
    render(<BlockHotbar />);
    press('4');
    const st = useGameStore.getState();
    expect(st.heldSlot).toBe(3);
    expect(st.heldPiece).toBe('stone_slab');
    expect(st.selectedBlockType).toBe(BlockTypes.STONE);
    expect(screen.getByText(/R to turn/)).toBeInTheDocument();
    press('r');
    expect(useGameStore.getState().pieceRotation).toBe(1);
    press('4'); // back to the hand
    expect(useGameStore.getState().heldPiece).toBeNull();
  });

  test('cubes have one orientation: R does nothing', () => {
    act(() => useGameStore.getState().setHotbarSlot(3, 'dirt_cube'));
    render(<BlockHotbar />);
    press('4');
    press('r');
    expect(useGameStore.getState().pieceRotation).toBe(0);
    expect(screen.queryByText(/R to turn/)).toBeNull();
  });

  test('clicking the hand slot clears the block', () => {
    render(<BlockHotbar />);
    press('2');
    fireEvent.click(screen.getByRole('button', { name: 'Empty hand' }));
    expect(useGameStore.getState().selectedBlockType).toBeNull();
  });

  test('a block picked from the Build catalog shows as an extra slot', () => {
    render(<BlockHotbar />);
    act(() => useGameStore.getState().pickBlock(BlockTypes.CAMPFIRE));
    expect(screen.getByRole('button', { name: /^Campfire/ })).toHaveAttribute('aria-pressed', 'true');
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
