/**
 * CraftingUI — the Bag's Craft tab: categories, the recipe list (locked,
 * ready or short of materials) and a parchment card with stats, materials
 * and the craft button. Opened with C; the frame and tabs come from BagFrame.
 */
import React, { useState, useEffect, useRef } from 'react';
import useGameStore from '../stores/useGameStore';
import BagFrame, { useIsMobile } from './ui/BagFrame';
import { artUrl, itemArt, materialArt, rarityClass, RARITY_INK } from './ui/art';
import { CRAFTING_RECIPES, ITEM_TYPES, canCraft } from '../data/craftingRecipes';
import { recipeLock } from '../data/unlocks';
import { PIECE_RECIPES, pieceRecipeTimes, applyPieceRecipe, materialName, blocksAvailable, formatBlocks } from '../data/pieces';
import { MaterialCraftingSystem, QUALITY_TIERS } from '../modules/crafting/MaterialCraftingSystem';

const CATEGORIES = [
  { id: 'all', name: 'All', icon: 'grid' },
  { id: ITEM_TYPES.TOOL, name: 'Tools', icon: 'pickaxe' },
  { id: ITEM_TYPES.WEAPON, name: 'Weapons', icon: 'sword' },
  { id: ITEM_TYPES.ARMOR, name: 'Armor', icon: 'armor' },
  { id: ITEM_TYPES.CONSUMABLE, name: 'Potions', icon: 'flask' },
  { id: 'pieces', name: 'Pieces', icon: 'box' },
];

const titleCase = (stat) => stat.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
const materialLabel = (key) => key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');

function RecipePicture({ recipe }) {
  const url = itemArt(recipe);
  return url ? <img src={url} alt="" /> : <img src={artUrl('ui', recipe.icon) || artUrl('ui', 'box')} alt="" />;
}

const CraftingUI = () => {
  // Open state lives in the store: one panel at a time, Esc handled centrally
  const isOpen = useGameStore((state) => state.openPanel === 'crafting');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [craftingAnimation, setCraftingAnimation] = useState(false);
  const isMobile = useIsMobile();
  const detailRef = useRef(null);
  const [lastCraftedQuality, setLastCraftedQuality] = useState(null);

  const craftingSystemRef = useRef(null);

  const inventory = useGameStore((state) => state.inventory);
  const equipment = useGameStore((state) => state.equipment);
  const level = useGameStore((state) => state.player.level);
  // Level-locked (data/unlocks.js) vs short of materials
  const lockOf = (recipe) => recipeLock(recipe, { player: { level } });
  const ready = (recipe) => !lockOf(recipe) && canCraft(recipe, inventory);

  // Initialize MaterialCraftingSystem
  useEffect(() => {
    if (!craftingSystemRef.current) {
      craftingSystemRef.current = new MaterialCraftingSystem(useGameStore);
    }
  }, []);

  useEffect(() => {
    const handleKeyPress = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'c' || e.key === 'C') {
        useGameStore.getState().togglePanel('crafting');
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  if (!isOpen) return null;

  // Unlocked recipes first, then by the level that unlocks them
  const filteredRecipes = Object.values(CRAFTING_RECIPES)
    .filter((recipe) => selectedCategory === 'all' || recipe.type === selectedCategory)
    .sort((a, b) => (lockOf(a)?.level || 0) - (lockOf(b)?.level || 0));

  const handleCraft = (recipe) => {
    if (!craftingSystemRef.current || !ready(recipe)) return;

    setCraftingAnimation(true);

    // Craft using MaterialCraftingSystem with equipped tool
    const tool = equipment.weapon || equipment.offhand; // Use weapon or offhand as crafting tool
    const result = craftingSystemRef.current.craftItem(recipe.id, { tool });

    if (result.success) {
      // Store quality for display
      setLastCraftedQuality(result.quality);

      // Spawn crafting effect with quality-based color
      useGameStore.getState().addParticleEffect?.({
        position: useGameStore.getState().player.position,
        color: result.quality.color,
        type: 'spiral',
        count: 30,
      });

      setTimeout(() => {
        setCraftingAnimation(false);
        setLastCraftedQuality(null);
      }, 2000);
    } else {
      setCraftingAnimation(false);
    }
  };

  const handleSelectRecipe = (recipe) => {
    setSelectedRecipe(recipe);
    // One column on phones: bring the card into view
    if (isMobile) setTimeout(() => detailRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }), 0);
  };

  const selectedLock = selectedRecipe && lockOf(selectedRecipe);
  const craftLabel = craftingAnimation
    ? 'Crafting...'
    : selectedLock
      ? selectedLock.reason
      : selectedRecipe && canCraft(selectedRecipe, inventory) ? 'Craft Item' : 'Need materials';

  return (
    <BagFrame
      active="crafting"
      label="Crafting"
      footer={(
        <>
          <span><kbd className="vx-key">C</kbd> or <kbd className="vx-key">Esc</kbd> close</span>
          <span>Better tools in hand give better quality</span>
        </>
      )}
    >
      <div className="craft">
        <nav className="craft__cats" aria-label="Recipe categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`vx-tab${selectedCategory === cat.id ? ' is-on' : ''}`}
              aria-pressed={selectedCategory === cat.id}
              onClick={() => setSelectedCategory(cat.id)}
            >
              <img src={artUrl('ui', cat.icon)} alt="" />
              {cat.name}
            </button>
          ))}
        </nav>

        {selectedCategory === 'pieces' ? (
          <PiecesCraft materials={inventory.materials} isMobile={isMobile} />
        ) : (<>
        <div className="craft__list">
          <h3 className="vx-h">Recipes ({filteredRecipes.length})</h3>
          {filteredRecipes.map((recipe) => {
            const lock = lockOf(recipe);
            const craftable = !lock && canCraft(recipe, inventory);
            return (
              <button
                key={recipe.id}
                type="button"
                className={`recipe${selectedRecipe?.id === recipe.id ? ' is-selected' : ''}${lock ? ' is-locked' : ''}`}
                onClick={() => handleSelectRecipe(recipe)}
              >
                <span className={`vx-slot ${rarityClass(recipe)}`}><RecipePicture recipe={recipe} /></span>
                <span className="recipe__text">
                  <span className="recipe__name">{recipe.name}</span>
                  <span className="recipe__sub">{recipe.rarity.name} {recipe.type}</span>
                </span>
                {lock ? (
                  <span className="vx-tag vx-tag--lock" title={lock.reason}>
                    <img src={artUrl('ui', 'lock')} alt="Locked until" /> Lv {lock.level}
                  </span>
                ) : craftable ? (
                  <span className="vx-tag vx-tag--ready">Ready</span>
                ) : (
                  <span className="vx-tag vx-tag--need">Need materials</span>
                )}
              </button>
            );
          })}
        </div>

        <aside className="vx-parch detail" aria-label="Recipe" ref={detailRef}>
          {selectedRecipe ? (
            <>
              <div className="detail__top">
                <div className={`vx-slot ${rarityClass(selectedRecipe)}`}><RecipePicture recipe={selectedRecipe} /></div>
                <div>
                  <h3 className="detail__name" style={{ color: RARITY_INK[selectedRecipe.rarity?.name] || 'var(--vx-ink)' }}>{selectedRecipe.name}</h3>
                  <div className="detail__sub">{selectedRecipe.rarity.name} {selectedRecipe.type}</div>
                </div>
              </div>
              <p className="detail__desc">{selectedRecipe.description}</p>

              {selectedRecipe.stats && (
                <div className="detail__rows">
                  {Object.entries(selectedRecipe.stats).map(([stat, value]) => (
                    <div key={stat} className="vx-stat">
                      <span>{titleCase(stat)}</span>
                      <span className="vx-stat__dots" />
                      <strong className="good">+{value}</strong>
                    </div>
                  ))}
                </div>
              )}

              <div className="detail__rows craft__need">
                <h4 className="vx-h">Materials</h4>
                {Object.entries(selectedRecipe.requirements).map(([material, required]) => {
                  const available = blocksAvailable(inventory.materials, material); // planks and slabs count
                  const url = materialArt(material);
                  return (
                    <div key={material} className="vx-stat">
                      <span className="vx-slot">{url && <img src={url} alt="" />}</span>
                      <span>{materialLabel(material)}</span>
                      <span className="vx-stat__dots" />
                      <strong className={available >= required - 1e-9 ? 'good' : 'bad'}>{formatBlocks(available)} / {required}</strong>
                    </div>
                  );
                })}
              </div>

              {lastCraftedQuality && (
                <div className="craft__quality" style={{ background: '#1d1f26', color: lastCraftedQuality.color }}>
                  <strong>{lastCraftedQuality.name} quality!</strong> Stats ×{lastCraftedQuality.multiplier}
                </div>
              )}

              <div className="detail__fill" />
              <button
                type="button"
                className={`vx-pbtn vx-pbtn--block${ready(selectedRecipe) ? '' : ' vx-pbtn--stone'}`}
                onClick={() => handleCraft(selectedRecipe)}
                disabled={!ready(selectedRecipe) || craftingAnimation}
              >
                {selectedLock && <img src={artUrl('ui', 'lock')} alt="" />}
                {craftLabel}
              </button>
              <div className="craft__tiers" aria-label="Quality tiers">
                {Object.values(QUALITY_TIERS).map((tier) => (
                  <span key={tier.name}><span style={{ color: tier.color }}>■</span> {tier.name} ×{tier.multiplier}</span>
                ))}
              </div>
            </>
          ) : (
            <p className="detail__empty">Select a recipe to see what it needs.</p>
          )}
        </aside>
        </>)}
      </div>
    </BagFrame>
  );
};

/**
 * Craft → Pieces: combine pieces into a block (2 slabs → 1 stone block) or
 * split a block into pieces. Exact shapes; the only place pieces combine.
 */
function PiecesCraft({ materials, isMobile }) {
  const [selectedId, setSelectedId] = useState(PIECE_RECIPES[0].id);
  const detailRef = useRef(null);
  const recipe = PIECE_RECIPES.find((r) => r.id === selectedId);
  const times = pieceRecipeTimes(recipe, materials);
  const [[fromKey, fromQty]] = Object.entries(recipe.from);
  const [[toKey, toQty]] = Object.entries(recipe.to);

  const run = (n) => {
    const next = applyPieceRecipe(recipe, useGameStore.getState().inventory.materials, n);
    if (!next) return;
    useGameStore.getState().setMaterials(next);
    useGameStore.getState().addPickupText(`+${toQty * n} ${materialName(toKey, toQty * n)}`, '#44ff44');
  };
  const pick = (id) => {
    setSelectedId(id);
    if (isMobile) setTimeout(() => detailRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }), 0);
  };

  return (
    <>
      <div className="craft__list">
        <h3 className="vx-h">Combine and split</h3>
        {PIECE_RECIPES.map((r) => {
          const n = pieceRecipeTimes(r, materials);
          const [[fk, fq]] = Object.entries(r.from);
          const [[tk]] = Object.entries(r.to);
          return (
            <button
              key={r.id}
              type="button"
              className={`recipe${r.id === selectedId ? ' is-selected' : ''}`}
              onClick={() => pick(r.id)}
            >
              <span className="vx-slot"><img src={materialArt(tk)} alt="" /></span>
              <span className="recipe__text">
                <span className="recipe__name">{r.kind === 'combine' ? materialName(tk) : `Split ${materialName(fk).toLowerCase()}`}</span>
                <span className="recipe__sub">from {fq} {materialName(fk, fq).toLowerCase()}</span>
              </span>
              {n > 0 ? <span className="vx-tag vx-tag--ready">×{n}</span> : <span className="vx-tag vx-tag--need">Need {fq}</span>}
            </button>
          );
        })}
      </div>

      <aside className="vx-parch detail" aria-label="Piece recipe" ref={detailRef}>
        <div className="detail__top">
          <div className="vx-slot"><img src={materialArt(toKey)} alt="" /></div>
          <div>
            <h3 className="detail__name">{toQty > 1 ? `${toQty} ${materialName(toKey, toQty).toLowerCase()}` : materialName(toKey)}</h3>
            <div className="detail__sub">{recipe.kind === 'combine' ? 'Combine pieces' : 'Split a block'}</div>
          </div>
        </div>
        <p className="detail__desc">
          {recipe.kind === 'combine'
            ? `Fit ${fromQty} ${materialName(fromKey, fromQty).toLowerCase()} together into one block you can place.`
            : `Break a block into ${toQty} ${materialName(toKey, toQty).toLowerCase()}. Buildings and recipes take pieces as they are.`}
        </p>
        <div className="detail__rows craft__need">
          <h4 className="vx-h">Uses</h4>
          <div className="vx-stat">
            <span className="vx-slot"><img src={materialArt(fromKey)} alt="" /></span>
            <span>{materialName(fromKey, fromQty)}</span>
            <span className="vx-stat__dots" />
            <strong className={times > 0 ? 'good' : 'bad'}>{materials?.[fromKey] || 0} / {fromQty}</strong>
          </div>
        </div>
        <div className="detail__fill" />
        <div className="detail__actions">
          <button type="button" className={`vx-pbtn vx-pbtn--block${times > 0 ? '' : ' vx-pbtn--stone'}`} disabled={times < 1} onClick={() => run(1)}>
            {times > 0 ? (recipe.kind === 'combine' ? 'Combine' : 'Split') : `Need ${fromQty} ${materialName(fromKey, fromQty).toLowerCase()}`}
          </button>
          {times > 1 && (
            <button type="button" className="vx-pbtn vx-pbtn--stone vx-pbtn--block" onClick={() => run(times)}>
              {recipe.kind === 'combine' ? 'Combine' : 'Split'} all (×{times})
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

export default CraftingUI;
