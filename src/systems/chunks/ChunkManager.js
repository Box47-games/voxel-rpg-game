/**
 * ChunkManager - Coordinates chunk loading, unloading, and lifecycle
 *
 * Manages active chunks, load/unload queues, and chunk state.
 * Works with Web Workers for async terrain generation.
 */

import { Chunk, ChunkState } from './Chunk.js';
import {
  chunkKey,
  worldToChunk,
  chunkDistanceSq,
  getChunksInRadiusSorted,
  CHUNK_SIZE,
  CHUNK_SIZE_Y,
  VOXEL_SIZE,
} from './coordinates.js';
import { BlockTypes, isSolid } from './blockTypes.js';
import { subCubeOf, subFilled, columnTop } from './cellShape.js';

// Campfire glow extends this many blocks — neighbors must rebuild when
// a campfire is placed/removed within this distance of a chunk edge.
const CAMPFIRE_GLOW_RADIUS = 5;

// Failed chunk loads (worker crash, timeout) are retried with linear backoff
const MAX_LOAD_RETRIES = 3;
const LOAD_RETRY_DELAY_MS = 500;

/**
 * Priority queue for chunk loading
 */
class LoadQueue {
  constructor() {
    this.items = [];
  }

  enqueue(chunkX, chunkZ, priority) {
    const key = chunkKey(chunkX, chunkZ);

    // Check if already in queue
    const existing = this.items.findIndex(item => item.key === key);
    if (existing !== -1) {
      // Update priority if higher
      if (priority < this.items[existing].priority) {
        this.items[existing].priority = priority;
        this.sort();
      }
      return;
    }

    this.items.push({ key, chunkX, chunkZ, priority });
    this.sort();
  }

  dequeue() {
    return this.items.shift();
  }

  remove(key) {
    const index = this.items.findIndex(item => item.key === key);
    if (index !== -1) {
      this.items.splice(index, 1);
    }
  }

  has(key) {
    return this.items.some(item => item.key === key);
  }

  sort() {
    this.items.sort((a, b) => a.priority - b.priority);
  }

  get length() {
    return this.items.length;
  }

  clear() {
    this.items = [];
  }
}

/**
 * ChunkManager class
 */
export class ChunkManager {
  /**
   * Create a new ChunkManager
   * @param {Object} options
   * @param {number} options.viewDistance - View distance in chunks (default 8)
   * @param {number} options.seed - World seed for generation
   * @param {Function} options.onChunkReady - Callback when chunk is ready
   * @param {Function} options.onChunkUnload - Callback when chunk unloads
   */
  constructor(options = {}) {
    this.viewDistance = options.viewDistance ?? 8;
    this.seed = options.seed ?? Math.floor(Math.random() * 2147483647);
    this.onChunkReady = options.onChunkReady ?? (() => {});
    this.onChunkUnload = options.onChunkUnload ?? (() => {});

    // Active chunks
    this.chunks = new Map();

    // Load/unload queues
    this.loadQueue = new LoadQueue();
    this.unloadQueue = new Set();

    // Currently loading (waiting for worker)
    this.loading = new Set();

    // Player position tracking (use invalid values to force initial update)
    this.playerChunkX = Number.MAX_SAFE_INTEGER;
    this.playerChunkZ = Number.MAX_SAFE_INTEGER;
    this.initialized = false;

    // Mesh rebuild queue
    this.meshRebuildQueue = new Set();

    // Block data of modified chunks that are currently unloaded.
    // Chunks are regenerated from the seed when they reload, so without this
    // cache every player/NPC edit would vanish once the player walked away.
    // key -> { blocks: Uint8Array, lastModified: number }
    this.modifiedChunkCache = new Map();

    // Retry bookkeeping for failed loads: key -> attempt count
    this.loadRetries = new Map();
    this.disposed = false;

    // Worker reference (set externally)
    this.workerPool = null;

    // Performance tracking
    this.stats = {
      chunksLoaded: 0,
      chunksUnloaded: 0,
      lastUpdateTime: 0,
    };

    // Configuration
    this.maxLoadsPerFrame = 3;
    this.maxUnloadsPerFrame = 4;
    this.maxMeshRebuildsPerFrame = 2;
  }

  /**
   * Set the worker pool for async terrain generation
   * @param {WorkerPool} pool
   */
  setWorkerPool(pool) {
    this.workerPool = pool;
  }

  /**
   * Update player position and trigger chunk loading/unloading
   * @param {number} worldX - Player world X position
   * @param {number} worldZ - Player world Z position
   */
  updatePlayerPosition(worldX, worldZ) {
    const { chunkX, chunkZ } = worldToChunk(worldX, worldZ);

    // Check if player moved to a new chunk
    if (chunkX !== this.playerChunkX || chunkZ !== this.playerChunkZ) {
      this.playerChunkX = chunkX;
      this.playerChunkZ = chunkZ;
      this.updateChunkQueues();
    }
  }

  /**
   * Update load and unload queues based on player position
   */
  updateChunkQueues() {
    const { playerChunkX, playerChunkZ, viewDistance } = this;

    // Get chunks that should be loaded
    const chunksNeeded = getChunksInRadiusSorted(
      playerChunkX,
      playerChunkZ,
      viewDistance
    );

    const neededKeys = new Set(chunksNeeded.map(c => chunkKey(c.chunkX, c.chunkZ)));

    // Queue chunks that need loading
    for (const { chunkX, chunkZ, distanceSq } of chunksNeeded) {
      const key = chunkKey(chunkX, chunkZ);

      if (!this.chunks.has(key) && !this.loading.has(key) && !this.loadQueue.has(key)) {
        this.loadQueue.enqueue(chunkX, chunkZ, distanceSq);
      }
    }

    // Queue chunks that should be unloaded
    for (const [key] of this.chunks) {
      if (!neededKeys.has(key)) {
        this.unloadQueue.add(key);
      }
    }

    // Chunks queued for unload that are needed again (player doubled back
    // before the queue drained) must stay loaded
    for (const key of this.unloadQueue) {
      if (neededKeys.has(key)) {
        this.unloadQueue.delete(key);
      }
    }

    // Remove from load queue if no longer needed
    for (const item of [...this.loadQueue.items]) {
      if (!neededKeys.has(item.key)) {
        this.loadQueue.remove(item.key);
      }
    }

    // Cancel loading if no longer needed
    for (const key of this.loading) {
      if (!neededKeys.has(key)) {
        // Note: Would need worker cancellation support
        // For now, we'll just let it complete and unload immediately
      }
    }
  }

  /**
   * Process queues - call this every frame
   * @param {number} deltaTime - Time since last frame
   */
  update(deltaTime) {
    const startTime = performance.now();

    // Process unloads first (free memory)
    this.processUnloadQueue();

    // Process loads
    this.processLoadQueue();

    // Note: Mesh rebuilds are handled by ChunkRenderer, which detects
    // dirty chunks via getDirtyChunks() and rebuilds them via the worker pool.

    this.stats.lastUpdateTime = performance.now() - startTime;
  }

  /**
   * Process chunk unload queue
   */
  processUnloadQueue() {
    let unloaded = 0;

    for (const key of this.unloadQueue) {
      if (unloaded >= this.maxUnloadsPerFrame) break;

      const chunk = this.chunks.get(key);
      if (chunk) {
        this.unloadChunk(chunk);
        unloaded++;
      }

      this.unloadQueue.delete(key);
    }
  }

  /**
   * Process chunk load queue
   */
  processLoadQueue() {
    let loaded = 0;

    while (this.loadQueue.length > 0 && loaded < this.maxLoadsPerFrame) {
      // Don't start too many concurrent loads
      if (this.loading.size >= 6) break;

      const item = this.loadQueue.dequeue();
      if (!item) break;

      // Double-check we still need this chunk
      const distSq = chunkDistanceSq(
        this.playerChunkX, this.playerChunkZ,
        item.chunkX, item.chunkZ
      );

      if (distSq > (this.viewDistance + 1) * (this.viewDistance + 1)) {
        continue; // Too far now, skip
      }

      this.startLoadingChunk(item.chunkX, item.chunkZ);
      loaded++;
    }
  }

  /**
   * Process mesh rebuild queue
   */
  processMeshRebuildQueue() {
    let rebuilt = 0;

    for (const key of this.meshRebuildQueue) {
      if (rebuilt >= this.maxMeshRebuildsPerFrame) break;

      const chunk = this.chunks.get(key);
      if (chunk && chunk.meshDirty && chunk.state === ChunkState.READY) {
        this.rebuildChunkMesh(chunk);
        rebuilt++;
      }

      this.meshRebuildQueue.delete(key);
    }
  }

  /**
   * Start loading a chunk (async)
   * @param {number} chunkX
   * @param {number} chunkZ
   */
  async startLoadingChunk(chunkX, chunkZ) {
    const key = chunkKey(chunkX, chunkZ);

    // Already loading or loaded
    if (this.loading.has(key) || this.chunks.has(key)) {
      return;
    }

    this.loading.add(key);

    try {
      let chunk;
      const cached = this.modifiedChunkCache.get(key);

      if (cached) {
        // Restore previously modified chunk instead of regenerating it
        chunk = new Chunk(chunkX, chunkZ);
        chunk.blocks = cached.blocks;
        chunk.shapes = cached.shapes || null;
        chunk.lastModified = cached.lastModified;
        chunk.isDirty = true;
        chunk.rebuildHeightMap();
        this.modifiedChunkCache.delete(key);
      } else if (this.workerPool) {
        // Use worker for terrain generation
        const result = await this.workerPool.execute({
          type: 'generateTerrain',
          chunkX,
          chunkZ,
          seed: this.seed,
        });

        // Create chunk from worker result
        chunk = new Chunk(chunkX, chunkZ);
        chunk.blocks = new Uint8Array(result.blocks);
        chunk.rebuildHeightMap();
      } else {
        // Fallback: generate synchronously (for testing)
        chunk = this.generateChunkSync(chunkX, chunkZ);
      }

      // Check if we still need this chunk
      const distSq = chunkDistanceSq(
        this.playerChunkX, this.playerChunkZ,
        chunkX, chunkZ
      );

      if (this.disposed || distSq > (this.viewDistance + 1) * (this.viewDistance + 1)) {
        // No longer needed — keep any edits for when the player returns
        this._cacheIfModified(chunk);
        chunk.dispose();
        this.loading.delete(key);
        return;
      }

      // A save may have been loaded while the worker was generating this chunk
      const savedWhileLoading = this.modifiedChunkCache.get(key);
      if (savedWhileLoading) {
        chunk.blocks = savedWhileLoading.blocks;
        chunk.shapes = savedWhileLoading.shapes || null;
        chunk.lastModified = savedWhileLoading.lastModified;
        chunk.isDirty = true;
        chunk.rebuildHeightMap();
        this.modifiedChunkCache.delete(key);
      }
      this.loadRetries.delete(key);

      // Add to active chunks
      chunk.state = ChunkState.READY;
      chunk.meshDirty = true;
      this.chunks.set(key, chunk);
      this.loading.delete(key);

      // Update neighbor references
      this.updateNeighbors(chunk);

      // Queue mesh build
      this.meshRebuildQueue.add(key);

      // Callback
      this.onChunkReady(chunk);

      this.stats.chunksLoaded++;

    } catch (error) {
      this.loading.delete(key);
      if (this.disposed) return;

      const attempts = (this.loadRetries.get(key) || 0) + 1;
      this.loadRetries.set(key, attempts);
      if (attempts <= MAX_LOAD_RETRIES) {
        console.warn(`Failed to load chunk ${key} (attempt ${attempts}), retrying:`, error);
        setTimeout(() => {
          if (this.disposed || this.chunks.has(key) || this.loading.has(key)) return;
          const distSq = chunkDistanceSq(this.playerChunkX, this.playerChunkZ, chunkX, chunkZ);
          if (distSq <= this.viewDistance * this.viewDistance) {
            this.loadQueue.enqueue(chunkX, chunkZ, distSq);
          }
        }, LOAD_RETRY_DELAY_MS * attempts);
      } else {
        console.error(`Failed to load chunk ${key} after ${attempts} attempts:`, error);
      }
    }
  }

  /**
   * Remember a modified chunk's blocks so edits survive unload/reload.
   * @param {Chunk} chunk
   */
  _cacheIfModified(chunk) {
    if (chunk && chunk.blocks && chunk.lastModified > 0) {
      this.modifiedChunkCache.set(chunk.key, {
        blocks: chunk.blocks,
        shapes: chunk.hasShapes() ? chunk.shapes : null,
        lastModified: chunk.lastModified,
      });
    }
  }

  /**
   * All chunks containing world edits, loaded or not (for saving).
   * `shapes` is present only for chunks with shaped cells (pieces).
   * @returns {Array<{ key: string, x: number, z: number, blocks: Uint8Array, shapes?: Uint16Array, lastModified: number }>}
   */
  getModifiedChunks() {
    const result = [];
    for (const chunk of this.chunks.values()) {
      if (chunk.blocks && chunk.lastModified > 0) {
        const entry = { key: chunk.key, x: chunk.x, z: chunk.z, blocks: chunk.blocks, lastModified: chunk.lastModified };
        if (chunk.hasShapes()) entry.shapes = chunk.shapes;
        result.push(entry);
      }
    }
    for (const [key, data] of this.modifiedChunkCache) {
      if (this.chunks.has(key)) continue;
      const [x, z] = key.split(',').map(Number);
      const entry = { key, x, z, blocks: data.blocks, lastModified: data.lastModified };
      if (data.shapes) entry.shapes = data.shapes;
      result.push(entry);
    }
    return result;
  }

  /**
   * Replace all world edits with the given set (for loading a save).
   * Loaded chunks are updated in place; loaded chunks with edits that are not
   * in the save are regenerated; unloaded chunks are applied when they load.
   * @param {Array<{ x: number, z: number, blocks: Uint8Array, lastModified: number }>} modified
   */
  applyModifiedChunks(modified) {
    this.modifiedChunkCache.clear();
    const savedKeys = new Set();

    for (const data of modified) {
      const key = chunkKey(data.x, data.z);
      savedKeys.add(key);
      const blocks = new Uint8Array(data.blocks); // copy: never alias saved buffers
      const shapes = data.shapes ? new Uint16Array(data.shapes) : null;
      const chunk = this.chunks.get(key);
      if (chunk) {
        chunk.blocks = blocks;
        chunk.shapes = shapes;
        chunk.lastModified = data.lastModified || Date.now();
        chunk.isDirty = true;
        chunk.rebuildHeightMap();
        this._markChunkAndNeighborsDirty(chunk);
      } else {
        this.modifiedChunkCache.set(key, { blocks, shapes, lastModified: data.lastModified || Date.now() });
      }
    }

    // Revert edits made since the save: regenerate those chunks from the seed
    for (const chunk of [...this.chunks.values()]) {
      if (chunk.lastModified > 0 && !savedKeys.has(chunk.key)) {
        const { x, z } = chunk;
        this.unloadChunk(chunk, { keepEdits: false });
        this.loadQueue.enqueue(x, z, chunkDistanceSq(this.playerChunkX, this.playerChunkZ, x, z));
      }
    }
  }

  /**
   * Mark a chunk and its loaded neighbours for mesh rebuild.
   * @param {Chunk} chunk
   */
  _markChunkAndNeighborsDirty(chunk) {
    chunk.meshDirty = true;
    this.meshRebuildQueue.add(chunk.key);
    for (const n of Object.values(chunk.neighbors)) {
      if (n) {
        n.meshDirty = true;
        this.meshRebuildQueue.add(n.key);
      }
    }
  }

  /**
   * Generate chunk synchronously (fallback/testing)
   * @param {number} chunkX
   * @param {number} chunkZ
   * @returns {Chunk}
   */
  generateChunkSync(chunkX, chunkZ) {
    const chunk = new Chunk(chunkX, chunkZ);

    // Simple terrain generation
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = chunkX * CHUNK_SIZE + x;
        const worldZ = chunkZ * CHUNK_SIZE + z;

        // Simple height based on sine waves
        const height = Math.floor(
          24 +
          Math.sin(worldX * 0.1) * 2 +
          Math.cos(worldZ * 0.1) * 2 +
          Math.sin(worldX * 0.05 + worldZ * 0.05) * 3
        );

        for (let y = 0; y < CHUNK_SIZE_Y; y++) {
          let blockType = 0; // Air

          if (y === 0) {
            blockType = 8; // Bedrock
          } else if (y < height - 3) {
            blockType = 1; // Stone
          } else if (y < height) {
            blockType = 2; // Dirt
          } else if (y === height) {
            blockType = 3; // Grass
          }

          if (blockType !== 0) {
            chunk.setBlock(x, y, z, blockType);
          }
        }
      }
    }

    chunk.rebuildHeightMap();
    // Freshly generated terrain is not a world edit
    chunk.isDirty = false;
    chunk.lastModified = 0;
    return chunk;
  }

  /**
   * Update neighbor references for a chunk
   * @param {Chunk} chunk
   */
  updateNeighbors(chunk) {
    const { x, z } = chunk;

    // Get neighbors
    const north = this.chunks.get(chunkKey(x, z + 1));
    const south = this.chunks.get(chunkKey(x, z - 1));
    const east = this.chunks.get(chunkKey(x + 1, z));
    const west = this.chunks.get(chunkKey(x - 1, z));

    // Set references
    chunk.setNeighbor('north', north || null);
    chunk.setNeighbor('south', south || null);
    chunk.setNeighbor('east', east || null);
    chunk.setNeighbor('west', west || null);

    // Update neighbors to reference this chunk
    if (north) {
      north.setNeighbor('south', chunk);
      this.meshRebuildQueue.add(north.key);
    }
    if (south) {
      south.setNeighbor('north', chunk);
      this.meshRebuildQueue.add(south.key);
    }
    if (east) {
      east.setNeighbor('west', chunk);
      this.meshRebuildQueue.add(east.key);
    }
    if (west) {
      west.setNeighbor('east', chunk);
      this.meshRebuildQueue.add(west.key);
    }
  }

  /**
   * Unload a chunk
   * @param {Chunk} chunk
   */
  unloadChunk(chunk, { keepEdits = true } = {}) {
    // Preserve world edits so they reappear when the chunk reloads
    if (keepEdits) this._cacheIfModified(chunk);

    // Remove from neighbors
    const north = chunk.neighbors.north;
    const south = chunk.neighbors.south;
    const east = chunk.neighbors.east;
    const west = chunk.neighbors.west;

    if (north) north.setNeighbor('south', null);
    if (south) south.setNeighbor('north', null);
    if (east) east.setNeighbor('west', null);
    if (west) west.setNeighbor('east', null);

    // Callback before disposing
    this.onChunkUnload(chunk);

    // Clean up
    chunk.dispose();
    this.chunks.delete(chunk.key);
    this.meshRebuildQueue.delete(chunk.key);

    this.stats.chunksUnloaded++;
  }

  /**
   * Rebuild mesh for a chunk (placeholder - actual building done by meshBuilder)
   * @param {Chunk} chunk
   */
  rebuildChunkMesh(chunk) {
    // This will be implemented by the mesh builder integration
    // For now, just mark as not dirty
    chunk.meshDirty = false;
  }

  /**
   * Get a chunk by coordinates
   * @param {number} chunkX
   * @param {number} chunkZ
   * @returns {Chunk | undefined}
   */
  getChunk(chunkX, chunkZ) {
    return this.chunks.get(chunkKey(chunkX, chunkZ));
  }

  /**
   * Get a chunk by key
   * @param {string} key
   * @returns {Chunk | undefined}
   */
  getChunkByKey(key) {
    return this.chunks.get(key);
  }

  /**
   * Get block at world coordinates
   * @param {number} worldX
   * @param {number} worldY
   * @param {number} worldZ
   * @returns {number} Block type
   */
  getBlock(worldX, worldY, worldZ) {
    const { chunkX, chunkZ } = worldToChunk(worldX, worldZ);
    const chunk = this.getChunk(chunkX, chunkZ);

    if (!chunk) return 0; // Air if chunk not loaded

    // Convert to local coordinates
    const voxelX = Math.floor(worldX / VOXEL_SIZE);
    const voxelY = Math.floor(worldY / VOXEL_SIZE);
    const voxelZ = Math.floor(worldZ / VOXEL_SIZE);

    // Above or below the world is air (don't clamp onto the top/bedrock layer)
    if (voxelY < 0 || voxelY >= CHUNK_SIZE_Y) return BlockTypes.AIR;

    const localX = ((voxelX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = voxelY;
    const localZ = ((voxelZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    return chunk.getBlock(localX, localY, localZ);
  }

  /**
   * Set block at world coordinates
   * @param {number} worldX
   * @param {number} worldY
   * @param {number} worldZ
   * @param {number} blockType
   * @returns {boolean} True if block was set
   */
  setBlock(worldX, worldY, worldZ, blockType) {
    const at = this._locate(worldX, worldY, worldZ);
    if (!at) return false; // unloaded chunk, or above/below the world
    const result = at.chunk.setBlock(at.x, at.y, at.z, blockType);
    if (result) this._cellChanged(at.chunk, at.x, at.z, blockType);
    return result;
  }

  /**
   * The loaded chunk and local cell holding a world point, or null when the
   * chunk isn't loaded or the point is above or below the world.
   * @returns {{ chunk: Chunk, x: number, y: number, z: number } | null}
   */
  _locate(worldX, worldY, worldZ) {
    const { chunkX, chunkZ } = worldToChunk(worldX, worldZ);
    const chunk = this.getChunk(chunkX, chunkZ);
    if (!chunk) return null;
    const voxelY = Math.floor(worldY / VOXEL_SIZE);
    if (voxelY < 0 || voxelY >= CHUNK_SIZE_Y) return null;
    const voxelX = Math.floor(worldX / VOXEL_SIZE);
    const voxelZ = Math.floor(worldZ / VOXEL_SIZE);
    return {
      chunk,
      x: ((voxelX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
      y: voxelY,
      z: ((voxelZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
    };
  }

  /** Queue mesh rebuilds after a cell changed (and the neighbours it touches). */
  _cellChanged(chunk, localX, localZ, blockType) {
    // Mark chunk as dirty so ChunkRenderer will rebuild its mesh
    chunk.meshDirty = true;
    this.meshRebuildQueue.add(chunk.key);

    // Campfire glow extends across chunk boundaries — use wider margin
    const edgeMargin = (blockType === BlockTypes.CAMPFIRE || blockType === BlockTypes.AIR)
      ? CAMPFIRE_GLOW_RADIUS : 0;

    // Check if we need to rebuild neighbor meshes (edge block or glow radius)
    const dirty = (n) => {
      if (!n) return;
      n.meshDirty = true;
      this.meshRebuildQueue.add(n.key);
    };
    if (localX < 1 + edgeMargin) dirty(chunk.neighbors.west);
    if (localX > CHUNK_SIZE - 2 - edgeMargin) dirty(chunk.neighbors.east);
    if (localZ < 1 + edgeMargin) dirty(chunk.neighbors.south);
    if (localZ > CHUNK_SIZE - 2 - edgeMargin) dirty(chunk.neighbors.north);
  }

  /**
   * Shape of the cell at world coordinates (see cellShape.js; 0 = full block or air).
   * @returns {number}
   */
  getShape(worldX, worldY, worldZ) {
    const at = this._locate(worldX, worldY, worldZ);
    return at ? at.chunk.getShape(at.x, at.y, at.z) : 0;
  }

  /**
   * Set a cell's type and shape at world coordinates (shape 0 = full block).
   * @returns {boolean} True if the cell changed
   */
  setCell(worldX, worldY, worldZ, blockType, shape = 0) {
    const at = this._locate(worldX, worldY, worldZ);
    if (!at) return false;
    const result = at.chunk.setCell(at.x, at.y, at.z, blockType, shape);
    if (result) this._cellChanged(at.chunk, at.x, at.z, blockType);
    return result;
  }

  /**
   * Is the exact point inside something solid? Like isSolid(getBlock(...)),
   * but a shaped cell counts only where it has a filled sub-cube.
   * @returns {boolean}
   */
  isSolidAt(worldX, worldY, worldZ) {
    const at = this._locate(worldX, worldY, worldZ);
    if (!at) return false;
    if (!isSolid(at.chunk.getBlock(at.x, at.y, at.z))) return false;
    const shape = at.chunk.getShape(at.x, at.y, at.z);
    if (!shape) return true;
    const [sx, sy, sz] = subCubeOf(worldX, worldY, worldZ, VOXEL_SIZE);
    return subFilled(shape, sx, sy, sz);
  }

  /**
   * Height of the walkable surface under a point: the top of the highest solid
   * cell or piece at (worldX, worldZ) at or below `fromY` (a bottom slab is a
   * half-block step). Null if there is none (chunk not loaded or open void).
   * @param {number} worldX
   * @param {number} worldZ
   * @param {number} [fromY] - search downward from here (default: top of the world)
   * @returns {number | null}
   */
  standingHeight(worldX, worldZ, fromY = CHUNK_SIZE_Y * VOXEL_SIZE) {
    const { chunkX, chunkZ } = worldToChunk(worldX, worldZ);
    const chunk = this.getChunk(chunkX, chunkZ);
    if (!chunk) return null;
    const lx = ((Math.floor(worldX / VOXEL_SIZE) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((Math.floor(worldZ / VOXEL_SIZE) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const [sx, , sz] = subCubeOf(worldX, 0, worldZ, VOXEL_SIZE);
    const startY = Math.min(CHUNK_SIZE_Y - 1, Math.floor(fromY / VOXEL_SIZE));
    for (let vy = startY; vy >= 0; vy--) {
      if (!isSolid(chunk.getBlock(lx, vy, lz))) continue;
      const top = columnTop(chunk.getShape(lx, vy, lz), sx, sz);
      if (top < 0) continue;
      const h = vy * VOXEL_SIZE + top * (VOXEL_SIZE / 2);
      if (h <= fromY + 1e-6) return h;
    }
    return null;
  }

  /**
   * Mark a chunk for mesh rebuild
   * @param {string} key - Chunk key
   */
  markMeshDirty(key) {
    const chunk = this.chunks.get(key);
    if (chunk) {
      chunk.meshDirty = true;
      this.meshRebuildQueue.add(key);
    }
  }

  /**
   * Get all active chunks
   * @returns {Map<string, Chunk>}
   */
  getActiveChunks() {
    return this.chunks;
  }

  /**
   * Get chunks that need mesh rebuild
   * @returns {Array<Chunk>}
   */
  getDirtyChunks() {
    return Array.from(this.chunks.values()).filter(c => c.meshDirty);
  }

  /**
   * Get current stats
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      activeChunks: this.chunks.size,
      loadQueueSize: this.loadQueue.length,
      loadingCount: this.loading.size,
      unloadQueueSize: this.unloadQueue.size,
      meshRebuildQueue: this.meshRebuildQueue.size,
    };
  }

  /**
   * Clean up all resources
   */
  dispose() {
    this.disposed = true;
    this.modifiedChunkCache.clear();
    this.loadRetries.clear();

    // Unload all chunks
    for (const chunk of this.chunks.values()) {
      chunk.dispose();
    }

    this.chunks.clear();
    this.loadQueue.clear();
    this.unloadQueue.clear();
    this.loading.clear();
    this.meshRebuildQueue.clear();
  }
}

export default ChunkManager;
