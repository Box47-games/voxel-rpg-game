/**
 * Procedural wildlife animation: gaits, idles, tails and wings.
 */
import { createAnimState, stepAnimation } from '../animalAnimation';
import { ANIMAL_MODELS } from '../animalModels';

const DT = 1 / 60;

/** Run `seconds` of animation at a fixed motion and return every pose. */
function run(spec, motion, seconds, anim = createAnimState(0.3)) {
  const poses = [];
  for (let t = 0; t < seconds; t += DT) poses.push(stepAnimation(anim, spec, motion, DT));
  return { poses, anim };
}

const range = (values) => Math.max(...values) - Math.min(...values);

describe('ground gaits', () => {
  test('a walking deer swings diagonal legs together and opposite pairs apart', () => {
    const { poses } = run(ANIMAL_MODELS.DEER.anim, { speed: 3 }, 2);
    const last = poses.slice(-60);
    for (const p of last) {
      expect(p.legs.FL).toBeCloseTo(p.legs.BR, 6);
      expect(p.legs.FR).toBeCloseTo(-p.legs.FL, 6);
    }
    expect(range(last.map((p) => p.legs.FL))).toBeGreaterThan(0.6);
  });

  test('bounding animals move front and back pairs in turn', () => {
    const { poses } = run(ANIMAL_MODELS.SQUIRREL.anim, { speed: 3 }, 1);
    const p = poses.at(-1);
    expect(p.legs.FL).toBeCloseTo(p.legs.FR, 6);
    expect(p.legs.BL).toBeCloseTo(-p.legs.FL, 6);
  });

  test('waddlers roll side to side', () => {
    const { poses } = run(ANIMAL_MODELS.BEAVER.anim, { speed: 1.5 }, 2);
    expect(range(poses.slice(-60).map((p) => p.bodyRoll))).toBeGreaterThan(0.05);
  });

  test('faster movement cycles the legs faster', () => {
    const spec = ANIMAL_MODELS.WOLF.anim;
    const slow = run(spec, { speed: 1.5 }, 2).anim;
    const fast = run(spec, { speed: 6 }, 2).anim;
    // Count completed cycles via total phase advanced (phase wraps, so track it directly)
    const advance = (speed) => {
      const anim = createAnimState(0);
      run(spec, { speed }, 1, anim);
      const before = anim.phase;
      stepAnimation(anim, spec, { speed }, DT);
      return (anim.phase - before + Math.PI * 2) % (Math.PI * 2);
    };
    expect(advance(6)).toBeGreaterThan(advance(1.5) * 3);
    expect(slow).not.toBe(fast);
  });

  test('legs settle when the animal stops', () => {
    const anim = createAnimState(0.5);
    run(ANIMAL_MODELS.DEER.anim, { speed: 3 }, 1, anim);
    const { poses } = run(ANIMAL_MODELS.DEER.anim, { speed: 0 }, 1.5, anim);
    expect(Math.abs(poses.at(-1).legs.FL)).toBeLessThan(0.02);
  });
});

describe('idle behaviour', () => {
  test('a still deer lowers its head to graze, then looks up again', () => {
    const { poses } = run(ANIMAL_MODELS.DEER.anim, { speed: 0 }, 20);
    const pitches = poses.map((p) => p.headPitch);
    expect(Math.max(...pitches)).toBeGreaterThan(0.8);
    expect(pitches.some((v, i) => i > pitches.indexOf(Math.max(...pitches)) && v < 0.1)).toBe(true);
  });

  test('predators turn their heads to look around', () => {
    const { poses } = run(ANIMAL_MODELS.WOLF.anim, { speed: 0 }, 20);
    expect(Math.max(...poses.map((p) => Math.abs(p.headYaw)))).toBeGreaterThan(0.5);
  });

  test('moving cancels an idle action', () => {
    const anim = createAnimState(0.1);
    run(ANIMAL_MODELS.DEER.anim, { speed: 0 }, 6, anim);
    run(ANIMAL_MODELS.DEER.anim, { speed: 3 }, 1, anim);
    expect(anim.action).toBeNull();
    expect(Math.abs(anim.head.pitch)).toBeLessThan(0.1);
  });

  test('each animal idles on its own rhythm', () => {
    const a = run(ANIMAL_MODELS.DEER.anim, { speed: 0 }, 6, createAnimState(0.1)).poses;
    const b = run(ANIMAL_MODELS.DEER.anim, { speed: 0 }, 6, createAnimState(0.7)).poses;
    expect(a.map((p) => p.headPitch)).not.toEqual(b.map((p) => p.headPitch));
  });
});

describe('tails', () => {
  test('a fleeing deer raises its white tail', () => {
    const { poses } = run(ANIMAL_MODELS.DEER.anim, { speed: 5, fleeing: true }, 1);
    expect(poses.at(-1).tailPitch).toBeGreaterThan(1.1);
  });

  test('a wolf wags harder while moving', () => {
    const still = run(ANIMAL_MODELS.WOLF.anim, { speed: 0 }, 2).poses;
    const moving = run(ANIMAL_MODELS.WOLF.anim, { speed: 4 }, 2).poses;
    expect(range(moving.map((p) => p.tailYaw))).toBeGreaterThan(range(still.map((p) => p.tailYaw)));
  });
});

describe('flight', () => {
  test('bats flap fast and symmetrically, with no leg motion', () => {
    const { poses } = run(ANIMAL_MODELS.BAT.anim, { speed: 3 }, 1);
    const lifts = poses.map((p) => p.wingLift);
    expect(range(lifts)).toBeGreaterThan(1.4);
    // ~7 beats a second: count upward zero crossings around the dihedral
    let beats = 0;
    for (let i = 1; i < lifts.length; i++) if (lifts[i - 1] < 0.1 && lifts[i] >= 0.1) beats++;
    expect(beats).toBeGreaterThanOrEqual(6);
    expect(poses.every((p) => p.legs.FL === 0)).toBe(true);
  });

  test('crows glide between bouts of flapping, but never while fleeing', () => {
    const anim = createAnimState(0.2);
    const { poses } = run(ANIMAL_MODELS.CROW.anim, { speed: 3 }, 12, anim);
    // A glide holds the wings still for a while
    let still = 0;
    let longest = 0;
    for (let i = 1; i < poses.length; i++) {
      still = Math.abs(poses[i].wingLift - poses[i - 1].wingLift) < 0.001 ? still + 1 : 0;
      longest = Math.max(longest, still);
    }
    expect(longest).toBeGreaterThan(30);

    const fleeing = run(ANIMAL_MODELS.CROW.anim, { speed: 5, fleeing: true }, 6).poses;
    expect(range(fleeing.slice(-30).map((p) => p.wingLift))).toBeGreaterThan(0.8);
  });

  test('climbing tips the nose up', () => {
    const { poses } = run(ANIMAL_MODELS.CROW.anim, { speed: 3, verticalSpeed: 2 }, 0.5);
    expect(poses.at(-1).bodyPitch).toBeLessThan(0);
  });
});
