// Rasterize public/icons/icon.svg into the PNG sizes the manifest and iOS use
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const dir = process.argv[2];
const sizes = [[72], [96], [128], [144], [152], [192], [384], [512], [180, 'apple-touch-icon.png'], [32, 'favicon-32.png']];
(async () => {
  const b = await chromium.launch();
  const svg = fs.readFileSync(path.join(dir, 'icon.svg')).toString('base64');
  for (const [s, name] of sizes) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<html><body style="margin:0"><img src="data:image/svg+xml;base64,${svg}" style="width:${s}px;height:${s}px;display:block"></body></html>`);
    await p.waitForTimeout(100);
    await p.screenshot({ path: path.join(dir, name || `icon-${s}x${s}.png`), omitBackground: false });
    await p.close();
  }
  await b.close();
})();
