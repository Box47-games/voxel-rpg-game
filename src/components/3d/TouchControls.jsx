import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { attackToward, tryCastSpellAt as tryCastSpellAt_ } from '../../systems/combat/playerAttack';

/**
 * TouchControls — Handles click/tap for attacking and spell casting.
 *
 * Movement is handled by WASD (desktop) or VirtualJoystick (mobile).
 * This component only handles:
 *   - Tap/click on enemy = attack (spell or melee fallback)
 *   - Tap/click on ground = cast spell at location
 */
const TouchControls = () => {
  const { gl, scene, camera } = useThree();
  const gameState = useGameStore((state) => state.gameState);

  useEffect(() => {
    if (gameState !== 'playing') return;

    const raycaster = new THREE.Raycaster();

    const handleClick = (event) => {
      if (useGameStore.getState().gameState !== 'playing') return;

      // Don't handle clicks in first-person (BlockInteraction handles it)
      if (document.pointerLockElement) return;

      // Skip if a block click just happened
      const store = useGameStore.getState();
      if (store._blockClickActive) {
        store._blockClickActive = false;
        return;
      }

      // Skip if a long press just fired
      const longPressAt = Number(gl.domElement.dataset.longPressAt || '0');
      if (Date.now() - longPressAt < 500) return;

      // Skip if build/zone mode is active
      if (store.buildMode || store.zoneMode || store.planMode || store.placingBuildingId) return;

      // Raycast from click position
      const rect = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera({ x, y }, camera);
      raycaster.far = 50;
      const intersects = raycaster.intersectObjects(scene.children, true);

      let enemyHit = null;
      let enemyData = null;
      let groundHit = null;

      for (let i = 0; i < intersects.length; i++) {
        const hit = intersects[i];
        let obj = hit.object;
        while (obj) {
          if (obj.userData?.isEnemy) {
            enemyHit = hit;
            enemyData = obj.userData;
            break;
          }
          obj = obj.parent;
        }
        if (enemyHit) break;
        if (!groundHit) groundHit = hit;
      }

      const tryCastSpellAt = (targetPoint) => tryCastSpellAt_(useGameStore.getState(), targetPoint);

      // Tap on enemy = attack (spell or melee)
      if (enemyHit && enemyData?.takeDamage) {
        attackToward(useGameStore.getState(), enemyHit.point);

        // Red attack marker
        useGameStore.getState().addTargetMarker({
          position: [enemyHit.point.x, enemyHit.point.y + 1, enemyHit.point.z],
          color: '#ff0000',
        });
        setTimeout(() => {
          const markers = useGameStore.getState().targetMarkers;
          if (markers.length > 0) {
            useGameStore.getState().removeTargetMarker(markers[0].id);
          }
        }, 800);
        return;
      }

      // Tap on ground = cast spell at location (no movement)
      if (groundHit) {
        const didCast = tryCastSpellAt(groundHit.point);
        if (didCast) {
          useGameStore.getState().addTargetMarker({
            position: [groundHit.point.x, groundHit.point.y, groundHit.point.z],
            color: '#ff6600',
          });
          setTimeout(() => {
            const markers = useGameStore.getState().targetMarkers;
            if (markers.length > 0) {
              useGameStore.getState().removeTargetMarker(markers[0].id);
            }
          }, 800);
        }
      }
    };

    gl.domElement.addEventListener('click', handleClick);
    return () => {
      gl.domElement.removeEventListener('click', handleClick);
    };
  }, [gl, scene, camera, gameState]);

  return null;
};

export default TouchControls;
