/**
 * The sky: gradient colors follow the time of day, stars come out at night,
 * clouds are built deterministically.
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import '../testSetup';
import { advanceFrames } from '@react-three/fiber';
import useGameStore from '../../../stores/useGameStore';
import SkyDome, { buildClouds } from '../SkyDome';

describe('SkyDome', () => {
  beforeEach(() => useGameStore.getState().reset());

  test('renders and runs through day and night without errors', () => {
    render(<SkyDome />);
    for (const timeOfDay of [0.5, 0.75, 0]) {
      useGameStore.setState({ worldTime: { ...useGameStore.getState().worldTime, timeOfDay } });
      expect(() => act(() => advanceFrames(3))).not.toThrow();
    }
  });

  test('clouds are a few flat blobs each, the same every time', () => {
    const clouds = buildClouds(10);
    expect(clouds).toHaveLength(10);
    expect(buildClouds(10)).toEqual(clouds);
    for (const cloud of clouds) {
      expect(cloud.parts.length).toBeGreaterThanOrEqual(3);
      for (const [, , , sx, sy, sz] of cloud.parts) {
        expect(sy).toBeLessThan(Math.min(sx, sz)); // wider than tall
      }
    }
  });
});
