import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useCommentList } from '@/features/comments/list';
import { UpdateNotice, noteItems, type UpdateState } from './UpdateNotice';

const base: UpdateState = { loaded: '0.2.0', installed: '0.2.0', latest: '0.2.0', available: false, restartNeeded: false, notes: [] };
const newer: UpdateState = { ...base, latest: '0.3.0', available: true, notes: [{ version: '0.3.0', date: '2026-12-01', notes: '- **Music.** A soundtrack lane,\n  with markers.\n- `update` is faster.' }] };
function serve(state: UpdateState, send?: object) {
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(String(url).endsWith('/send') ? send : state), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
afterEach(() => { vi.unstubAllGlobals(); useCommentList.setState({ link: null }); });

test('release notes read as plain list items', () => {
  expect(noteItems(newer.notes![0].notes)).toEqual(['Music. A soundtrack lane, with markers.', 'update is faster.']);
});

test('up to date: nothing in the top bar', async () => {
  serve(base);
  const { container } = render(<UpdateNotice />);
  await new Promise((r) => setTimeout(r, 20));
  expect(container).toBeEmptyDOMElement();
});

test('a newer release: what is new, and the request sent straight to a linked Claude', async () => {
  const fetch = serve(newer, { via: 'session' });
  useCommentList.setState({ link: { connected: true, available: true, fails: 0, checkedAt: null, restart: '' } });
  render(<UpdateNotice />);
  fireEvent.click(await screen.findByRole('button', { name: /Update to 0\.3\.0/ }));
  expect(screen.getByText('Motion Director 0.3.0 is out')).toBeInTheDocument();
  expect(screen.getByText('Music. A soundtrack lane, with markers.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ask Claude to update' }));
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/update/send', expect.objectContaining({ method: 'POST' })));
});

test('without a linked session the request is copied for the agent to paste', async () => {
  serve(newer, { via: 'clipboard', text: 'Motion Director 0.3.0 is out…' });
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  useCommentList.setState({ link: { connected: false, available: false, fails: 0, checkedAt: null, restart: '', agent: 'Codex' } });
  render(<UpdateNotice />);
  fireEvent.click(await screen.findByRole('button', { name: /Update to 0\.3\.0/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy the update request for Codex' }));
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('Motion Director 0.3.0 is out…'));
});

test('updated under the running studio: it asks for a restart', async () => {
  serve({ ...base, installed: '0.3.0', restartNeeded: true });
  render(<UpdateNotice />);
  fireEvent.click(await screen.findByRole('button', { name: /Restart to finish updating/ }));
  expect(screen.getByText(/still running 0\.2\.0/)).toBeInTheDocument();
});
