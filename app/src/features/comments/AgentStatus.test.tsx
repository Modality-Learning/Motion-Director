import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AgentStatus, statusLine, type AgentStatusLine } from './AgentStatus';
import { useCommentList, type StudioComment } from './list';

const s = (text: string, film: string | null = 'hello'): AgentStatusLine => ({ text, film, about: null, by: 'Claude', at: '2026-11-17T10:00:00Z' });
const sent = (id: string) => ({ id, status: 'sent', at: '', view: 'edit', frame: null, t: 0, text: '', about: null, target: null }) as StudioComment;

afterEach(() => { vi.unstubAllGlobals(); useCommentList.setState({ film: null, comments: [], link: null }); });

test('the line is the agent\'s own words, else that it has comments, else nothing', () => {
  expect(statusLine(s('Softening the bounce'), 'Claude', 2, 'hello')).toBe('Softening the bounce');
  expect(statusLine(s('Softening the bounce', 'tour'), 'Claude', 0, 'hello')).toBe('Softening the bounce (tour)');
  expect(statusLine(null, 'Codex', 1, 'hello')).toBe('Codex has 1 comment');
  expect(statusLine(null, 'Claude', 3, 'hello')).toBe('Claude has 3 comments');
  expect(statusLine(null, 'Claude', 0, 'hello')).toBeNull();
});

test('beside the link icon: the agent\'s status with a spinner, announced, and nothing when idle', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ status: s('Recolouring the card') }), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  useCommentList.setState({ film: 'hello', comments: [sent('a')] });
  render(<AgentStatus />);
  expect(await screen.findByText('Recolouring the card')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Claude is working: Recolouring the card');

});

test('without a status of its own, comments with the agent still show a spinner', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: null }))));
  useCommentList.setState({ film: 'hello', comments: [sent('a'), sent('b')], link: { connected: true, available: true, fails: 0, checkedAt: null, restart: '' } });
  render(<AgentStatus />);
  expect(await screen.findByText('Claude has 2 comments')).toBeInTheDocument();
});

test('idle: the region stays in the page, empty', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: null }))));
  useCommentList.setState({ film: 'hello', comments: [] });
  render(<AgentStatus />);
  await act(async () => {});
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});
