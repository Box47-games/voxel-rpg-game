/**
 * Spell visuals: pixel-font labels for damage numbers and the bolt shape
 * each spell flies as.
 */
import { layoutPixelText, pixelTextTexture } from '../pixelText';
import { boltStyle, boltMaterial } from '../spellBolts';
import { damageColor } from '../DamageNumber';
import { SPELLS } from '../../../data/spells';

describe('pixel text', () => {
  it('lays digits out 3 wide with a 1-pixel gap', () => {
    const { width, height, on } = layoutPixelText('17');
    expect(width).toBe(7);
    expect(height).toBe(5);
    // The 1's stem and the 7's top bar are both lit
    expect(on).toContainEqual([1, 2]);
    expect(on).toContainEqual([4, 0]);
    expect(on).toContainEqual([6, 0]);
  });

  it('draws every character the game shows', () => {
    for (const label of ['CRIT!', '3x COMBO', '+25', '-4', '0123456789']) {
      const blank = [...label].filter((c) => c === ' ').length;
      // Each non-space character lights at least one pixel
      const lit = new Set(layoutPixelText(label).on.map(([x]) => Math.floor(x / 4)));
      expect(lit.size).toBe(label.length - blank);
    }
  });

  it('shares one texture per label and colour', () => {
    const a = pixelTextTexture('42', '#ff6a5a');
    expect(pixelTextTexture('42', '#ff6a5a')).toBe(a);
    expect(pixelTextTexture('42', '#ffd977')).not.toBe(a);
    expect(a.aspect).toBeGreaterThan(1);
  });

  it('colours crits, combos, heals and damage', () => {
    expect(damageColor('CRIT!')).toBe('#ffd977');
    expect(damageColor('2x COMBO')).toBe('#7fe3ff');
    expect(damageColor('+10')).toBe('#7fcb62');
    expect(damageColor(12)).toBe('#ff6a5a');
    expect(damageColor(12, '#123456')).toBe('#123456');
  });
});

describe('spell bolts', () => {
  it('gives every spell a shape', () => {
    for (const spell of SPELLS) expect(['fire', 'shard', 'spark', 'orb']).toContain(boltStyle(spell.id));
    expect(boltStyle('fireball')).toBe('fire');
    expect(boltStyle('iceShard')).toBe('shard');
    expect(boltStyle('lightning')).toBe('spark');
    expect(boltStyle('somethingNew')).toBe('orb');
  });

  it('shares unlit materials per colour', () => {
    const m = boltMaterial('#ff6b00');
    expect(boltMaterial('#ff6b00')).toBe(m);
    expect(boltMaterial('#ff6b00', 0.5)).not.toBe(m);
    expect(m.type).toBe('MeshBasicMaterial');
  });
});
