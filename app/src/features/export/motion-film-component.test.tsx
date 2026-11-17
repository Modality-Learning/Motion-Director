/// <reference types="node" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRef, type ComponentType, type Ref } from 'react';
import { renderToString } from 'react-dom/server';
import { act, render } from '@testing-library/react';
import { beforeAll, expect, test, vi } from 'vitest';
// the component exactly as `motion-director web --react` writes it into a project, beside the player
import { REACT_COMPONENT } from '../../../../render/web.mjs';
import type { MotionFilmElement } from '@/motion-film';

type Def = { name: string; title: string; player: number; ratio: string };
type Props = { film: Def; ref?: Ref<MotionFilmElement | null>; label?: string; mode?: 'scroll'; onReady?: (el: MotionFilmElement) => void; onPointChange?: (p: { name: string } | null, i: number) => void };
let MotionFilm: ComponentType<Props>;
let register: (f: unknown) => Def;

const dir = resolve('node_modules/.cache/md-web-component-test'); // inside the repo, so react resolves
beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'motion-film.js'), `export * from ${JSON.stringify(resolve('kit/web.js'))};\n`);
  writeFileSync(join(dir, 'MotionFilm.tsx'), REACT_COMPONENT);
  ({ register } = await import(/* @vite-ignore */ join(dir, 'motion-film.js')));
  ({ MotionFilm } = await import(/* @vite-ignore */ join(dir, 'MotionFilm.tsx')));
});

const POINTS = [{ name: 'Opening', t: 0 }, { name: 'Step 2', t: 5, note: 'Plan it out.' }];
function film(name: string): Def {
  return register({
    name, title: `Film ${name}`, player: 1, ratio: '1080 / 1920', fonts: [], params: {}, css: '', html: '<div id="stage"></div>',
    scripts: [
      (_d: Document, w: Window & { Motion?: unknown }) => { w.Motion = { param: (_n: string, f: unknown) => f }; },
      (_d: Document, _w: Window, _l: Location, Motion: { mountPlayer: (o: unknown) => void }) => Motion.mountPlayer({ duration: 10, keys: POINTS, render: () => {} }),
    ],
  });
}

test('on the server it is an empty box of the film\'s shape, labelled', () => {
  const html = renderToString(<MotionFilm film={film('ssr')} mode="scroll" />);
  expect(html).toMatch(/^<motion-film film="ssr" mode="scroll" role="img" aria-label="Film ssr" style="display:block;aspect-ratio:1080 \/ 1920"><\/motion-film>$/);
});

test('the ref is the element, and its events arrive as props', async () => {
  const ref = createRef<MotionFilmElement | null>();
  const onReady = vi.fn(), onPointChange = vi.fn();
  const def = film('react');
  render(<MotionFilm film={def} ref={ref} label="The tour" onReady={onReady} onPointChange={onPointChange} />);
  const el = ref.current!;
  expect(el.tagName).toBe('MOTION-FILM');
  expect(el.getAttribute('aria-label')).toBe('The tour');
  await act(() => el.ready);
  expect(onReady).toHaveBeenCalledWith(el);
  expect(el.points[1]).toEqual({ name: 'Step 2', t: 5, note: 'Plan it out.' });
  act(() => el.seek('Step 2'));
  expect(onPointChange).toHaveBeenLastCalledWith({ name: 'Step 2', t: 5, note: 'Plan it out.' }, 1);
  expect(onReady).toHaveBeenCalledTimes(1);
});
