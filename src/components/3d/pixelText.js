/**
 * pixelText.js — Short labels ("24", "CRIT!", "3x COMBO") drawn in a 3×5
 * pixel font with a dark outline, as textures for sprites. Used by the
 * floating damage numbers (drei's Text breaks the renderer here; see CLAUDE.md).
 */

import * as THREE from 'three';

// 3×5 glyphs, rows top to bottom; '#' = on
const GLYPHS = {
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  ' ': ['...', '...', '...', '...', '...'],
};

/** Grid of on-pixels for a label (unknown characters are blank). */
export function layoutPixelText(text) {
  const chars = [...String(text).toUpperCase()];
  const width = Math.max(1, chars.length * 4 - 1);
  const on = [];
  chars.forEach((ch, i) => {
    const glyph = GLYPHS[ch] || GLYPHS[' '];
    glyph.forEach((row, y) => {
      [...row].forEach((c, x) => { if (c === '#') on.push([i * 4 + x, y]); });
    });
  });
  return { width, height: 5, on };
}

const PX = 6; // canvas pixels per font pixel
const OUTLINE = 2; // canvas pixels of dark outline around each glyph pixel
const cache = new Map();
const CACHE_MAX = 64;

/**
 * A texture with the label drawn on it, shared by every sprite showing the
 * same label in the same colour. @returns {{ texture, aspect }}
 */
export function pixelTextTexture(text, color) {
  const key = `${text}|${color}`;
  if (cache.has(key)) return cache.get(key);

  const { width, height, on } = layoutPixelText(text);
  const canvas = document.createElement('canvas');
  canvas.width = width * PX + OUTLINE * 2;
  canvas.height = height * PX + OUTLINE * 2;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#07080b';
    for (const [x, y] of on) ctx.fillRect(x * PX, y * PX, PX + OUTLINE * 2, PX + OUTLINE * 2);
    ctx.fillStyle = color;
    for (const [x, y] of on) ctx.fillRect(x * PX + OUTLINE, y * PX + OUTLINE, PX, PX);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  const entry = { texture, aspect: canvas.width / canvas.height };

  if (cache.size >= CACHE_MAX) {
    const [oldKey, old] = cache.entries().next().value;
    old.texture.dispose();
    cache.delete(oldKey);
  }
  cache.set(key, entry);
  return entry;
}
