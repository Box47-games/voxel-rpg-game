/**
 * Settlement and companion visuals: stockpile crates, scaffolding frame,
 * thought-bubble icons and the companion rigs.
 */
import { planCrates, crateBoxes, mergeColoredBoxes } from '../StockpileVisual';
import { scaffoldFrame } from '../ConstructionVisual';
import { THOUGHT_ART, thoughtTexture } from '../NPCThoughtBubble';
import { createCompanionRig, COMPANION_LOOKS, COMPANION_ANIMALS } from '../Companion';
import { artUrl } from '../../ui/art';
import { boxEdgePositions, footprintGridPositions } from '../BlueprintGhost';

describe('stockpile crates', () => {
  it('gives every material a crate and fills the last one partly', () => {
    const crates = planCrates({ stone: 23, wood: 3 }, 20);
    expect(crates.filter((c) => c.material === 'stone').length).toBeGreaterThan(1);
    expect(crates.some((c) => c.material === 'wood')).toBe(true);
    for (const c of crates) {
      expect(c.fill).toBeGreaterThan(0);
      expect(c.fill).toBeLessThanOrEqual(1);
    }
  });

  it('never shows more crates than there is room for, materials first', () => {
    const items = { stone: 500, wood: 400, iron: 50, berry: 2, clay: 1 };
    // Room for 8: all five materials get a crate before any gets a second
    const eight = planCrates(items, 8);
    expect(eight.length).toBeLessThanOrEqual(8);
    expect(new Set(eight.map((c) => c.material)).size).toBe(5);
    // Room for 4: the four biggest
    const four = planCrates(items, 4);
    expect(four).toHaveLength(4);
    expect(four.map((c) => c.material)).toEqual(['stone', 'wood', 'iron', 'berry']);
    expect(planCrates({}, 10)).toEqual([]);
  });

  it('builds one merged geometry with a colour per vertex', () => {
    const boxes = crateBoxes('stone', 0.5);
    const g = mergeColoredBoxes(boxes);
    expect(g.attributes.position.count).toBe(boxes.length * 24);
    expect(g.attributes.color.count).toBe(g.attributes.position.count);
    expect(g.index.count).toBe(boxes.length * 36);
    // Fuller crates heap higher
    const top = (fill) => Math.max(...crateBoxes('stone', fill).map(([s, c]) => c[1] + s[1] / 2));
    expect(top(1)).toBeGreaterThan(top(0.2));
  });
});

describe('scaffolding frame', () => {
  const site = { position: [10, 4, 20] };
  it('has a rail per storey per side, braces between, and four pads', () => {
    const tall = scaffoldFrame(site, { width: 3, depth: 3, height: 4 }); // 8 units: 2 storeys
    expect(tall.rails).toHaveLength(8);
    expect(tall.braces).toHaveLength(8);
    expect(tall.pads).toHaveLength(4);
    const short = scaffoldFrame(site, { width: 3, depth: 3, height: 1 });
    expect(short.rails).toHaveLength(4);
    // Braces lean (rotated) and zigzag
    expect(tall.braces.every((b) => b.r && b.r.some((v) => v !== 0))).toBe(true);
  });
});

describe('thought bubbles', () => {
  it('has art for every thought', () => {
    for (const [group, id] of Object.values(THOUGHT_ART)) expect(artUrl(group, id)).toBeTruthy();
  });
  it('shares one texture per thought', () => {
    expect(thoughtTexture('mining')).toBe(thoughtTexture('mining'));
    expect(thoughtTexture('mining')).not.toBe(thoughtTexture('sleeping'));
  });
});

describe('companion rigs', () => {
  it('builds a humanoid or an animal for every type', () => {
    for (const type of [...Object.keys(COMPANION_LOOKS), ...Object.keys(COMPANION_ANIMALS)]) {
      const { rig, animal } = createCompanionRig(type);
      expect(rig?.mesh).toBeTruthy();
      expect(!!animal).toBe(type in COMPANION_ANIMALS);
      rig.dispose();
    }
    expect(createCompanionRig(null).animal).toBeNull(); // unknown: the mage
  });
});

describe('blueprint ghost', () => {
  it('outlines each cell with its 12 edges, just inside the cell', () => {
    const pos = boxEdgePositions([{ center: [1, 1, 1], size: [2, 2, 2] }, { center: [3, 0.5, 1], size: [2, 1, 2] }], 0.05);
    expect(pos).toHaveLength(2 * 12 * 2 * 3);
    const first = Array.from(pos.slice(0, 72));
    expect(Math.min(...first)).toBeCloseTo(0.05);
    expect(Math.max(...first)).toBeCloseTo(1.95);
    // The half-height piece stays in the lower half of its cell
    const ys = Array.from(pos.slice(72)).filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(0.95);
  });

  it('grids the footprint: one line per cell boundary each way, on the ground', () => {
    const pos = footprintGridPositions(5, 4, 2);
    expect(pos.length / 6).toBe((5 + 1) + (4 + 1));
    const xs = Array.from(pos).filter((_, i) => i % 3 === 0);
    const zs = Array.from(pos).filter((_, i) => i % 3 === 2);
    expect(Math.max(...xs)).toBe(10);
    expect(Math.max(...zs)).toBe(8);
    for (let i = 1; i < pos.length; i += 3) expect(pos[i]).toBeGreaterThan(0);
  });
});
