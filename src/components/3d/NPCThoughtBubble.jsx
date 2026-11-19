/**
 * NPCThoughtBubble — a pixel speech bubble over a settler's head with the
 * game's own icon for what they are doing or need (pickaxe, crate, hammer,
 * sprout, axe, berry, food, sleep, talk).
 *
 * A three.js sprite (always faces the camera; no drei Text/Billboard, which
 * corrupts shaders here). One canvas texture per thought, shared by every
 * settler thinking it. Rendered as a child of the SettlerNPC group.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { artUrl } from '../ui/art';

/** Thought type → [art group, id]. */
export const THOUGHT_ART = {
  mining: ['ui', 'pickaxe'],
  hauling: ['ui', 'crate'],
  building: ['ui', 'hammer'],
  farming: ['ui', 'sprout'],
  chopping: ['items', 'stoneAxe'],
  foraging: ['materials', 'berry'],
  hungry: ['ui', 'food'],
  sleeping: ['ui', 'sleep'],
  socializing: ['ui', 'talk'],
};

// Bubble drawn on a 16×18 pixel grid, 8 canvas pixels per grid pixel
const PX = 8;
const W = 16;
const H = 18;
const SIZE = 0.62; // world units wide

const textures = new Map();

/** Shared texture for a thought: dark stone bubble, wood rim, tail, icon. */
export function thoughtTexture(type) {
  if (textures.has(type)) return textures.get(type);
  const canvas = document.createElement('canvas');
  canvas.width = W * PX;
  canvas.height = H * PX;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  if (ctx) {
    const px = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x * PX, y * PX, w * PX, h * PX); };
    // Outline, rim and body with clipped corners; a tail at the bottom left
    px(1, 0, 14, 15, '#07080b');
    px(0, 1, 16, 13, '#07080b');
    px(1, 1, 14, 13, '#7a5230');
    px(2, 2, 12, 11, '#2a2c33');
    px(3, 2, 10, 1, '#3a3d46');
    px(4, 15, 3, 1, '#07080b');
    px(4, 14, 3, 1, '#7a5230');
    px(5, 16, 1, 1, '#07080b');
    const [group, id] = THOUGHT_ART[type] || [];
    const url = group ? artUrl(group, id) : null;
    if (url && typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 3 * PX, 2.5 * PX, 10 * PX, 10 * PX);
        texture.needsUpdate = true;
      };
      img.src = url;
    }
  }
  const entry = { texture, aspect: W / H };
  textures.set(type, entry);
  return entry;
}

const NPCThoughtBubble = React.memo(({ type }) => {
  const spriteRef = useRef();
  const startTime = useMemo(() => Date.now() / 1000, [type]); // eslint-disable-line react-hooks/exhaustive-deps
  const known = !!(type && THOUGHT_ART[type]);
  const material = useMemo(
    () => (known ? new THREE.SpriteMaterial({ map: thoughtTexture(type).texture, transparent: true, toneMapped: false }) : null),
    [type, known]
  );
  useEffect(() => () => material?.dispose(), [material]);

  useFrame(() => {
    if (!spriteRef.current) return;
    const t = Date.now() / 1000 - startTime;
    // Pop in, then bob gently
    const pop = Math.min(1, t * 6);
    spriteRef.current.position.y = 3.3 + Math.sin(t * 2) * 0.06;
    spriteRef.current.scale.set(SIZE * pop, (SIZE / (W / H)) * pop, 1);
  });

  if (!known || !material) return null;

  return <sprite ref={spriteRef} material={material} position={[0, 3.3, 0]} scale={[0.01, 0.01, 1]} />;
});

NPCThoughtBubble.displayName = 'NPCThoughtBubble';

export default NPCThoughtBubble;
