import {
  isSheltered,
  getHealthRegenRate,
  getStaminaRegenMult,
  canSpawnNear,
} from '../ShelterEffects';
import {
  PLAYER_HEALTH_REGEN,
  PLAYER_HEALTH_REGEN_DELAY,
  SHELTER_HEALTH_REGEN_MULT,
  SHELTER_STAMINA_REGEN_MULT,
  SHELTER_MONSTER_EXCLUSION,
  HUNGER_WELL_FED,
  HUNGER_STARVING,
} from '../../../data/tuning';
import useGameStore from '../../../stores/useGameStore';

const OPEN = { isFullShelter: false, isPartialShelter: false, isExposed: true };
const FULL = { isFullShelter: true, isPartialShelter: false, isExposed: false };
const PARTIAL = { isFullShelter: false, isPartialShelter: true, isExposed: false };
const FED = 100;

describe('ShelterEffects', () => {
  test('full and partial shelter both count', () => {
    expect(isSheltered(FULL)).toBe(true);
    expect(isSheltered(PARTIAL)).toBe(true);
    expect(isSheltered(OPEN)).toBe(false);
    expect(isSheltered(undefined)).toBe(false);
  });

  test('health regen: base when well fed, doubled in shelter', () => {
    expect(getHealthRegenRate(FED, OPEN)).toBeCloseTo(PLAYER_HEALTH_REGEN);
    expect(getHealthRegenRate(FED, FULL)).toBeCloseTo(PLAYER_HEALTH_REGEN * SHELTER_HEALTH_REGEN_MULT);
  });

  test('health regen: halved when hungry, none when starving, even in shelter', () => {
    const hungry = (HUNGER_WELL_FED + HUNGER_STARVING) / 2;
    expect(getHealthRegenRate(hungry, OPEN)).toBeCloseTo(PLAYER_HEALTH_REGEN * 0.5);
    expect(getHealthRegenRate(HUNGER_STARVING - 1, FULL)).toBe(0);
  });

  test('health regen waits after damage', () => {
    expect(getHealthRegenRate(FED, FULL, 0.5)).toBe(0);
  });

  test('stamina regen is faster in shelter', () => {
    expect(getStaminaRegenMult(OPEN)).toBe(1);
    expect(getStaminaRegenMult(PARTIAL)).toBe(SHELTER_STAMINA_REGEN_MULT);
  });

  test('spawns are kept away from a sheltered player only', () => {
    const p = [0, 0, 0];
    expect(canSpawnNear(SHELTER_MONSTER_EXCLUSION - 1, 0, p, true)).toBe(false);
    expect(canSpawnNear(SHELTER_MONSTER_EXCLUSION + 1, 0, p, true)).toBe(true);
    expect(canSpawnNear(1, 0, p, false)).toBe(true);
  });

  test('taking damage restarts the regen delay', () => {
    useGameStore.getState().updatePlayer({ healthRegenDelay: 0, isInvincible: false });
    useGameStore.getState().dealDamageToPlayer(10, 'test');
    expect(useGameStore.getState().player.healthRegenDelay).toBe(PLAYER_HEALTH_REGEN_DELAY);
  });
});
