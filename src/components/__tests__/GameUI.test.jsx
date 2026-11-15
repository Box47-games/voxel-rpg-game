import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import useGameStore from '../../stores/useGameStore';
import { game3DSaveManager } from '../../persistence/Game3DSaveManager';
import GameUI from '../GameUI';
import DeathScreen from '../DeathScreen';
import PauseMenu from '../PauseMenu';

const setState = (patch) => act(() => useGameStore.setState(patch));

describe('Start screen', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useGameStore.setState({ gameState: 'intro' });
    vi.spyOn(game3DSaveManager, 'listSaves').mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  test('Start Game begins play and unpauses the world', async () => {
    render(<GameUI />);
    expect(screen.getByTestId('start-screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/rift\s*holm/i);
    expect(screen.getByRole('region', { name: 'Controls' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
    expect(useGameStore.getState().gameState).toBe('playing');
    expect(useGameStore.getState().worldTime.paused).toBe(false);
  });

  test('Enter starts a new game when there is no save', async () => {
    render(<GameUI />);
    await act(async () => {});
    act(() => { fireEvent.keyDown(window, { key: 'Enter' }); });
    expect(useGameStore.getState().gameState).toBe('playing');
  });

  test('Continue loads the default save once the world is ready', async () => {
    game3DSaveManager.listSaves.mockResolvedValue([
      { slot: 'default', savedAt: new Date().toISOString(), playerLevel: 4, version: 7 },
    ]);
    const load = vi.spyOn(game3DSaveManager, 'loadGame').mockResolvedValue({ success: true });
    render(<GameUI />);

    const continueButton = await screen.findByRole('button', { name: /continue/i });
    expect(continueButton).toHaveTextContent('Lv 4');
    expect(continueButton).toBeDisabled(); // no chunk manager yet
    expect(screen.getByRole('button', { name: 'New Game' })).toBeEnabled();

    const chunkManager = { getModifiedChunks: () => [] };
    setState({ _chunkManager: chunkManager });
    expect(continueButton).toBeEnabled();

    await act(async () => { fireEvent.click(continueButton); });
    expect(load).toHaveBeenCalledWith(useGameStore, chunkManager, 'default');
    expect(useGameStore.getState().gameState).toBe('playing');
  });

  test('a failed load shows the error and stays on the title screen', async () => {
    game3DSaveManager.listSaves.mockResolvedValue([{ slot: 'default', savedAt: '2026-01-02T03:04:05Z', playerLevel: 1 }]);
    vi.spyOn(game3DSaveManager, 'loadGame').mockResolvedValue({ success: false, message: 'Save file is corrupted' });
    useGameStore.setState({ _chunkManager: {} });
    render(<GameUI />);

    const continueButton = await screen.findByRole('button', { name: /continue/i });
    await act(async () => { fireEvent.click(continueButton); });
    expect(screen.getByRole('alert')).toHaveTextContent('Save file is corrupted');
    expect(useGameStore.getState().gameState).toBe('intro');
  });

  test('saves in other slots do not offer Continue', async () => {
    game3DSaveManager.listSaves.mockResolvedValue([{ slot: 'dev', savedAt: '2026-01-02T03:04:05Z', playerLevel: 9 }]);
    render(<GameUI />);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument();
  });
});

describe('HUD', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useGameStore.setState({ gameState: 'playing' });
  });

  test('renders nothing while paused', () => {
    useGameStore.setState({ gameState: 'paused' });
    const { container } = render(<GameUI />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows vitals, level, clock and purse', () => {
    const s = useGameStore.getState();
    useGameStore.setState({
      player: { ...s.player, health: 37, maxHealth: 100, level: 3, xp: 40, xpToNext: 200 },
      inventory: { ...s.inventory, gold: 123, potions: 2 },
      worldTime: { ...s.worldTime, dayNumber: 5, hour: 7, minute: 5, isNight: false, period: 'day' },
    });
    render(<GameUI />);

    expect(screen.getByRole('meter', { name: 'Health' })).toHaveTextContent('37 / 100');
    expect(screen.getByRole('meter', { name: 'Health' })).toHaveAttribute('aria-valuenow', '37');
    expect(screen.getByRole('meter', { name: 'Mana' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Hunger' })).toBeInTheDocument();
    expect(screen.getByLabelText('Level 3')).toHaveTextContent('3');
    expect(screen.getByText('40 / 200 XP')).toBeInTheDocument();
    expect(screen.getByText('Day 5')).toBeInTheDocument();
    expect(screen.getByText('07:05')).toBeInTheDocument();
    expect(screen.getByTitle('Gold')).toHaveTextContent('123');
    expect(screen.getByTitle('Potions')).toHaveTextContent('2');
  });

  test('low health and hunger flash', () => {
    const s = useGameStore.getState();
    useGameStore.setState({
      player: { ...s.player, health: 10, maxHealth: 100 },
      hunger: { ...s.hunger, current: 5 },
    });
    render(<GameUI />);
    expect(screen.getByRole('meter', { name: 'Health' }).querySelector('.vx-bar--low')).not.toBeNull();
    expect(screen.getByRole('meter', { name: 'Hunger' }).querySelector('.vx-bar--low')).not.toBeNull();
    expect(screen.getByRole('meter', { name: 'Mana' }).querySelector('.vx-bar--low')).toBeNull();
  });

  test('bars clamp to the track', () => {
    const s = useGameStore.getState();
    useGameStore.setState({ player: { ...s.player, health: 150, maxHealth: 100 } });
    render(<GameUI />);
    const track = screen.getByRole('meter', { name: 'Health' }).querySelector('.vx-bar');
    expect(track.style.getPropertyValue('--fill')).toBe('100%');
  });

  test('Build and Zones slots toggle their modes and show the badge', () => {
    render(<GameUI />);
    const build = screen.getByRole('button', { name: 'Build' });
    expect(build).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(build);
    expect(useGameStore.getState().buildMode).toBe(true);
    expect(screen.getByRole('button', { name: 'Build' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Build mode')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zones' }));
    expect(useGameStore.getState().zoneMode).toBe(true);
    expect(useGameStore.getState().buildMode).toBe(false);
    expect(screen.getByText('Zone mode')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zones' }));
    expect(useGameStore.getState().zoneMode).toBe(false);
  });

  test('Inventory and Crafting slots press their hotkeys; Settlement opens the dashboard', () => {
    const keys = [];
    const onKey = (e) => keys.push(e.key);
    window.addEventListener('keydown', onKey);
    render(<GameUI />);
    fireEvent.click(screen.getByRole('button', { name: 'Inventory' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crafting' }));
    window.removeEventListener('keydown', onKey);
    expect(keys).toEqual(['i', 'c']);

    const before = useGameStore.getState().settlementDashboardOpen;
    fireEvent.click(screen.getByRole('button', { name: 'Settlement' }));
    expect(useGameStore.getState().settlementDashboardOpen).toBe(!before);
  });

  test('shows the shelter chip only when sheltered', () => {
    const s = useGameStore.getState();
    useGameStore.setState({ shelter: { ...s.shelter, isExposed: true } });
    const { rerender } = render(<GameUI />);
    expect(screen.queryByText(/shelter/i)).toBeNull();
    setState({ shelter: { ...s.shelter, isExposed: false, isFullShelter: true } });
    rerender(<GameUI />);
    expect(screen.getByText('Sheltered')).toBeInTheDocument();
  });
});

describe('DeathScreen', () => {
  test('shows the cause and respawns', () => {
    const onRespawn = vi.fn();
    render(<DeathScreen onRespawn={onRespawn} deathCause="Slain by a goblin" />);
    expect(screen.getByRole('alertdialog', { name: /you died/i })).toBeInTheDocument();
    expect(screen.getByText('Slain by a goblin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Respawn' }));
    expect(onRespawn).toHaveBeenCalledTimes(1);
  });
});

describe('PauseMenu', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useGameStore.setState({ gameState: 'playing' });
  });

  test('F10 opens it and Resume closes it', () => {
    render(<PauseMenu />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => { fireEvent.keyDown(window, { code: 'F10', key: 'F10' }); });
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeInTheDocument();
    expect(useGameStore.getState().gameState).toBe('paused');

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useGameStore.getState().gameState).toBe('playing');
  });

  test('Save reports success', async () => {
    vi.spyOn(game3DSaveManager, 'saveGame').mockResolvedValue({ success: true });
    render(<PauseMenu />);
    act(() => { fireEvent.keyDown(window, { code: 'F10', key: 'F10' }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Game' })); });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Game saved!'));
    vi.restoreAllMocks();
  });
});

describe('MobileTouchTutorial', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    localStorage.removeItem('mobileTutorialSeen');
    window.ontouchstart = null; // makes isTouchDevice() true
  });
  afterEach(() => {
    delete window.ontouchstart;
    localStorage.removeItem('mobileTutorialSeen');
  });

  test('waits for play to start, then shows once', async () => {
    const { default: MobileTouchTutorial } = await import('../ui/MobileTouchTutorial');
    useGameStore.setState({ gameState: 'intro' });
    const { unmount } = render(<MobileTouchTutorial />);
    expect(screen.queryByRole('dialog')).toBeNull();

    setState({ gameState: 'playing' });
    const dialog = screen.getByRole('dialog', { name: 'Touch controls' });
    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();

    render(<MobileTouchTutorial />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
