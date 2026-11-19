import React, { useState, useEffect } from 'react';
import useGameStore from '../stores/useGameStore';
import { SPELLS } from '../data/spells';
import { artUrl } from './ui/art';
import './SpellWheel.css';

/**
 * SpellWheel component - Spell selection wheel: hold Q (or the touch button), pick, release
 * Mobile-compatible with touch trigger button and responsive layout
 * Supports up to 12 spells with navigation
 */
const SpellWheel = () => {
  const [isActive, setIsActive] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const playerMana = useGameStore((state) => state.player.mana);
  const setActiveSpellId = useGameStore((state) => state.setActiveSpellId);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Filter spells by what the player has unlocked
  const unlockedSpells = useGameStore((s) => s.unlockedSpells);
  const availableSpells = SPELLS.filter((s) => unlockedSpells.includes(s.id));

  // Display 6 spells per page
  const SPELLS_PER_PAGE = 6;
  const totalPages = Math.ceil(availableSpells.length / SPELLS_PER_PAGE);
  const spellsOnPage = availableSpells.slice(page * SPELLS_PER_PAGE, (page + 1) * SPELLS_PER_PAGE);

  // Toggle spell wheel (for mobile button)
  const toggleSpellWheel = () => {
    setIsActive(!isActive);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip keyboard controls on mobile
      if (isMobile) return;

      if (e.code === 'KeyQ' && !e.repeat) {
        if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
        setIsActive(true);
        e.preventDefault();
      }

      if (isActive) {
        // Arrow keys for selection
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          const newIndex = selectedIndex - 1;
          if (newIndex >= 0) {
            setSelectedIndex(newIndex);
            // Auto-page if needed
            setPage(Math.floor(newIndex / SPELLS_PER_PAGE));
          }
          e.preventDefault();
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          const newIndex = selectedIndex + 1;
          if (newIndex < availableSpells.length) {
            setSelectedIndex(newIndex);
            // Auto-page if needed
            setPage(Math.floor(newIndex / SPELLS_PER_PAGE));
          }
          e.preventDefault();
        }

        // Page navigation
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          if (page > 0) {
            setPage(page - 1);
            setSelectedIndex((page - 1) * SPELLS_PER_PAGE);
          }
          e.preventDefault();
        }
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          if (page < totalPages - 1) {
            setPage(page + 1);
            setSelectedIndex((page + 1) * SPELLS_PER_PAGE);
          }
          e.preventDefault();
        }
      }
    };

    const handleKeyUp = (e) => {
      // Skip keyboard controls on mobile
      if (isMobile) return;

      if (e.code === 'KeyQ') {
        // Commit selected spell as the active spell for left-click casting
        const spell = availableSpells[selectedIndex];
        if (spell) {
          setActiveSpellId(spell.id);
        }
        setIsActive(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isActive, selectedIndex, page, spellsOnPage.length, totalPages, isMobile, setActiveSpellId, availableSpells]);

  const selectedSpell = availableSpells[selectedIndex];

  return (
    <>
      {/* Touch: the wand button opens and closes the wheel */}
      {isMobile && (
        <button
          type="button"
          onClick={toggleSpellWheel}
          className={`vx-tbtn sw-fab${isActive ? ' is-on' : ''}`}
          style={{ '--c': '#5a3fa8' }}
          aria-label="Toggle Spell Wheel"
          aria-pressed={isActive}
        >
          <img src={artUrl('ui', 'wand')} alt="" />
        </button>
      )}

      {isActive && (
        <div
          className={`vx-overlay sw-overlay${isMobile ? ' sw--mobile' : ''}`}
          onClick={(e) => {
            // Close on backdrop click (mobile only)
            if (isMobile && e.target === e.currentTarget) {
              setIsActive(false);
            }
          }}
        >
          <section className="vx-frame sw" role="dialog" aria-label="Spells">
            <h2 className="vx-sign-title sw__title">Spells</h2>

            <div className="sw__main">
              <div className="sw__grid">
                {spellsOnPage.length === 0 && <p className="sw__empty">No spells learned yet.</p>}
                {spellsOnPage.map((spell, localIndex) => {
                  const globalIndex = page * SPELLS_PER_PAGE + localIndex;
                  const isSelected = globalIndex === selectedIndex;
                  const canAfford = playerMana >= spell.manaCost;
                  const art = artUrl('spells', spell.id);
                  return (
                    <button
                      key={spell.id}
                      type="button"
                      className={`vx-slot sw__spell${isSelected ? ' is-on' : ''}${canAfford ? '' : ' is-poor'}`}
                      style={{ '--r': isSelected ? spell.color : undefined }}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelectedIndex(globalIndex);
                        setActiveSpellId(spell.id);
                      }}
                    >
                      {art ? <img src={art} alt="" /> : <span className="sw__dot" style={{ background: spell.color }} />}
                      <span className="sw__name">{spell.name}</span>
                      <span className={`sw__cost${canAfford ? '' : ' is-poor'}`}>{spell.manaCost} mana</span>
                    </button>
                  );
                })}
              </div>

              {selectedSpell && (
                <div className="vx-parch sw__detail">
                  <h3 className="vx-h sw__detail-name">{selectedSpell.name}</h3>
                  <p className="sw__desc">{selectedSpell.description}</p>
                  <div className="sw__stats">
                    <div className="sw__stat"><span>Mana</span><b>{selectedSpell.manaCost}</b></div>
                    <div className="sw__stat"><span>Cooldown</span><b>{selectedSpell.cooldown.toFixed(1)}s</b></div>
                    {selectedSpell.damage > 0 && <div className="sw__stat"><span>Damage</span><b className="sw__bad">{selectedSpell.damage}</b></div>}
                    {selectedSpell.healAmount && <div className="sw__stat"><span>Heal</span><b className="sw__good">{selectedSpell.healAmount}</b></div>}
                    {selectedSpell.aoeRadius && <div className="sw__stat"><span>Area</span><b>{selectedSpell.aoeRadius}</b></div>}
                  </div>
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="sw__pages">
                <button type="button" className="vx-pbtn vx-pbtn--stone vx-pbtn--sm" onClick={() => page > 0 && setPage(page - 1)} disabled={page === 0} aria-label="Previous page">
                  <img src={artUrl('ui', 'up')} alt="" width="14" height="14" />
                </button>
                <span>Page {page + 1} / {totalPages}</span>
                <button type="button" className="vx-pbtn vx-pbtn--stone vx-pbtn--sm" onClick={() => page < totalPages - 1 && setPage(page + 1)} disabled={page >= totalPages - 1} aria-label="Next page">
                  <img src={artUrl('ui', 'down')} alt="" width="14" height="14" />
                </button>
              </div>
            )}

            <p className="sw__hint">
              {isMobile
                ? 'Tap a spell to ready it · tap outside or the wand to close'
                : 'A / D or arrows to choose · W / S to change page · release Q to ready it'}
            </p>
          </section>
        </div>
      )}
    </>
  );
};

export default SpellWheel;
