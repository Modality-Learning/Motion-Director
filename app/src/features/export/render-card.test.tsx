import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useStudio } from '@/lib/store';
import type { Catalog, Film, VideoSupport } from '@/lib/api';
import { RenderCard } from './ExportTab';

const film = { name: 'tour', title: 'Tour', duration: 10 } as unknown as Film;
function seed(video?: VideoSupport) {
  useStudio.setState({
    catalog: {
      project: { name: 'Test', drift: false, video },
      films: [film], comps: [],
      presets: { share: { label: 'Share', detail: 'H.264' } },
      sizes: { '1440p': { label: '1440p' } },
    } as unknown as Catalog,
    jobs: [],
  });
  // Radix's controls measure themselves; the page here can't
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  // the card asks for the film's sound and the audio tool
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } })));
}
afterEach(() => vi.unstubAllGlobals());

test('on a machine that can render, the Render button is ready and nothing is in the way', () => {
  seed({ ok: true });
  render(<RenderCard film={film} />);
  expect(screen.getByRole('button', { name: 'Render' })).toBeEnabled();
  expect(screen.queryByText(/needs macOS/)).toBeNull();
});

test('off macOS, Render is disabled and says why, described to screen readers too', () => {
  seed({ ok: false, reason: 'Rendering video needs macOS: the encoder uses AVFoundation.' });
  render(<RenderCard film={film} />);
  const button = screen.getByRole('button', { name: 'Render' });
  expect(button).toBeDisabled();
  expect(button).toHaveAccessibleDescription(/needs macOS/);
  expect(screen.queryByText(/To fix it/)).toBeNull();
});

test('a missing tool on a Mac shows the command that fixes it', () => {
  seed({ ok: false, reason: "Rendering video needs Apple's Command Line Tools.", fix: 'xcode-select --install' });
  render(<RenderCard film={film} />);
  expect(screen.getByRole('button', { name: 'Render' })).toBeDisabled();
  expect(screen.getByText('xcode-select --install')).toBeInTheDocument();
});

test('an older server that does not say is treated as able to render', () => {
  seed(undefined);
  render(<RenderCard film={film} />);
  expect(screen.getByRole('button', { name: 'Render' })).toBeEnabled();
});
