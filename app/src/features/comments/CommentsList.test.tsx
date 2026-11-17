import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommentsList, shortAbout } from './CommentsList';
import { STALE_MS, WORKING_MS, isWorking, useCommentList, type StudioComment } from './list';
import { REPAIR_AFTER, SessionLinkButton, repairRequest } from './SessionLink';

const c = (id: string, status: StudioComment['status'], text: string, extra: Partial<StudioComment> = {}): StudioComment =>
  ({ id, at: '2026-11-16T00:00:00Z', status, view: 'edit', frame: null, t: 3.5, text, about: '(#ball) at 0:03.5', target: null, ...extra });

afterEach(() => { useCommentList.setState({ film: null, comments: [], session: false, open: false, link: null, checking: false }); vi.restoreAllMocks(); });

const show = (comments: StudioComment[], session = true) => {
  useCommentList.setState({ film: 'tour', comments, session, open: true });
  return render(<TooltipProvider><CommentsList working={null} /></TooltipProvider>);
};

test('groups the comments: with Claude, queued with Send all, and done folded away', () => {
  show([c('a', 'queued', 'Softer bounce.'), c('b', 'sent', 'Tile sooner.'), c('d', 'resolved', 'Bolder headline.')]);

  const queued = screen.getByRole('heading', { name: 'Queued (1)' }).closest('section')!;
  expect(within(queued).getByText('Softer bounce.')).toBeTruthy();
  expect(within(queued).getByRole('button', { name: /Send all/ })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'With Claude (1)' })).toBeTruthy();
  expect(screen.getByText('Tile sooner.')).toBeTruthy();
  // resolved ones stay folded until asked for
  expect(screen.queryByText('Bolder headline.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Done (1)' }));
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

test('a comment with the agent counts as worked on for as long as a status lasts', () => {
  const now = Date.parse('2026-11-16T01:00:00Z');
  expect(isWorking(c('a', 'sent', 'x', { changed: new Date(now - 60_000).toISOString() }), now)).toBe(true);
  expect(isWorking(c('b', 'sent', 'y', { changed: new Date(now - WORKING_MS - 1000).toISOString() }), now)).toBe(false);
  expect(isWorking(c('d', 'queued', 'z', { changed: new Date(now).toISOString() }), now)).toBe(false);
});

test('a comment with the agent can be cleared, one at a time or all together', () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ comments: [], session: true })));
  show([c('a', 'sent', 'Never arrived.'), c('b', 'sent', 'Nor this.')]);
  const posted = () => fetch.mock.calls.filter(([u]) => u === '/api/comments/status').map(([, i]) => JSON.parse(String((i as RequestInit).body)));
  fireEvent.click(screen.getByRole('button', { name: 'Clear “Never arrived.”' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
  expect(posted()).toEqual([{ film: 'tour', ids: ['a'], status: 'removed' }, { film: 'tour', ids: ['a', 'b'], status: 'removed' }]);
});

test('the top says what the agent is working on, or that it is not', () => {
  useCommentList.setState({ film: 'tour', comments: [], session: true });
  const { unmount } = render(<TooltipProvider><CommentsList working="Softening the bounce" /></TooltipProvider>);
  expect(screen.getByText('Softening the bounce')).toBeTruthy();
  unmount();
  render(<TooltipProvider><CommentsList working={null} /></TooltipProvider>);
  expect(screen.getByText('Not working on anything now.')).toBeTruthy();
});

test('what a comment is about, without the scope id, time or current value', () => {
  expect(shortAbout('Opening line (param:title-0) at 0:00.0, currently "Films about your product."')).toBe('Opening line');
  expect(shortAbout('(#ball) at 0:03.5')).toBe('(#ball)');
  expect(shortAbout('"Plan it out" (#stepM) in "Step 2" (storyboard, 0:20.9)')).toBe('"Plan it out" (#stepM) in "Step 2"');
  expect(shortAbout(null)).toBe('');
});

test('a comment with Claude for a while offers to copy it, in case it never arrived', () => {
  const old = new Date(Date.now() - STALE_MS - 5000).toISOString(), fresh = new Date().toISOString();
  show([c('a', 'sent', 'Old one.', { changed: old, note: 'the note' }), c('b', 'sent', 'New one.', { changed: fresh, note: 'n' })]);
  expect(screen.getAllByRole('button', { name: /Not picked up\? Copy it/ })).toHaveLength(1);
});

const link = (over = {}) => ({ connected: true, available: true, fails: 0, checkedAt: null, restart: 'node bin studio --port 4332', ...over });
const showLink = (l: ReturnType<typeof link>) => { useCommentList.setState({ link: l }); return render(<TooltipProvider><SessionLinkButton /></TooltipProvider>); };

test('the link icon says whether comments reach Claude, and what a click does', () => {
  showLink(link());
  expect(screen.getByRole('button', { name: /^Connected to Claude.*Click to check/ })).toBeTruthy();
});

test('a broken link offers another try, then the repair once it has failed a few times', () => {
  const { unmount } = showLink(link({ connected: false, fails: 1 }));
  expect(screen.getByRole('button', { name: /Not connected.*Click to try again/ })).toBeTruthy();
  unmount();
  showLink(link({ connected: false, fails: REPAIR_AFTER }));
  fireEvent.click(screen.getByRole('button', { name: /Not connected.*Click to repair/ }));
  expect(screen.getByRole('button', { name: 'Copy repair request' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});

test('a studio never started from a session goes straight to the repair, with no retry', () => {
  showLink(link({ connected: false, available: false }));
  fireEvent.click(screen.getByRole('button', { name: /Click to repair/ }));
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});

test('the repair request asks Claude to start the studio again from its session, with the command', () => {
  expect(repairRequest('node bin studio --port 4332')).toMatch(/Start it again from this session[\s\S]*\nnode bin studio --port 4332$/);
});

const mcpLink = { connected: false, available: false, fails: 0, checkedAt: null, restart: '', agent: 'Codex' };

test('when Codex reads comments over MCP, the list and the footer name Codex, and say it can be asked', () => {
  useCommentList.setState({ link: mcpLink });
  show([c('b', 'sent', 'Tile sooner.')], false);
  expect(screen.getByRole('heading', { name: 'With Codex (1)' })).toBeTruthy();
  expect(screen.getByText(/paste into Codex; ⌘Enter queues it\. Or ask Codex to read the studio's comments\./)).toBeTruthy();
});

test('the link icon offers no repair for an agent on MCP: it says to ask that agent', () => {
  useCommentList.setState({ link: mcpLink });
  render(<SessionLinkButton />);
  const button = screen.getByRole('button', { name: /Comments are for Codex/ });
  fireEvent.click(button);
  expect(screen.getByText(/say "check the studio comments"/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Copy repair request' })).toBeNull();
});
