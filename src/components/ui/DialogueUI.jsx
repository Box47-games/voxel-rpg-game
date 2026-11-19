/**
 * DialogueUI.jsx — Branching dialogue interface for companion conversations.
 *
 * Shows speaker name, dialogue text, and choice buttons.
 * Supports conditions on choices (filtered by DialogueEngine).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useGameStore from '../../stores/useGameStore';
import './DialogueUI.css';
import DialogueEngine from '../../systems/story/DialogueEngine';

const DialogueUI = ({ dialogueTree, onAction, onClose }) => {
  const [engine] = useState(() => new DialogueEngine());
  const [, setUpdate] = useState(0); // Force re-render trigger

  const playerState = useGameStore(useShallow((s) => ({
    bondLevel: s.companion.bondLevel,
    inventory: s.inventory,
  })));

  useEffect(() => {
    if (dialogueTree) {
      engine.startDialogue(dialogueTree);
      setUpdate((n) => n + 1);
    }
  }, [dialogueTree, engine]);

  const handleChoice = useCallback((choiceId) => {
    const result = engine.selectChoice(choiceId);

    if (result?.action && result.action !== 'close') {
      onAction?.(result.action);
    }

    if (engine.isComplete()) {
      onClose?.();
    } else {
      setUpdate((n) => n + 1);
    }
  }, [engine, onAction, onClose]);

  const handleAdvance = useCallback(() => {
    if (engine.hasChoices()) return;
    const advanced = engine.advance();
    if (!advanced || engine.isComplete()) {
      onClose?.();
    } else {
      setUpdate((n) => n + 1);
    }
  }, [engine, onClose]);

  if (!dialogueTree || engine.isComplete()) return null;

  const node = engine.getCurrentNode();
  if (!node) return null;

  const choices = engine.getAvailableChoices(playerState);

  return (
    <div className="dlg-wrap">
      <section className="vx-frame vx-frame--thin dlg" role="dialog" aria-label={node.speaker ? `${node.speaker} says` : 'Conversation'}>
        {node.speaker && <h2 className="dlg__speaker">{node.speaker}</h2>}
        <div className="dlg__body">
          <p className="dlg__text">{node.text}</p>
        </div>

        {choices.length > 0 ? (
          <div className="dlg__choices">
            {choices.map((choice) => (
              <button key={choice.id} type="button" className="vx-pbtn vx-pbtn--stone dlg__choice" onClick={() => handleChoice(choice.id)}>
                {choice.text}
              </button>
            ))}
          </div>
        ) : (
          <button type="button" className="vx-pbtn vx-pbtn--block" onClick={handleAdvance}>
            Continue
          </button>
        )}
      </section>
    </div>
  );
};

export default DialogueUI;
