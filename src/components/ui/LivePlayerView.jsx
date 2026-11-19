/**
 * LivePlayerView — the player's voxel model turning slowly in the Bag's
 * equipment niche, wearing what is equipped (playerGear.js). Drag to turn it.
 *
 * A small three.js renderer of its own that runs only while the Bag is open.
 * Where WebGL isn't available (tests, old devices) it shows the rendered
 * portrait instead.
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { createHumanoidInstance, PLAYER_LOOK, buildHumanoidModel } from '../3d/characters/humanoidModel';
import { createHumanoidAnimState, stepHumanoidAnimation } from '../3d/characters/humanoidAnimation';
import { selectPlayerGearKey, gearLookFromKey, heldBone } from '../3d/characters/playerGear';
import { applyBonePose, getModelBounds } from '../3d/voxelRig';
import { artUrl } from './art';

const TURN_SPEED = 0.6; // radians per second while nobody is dragging

function makeRenderer(canvas) {
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    return renderer;
  } catch {
    return null;
  }
}

export default function LivePlayerView() {
  const boxRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const gearKey = useGameStore(selectPlayerGearKey);
  const drag = useRef({ active: false, x: 0, yaw: 0.5 });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    // A fresh canvas per mount: a canvas whose context was released can't be reused
    const canvas = document.createElement('canvas');
    canvas.className = 'live-player__canvas';
    box.appendChild(canvas);
    const renderer = makeRenderer(canvas);
    if (!renderer) {
      canvas.remove();
      setFailed(true);
      return undefined;
    }

    const look = { ...PLAYER_LOOK, ...gearLookFromKey(gearKey) };
    const rig = createHumanoidInstance(look);
    const bounds = getModelBounds(buildHumanoidModel(look));
    const height = bounds.size[1];

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff2dc, 0x3a3226, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const holder = new THREE.Group();
    holder.add(rig.mesh);
    scene.add(holder);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const fit = () => {
      const w = canvas.clientWidth || 150;
      const h = canvas.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Far enough back that the whole figure fits, whichever way it faces
      // (its widest reach is a tool held out or the shield)
      const tanV = Math.tan((camera.fov * Math.PI) / 360);
      const reach = Math.max(bounds.size[0], bounds.size[2]) * 1.25;
      const dist = Math.max((height * 1.2) / (2 * tanV), reach / (2 * tanV * camera.aspect));
      camera.position.set(0, height * 0.55, dist);
      camera.lookAt(0, height * 0.5, 0);
      camera.updateProjectionMatrix();
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(canvas);

    const anim = createHumanoidAnimState(0);
    const held = heldBone(look.heldKind);
    let last = performance.now();
    let raf = 0;
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!drag.current.active) drag.current.yaw += dt * TURN_SPEED;
      holder.rotation.y = drag.current.yaw;
      applyBonePose(rig, stepHumanoidAnimation(anim, { speed: 0, held }, dt));
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      rig.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // browsers allow only a few live WebGL contexts
      canvas.remove();
    };
  }, [gearKey]);

  if (failed) return <img src={artUrl('portraits', 'player')} alt="Your character" />;

  const onPointerDown = (e) => {
    drag.current.active = true;
    drag.current.x = e.clientX;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current.active) return;
    drag.current.yaw += (e.clientX - drag.current.x) * 0.02;
    drag.current.x = e.clientX;
  };
  const stop = () => { drag.current.active = false; };

  return (
    <div
      ref={boxRef}
      className="live-player"
      role="img"
      aria-label="Your character, wearing what you have equipped. Drag to turn."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
    />
  );
}
