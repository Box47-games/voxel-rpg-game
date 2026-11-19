/**
 * The player's equipment on the body: tiers and kinds from item ids, the look
 * key the model rebuilds on, worn parts, the held tool's animation, and the
 * cape earned by sealing the first rift.
 */
import {
  EARNED_CAPE,
  GEAR_TIERS,
  gearLookFromKey,
  gearTier,
  heldBone,
  heldKind,
  playerGearLook,
  selectPlayerGearKey,
} from '../playerGear';
import { buildHumanoidModel, PLAYER_LOOK, TOOL_BONES } from '../humanoidModel';
import { createHumanoidAnimState, stepHumanoidAnimation, triggerAction } from '../humanoidAnimation';
import useGameStore from '../../../../stores/useGameStore';

const DT = 1 / 60;
const shown = (pose, tool) => (pose.bones[tool]?.sx ?? 1) > 0;
const partsOn = (model, bone) => model.parts.filter((p) => p[0] === bone);

describe('tiers and kinds', () => {
  it('reads the tier from the recipe id', () => {
    expect(gearTier({ id: 'stonePickaxe' })).toBe('stone');
    expect(gearTier({ id: 'steelAxe' })).toBe('steel');
    expect(gearTier({ id: 'crystalSword' })).toBe('crystal');
    expect(gearTier({ id: 'leatherArmor' })).toBe('leather');
    expect(gearTier({ id: 'woodenClub' })).toBe('wood');
    expect(gearTier({ id: 'mysteryHelm' })).toBe('iron'); // unnamed: iron
  });

  it('tells a pickaxe from an axe, a club and a sword', () => {
    expect(heldKind({ id: 'ironPickaxe' })).toBe('pick');
    expect(heldKind({ id: 'stoneAxe' })).toBe('axe');
    expect(heldKind({ id: 'woodenClub' })).toBe('club');
    expect(heldKind({ id: 'steelSword' })).toBe('sword');
    expect(heldKind(null)).toBeNull();
    expect(heldBone('axe')).toBe('toolAxe');
    expect(heldBone(null)).toBeNull();
  });

  it('every tier has two colours', () => {
    for (const colours of Object.values(GEAR_TIERS)) expect(colours).toHaveLength(2);
  });
});

describe('gear look', () => {
  const equipment = {
    weapon: { id: 'steelAxe' },
    helmet: { id: 'ironHelmet' },
    armor: { id: 'leatherArmor' },
    offhand: { id: 'woodenShield' },
  };

  it('maps equipment to look fields, cape only once a rift is sealed', () => {
    const look = playerGearLook(equipment, 0);
    expect(look).toMatchObject({ heldKind: 'axe', heldTier: 'steel', helmetTier: 'iron', armorTier: 'leather', shieldTier: 'wood', cape: null });
    expect(playerGearLook(equipment, 1).cape).toBe(EARNED_CAPE);
  });

  it('round-trips through the store key', () => {
    const key = selectPlayerGearKey({ equipment, riftsClosed: 2 });
    expect(gearLookFromKey(key)).toEqual(playerGearLook(equipment, 2));
    expect(selectPlayerGearKey({ equipment: {}, riftsClosed: 0 })).toBe('-|-|-|-|-|-|-|-');
  });

  it('adds worn parts and tier colours to the model', () => {
    const bare = buildHumanoidModel(PLAYER_LOOK);
    const geared = buildHumanoidModel({ ...PLAYER_LOOK, ...playerGearLook(equipment, 1) });
    expect(geared.parts.length).toBeGreaterThan(bare.parts.length);
    expect(partsOn(geared, 'shield').length).toBeGreaterThan(0);
    expect(partsOn(geared, 'cape').length).toBeGreaterThan(0);
    expect(partsOn(bare, 'shield')).toHaveLength(0);
    expect(geared.colors.axeHead).toBe(GEAR_TIERS.steel[0]);
    expect(geared.colors.plate).toBe(GEAR_TIERS.leather[0]);
    // Settlers keep plain iron tools
    expect(bare.colors.axeHead).toBe('#7d848c');
  });
});

describe('held tool animation', () => {
  it('carries the equipped tool and hides the others', () => {
    const pose = stepHumanoidAnimation(createHumanoidAnimState(0), { speed: 0, held: 'toolAxe' }, DT);
    expect(shown(pose, 'toolAxe')).toBe(true);
    for (const t of TOOL_BONES.filter((b) => b !== 'toolAxe')) expect(shown(pose, t)).toBe(false);
  });

  it('mines with the held tool, or bare-handed', () => {
    const withAxe = stepHumanoidAnimation(createHumanoidAnimState(0), { speed: 0, activity: 'mine', held: 'toolAxe', mineTool: 'toolAxe' }, DT);
    expect(shown(withAxe, 'toolAxe')).toBe(true);
    expect(shown(withAxe, 'toolPick')).toBe(false);
    const fists = stepHumanoidAnimation(createHumanoidAnimState(0), { speed: 0, activity: 'mine', held: null, mineTool: null }, DT);
    for (const t of TOOL_BONES) expect(shown(fists, t)).toBe(false);
    // Settlers (no mineTool given) still use a pickaxe
    const settler = stepHumanoidAnimation(createHumanoidAnimState(0), { speed: 0, activity: 'mine' }, DT);
    expect(shown(settler, 'toolPick')).toBe(true);
  });

  it('swings the equipped weapon in melee', () => {
    const anim = createHumanoidAnimState(0);
    triggerAction(anim, 'melee');
    const pose = stepHumanoidAnimation(anim, { speed: 0, held: 'toolClub' }, DT);
    expect(shown(pose, 'toolClub')).toBe(true);
    expect(shown(pose, 'toolSword')).toBe(false);
  });
});

describe('earned cape', () => {
  beforeEach(() => {
    useGameStore.setState({ riftsClosed: 0 });
    window.addNotification = vi.fn();
  });
  afterEach(() => {
    delete window.addNotification;
  });

  it('the first sealed rift earns the cape with a toast, later ones only count', () => {
    useGameStore.getState().noteRiftClosed();
    expect(useGameStore.getState().riftsClosed).toBe(1);
    expect(window.addNotification).toHaveBeenCalledTimes(1);
    expect(window.addNotification.mock.calls[0][0].title).toMatch(/cape/i);
    useGameStore.getState().noteRiftClosed();
    expect(useGameStore.getState().riftsClosed).toBe(2);
    expect(window.addNotification).toHaveBeenCalledTimes(1);
    expect(gearLookFromKey(selectPlayerGearKey(useGameStore.getState())).cape).toBe(EARNED_CAPE);
  });
});
