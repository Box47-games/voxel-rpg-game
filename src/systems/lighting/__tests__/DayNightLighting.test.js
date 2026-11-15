import {
  getDaylightFactor,
  getAmbientIntensity,
  getDirectionalIntensity,
  getSunPosition,
  getSkyColor,
  getHorizonColor,
  getFogColor,
  getSunColor,
  getGroundBounceColor,
  getAmbientColor,
  getLightingState,
} from '../DayNightLighting';

import {
  LIGHT_AMBIENT_NIGHT,
  LIGHT_AMBIENT_DAY,
  LIGHT_DIRECTIONAL_NIGHT,
  LIGHT_DIRECTIONAL_DAY,
} from '../../../data/tuning';

describe('DayNightLighting', () => {
  describe('getDaylightFactor', () => {
    test('midnight returns 0', () => {
      expect(getDaylightFactor(0)).toBe(0);
    });

    test('noon returns 1', () => {
      expect(getDaylightFactor(0.5)).toBe(1);
    });

    test('deep night returns 0', () => {
      expect(getDaylightFactor(0.1)).toBe(0);
      expect(getDaylightFactor(0.9)).toBe(0);
    });

    test('sunrise midpoint returns ~0.5', () => {
      const mid = (0.20 + 0.30) / 2; // 0.25
      const factor = getDaylightFactor(mid);
      expect(factor).toBeGreaterThan(0.3);
      expect(factor).toBeLessThan(0.7);
    });

    test('sunset midpoint returns ~0.5', () => {
      const mid = (0.70 + 0.80) / 2; // 0.75
      const factor = getDaylightFactor(mid);
      expect(factor).toBeGreaterThan(0.3);
      expect(factor).toBeLessThan(0.7);
    });

    test('after sunrise end returns 1', () => {
      expect(getDaylightFactor(0.35)).toBe(1);
    });

    test('before sunset start returns 1', () => {
      expect(getDaylightFactor(0.65)).toBe(1);
    });

    test('transitions are monotonic during sunrise', () => {
      let prev = 0;
      for (let t = 0.20; t <= 0.30; t += 0.01) {
        const f = getDaylightFactor(t);
        expect(f).toBeGreaterThanOrEqual(prev - 0.001); // allow tiny float error
        prev = f;
      }
    });

    test('transitions are monotonic during sunset', () => {
      let prev = 1;
      for (let t = 0.70; t <= 0.80; t += 0.01) {
        const f = getDaylightFactor(t);
        expect(f).toBeLessThanOrEqual(prev + 0.001);
        prev = f;
      }
    });
  });

  describe('getAmbientIntensity', () => {
    test('noon returns max ambient', () => {
      expect(getAmbientIntensity(0.5)).toBeCloseTo(LIGHT_AMBIENT_DAY, 2);
    });

    test('midnight returns min ambient', () => {
      expect(getAmbientIntensity(0)).toBeCloseTo(LIGHT_AMBIENT_NIGHT, 2);
    });

    test('sunrise is between min and max', () => {
      const val = getAmbientIntensity(0.25);
      expect(val).toBeGreaterThan(LIGHT_AMBIENT_NIGHT);
      expect(val).toBeLessThan(LIGHT_AMBIENT_DAY);
    });
  });

  describe('getDirectionalIntensity', () => {
    test('noon returns max directional', () => {
      expect(getDirectionalIntensity(0.5)).toBeCloseTo(LIGHT_DIRECTIONAL_DAY, 2);
    });

    test('midnight returns min directional', () => {
      expect(getDirectionalIntensity(0)).toBeCloseTo(LIGHT_DIRECTIONAL_NIGHT, 2);
    });
  });

  describe('getSunPosition', () => {
    test('noon sun is high', () => {
      const pos = getSunPosition(0.5);
      expect(pos.y).toBeGreaterThan(30);
    });

    test('midnight sun is low or below horizon', () => {
      const pos = getSunPosition(0);
      expect(pos.y).toBeLessThanOrEqual(0);
    });

    test('sunrise sun is near horizon', () => {
      const pos = getSunPosition(0.20);
      expect(pos.y).toBeLessThan(10);
    });
  });

  describe('sky gradient', () => {
    const brightness = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    const isBlue = (hex) => parseInt(hex.slice(5, 7), 16) > parseInt(hex.slice(1, 3), 16);

    test('noon: a blue sky that pales toward the horizon', () => {
      expect(getSkyColor(0.5)).toBe('#3a7fd6');
      expect(isBlue(getHorizonColor(0.5))).toBe(true);
      expect(brightness(getHorizonColor(0.5))).toBeGreaterThan(brightness(getSkyColor(0.5)));
    });

    test('midnight is dark', () => {
      expect(getSkyColor(0)).toBe('#060a1c');
      expect(brightness(getHorizonColor(0))).toBeLessThan(150);
    });

    test('sunrise and sunset glow orange at the horizon', () => {
      for (const t of [0.25, 0.75]) {
        const h = getHorizonColor(t);
        expect(parseInt(h.slice(1, 3), 16)).toBeGreaterThan(parseInt(h.slice(5, 7), 16) + 80);
      }
    });

    test('fog matches the horizon so distant terrain melts into the sky', () => {
      for (let t = 0; t <= 1; t += 0.1) expect(getFogColor(t)).toBe(getHorizonColor(t));
    });

    test('sunlight is warm by day and cool by night; ground bounce dims at night', () => {
      const day = getSunColor(0.5);
      const night = getSunColor(0);
      expect(parseInt(day.slice(1, 3), 16)).toBeGreaterThanOrEqual(parseInt(day.slice(5, 7), 16));
      expect(parseInt(night.slice(5, 7), 16)).toBeGreaterThan(parseInt(night.slice(1, 3), 16));
      expect(brightness(getGroundBounceColor(0.5))).toBeGreaterThan(brightness(getGroundBounceColor(0)));
    });

    test('returns valid hex for all times', () => {
      for (let t = 0; t <= 1; t += 0.05) {
        for (const fn of [getSkyColor, getHorizonColor, getSunColor, getGroundBounceColor]) {
          expect(fn(t)).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    });
  });

  describe('getAmbientColor', () => {
    test('noon is white', () => {
      expect(getAmbientColor(0.5)).toBe('#ffffff');
    });

    test('night is cool blue', () => {
      expect(getAmbientColor(0)).toBe('#334466');
    });
  });

  describe('getLightingState', () => {
    test('returns all fields', () => {
      const state = getLightingState(0.5);
      expect(state).toHaveProperty('ambientIntensity');
      expect(state).toHaveProperty('ambientColor');
      expect(state).toHaveProperty('directionalIntensity');
      expect(state).toHaveProperty('sunPosition');
      expect(state).toHaveProperty('skyColor');
      expect(state).toHaveProperty('fogColor');
      expect(state).toHaveProperty('daylightFactor');
    });

    test('weather modifier applies correctly (external)', () => {
      const state = getLightingState(0.5); // noon
      const weatherMod = 0.5; // storm
      const effective = state.ambientIntensity * weatherMod;
      expect(effective).toBeCloseTo(LIGHT_AMBIENT_DAY * 0.5, 2);
    });
  });
});
