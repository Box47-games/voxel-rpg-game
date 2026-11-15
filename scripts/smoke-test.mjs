/**
 * smoke-test.mjs — Start the production build in a real browser and check
 * the game actually runs (unit tests mock the 3D engine, so they can't).
 *
 *   npm run build && npm run test:smoke
 *
 * Fails if the page throws or logs an error, if the start screen or the 3D
 * canvas never appears, or if the in-game clock doesn't move after starting
 * (which would mean the game loop isn't running).
 */

import { preview } from 'vite';
import { chromium } from 'playwright';

const START_TIMEOUT = 60_000;
const CLOCK_TIMEOUT = 45_000;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

const server = await preview({ preview: { port: 4173, strictPort: true, open: false }, logLevel: 'warn' });
const url = server.resolvedUrls.local[0];

// Software WebGL: CI runners have no GPU. SMOKE_CHROMIUM_PATH points at a
// preinstalled Chromium when Playwright's own browser isn't installed.
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: process.env.SMOKE_CHROMIUM_PATH || undefined,
});

const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console error: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(url)) errors.push(`HTTP ${r.status()}: ${r.url()}`);
  });

  console.log(`Loading ${url}`);
  await page.goto(url);

  const start = page.getByRole('button', { name: 'Start Game' });
  await start.waitFor({ timeout: START_TIMEOUT });
  console.log('✓ start screen');

  await start.click();
  await page.getByTestId('game-ui').waitFor({ timeout: START_TIMEOUT });
  console.log('✓ HUD after Start Game');

  // The 3D view fills the window once the renderer has sized itself
  try {
    await page.waitForFunction(
      () => {
        const c = document.querySelector('canvas');
        return c && c.getBoundingClientRect().width >= 1000 && c.getBoundingClientRect().height >= 600;
      },
      null,
      { timeout: START_TIMEOUT }
    );
    const box = await page.locator('canvas').first().boundingBox();
    console.log(`✓ 3D canvas ${Math.round(box.width)}x${Math.round(box.height)}`);
  } catch {
    fail('3D canvas never filled the window');
  }

  // The game loop advances world time, so the HUD clock should change
  const clock = page.locator('.hud-clock__time');
  const first = await clock.textContent();
  try {
    await page.waitForFunction(
      (before) => document.querySelector('.hud-clock__time')?.textContent !== before,
      first,
      { timeout: CLOCK_TIMEOUT, polling: 500 }
    );
    console.log(`✓ clock moving (${first} → ${await clock.textContent()})`);
  } catch {
    fail(`in-game clock stuck at ${first}: the game loop isn't running`);
  }
} catch (err) {
  fail(err.message);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

// Report each distinct error once (a broken frame loop throws every frame)
const counts = new Map();
for (const e of errors) counts.set(e, (counts.get(e) || 0) + 1);
for (const [e, n] of counts) fail(n > 1 ? `${e} (×${n})` : e);
if (!process.exitCode) console.log('Smoke test passed');
