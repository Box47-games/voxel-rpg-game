/**
 * ScreenshotProvider — Registers `store._captureScreenshot()`, which renders
 * the scene once and returns the 3D view as a data URL (the HUD is HTML, so
 * it isn't in the picture). Used by the feedback form.
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import useGameStore from '../../stores/useGameStore';

const ScreenshotProvider = () => {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const capture = () => {
      // Read the canvas right after a render (the buffer isn't preserved between frames)
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/jpeg', 0.85);
    };
    useGameStore.setState({ _captureScreenshot: capture });
    return () => {
      if (useGameStore.getState()._captureScreenshot === capture) useGameStore.setState({ _captureScreenshot: null });
    };
  }, [gl, scene, camera]);
  return null;
};

export default ScreenshotProvider;
