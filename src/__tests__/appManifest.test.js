/**
 * The web app manifest and index.html must only point at icons that exist
 * (the manifest once listed eight PNGs that were never added).
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const publicDir = path.join(root, 'public');
const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf8'));
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function pngSize(file) {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('app manifest', () => {
  test('is named Riftholm', () => {
    expect(manifest.name).toBe('Riftholm');
    expect(manifest.short_name).toBe('Riftholm');
  });

  test('every icon exists and PNGs match their declared size', () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      const file = path.join(publicDir, icon.src);
      expect(fs.existsSync(file), icon.src).toBe(true);
      if (icon.type === 'image/png') {
        const [w, h] = pngSize(file);
        expect(`${w}x${h}`).toBe(icon.sizes);
      }
    }
  });

  test('has 192px and 512px icons for install, including maskable ones', () => {
    const has = (size, purpose) => manifest.icons.some((i) => i.sizes === size && i.purpose.split(' ').includes(purpose));
    expect(has('192x192', 'any')).toBe(true);
    expect(has('512x512', 'any')).toBe(true);
    expect(has('512x512', 'maskable')).toBe(true);
  });
});

describe('index.html', () => {
  test('icon links point at files in public/', () => {
    const hrefs = [...indexHtml.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
    for (const href of hrefs) {
      const rel = href.replace(/^\/voxel-rpg-game\//, '');
      expect(fs.existsSync(path.join(publicDir, rel)), href).toBe(true);
    }
  });

  test('title uses the game name', () => {
    expect(indexHtml).toMatch(/<title>Riftholm<\/title>/);
  });

  test('the start screen mark exists', () => {
    expect(fs.existsSync(path.join(publicDir, 'icons/rift-mark.svg'))).toBe(true);
  });
});
