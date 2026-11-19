# Art pass: menus, icons and 3D gaps

Status as of 2026-11-18. Design canvas (mockups + icon sheets):
https://claude.ai/artifact/VNRRsi9R41N8dR3BLRFfgG (private to the owner; share from its page).
Copies of the mockup sources are in `docs/art/mockups/` (their images point at the canvas's uploads).

## Look (approved)

"Carved from the world", a voxel RPG look rather than a modern web UI. Not a Minecraft look:
no light-grey inventory grid, no Minecraft-style font, no grass blocks with dirt sides.

- **Frames**: pixel-art wood planks with iron corner plates (stone with gold corners as the
  alternative). 9-slice images: `src/assets/art/textures/frame-wood.svg`, `frame-stone.svg`
  (slice 8, drawn at 3×).
- **Panel body**: dark stone-brick wall (`textures/stonewall.svg`, 64px tiles).
- **Titles**: a wooden sign (`textures/planks.svg`) hung over the frame's top edge, Silkscreen, gold.
- **Tabs**: small wooden signs; the selected one is parchment (`textures/parchment.svg`) with dark ink.
- **Item details**: parchment card, dotted leaders between stat and value.
- **Type**: Pixelify Sans for all text, Silkscreen for titles/buttons/tags.
- **Edges**: hard pixel bevels and drop shadows only: no rounded corners, no blur.
- **Slots**: recessed stone cells; the border color is the rarity (common dark, uncommon
  `#4f9a3a`, rare `#3d6fd0`, epic `#8a55d8`, legendary `#d9a43a`).
- **Bars**: notched, 3px dark border. **Tags**: small metal plates (lock gold, ready green, need red).
- **Icons**: 16×16 pixel drawings extruded into voxels (60–170 blocks each).
- **Characters**: rendered from the real models (`humanoidModel.js`), never drawn separately.
  The player wears a green shirt and brown leather jerkin, and has no cape until one is earned.

## Generating the art

```
npm run art             # icons, blocks, buildings, textures → src/assets/art (deterministic)
npm run art:portraits   # player + settler portraits from the real models (needs Chromium)
```

- `scripts/art/sprites.mjs`: every sprite as a character grid + palettes. Tiered items are one
  drawing with palette swaps (stone/iron/steel/crystal/leather/gold). Edit here to change art.
- `scripts/art/build.mjs`: renderers (voxel extrusion, flat glyphs, mono UI symbols, isometric
  blocks, buildings from their real blueprints in `src/data/buildings.js`, pixel textures).
- `src/assets/art/manifest.json` lists every icon (group, id, label, file); ids match game ids
  (recipe ids, material keys, BlockTypes names, spell ids, STATUS_EFFECTS keys, building ids).
- `src/assets/art/index.html`: contact sheet; open it in a browser to see the whole set.
- Mono UI symbols use `currentColor` (default `#f1e6cc`), so inline them to recolor.

## Checklist

### Drawn (in `src/assets/art`)
- [x] Item icons (26): weapons 5, tools 6, armour 4, rings 2, wooden shield, potions/food 8
- [x] Material icons (17)
- [x] Block icons (13): the 12 placeable blocks + iron/gold ore
- [x] Building pictures (7): from the real blueprints, seen from the front-right
- [x] Spell icons (15), status effect icons (7), HUD stat icons (6)
- [x] UI symbols (40): mode buttons, tabs/categories, plan tools, equipment slots,
      notifications, settler activities, touch controls, general
- [x] Campfire and rift icons (for toasts)
- [x] UI textures: stone wall, planks, parchment, wood frame, stone frame
- [x] Portraits: player, one settler per job (rendered from the models)

### To do: wire the art into the game (screens to restyle in the new look)
- [x] Style kit in `src/styles/voxel-ui.css`: frame, sign title, sign tabs, slot, parchment
      card, notched bar, tags, key caps, pixel buttons; load Pixelify Sans; retire the slate/blue
      tokens in `tokens.css` (still to do: other screens use them)
- [x] Bag: Inventory (paper-doll with rendered portrait), Craft, Repair — live 3D player is a later 3D-gap item
- [x] Toasts / notifications, E prompts, hints, stat tooltips
- [x] Settlement dashboard (4 tabs), Stockpile, Settler and Building panels (`FramedPanel`)
- [x] Build catalog, Plan bar + overview
- [x] Spell wheel, touch tool wheel, Dialogue
- [x] Pause, Start, Death, Help/controls, phone tutorial, error screen, feedback form
- [x] HUD: stat bars (HUD icons), level badge, clock (sun/moon), hotbar (block icons),
      mode buttons, crosshair, tool durability; toasts placed for upright and sideways phones
      and the touch buttons (jump, E, sprint, spell wand, Attack, turn piece: `.vx-tbtn`)
- [x] Replace emoji/lucide icons everywhere with the manifest icons (lucide-react removed)

### To do: 3D
- [x] Live player view in the Bag (turning model with equipped gear; drag to turn)
- [x] Companion: humanoid (mage, mercenary, gatherer) or animal (wolf pet, deer mount) rig
- [x] Held tools per tier, axe and club in hand (`playerGear.js`, `humanoidModel.js` tool bones)
- [x] Worn armour on the body: helmet, armour, gloves, boots, shield
- [x] Earned cape: sealing the first rift (`riftsClosed`, saved), with a toast
- [x] Spell visuals: voxel bolt per spell family + voxel-chip impact (`spellBolts.jsx`)
- [x] Damage numbers with pixel digits (`pixelText.js` sprites)
- [x] Target marker in pixel style (corner brackets)
- [x] Loot: a chunk per material (`pickups/pickupModels.jsx`)
- [x] Stockpile crates that show their contents (`StockpileVisual.jsx`, one merged mesh)
- [x] Settler thought-bubble icons (`NPCThoughtBubble.jsx`, pixel sprites)
- [x] Construction scaffolding detail: rails, braces, pads; notched progress bar

### Later (no screen yet)
- [ ] Skill tree icons (29, currently emoji in `src/data/skillTrees/settlementTree.json`)
- [ ] Quest screen art

## Suggested order
1. Style kit + Bag + toasts (most-used screens)
2. HUD + hotbar + Build/Plan (uses block and building icons)
3. Settlement panels, wheels, the remaining screens
4. 3D gaps: live portrait, held tools/armour, spell visuals, damage numbers, then the rest
