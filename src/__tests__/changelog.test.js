import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Every merge to main is a release (docs/DECISIONS.md, D-003): the changelog's top entry is package.json's version.
const root = resolve(__dirname, '../..');

describe('CHANGELOG.md', () => {
  it("starts with an entry for package.json's version", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
    const top = changelog.match(/^## (\d+\.\d+\.\d+) · (\d{4}-\d{2}-\d{2}) · .+$/m);
    expect(top, 'a "## X.Y.Z · YYYY-MM-DD · Title" heading').not.toBeNull();
    expect(top[1]).toBe(pkg.version);
  });

  it('lists each version once, newest first', () => {
    const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
    const versions = [...changelog.matchAll(/^## (\d+)\.(\d+)\.(\d+) · /gm)].map((m) => m.slice(1, 4).map(Number));
    for (let i = 1; i < versions.length; i++) {
      const [a, b] = [versions[i - 1], versions[i]];
      const newer = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      expect(newer, `${a.join('.')} before ${b.join('.')}`).toBeGreaterThan(0);
    }
  });
});
