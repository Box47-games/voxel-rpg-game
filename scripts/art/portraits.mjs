#!/usr/bin/env node
/**
 * portraits.mjs — Render the real character models to PNG portraits.
 *
 *   npm run art:portraits
 *
 * Starts Vite, opens a headless Chromium (software WebGL), runs
 * portraits.client.js and writes src/assets/art/portraits/*.png: the player
 * (full body) and one head shot per settler job. Re-run after changing
 * humanoidModel.js so the menus match the game.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'src/assets/art/portraits');
// Use a system Chromium when Playwright's own download is missing
const SYSTEM_CHROMIUM = '/opt/pw-browsers/chromium';

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, open: false } });
await server.listen();
const { port } = server.httpServer.address();
const base = server.config.base || '/';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  ...(existsSync(SYSTEM_CHROMIUM) ? { executablePath: SYSTEM_CHROMIUM } : {}),
});
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}${base}scripts/art/blank.html`);
  const shots = await page.evaluate(async (url) => (await import(url)).renderPortraits(), `${base}scripts/art/portraits.client.js`);
  mkdirSync(OUT, { recursive: true });
  for (const [name, dataUrl] of Object.entries(shots)) {
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
  console.log(`portraits: ${Object.keys(shots).join(', ')} → src/assets/art/portraits`);
} finally {
  await browser.close();
  await server.close();
}
