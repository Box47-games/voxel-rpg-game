#!/usr/bin/env node
/**
 * build.mjs — Generate the game's icon and texture art as SVG.
 *
 *   npm run art
 *
 * Reads the pixel sprites in sprites.mjs and the building blueprints in
 * src/data/buildings.js, and writes src/assets/art/:
 *   <group>/<id>.svg   one file per icon (items, materials, blocks, buildings,
 *                      spells, status, hud, ui, misc)
 *   textures/*.svg     tileable UI textures (stone wall, planks, parchment)
 *                      and 9-slice frames (wood, stone)
 *   manifest.json      every icon: group, id, label, file, what it's for
 *   index.html         a contact sheet to eyeball the whole set
 * Output is deterministic (seeded), so re-running only changes what changed.
 */

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { PALETTE, VOXEL, FLAT, MONO, ICONS, BLOCKS, PIECE_ICONS } from './sprites.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'src/assets/art');
const OUTLINE = '#07080b';

// ── helpers ──────────────────────────────────────────────────────────────

function rng(seedText) {
  let a = 2166136261;
  for (const ch of seedText) a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const pts = (list) => list.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(' ');

function grid(rows, width = 16) {
  const w = Math.max(width, ...rows.map((r) => r.length));
  return rows.map((r) => r.padEnd(w, '.'));
}

// ── voxel sprites: a 16×16 drawing pushed back into blocks ───────────────

function renderVoxel(rows, palette, seed, depth = 0.55) {
  const g = grid(rows);
  const H = Math.max(16, g.length);
  const W = g[0].length;
  const on = (r, c) => r >= 0 && r < g.length && c >= 0 && c < W && g[r][c] !== '.';
  const rand = rng(seed);
  const body = [];
  const sil = [];
  for (let r = g.length - 1; r >= 0; r--) {
    for (let c = 0; c < W; c++) {
      if (!on(r, c)) continue;
      const key = g[r][c];
      const color = palette[key] || PALETTE[key];
      if (!color) throw new Error(`${seed}: no color for '${key}'`);
      const base = shade(color, 1 + (rand() - 0.5) * 0.12);
      const faces = [];
      if (!on(r - 1, c)) faces.push([[[c, r], [c + 1, r], [c + 1 + depth, r - depth], [c + depth, r - depth]], shade(base, 1.22)]);
      if (!on(r, c + 1)) faces.push([[[c + 1, r], [c + 1 + depth, r - depth], [c + 1 + depth, r + 1 - depth], [c + 1, r + 1]], shade(base, 0.66)]);
      faces.push([[[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]], base]);
      for (const [p, col] of faces) {
        body.push(`<polygon points="${pts(p)}" fill="${col}" stroke="${col}" stroke-width="0.06"/>`);
        sil.push(`<polygon points="${pts(p)}"/>`);
      }
    }
  }
  const vb = `-0.6 ${(-0.6 - depth).toFixed(2)} ${(W + 1.2 + depth).toFixed(2)} ${(H + 1.2 + depth).toFixed(2)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="128" height="128"><g fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="0.7" stroke-linejoin="round">${sil.join('')}</g>${body.join('')}</svg>`;
}

// ── flat glyphs: colored pixels with a 1px outline ──────────────────────

function renderFlat(rows, palette) {
  const g = grid(rows, 0);
  const H = g.length;
  const W = g[0].length;
  const S = Math.max(W, H) + 2;
  const ox = (S - W) / 2;
  const oy = (S - H) / 2;
  const back = [];
  const front = [];
  g.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    const x = c + ox;
    const y = r + oy;
    back.push(`<rect x="${x - 1}" y="${y - 1}" width="3" height="3"/>`);
    front.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[ch] || PALETTE[ch]}"/>`);
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="64" height="64" shape-rendering="crispEdges"><g fill="${OUTLINE}">${back.join('')}</g>${front.join('')}</svg>`;
}

/** A 16×16 voxel drawing reduced for flat use: every pixel kept, no extrusion. */
const flatFrom = (rows) => renderFlat(grid(rows).filter((r, i, all) => r.replace(/\./g, '') || all.slice(i).some((x) => x.replace(/\./g, ''))), {});

// ── mono UI symbols ──────────────────────────────────────────────────────

function renderMono(rows) {
  const g = grid(rows, 0);
  const H = g.length;
  const W = g[0].length;
  const ox = Math.floor((12 - W) / 2);
  const oy = Math.floor((12 - H) / 2);
  let d = '';
  g.forEach((row, r) => {
    let c = 0;
    while (c < W) {
      if (row[c] !== '#') { c++; continue; }
      let e = c;
      while (e < W && row[e] === '#') e++;
      d += `M${c + ox} ${r + oy}h${e - c}v1h${c - e}z`;
      c = e;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="24" height="24" color="#f1e6cc" shape-rendering="crispEdges"><path d="${d}" fill="currentColor"/></svg>`;
}

// ── blocks: isometric cube, 8×8 texels per face ──────────────────────────

function faceTexture(block, face, rand, size = 8) {
  const tex = [];
  for (let v = 0; v < size; v++) {
    const row = [];
    for (let u = 0; u < size; u++) {
      let col = face === 'top' ? block.top : block.side;
      for (const [speck, p] of block.specks || []) if (rand() < p) col = speck;
      if (block.rings && face === 'top') {
        const d = Math.max(Math.abs(u - 3.5), Math.abs(v - 3.5));
        if (Math.round(d) === 2 || d > 3.4) col = d > 3.4 ? block.bark : block.rings;
      }
      if (block.bark && face !== 'top' && u % 3 === 1) col = block.bark;
      if (block.fringe && face !== 'top' && (v === 0 || (v === 1 && rand() < 0.5))) col = block.fringe;
      if (block.streak && u === v) col = block.streak;
      row.push(shade(col, 1 + (rand() - 0.5) * block.noise * 2));
    }
    tex.push(row);
  }
  return tex;
}

/**
 * An isometric box X wide (along +u), Y tall, Z deep (along +v), in texels
 * (a block is 8×8×8). Blocks, slabs, planks and cubes all use it.
 */
function renderBox(block, X = 8, Y = 8, Z = 8) {
  const rand = rng(block.id);
  const s = 2;
  const a = Math.cos(Math.PI / 6) * s;
  const b = 0.5 * s;
  const T = Math.max(X, Y, Z);
  const top = faceTexture(block, 'top', rand, T);
  const left = faceTexture(block, 'left', rand, T);
  const right = faceTexture(block, 'right', rand, T);
  const polys = [];
  const quad = (p0, du, dv, col) => {
    const p = [p0, [p0[0] + du[0], p0[1] + du[1]], [p0[0] + du[0] + dv[0], p0[1] + du[1] + dv[1]], [p0[0] + dv[0], p0[1] + dv[1]]];
    polys.push(`<polygon points="${pts(p)}" fill="${col}" stroke="${col}" stroke-width="0.08"/>`);
  };
  for (let v = 0; v < Z; v++) for (let u = 0; u < X; u++) quad([u * a - v * a, u * b + v * b], [a, b], [-a, b], shade(top[v][u], 1.12));
  for (let h = 0; h < Y; h++) for (let u = 0; u < X; u++) quad([-Z * a + u * a, Z * b + u * b + h * s], [a, b], [0, s], shade(left[h][u], 0.86));
  for (let h = 0; h < Y; h++) for (let w = 0; w < Z; w++) quad([X * a - Z * a + w * a, X * b + Z * b - w * b + h * s], [a, -b], [0, s], shade(right[h][w], 0.66));
  const hex = [[0, 0], [X * a, X * b], [X * a, X * b + Y * s], [X * a - Z * a, X * b + Z * b + Y * s], [-Z * a, Z * b + Y * s], [-Z * a, Z * b]];
  const outline = `<polygon points="${pts(hex)}" fill="none" stroke="${OUTLINE}" stroke-width="0.9" stroke-linejoin="round"/>`;
  // Square view, centred, same scale as a full block so pieces read smaller
  const full = 2 * 8 * a + 2;
  const minX = -Z * a; const maxX = X * a;
  const minY = 0; const maxY = X * b + Z * b + Y * s;
  const side = Math.max(full, maxX - minX + 2, maxY - minY + 3);
  const vx = (minX + maxX) / 2 - side / 2;
  const vy = (minY + maxY) / 2 - side / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx.toFixed(2)} ${vy.toFixed(2)} ${side.toFixed(2)} ${side.toFixed(2)}" width="128" height="128">${polys.join('')}${outline}</svg>`;
}

function renderBlock(block) {
  return renderBox(block, 8, 8, 8);
}

// ── buildings: their real blueprints as isometric voxels ─────────────────

function renderBuilding(blocks, colorOf, seed) {
  const rand = rng(seed);
  const s = 2;
  const a = Math.cos(Math.PI / 6) * s;
  const b = 0.5 * s;
  const key = (x, y, z) => `${x},${y},${z}`;
  // Height of each cell as a fraction of a block (pieces: slabs and plank floors fill the lower half)
  const heightOf = (bl) => (bl.box ? (bl.box[4] - bl.box[1]) / 2 : 1);
  const filled = new Map(blocks.map((bl) => [key(bl.x, bl.y, bl.z), heightOf(bl)]));
  const order = [...blocks].sort((p, q) => p.x + p.z - (q.x + q.z) || p.y - q.y);
  const sil = [];
  const body = [];
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const bl of order) {
    const { x, y, z, blockType } = bl;
    const hf = heightOf(bl);
    const base = shade(colorOf(blockType), 1 + (rand() - 0.5) * 0.12);
    const ox = (x - z) * a;
    const oy = (x + z) * b - y * s + (1 - hf) * s; // a half-height piece's top sits lower
    const hs = hf * s;
    const top = [[ox, oy], [ox + a, oy + b], [ox, oy + 2 * b], [ox - a, oy + b]];
    const lf = [[ox - a, oy + b], [ox, oy + 2 * b], [ox, oy + 2 * b + hs], [ox - a, oy + b + hs]];
    const rt = [[ox, oy + 2 * b], [ox + a, oy + b], [ox + a, oy + b + hs], [ox, oy + 2 * b + hs]];
    const faces = [];
    // A side hides behind a neighbour at least as tall; a seam line marks each piece
    const covers = (k) => (filled.get(k) ?? 0) >= hf;
    if (!(hf === 1 && filled.has(key(x, y + 1, z)))) faces.push([top, shade(base, 1.18)]);
    if (!covers(key(x, y, z + 1))) faces.push([lf, shade(base, 0.86)]);
    if (!covers(key(x + 1, y, z))) faces.push([rt, shade(base, 0.64)]);
    for (const [p, col] of faces) {
      body.push(`<polygon points="${pts(p)}" fill="${col}" stroke="${shade(col, 0.82)}" stroke-width="0.12"/>`);
      sil.push(`<polygon points="${pts(p)}"/>`);
      for (const [px, py] of p) { minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
    }
  }
  const pad = 1.5;
  const w = maxX - minX + 2 * pad;
  const h = maxY - minY + 2 * pad;
  const side = Math.max(w, h);
  const vx = minX - pad - (side - w) / 2;
  const vy = minY - pad - (side - h) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx.toFixed(2)} ${vy.toFixed(2)} ${side.toFixed(2)} ${side.toFixed(2)}" width="160" height="160"><g fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="0.9" stroke-linejoin="round">${sil.join('')}</g>${body.join('')}</svg>`;
}

// ── UI textures (pixel art, scaled with image-rendering: pixelated) ──────

function pixelSvg(w, h, pixel) {
  let rects = '';
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const col = pixel(x, y);
      let e = x + 1;
      while (e < w && pixel(e, y) === col) e++;
      if (col) rects += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${col}"/>`;
      x = e;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">${rects}</svg>`;
}

function memo(w, h, fn) {
  const px = [];
  for (let y = 0; y < h; y++) { px.push([]); for (let x = 0; x < w; x++) px[y].push(fn(x, y)); }
  return (x, y) => px[y][x];
}

function textures() {
  const out = {};
  let r = rng('stonewall');
  out.stonewall = pixelSvg(32, 32, memo(32, 32, (x, y) => {
    const row = Math.floor(y / 8); const bx = (x + (row % 2 ? 8 : 0)) % 16; const by = y % 8;
    if (by === 7 || bx === 15) return '#0c0e12';
    let c = shade('#262a32', 1 + (r() - 0.5) * 0.12);
    if (by === 0) c = shade(c, 1.18); else if (by === 6 || bx === 14) c = shade(c, 0.8);
    return c;
  }));
  r = rng('planks');
  out.planks = pixelSvg(32, 16, memo(32, 16, (x, y) => {
    const by = y % 8;
    if (by === 7) return '#21140b';
    if ((x + Math.floor(y / 8) * 13) % 32 >= 3 && (x + Math.floor(y / 8) * 13) % 32 <= 4 && (by === 2 || by === 4)) return '#2b1a0e';
    let c = shade('#6b4428', 1 + (r() - 0.5) * 0.1);
    if (by === 0) c = shade(c, 1.2);
    if (r() < 0.12) c = shade(c, 0.85);
    return c;
  }));
  r = rng('parchment');
  out.parchment = pixelSvg(32, 32, memo(32, 32, () => {
    let c = shade('#d8c39a', 1 + (r() - 0.5) * 0.08);
    if (r() < 0.05) c = shade(c, 0.9);
    return c;
  }));
  const frame = (name, band, hi, lo, corner, cornerHi, rivet) => {
    const fr = rng(name);
    out[name] = pixelSvg(24, 24, memo(24, 24, (x, y) => {
      const inCorner = (x < 8 || x > 15) && (y < 8 || y > 15);
      if (inCorner) {
        const lx = x % 8 === x ? x : x - 16; const ly = y < 8 ? y : y - 16;
        if (lx === 0 || lx === 7 || ly === 0 || ly === 7) return OUTLINE;
        if ((lx === 3 || lx === 4) && (ly === 3 || ly === 4)) return lx === 4 && ly === 4 ? shade(rivet, 0.6) : rivet;
        if (lx === 6 || ly === 6) return shade(corner, 0.7);
        if (lx === 1 || ly === 1) return cornerHi;
        return shade(corner, 1 + (fr() - 0.5) * 0.08);
      }
      const d = Math.min(x, y, 23 - x, 23 - y);
      if (d === 0 || d === 6) return OUTLINE;
      if (d > 6) return null;
      if (d === 1) return y === 22 || x === 22 ? lo : hi;
      const c = shade(band, 1 + (fr() - 0.5) * 0.1);
      return d === 5 ? shade(c, 0.7) : c;
    }));
  };
  frame('frame-wood', '#6b4428', '#9a6a40', '#3b2414', '#8d949c', '#d5dae0', '#f2c14e');
  frame('frame-stone', '#5a606b', '#8a909a', '#30343b', '#c8962e', '#ffe08a', '#5a3a0e');
  return out;
}

// ── main ─────────────────────────────────────────────────────────────────

async function loadGameData() {
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const buildings = await server.ssrLoadModule('/src/data/buildings.js');
    const blockTypes = await server.ssrLoadModule('/src/systems/chunks/blockTypes.js');
    return { buildings, blockTypes };
  } finally {
    await server.close();
  }
}

async function main() {
  // Clear only what this script writes (portraits.mjs owns portraits/)
  for (const dir of [...Object.keys(ICONS), 'blocks', 'pieces', 'buildings', 'textures']) rmSync(join(OUT, dir), { recursive: true, force: true });
  const manifest = [];
  const write = (group, id, label, svg, extra = {}) => {
    const file = `${group}/${id}.svg`;
    mkdirSync(join(OUT, group), { recursive: true });
    writeFileSync(join(OUT, file), svg);
    manifest.push({ group, id, label, file, ...extra });
  };

  for (const [group, list] of Object.entries(ICONS)) {
    for (const icon of list) {
      let svg;
      if (icon.kind === 'voxel') svg = renderVoxel(VOXEL[icon.sprite], icon.palette || {}, icon.id);
      else if (icon.kind === 'flat') svg = icon.from ? flatFrom(VOXEL[icon.from]) : renderFlat(FLAT[icon.sprite], {});
      else svg = renderMono(MONO[icon.sprite]);
      const extra = {};
      if (icon.group) extra.uiGroup = icon.group;
      if (icon.note) extra.note = icon.note;
      write(group, icon.id, icon.label, svg, extra);
    }
  }
  for (const block of BLOCKS) write('blocks', block.id, block.label, renderBlock(block));
  for (const piece of PIECE_ICONS) write('pieces', piece.id, piece.label, renderBox(piece, ...piece.dims));

  const { buildings, blockTypes } = await loadGameData();
  const colorOf = (type) => {
    const c = blockTypes.BlockProperties[type]?.color || [0.5, 0.5, 0.5];
    return `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
  };
  for (const bld of buildings.BUILDINGS) {
    // Seen from the front-right: flip Z so the front (row 0, doors) faces the viewer
    const cells = buildings.parseLayers(bld).map((c) => ({ ...c, z: bld.size.depth - 1 - c.z }));
    write('buildings', bld.id, bld.name, renderBuilding(cells, colorOf, bld.id));
  }

  mkdirSync(join(OUT, 'textures'), { recursive: true });
  for (const [name, svg] of Object.entries(textures())) writeFileSync(join(OUT, 'textures', `${name}.svg`), svg);

  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // Contact sheet
  const groups = [...new Set(manifest.map((m) => m.group))];
  const sheet = groups.map((g) => `<h2>${g}</h2><div class="g">${manifest.filter((m) => m.group === g).map((m) => `<figure><img src="${m.file}" alt=""><figcaption>${m.label}</figcaption></figure>`).join('')}</div>`).join('');
  writeFileSync(join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Riftholm art</title><style>body{background:#14171e;color:#e4dccb;font:14px system-ui;margin:20px}h2{text-transform:capitalize;color:#ffd977}.g{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0;width:96px;text-align:center}img{width:72px;height:72px;background:#0d0f14;padding:6px;color:#e4dccb}figcaption{font-size:11px}</style>${sheet}`);

  console.log(`art: ${manifest.length} icons + ${Object.keys(textures()).length} textures → src/assets/art`);
}

main().catch((err) => { console.error(err); process.exit(1); });
