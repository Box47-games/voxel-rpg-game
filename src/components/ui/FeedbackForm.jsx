/**
 * FeedbackForm — "Send feedback" from the pause menu or the start screen:
 * a 1–5 rating, a category, a message, and (optionally) a screenshot of the
 * game view. Game details (level, place, device size...) go along so a bug
 * can be reproduced; nothing personal is sent. Posts to the feedback Worker.
 */

import React, { useEffect, useRef, useState } from 'react';
import useGameStore from '../../stores/useGameStore';
import {
  FEEDBACK_CATEGORIES, FEEDBACK_MAX_MESSAGE, gameContext, captureScreenshot, sendFeedback,
} from '../../systems/feedback/feedback';
import { artUrl } from './art';
import './FeedbackForm.css';

const FeedbackForm = () => {
  const open = useGameStore((s) => s.feedbackOpen);
  if (!open) return null;
  return <FeedbackDialog />;
};

function FeedbackDialog() {
  const close = () => useGameStore.getState().setFeedbackOpen(false);
  const [rating, setRating] = useState(null);
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [shot, setShot] = useState(null);
  const [withShot, setWithShot] = useState(true);
  const [status, setStatus] = useState({ kind: 'idle' }); // idle | sending | sent | error
  const textRef = useRef(null);

  // Take the screenshot as the form opens (of the game as it was)
  useEffect(() => {
    let live = true;
    const s = useGameStore.getState();
    if (s.gameState === 'playing' || s.gameState === 'paused') {
      captureScreenshot(s).then((url) => { if (live) setShot(url); });
    }
    textRef.current?.focus();
    return () => { live = false; };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!message.trim() || status.kind === 'sending') return;
    setStatus({ kind: 'sending' });
    const res = await sendFeedback({
      rating,
      category,
      message: message.trim(),
      context: gameContext(useGameStore.getState()),
      screenshot: withShot ? shot : null,
    });
    setStatus(res.ok ? { kind: 'sent' } : { kind: 'error', text: res.error });
  };

  // Keys typed here are for the form, not the game
  const stopKeys = (e) => {
    if (e.key === 'Escape') return; // Esc closes (PauseMenu / backOut)
    e.stopPropagation();
  };

  return (
    <div className="feedback-overlay" data-feedback-form onClick={close}>
      <form
        className="feedback vx-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={stopKeys}
        onSubmit={submit}
      >
        <header className="feedback__head">
          <h2 id="feedback-title" className="vx-heading feedback__title">Send Feedback</h2>
          <button type="button" className="vx-btn vx-btn--ghost feedback__close" onClick={close} aria-label="Close"><img src={artUrl('ui', 'close')} alt="" /></button>
        </header>

        {status.kind === 'sent' ? (
          <div className="feedback__done" role="status">
            <p>Thanks! Your feedback was sent.</p>
            <button type="button" className="vx-btn vx-btn--primary vx-btn--block" onClick={close}>Close</button>
          </div>
        ) : (
          <>
            <fieldset className="feedback__row">
              <legend>How are you enjoying it?</legend>
              <div className="feedback__stars" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} of 5`}
                    className={`feedback__star${rating != null && n <= rating ? ' is-on' : ''}`}
                    onClick={() => setRating(rating === n ? null : n)}
                  >
                    <img src={artUrl('ui', 'star')} alt="" />
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="feedback__row">
              <legend>What about?</legend>
              <div className="feedback__cats">
                {FEEDBACK_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={category === c.id}
                    className={`feedback__cat${category === c.id ? ' is-on' : ''}`}
                    onClick={() => setCategory(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="feedback__row feedback__label" htmlFor="feedback-message">
              Tell us more
            </label>
            <textarea
              id="feedback-message"
              ref={textRef}
              className="feedback__text"
              value={message}
              maxLength={FEEDBACK_MAX_MESSAGE}
              rows={5}
              placeholder={category === 'bug' ? 'What happened, and what did you expect?' : 'What would make the game better?'}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="feedback__count">{message.length}/{FEEDBACK_MAX_MESSAGE}</div>

            {shot && (
              <label className="feedback__shot">
                <input type="checkbox" checked={withShot} onChange={(e) => setWithShot(e.target.checked)} />
                <span>Include a screenshot of the game</span>
                <img src={shot} alt="Screenshot to send" className={withShot ? '' : 'is-off'} />
              </label>
            )}
            <p className="feedback__note">
              Game details are sent too (level, location, day, device size and browser), but nothing personal.
            </p>

            {status.kind === 'error' && <p className="feedback__error" role="alert">{status.text}</p>}

            <button
              type="submit"
              className="vx-btn vx-btn--primary vx-btn--block"
              disabled={!message.trim() || status.kind === 'sending'}
            >
              {status.kind === 'sending' ? 'Sending…' : 'Send'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

export default FeedbackForm;
