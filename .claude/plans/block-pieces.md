# Block pieces: blocks break into placeable pieces

Status: planned (not started). Decisions from the user on 2026-11-18 are marked **[decided]**;
my proposals still to confirm are marked **[proposed]**.

## The idea

A block is 2×2×2 world units (`VOXEL_SIZE = 2`), so it holds eight 1×1×1 **units**. Mining a
block removes the whole block and gives its 8 units as pieces in the material's natural shape:

| Material | Natural piece | Units each | One block gives |
|---|---|---|---|
| Wood | plank 4×1×1 | 4 | 2 planks |
| Stone (and gravel) | slab 2×2×1 | 4 | 2 slabs |
| Dirt, sand, snow, clay | cube 1×1×1 | 1 | 8 cubes |

- **[decided]** Pieces can be placed back into the world (option B: shaped pieces in the normal grid,
  not a half-size world).
- **[decided]** One hit removes one block (cell) and gives pieces; no chipping a block apart.
- **[decided]** Tools matter.
- **[decided]** Settlers haul and build with pieces.
- **[decided]** Units are interchangeable for costs: a blueprint asking for one stone block accepts
  8 stone units in any mix (8 cubes, 2 slabs, 1 block, ...).

## Core model

### Inventory: units, shown as pieces **[proposed]**
- `inventory.materials.<m>` counts **units** for the building materials (wood, stone, dirt, sand,
  snow, clay). Ores, food, leather, etc. stay plain counts.
- The UI shows each material in its natural piece: "Stone: 3 slabs + 2" (14 units),
  "Wood: 5 planks", "Dirt: 23 cubes". Costs are shown the same way.
- Because units are interchangeable, the player can place any shape from any units of that
  material (a slab from 4 stone cubes' worth), matching the blueprint rule above.

### World: an 8-bit shape mask per cell
- `Chunk` gets `masks: Uint8Array(CHUNK_SIZE_CUBED)` next to `blocks`. Bit i = sub-cube i of the
  cell (x, y, z each 0/1). `0xFF` = full block (all terrain), `0` = empty.
- A cell still has exactly one block type, so pieces in one cell are one material **[proposed]**.
- Shapes are just masks: bottom slab `0x0F`, top slab `0xF0`, side slabs, one cube, a bar. A 4-long
  plank is a 2-unit bar in two neighbouring cells; no linking needed, since mining either half
  gives its 2 units back.
- Placing a piece into a cell that already holds the same material merges the masks (two slabs
  become a full block, which is stored as `0xFF` again).
- Cost of anything = the number of bits it sets. Mining a cell gives back the number of bits in it
  (times the tool's yield).
- `ChunkManager.getBlock` keeps returning the type; add `getMask` / `setCell(type, mask)`.
  `setBlock` keeps meaning "full block" so existing callers keep working.

### Tools **[proposed numbers, to tune in tuning.js]**
Yield = the share of a block's 8 units you keep; the rest is lost as rubble or splinters.

| Material | Bare hand | Stone tool | Iron | Steel+ |
|---|---|---|---|---|
| Stone (pickaxe) | 4 | 6 | 8 | 8 |
| Wood (axe) | 4 | 6 | 8 | 8 |
| Dirt, sand, snow, clay | 8 | 8 | 8 | 8 |

- Ores keep `requiresTier` and their current drops.
- Mining speed by tool stays as it is now.
- Steel+ could add a small bonus later (for example, a chance of a 9th unit). Not in the first cut.

## What changes, by system

| System | Change |
|---|---|
| `data/blockDrops.js` | Drops in units by tool yield; `BLOCK_PLACEMENT_COSTS` becomes units per bit; natural-piece table |
| `stores/useGameStore.js` | Material counts in units; helpers to show as pieces |
| `data/craftingRecipes.js`, `data/buildings.js` | Costs in units (current numbers ×8 as a start, then rebalance) |
| `systems/chunks/Chunk.js`, `ChunkManager.js` | `masks` array, `getMask`/`setCell`, modified-chunk cache keeps masks |
| `workers/chunkWorker.js` | Mesh partial cells as sub-cubes (cull sub-faces against neighbour masks); full cells unchanged; LOD treats any non-empty cell as full |
| Collision | Trimesh comes from the mesh, so shapes collide for free. The player gets a half-block step-up so slabs are steps, not jumps |
| Navigation / settlers | "Standing height" of a cell comes from its mask; a bottom slab is a half step |
| Shelter / campfire / mining scanners | Treat a cell as solid when it is full or a full layer (decide per check) |
| `persistence/Game3DSaveManager.js` | Schema v7: chunk saves carry masks (old saves: every non-air cell `0xFF`); inventory building materials ×8 |
| Block interaction | Mining gives units; placement picks a shape and orientation, previews it on the sub-grid, merges into same-material cells |
| Hotbar / touch wheel | A shape picker (block, slab, plank, cube) next to the block; R rotates on desktop, a rotate button on touch |
| Settlement | Hauling and stockpiles count units; construction consumes units per placed piece (smoother progress) |
| Blueprints (`parseLayers`) | New glyphs for slabs and planks, so buildings can have slab roofs, plank floors and beams |
| Art | Piece icons per material (plank, slab, cube); loot pieces in 3D (ties in with the art-pass "loot chunk per material" gap) |

## Phases and checkpoints

1. **Units economy (no world change).**
   - Changes: building materials counted in units, drops by tool yield, pieces shown in the UI,
     recipe and blueprint costs in units, stockpile and hauling in units, save v7 for inventory.
   - Check: tests updated; mine and craft in the browser; old save loads with ×8 materials.
2. **Shaped cells in the world.**
   - Changes: chunk masks, worker meshing of partial cells, saves carry masks, mining a partial
     cell gives its bits, standing height and step-up.
   - Placement is still full blocks; a dev-overlay tool places test shapes.
   - Check: mesher unit tests per mask; walk on and mine test shapes; frame time on a phone
     profile stays inside budget.
3. **Placing pieces.**
   - Changes: shape picker, rotation, sub-grid ghost preview, merging, cost per bit.
     Desktop and touch.
   - Check: place, merge and mine round-trips are never a net gain; touch flow on 844×390 and
     390×844.
4. **Settlers and blueprints.**
   - Changes: construction places and pays per piece; blueprint glyphs for slabs and planks;
     refresh a few buildings to use them; regenerate building art.
   - Check: a settlement builds a slab-roof house end to end.
5. **Polish.**
   - Changes: 3D loot pieces, piece icons, sub-cube ambient occlusion, tuning pass.

Each phase is its own branch, playable on its own, merged only with the user's go-ahead.

## Open questions
- Tool yield numbers above: OK as a start?
- Show materials as pieces ("3 slabs + 2") or as plain units ("14")? Proposal: pieces.
- One material per cell: OK? (Mixing materials in one cell would need per-sub-cube types: 8×
  memory for edited cells.)
- Should grass placed as dirt stay dirt (as today)? Proposal: yes.
- Leaves, berry bushes, campfires and ores stay whole and are not split. OK?
