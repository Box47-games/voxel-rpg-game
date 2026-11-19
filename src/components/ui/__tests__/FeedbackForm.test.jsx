import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import useGameStore from '../../../stores/useGameStore';
import FeedbackForm from '../FeedbackForm';
import { gameContext, sendFeedback, FEEDBACK_URL } from '../../../systems/feedback/feedback';

describe('FeedbackForm', () => {
  let fetchMock;
  beforeEach(() => {
    useGameStore.getState().reset();
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, id: 7 }) }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  test('hidden until opened; Esc (backOut) closes it before anything else', () => {
    render(<FeedbackForm />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useGameStore.getState().setFeedbackOpen(true));
    expect(screen.getByRole('dialog', { name: 'Send Feedback' })).toBeInTheDocument();
    act(() => { expect(useGameStore.getState().backOut()).toBe(true); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('sends rating, category, message and game details', async () => {
    useGameStore.setState({ feedbackOpen: true });
    render(<FeedbackForm />);
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled(); // needs a message
    fireEvent.click(screen.getByRole('radio', { name: '4 of 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Idea' }));
    fireEvent.change(screen.getByLabelText('Tell us more'), { target: { value: '  More rifts please  ' } });
    fireEvent.click(send);
    await waitFor(() => expect(screen.getByText(/Thanks! Your feedback was sent/)).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(FEEDBACK_URL);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ rating: 4, category: 'idea', message: 'More rifts please', screenshot: null });
    expect(body.context).toMatchObject({ state: 'intro', settlers: 0 });
  });

  test('shows the service error and keeps the message', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ ok: false, error: 'Too much feedback at once' }) });
    useGameStore.setState({ feedbackOpen: true });
    render(<FeedbackForm />);
    fireEvent.change(screen.getByLabelText('Tell us more'), { target: { value: 'Bug!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too much feedback at once');
    expect(screen.getByLabelText('Tell us more')).toHaveValue('Bug!');
  });

  test('typing in the form does not reach game key handlers', () => {
    useGameStore.setState({ feedbackOpen: true });
    const onKey = vi.fn();
    window.addEventListener('keydown', onKey);
    render(<FeedbackForm />);
    fireEvent.keyDown(screen.getByLabelText('Tell us more'), { key: 'w' });
    window.removeEventListener('keydown', onKey);
    expect(onKey).not.toHaveBeenCalled();
  });
});

describe('feedback client', () => {
  test('game details carry no personal data', () => {
    const ctx = gameContext({ gameState: 'playing', player: { level: 3, health: 40, maxHealth: 100, position: [1.4, 2, 3.6] }, worldTime: { day: 2, hour: 13.7 } });
    expect(ctx).toMatchObject({ state: 'playing', level: 3, health: '40/100', pos: [1, 2, 4], day: 2, hour: 13 });
    expect(Object.keys(ctx)).not.toContain('email');
  });

  test('network failure and timeouts come back as friendly errors', async () => {
    const down = await sendFeedback({ message: 'x' }, { fetchImpl: async () => { throw new TypeError('Failed'); } });
    expect(down).toEqual({ ok: false, error: expect.stringMatching(/Could not reach/) });
    const slow = await sendFeedback({ message: 'x' }, {
      timeoutMs: 10,
      fetchImpl: (u, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('a'), { name: 'AbortError' })))),
    });
    expect(slow.error).toMatch(/took too long/);
  });
});
