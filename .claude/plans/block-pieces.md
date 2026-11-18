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
- **[decided]** Blueprints (and settlers building them) pay by volume: a blueprint asking for one
  stone block accepts a block, 2 slabs or 8 cubes, in any mix.
- **[decided]** Placed pieces never merge in the world. Two slabs in one cell stay two slabs.
  Pieces combine only in crafting (2 slabs → 1 block).
- **[decided]** Tool yields below are the starting point; materials shown as pieces; one material
  per cell; leaves, berry bushes, campfires and ores stay whole.

## Core model

### Inventory: real pieces by shape **[decided; built in phase 1]**
- Pieces are their own material keys next to the block keys: `wood` + `wood_plank`,
  `stone` + `stone_slab`, `dirt` + `dirt_cube`, and `sand`, `snow`, `clay` with `_cube`
  (`src/data/pieces.js`). Stockpiles, hauling and saves carry them like any material, so old
  saves need no conversion (their counts were already blocks).
- The player places the shape they hold. A full block needs a block.
  Exceptions paid by volume: the campfire and leaves, which aren't a material's own block.
  A hand-chopping new player has only planks, and the campfire starts the settlement.
- **Crafting converts** (Craft → Pieces, no station needed): 2 slabs → 1 stone block, 2 planks → 1
  wood block, 8 cubes → 1 block, and the reverse splits. "Combine all" does a whole stack.
- **Costs by volume** for gear recipes, repairs, blueprints, upgrades, settler construction and
  hauling: block 8 units, slab and plank 4, cube 1. Payment takes pieces first, then blocks. A
  block broken to pay less than a block gives the change back as pieces; a settler's change goes
  back to the stockpile it hauled from.
- Stockpile capacity counts volume (a slab takes half a block's room).
- Settlers mine and chop as if with stone tools (6 units: one piece and a 50% chance of a second).
- Quests count the base material (a stone slab counts as stone).

### World: shape mask plus piece layout per cell
- `Chunk` gets two more `Uint8Array(CHUNK_SIZE_CUBED)`:
  - `masks`: bit i = sub-cube i is filled.
  - `layout`: piece kind (block / slab / plank / cubes) and axis.
- Terrain cells are `block` with mask `0xFF`. They mine as one whole block.
- Kind and axis cut a cell's mask into separate pieces: each bit is a cube; each half along the axis
  is a slab; each 2-unit bar along the axis is half a plank.
- One material and one piece kind per cell. A second piece goes into a cell only if it is the same
  material, kind and axis and the space is free (for example, a top slab over a bottom slab).
  Pieces are never fused.
- Rendering draws a seam between pieces, so two slabs never look like a block.
- Mining finds the piece you hit (sub-cube ray test) and removes only that piece. A 4-long plank is
  two 2-unit halves in neighbouring cells; mining either half gives half a plank's worth.
  **[proposed]**: drop it as 2 cubes' worth? Wood has no cube shape, so the hit removes both halves
  of that plank (the neighbour cell's matching bar) and returns 1 plank.
- `ChunkManager.getBlock` keeps returning the type. Add `getCell` and `setCell(type, mask, layout)`.
  `setBlock` keeps meaning "full block", so existing callers keep working.

### Tools **[proposed numbers, to tune in tuning.js]**
Yield = how many units of a mined block you get back, as that material's pieces (4 = one slab or
one plank; 8 = two). The rest is lost as rubble or splinters.

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
| `data/blockDrops.js` | Drops as pieces by tool yield; placement costs one piece of the chosen shape; shape table per material |
| `stores/useGameStore.js` | `inventory.pieces`; add/spend helpers (spend by volume for blueprints) |
| Crafting | "Pieces" category: combine and split recipes |
| `data/craftingRecipes.js`, `data/buildings.js` | Gear recipes keep costs in blocks (paid by volume); blueprint requirements in units from their cells |
| `systems/chunks/Chunk.js`, `ChunkManager.js` | `masks` + `layout` arrays, `getCell`/`setCell`, modified-chunk cache keeps both |
| `workers/chunkWorker.js` | Mesh partial cells as sub-cubes (cull sub-faces against neighbour masks); full cells unchanged; LOD treats any non-empty cell as full |
| Collision | Trimesh comes from the mesh, so shapes collide for free. The player gets a half-block step-up so slabs are steps, not jumps |
| Navigation / settlers | "Standing height" of a cell comes from its mask; a bottom slab is a half step |
| Shelter / campfire / mining scanners | Treat a cell as solid when it is full or a full layer (decide per check) |
| `persistence/Game3DSaveManager.js` | Schema v7: chunk saves carry masks + layout (old saves: every non-air cell a full block); old material counts become blocks |
| Block interaction | Mining removes the hit piece; placement picks a shape and direction, previews it on the sub-grid, fills free space in a matching cell, never fuses |
| Hotbar / touch wheel | A shape picker (block, slab, plank, cube) next to the block; R rotates on desktop, a rotate button on touch |
| Settlement | Stockpiles hold pieces; hauling and construction pay by volume per placed piece (smoother progress) |
| Blueprints (`parseLayers`) | New glyphs for slabs and planks, so buildings can have slab roofs, plank floors and beams |
| Art | Piece icons per material (plank, slab, cube); loot pieces in 3D (ties in with the art-pass "loot chunk per material" gap) |

## Phases and checkpoints

1. **Pieces in the inventory (no world change).** Built on branch `block-pieces-1`.
   - Changes: `inventory.pieces`, drops as pieces by tool yield, the Pieces craft category
     (combine and split), pay-by-volume for blueprints and settlers, stockpiles hold pieces,
     the Bag shows pieces, save v7 for the inventory.
   - Placing still uses full blocks, paid with a block.
   - Check: tests updated; mine, split and combine in the browser; old save loads with its
     materials as blocks.
2. **Shaped cells in the world.**
   - Changes: chunk masks and layout, worker meshing of partial cells with seams between pieces,
     saves carry both, mining removes the hit piece, standing height and step-up.
   - Placement is still full blocks; a dev-overlay tool places test shapes.
   - Check: mesher unit tests per mask; walk on and mine test shapes; frame time on a phone
     profile stays inside budget.
3. **Placing pieces.**
   - Changes: shape picker, rotation, sub-grid ghost preview, filling free space in a matching
     cell (never fusing), one piece per placement. Desktop and touch.
   - Check: placing then mining a piece is never a net gain; two slabs in one cell stay two
     slabs; touch flow on 844×390 and 390×844.
4. **Settlers and blueprints.**
   - Changes: construction places and pays per piece; blueprint glyphs for slabs and planks;
     refresh a few buildings to use them; regenerate building art.
   - Check: a settlement builds a slab-roof house end to end.
5. **Polish.**
   - Changes: 3D loot pieces, piece icons, sub-cube ambient occlusion, tuning pass.

Each phase is its own branch, playable on its own, merged only with the user's go-ahead.

## Open questions
- When a blueprint takes 1 cube's worth and only a slab is left: break the slab and return 3 cubes
  (proposed), or require exact pieces?
- Wood has no cube: mining one half of a placed plank removes the whole plank (proposed). OK?
