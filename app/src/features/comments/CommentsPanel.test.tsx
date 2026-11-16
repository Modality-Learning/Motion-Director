import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommentsPanel, shortAbout } from './CommentsPanel';
import { openCount, useCommentList, type StudioComment } from './list';

const c = (id: string, status: StudioComment['status'], text: string, extra: Partial<StudioComment> = {}): StudioComment =>
  ({ id, at: '2026-11-16T00:00:00Z', status, view: 'edit', frame: null, t: 3.5, text, about: '(#ball) at 0:03.5', target: null, ...extra });

afterEach(() => { useCommentList.setState({ film: null, comments: [], session: false, open: false }); vi.restoreAllMocks(); });

const show = (comments: StudioComment[], session = true) => {
  useCommentList.setState({ film: 'tour', comments, session, open: true });
  return render(<TooltipProvider><CommentsPanel /></TooltipProvider>);
};

test('groups the comments: queued with Send all, with Claude, and resolved folded away', () => {
  show([c('a', 'queued', 'Softer bounce.'), c('b', 'sent', 'Tile sooner.'), c('d', 'resolved', 'Bolder headline.')]);

  const queued = screen.getByRole('heading', { name: 'Queued (1)' }).closest('section')!;
  expect(within(queued).getByText('Softer bounce.')).toBeTruthy();
  expect(within(queued).getByRole('button', { name: /Send all/ })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'With Claude (1)' })).toBeTruthy();
  expect(screen.getByText('Tile sooner.')).toBeTruthy();
  // resolved ones stay folded until asked for
  expect(screen.queryByText('Bolder headline.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Resolved (1)' }));
  expect(screen.getByText('Bolder headline.')).toBeTruthy();
});

test('without a session the queue is copied instead of sent, and the footer says so', () => {
  show([c('a', 'queued', 'Softer bounce.')], false);
  expect(screen.getByRole('button', { name: /Copy all/ })).toBeTruthy();
  expect(screen.getByText(/Enter copies a comment/)).toBeTruthy();
});

test('a queued comment can be taken out of the queue', () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ comments: [], session: true })));
  show([c('a', 'queued', 'Softer bounce.')]);
  fireEvent.click(screen.getByRole('button', { name: /Remove “Softer bounce\.” from the queue/ }));
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('/api/comments/status');
  expect(JSON.parse(String((init as RequestInit).body))).toEqual({ film: 'tour', ids: ['a'], status: 'removed' });
});

test('the count beside the Comment button is what is still open', () => {
  expect(openCount([c('a', 'queued', 'x'), c('b', 'sent', 'y'), c('d', 'resolved', 'z')])).toBe(2);
});

test('what a comment is about, without the scope id, time or current value', () => {
  expect(shortAbout('Opening line (param:title-0) at 0:00.0, currently "Films about your product."')).toBe('Opening line');
  expect(shortAbout('(#ball) at 0:03.5')).toBe('(#ball)');
  expect(shortAbout('"Plan it out" (#stepM) in "Step 2" (storyboard, 0:20.9)')).toBe('"Plan it out" (#stepM) in "Step 2"');
  expect(shortAbout(null)).toBe('');
});
