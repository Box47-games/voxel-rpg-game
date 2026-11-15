/**
 * WildlifeAnimal: renders a skinned voxel model, animates it each frame and
 * stops while the game is paused.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '../testSetup';
import { advanceFrames } from '@react-three/fiber';
import useGameStore from '../../../stores/useGameStore';
import WildlifeAnimal from '../WildlifeAnimal';
import { WILDLIFE_TYPES } from '../../../data/wildlifeTypes';
import { stepAnimation } from '../wildlife/animalAnimation';

vi.mock('../wildlife/animalAnimation', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, stepAnimation: vi.fn(actual.stepAnimation) };
});

const animal = (type, overrides = {}) => ({
  id: `wildlife_test_${type}`,
  type,
  position: [0, 10, 0],
  spawnPosition: [0, 10, 0],
  alive: true,
  ...overrides,
});

describe('WildlifeAnimal', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useGameStore.setState({
      gameState: 'playing',
      player: { ...useGameStore.getState().player, position: [200, 10, 200] },
    });
  });

  test.each(Object.keys(WILDLIFE_TYPES))('%s renders a collider sized to its body', (type) => {
    const { container } = render(<WildlifeAnimal animalData={animal(type)} chunkManager={null} />);
    const collider = screen.getByTestId('rapier-cuboid-collider');
    expect(collider).toBeInTheDocument();
    expect(container.querySelector('primitive')).not.toBeNull();
    expect(() => advanceFrames(30)).not.toThrow();
  });

  test('a deer near the player animates as fleeing, at running speed', () => {
    useGameStore.setState({ player: { ...useGameStore.getState().player, position: [0, 10, -5] } });
    render(<WildlifeAnimal animalData={animal('DEER')} chunkManager={null} />);
    stepAnimation.mockClear();
    advanceFrames(2);
    const [, spec, motion] = stepAnimation.mock.calls.at(-1);
    expect(spec.gait).toBe('walk');
    expect(motion.fleeing).toBe(true);
    expect(motion.speed).toBeGreaterThan(WILDLIFE_TYPES.DEER.speed);
  });

  test('does nothing while paused', () => {
    const data = animal('WOLF');
    useGameStore.setState({ gameState: 'paused' });
    render(<WildlifeAnimal animalData={data} chunkManager={null} />);
    data.position[0] = 123;
    advanceFrames(10);
    expect(data.position[0]).toBe(123); // the frame loop never wrote it back
  });

  test('unknown types render nothing', () => {
    const { container } = render(<WildlifeAnimal animalData={animal('DRAGON')} chunkManager={null} />);
    expect(container.innerHTML).toBe('');
  });
});
