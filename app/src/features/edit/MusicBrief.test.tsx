import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { MusicBrief, promptText } from './MusicBrief';
import { useEdit } from './store';
import type { Brief, Sheet } from './types';

const brief: Brief = {
  bpm: 124, beatsPerBar: 4, offset: 0.47, ending: 'button',
  sections: [{ name: 'Intro', at: 0.47 }, { name: 'The lift', at: 31.44, drop: true, note: 'full energy' }],
  prompt: { style: 'Instrumental, upbeat electronic pop, 124 BPM', structure: '[Instrumental]\n[Intro: 3 bars]', notes: 'Ask for about 1:40.' },
};
const seed = (b: Brief | null, cues: Sheet['cues'] = [], error: string | null = null) => useEdit.setState({ brief: b, briefError: error, sheet: { master: 0, cues } });
afterEach(() => { seed(null); vi.unstubAllGlobals(); });

test('the prompt is the style line, then the structure', () => {
  expect(promptText(brief)).toBe('Instrumental, upbeat electronic pop, 124 BPM\n\n[Instrumental]\n[Intro: 3 bars]\n[End]');
  // with a length, the style says it, so the generator makes a track that long
  expect(promptText({ ...brief, length: 35 })).toMatch(/^Instrumental, upbeat electronic pop, 124 BPM, 0:35 long, ending at 0:35\n/);
});

test('no brief: no button', () => {
  seed(null);
  const { container } = render(<MusicBrief />);
  expect(container).toBeEmptyDOMElement();
});

test('the brief: tempo, sections with the drop, the prompt to copy, and Line up waiting for a track', () => {
  seed(brief);
  render(<MusicBrief />);
  fireEvent.click(screen.getByRole('button', { name: 'The music brief' }));
  expect(screen.getByText(/124 BPM in 4\/4, first downbeat at 0\.47 s, a button ending/)).toBeInTheDocument();
  expect(screen.getByText('The lift')).toBeInTheDocument();
  expect(screen.getByText(/\(the drop\)/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copy the prompt' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Line up the music' })).toBeDisabled();
  expect(screen.getByText(/Drop the generated track on the music lane/)).toBeInTheDocument();
});

test('with a track on the music lane, Line up is ready', () => {
  seed(brief, [{ id: 'm', sound: 'music.wav', at: 0, music: true }]);
  render(<MusicBrief />);
  fireEvent.click(screen.getByRole('button', { name: 'The music brief' }));
  expect(screen.getByRole('button', { name: 'Line up the music' })).toBeEnabled();
});

test('a brief that does not check out says why', () => {
  seed(null, [], 'bpm must be between 40 and 240');
  render(<MusicBrief />);
  fireEvent.click(screen.getByRole('button', { name: 'The music brief' }));
  expect(screen.getByText(/music.json doesn't check out: bpm must be between 40 and 240/)).toBeInTheDocument();
});

test('the brief takes comments: on a section, on the prompt and on the whole of it, each opening the comment box', async () => {
  const { useComments } = await import('@/features/comments/comments');
  seed(brief);
  render(<MusicBrief />);
  fireEvent.click(screen.getByRole('button', { name: 'The music brief' }));
  fireEvent.click(screen.getByRole('button', { name: 'Comment on The lift' }));
  expect(useComments.getState()).toMatchObject({ open: true, title: 'The lift · Music', pending: { view: 'edit', t: 31.44, target: { music: { part: 'section', section: 'The lift' } } } });
  fireEvent.click(screen.getByRole('button', { name: 'Comment on the prompt' }));
  expect(useComments.getState()).toMatchObject({ title: 'The prompt · Music', pending: { target: { music: { part: 'prompt' } } } });
  fireEvent.click(screen.getByRole('button', { name: 'Comment on the whole brief' }));
  expect(useComments.getState()).toMatchObject({ title: 'The music brief', pending: { target: { music: { part: 'brief' } } } });
});
