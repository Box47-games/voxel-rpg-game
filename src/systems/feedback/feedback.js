/**
 * feedback.js — Player feedback: what the game sends to the feedback Worker
 * (workers/feedback). Nothing personal: a rating, a category, the message,
 * an optional screenshot of the 3D view, and game details for reproducing.
 */

import { isTouchDevice } from '../../utils/deviceDetection';

// The deployed Worker; a build can point elsewhere with VITE_FEEDBACK_URL
export const FEEDBACK_URL =
  (import.meta.env?.VITE_FEEDBACK_URL) || 'https://riftholm-feedback.box47games.workers.dev/api/feedback';

export const FEEDBACK_CATEGORIES = [
  { id: 'bug', label: 'Bug' },
  { id: 'idea', label: 'Idea' },
  { id: 'balance', label: 'Balance' },
  { id: 'art', label: 'Look & feel' },
  { id: 'other', label: 'Other' },
];
export const FEEDBACK_MAX_MESSAGE = 2000;
// Screenshots are scaled to this width at most, as JPEG
const SHOT_MAX_WIDTH = 960;
const SHOT_QUALITY = 0.7;

/** Game details sent with feedback (no personal data). */
export function gameContext(state, extra = {}) {
  const p = state.player || {};
  const pos = Array.isArray(p.position) ? p.position.map((n) => Math.round(n)) : null;
  return {
    build: import.meta.env?.MODE || 'unknown',
    screen: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}` : null,
    touch: isTouchDevice(),
    ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 160) : null,
    state: state.gameState,
    level: p.level ?? null,
    health: p.health != null ? `${Math.round(p.health)}/${p.maxHealth}` : null,
    pos,
    day: state.worldTime?.day ?? null,
    hour: state.worldTime?.hour != null ? Math.floor(state.worldTime.hour) : null,
    settlers: state.settlement?.npcs?.length ?? 0,
    buildings: state.constructionSites?.length ?? 0,
    enemies: state.enemies?.length ?? 0,
    fps: state._debugStats?.fps ?? null,
    ...extra,
  };
}

/** Scale a data URL image down to SHOT_MAX_WIDTH and re-encode as JPEG. */
export function shrinkScreenshot(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, SHOT_MAX_WIDTH / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', SHOT_QUALITY));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Capture the 3D view (Experience registers `_captureScreenshot`), scaled down. */
export async function captureScreenshot(state) {
  try {
    const raw = state._captureScreenshot?.();
    return raw ? await shrinkScreenshot(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Send feedback. Resolves { ok: true, id } or { ok: false, error }.
 * @param {{ rating?: number|null, category: string, message: string, context: object, screenshot?: string|null }} payload
 */
export async function sendFeedback(payload, { url = FEEDBACK_URL, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (res.ok && data?.ok) return { ok: true, id: data.id };
    return { ok: false, error: data?.error || `The feedback service answered ${res.status}` };
  } catch (err) {
    return { ok: false, error: err?.name === 'AbortError' ? 'The feedback service took too long' : 'Could not reach the feedback service (are you offline?)' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
