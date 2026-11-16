# Controls & Modes Rework

**Agreed:** 2026-11-16. **Goal:** fewer modes, no key clashes, one control scheme that works on desktop and touch. Land it before Phase 3 adds combat controls.

## Target design

Two modes and one screen, instead of five toggles and three separate panels:

| | What it is | Enter / leave |
|---|---|---|
| **Play** | Explore, fight, mine and place blocks. No separate build mode. | Default; Esc returns here |
| **Plan** | Settlement planning: zones and buildings, camera pulled up to top-down, settlement overview alongside | P (touch: tool wheel) |
| **Bag** | One screen with Inventory, Craft and Repair tabs | I (Inventory tab), C (Craft tab) |

The store holds exactly one `mode` (`play` or `plan`) and at most one open `panel` (`bag`, `settlement` or null). Entering one leaves the others; Esc always backs out one step; the HUD badge names the mode and how to leave it.

### Play: context decides what a click does

- **Left-click, hold:** an enemy under the cursor → attack with the chosen spell (or melee); otherwise → mine the targeted block.
- **Right-click, tap:** place the selected hotbar block on the targeted face. Right-*drag* still turns the camera.
- **Hotbar 1–9, always visible:** blocks. An empty "hand" slot places nothing, so a fight can't place blocks by accident.
- **Spells:** hold **Q** for the spell wheel, release to choose; clicks on enemies cast it. *(Done in step 1.)*

### Touch

- One **context button** whose icon follows the target: sword on an enemy, pickaxe on a block, hand on an item, block icon to place. Tap to act, hold to repeat (mining). Replaces long-press mining, so a drag is always the camera.
- One **tool wheel** button: hotbar block, Plan, Bag, Settlement, spells.

### Keys

| Key | Does |
|---|---|
| WASD, Space, Shift | Move, jump, run |
| 1–9 / mouse wheel | Hotbar |
| Q (hold) | Spell wheel |
| E | Interact / pick up |
| B | Build catalog (blocks and buildings, tabs) |
| P | Plan mode (zones, buildings, top-down) |
| I / C | Bag (Inventory / Craft tab) |
| N | Settlement overview |
| H | Potion |
| Right-mouse hold or Ctrl | Block (was Alt, which browsers grab) |
| Esc | Back out one step / pause |

Tab is freed (browser focus key). Remapping in Settings comes later.

## Steps

1. **Done:** spells on the Q wheel; number keys no longer cast spells (fixes the clash with the block hotbar).
2. **Done:** one mode (play, build, zone) and one panel (inventory, crafting, settlement, building catalog) at a time; Esc backs out one step (placement → panel or info card → mode), then pauses.
3. **Done:** modeless mining and placing in Play (desktop); always-visible hotbar with an empty hand slot (the default; pressing a selected block's key again returns to it). Left-click on terrain within reach mines; ground clicks beyond reach still cast the spell. Touch keeps build mode until step 6.
4. **Done:** B catalog: blocks and buildings in one, with tabs (1 / 2 switch while open). Picking a block puts it in hand; one not on the bar gets an extra hotbar slot. The desktop dock's Build button opens it; touch keeps build mode and gets a Catalog button in the build hotbar.
5. Plan mode: zones + building placement with the raised camera; settlement overview alongside.
6. Touch: context button and tool wheel; drop long-press mining.
7. Bag: Inventory, Craft and Repair as tabs of one screen.
8. Key layout above: block on right-mouse/Ctrl, update hints, start screen and the shortcuts panel.
