/**
 * ChunkAttractivenessAdapter.js — Wraps the chunk-scanning AttractivenessCalculator
 * so it fits the module interface (getScore pattern).
 */

import { calculateAttractiveness } from '../../systems/settlement/AttractivenessCalculator';

class ChunkAttractivenessAdapter {
  constructor() {
    this._score = 0;
  }

  /**
   * Recalculate attractiveness by scanning chunks near the settlement center.
   *
   * @param {number[]} center - [x, y, z] settlement center
   * @param {Object} chunkAdapter - Must expose getRawChunkManager()
   * @param {Object} storeSnapshot - Zustand store snapshot (for inventory, npcs, rifts)
   */
  recalculate(center, chunkAdapter, storeSnapshot) {
    const result = calculateAttractiveness(center, chunkAdapter.getRawChunkManager(), storeSnapshot);
    this._score = result.score;
  }

  getScore() {
    return this._score;
  }
}

export default ChunkAttractivenessAdapter;
