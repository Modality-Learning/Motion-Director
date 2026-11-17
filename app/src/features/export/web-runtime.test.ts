import { afterEach, expect, test, vi } from 'vitest';
import { MotionFilmElement, PLAYER_VERSION, nearestPoint, pointIndex, register, resolveTime, scrollDelta, scrollProgress, sectionFills, tweenAt, tweenPlan } from '@kit/web.js';
import { snippets } from './ScrollExport';

type Film = Parameters<typeof register>[0];
const POINTS = [{ name: 'Opening', t: 0 }, { name: 'Step 2', t: 5 }, { name: 'End card', t: 9 }];

/* a small film in the shape the export writes: motion.js first (it sets window.Motion), then the film's script */
function film(name: string, drawn: number[] = []): Film {
  return {
    name, title: `Film ${name}`, fonts: [], params: { greeting: 'hi' }, css: ':host { --x: 1 }',
    html: '<div id="stage"><b id="out"></b></div>',
    scripts: [
      (_d: Document, window: Window & { Motion?: unknown }) => { window.Motion = { param: (n: string, f: unknown) => ((window as unknown as { __promoParams: Record<string, unknown> }).__promoParams[n] ?? f) }; },
      (document: Document, window: Window & { __film?: unknown }, _l: Location, Motion: { mountPlayer: (o: unknown) => void; param: (n: string) => unknown }) => {
        const out = document.querySelector('#out')!;
        window.__film = { mine: name };
        Motion.mountPlayer({ duration: 10, keys: POINTS, render: (t: number) => { drawn.push(t); out.textContent = `${Motion.param('greeting')} ${t}`; } });
      },
    ],
  } as unknown as Film;
}
const place = (attrs: Record<string, string>) => {
  const el = document.createElement('motion-film') as MotionFilmElement & { time: number; points: { name: string; t: number }[]; seek(t: unknown): void; goTo(t: unknown, o?: unknown): Promise<boolean>; sectionProgress(s: (string | number)[]): number[]; paused: boolean };
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  return el;
};
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

test('a target is a time, a point by name, or next/prev/start/end', () => {
  const at = (target: unknown, time = 0) => resolveTime(target as string, { points: POINTS, duration: 10, time });
  expect([at('step 2'), at(' End card '), at(42), at('next', 5), at('prev', 5), at('end'), at('3.5'), at('nope'), at({})]).toEqual([5, 9, 10, 9, 0, 10, 3.5, null, null]);
});

test('with no speed or duration a move is a cut; a speed plays there, either way; a duration is a set move', () => {
  expect([tweenPlan(0, 40), tweenPlan(40, 0), tweenPlan(3, 3, { speed: 2 })]).toEqual([null, null, null]);
  expect(tweenPlan(0, 40, { speed: 4 })).toEqual({ from: 0, to: 40, dur: 10, eased: false });
  expect(tweenPlan(40, 0, { speed: 4 })).toEqual({ from: 40, to: 0, dur: 10, eased: false });
  expect(tweenPlan(0, 40, { duration: 1 })).toEqual({ from: 0, to: 40, dur: 1, eased: true });
  expect(tweenPlan(0, 40, { speed: 0, duration: 0 })).toBeNull();
  expect([tweenAt({ from: 0, to: 2, dur: 2, eased: false }, 1), tweenAt({ from: 0, to: 2, dur: 2, eased: false }, 5)]).toEqual([1, 2]);
});

test('each section fills from its moment to the next one in the list, the last to the end', () => {
  const steps = [{ t: 2 }, { t: 6 }, { t: 8 }];
  expect(sectionFills(steps, 0, 10)).toEqual([0, 0, 0]);
  expect(sectionFills(steps, 4, 10)).toEqual([0.5, 0, 0]);
  expect(sectionFills(steps, 9, 10)).toEqual([1, 1, 0.5]);
  expect(sectionFills(steps, 10, 10)).toEqual([1, 1, 1]);
});

test('scroll progress runs from the section reaching the top to its end reaching the bottom', () => {
  const port = { top: 0, height: 100 };
  expect([scrollProgress({ top: 50, height: 500 }, port), scrollProgress({ top: -200, height: 500 }, port), scrollProgress({ top: -900, height: 500 }, port)]).toEqual([0, 0.5, 1]);
  // and back: how far to scroll to reach a progress
  expect(scrollDelta(0.5, { top: 50, height: 500 }, port)).toBe(250);
  expect([pointIndex(POINTS, 4.9), pointIndex(POINTS, 5), nearestPoint(POINTS, 7.2)?.name]).toEqual([0, 1, 'End card']);
});

test('the film runs in the element\'s shadow root, with its own document and window', async () => {
  const drawn: number[] = [];
  document.body.innerHTML = '<b id="out">the page\'s own</b>';
  register(film('a', drawn));
  const el = place({ film: 'a' });
  const out = el.shadowRoot!.getElementById('out')!;
  expect(out.textContent).toBe('hi 0');
  expect(document.getElementById('out')!.textContent).toBe('the page\'s own');
  expect((window as unknown as { Motion?: unknown; __film?: unknown }).Motion).toBeUndefined();
  expect((window as unknown as { __film?: unknown }).__film).toBeUndefined();
  expect(el.getAttribute('role')).toBe('img');
  expect(el.getAttribute('aria-label')).toBe('Film a');
  expect(el.points.map((p) => p.name)).toEqual(['Opening', 'Step 2', 'End card']);

  const changes: number[] = [];
  el.addEventListener('pointchange', (e) => changes.push((e as CustomEvent).detail.index));
  el.seek('Step 2');
  expect(out.textContent).toBe('hi 5');
  expect(changes).toEqual([1]);
});

test('goTo cuts to the moment straight away, and says it arrived', async () => {
  register(film('b'));
  const el = place({ film: 'b' });
  const arrived = vi.fn();
  el.addEventListener('arrive', (e) => arrived((e as CustomEvent).detail.point?.name));
  const going = el.goTo('End card');
  expect(el.time).toBe(9); // before any frame has run
  await expect(going).resolves.toBe(true);
  expect(arrived).toHaveBeenCalledWith('End card');
  expect(el.paused).toBe(true);
});

test('with reduced motion, a goTo with a speed cuts too', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
  register(film('b2'));
  const el = place({ film: 'b2' });
  const going = el.goTo('End card', { speed: 2 });
  expect(el.time).toBe(9);
  await expect(going).resolves.toBe(true);
});

test('goTo with a duration moves frame by frame, and a newer goTo replaces it', async () => {
  register(film('c'));
  const el = place({ film: 'c' });
  const first = el.goTo('End card', { duration: 5 });
  expect(el.paused).toBe(false);
  expect(el.time).toBe(0);
  await expect(el.goTo(2, { duration: 0.05 })).resolves.toBe(true);
  await expect(first).resolves.toBe(false);
  expect(el.time).toBe(2);
});

test('the element reports how far through each named section it is, and the whole film in timeupdate', () => {
  register(film('s'));
  const el = place({ film: 's' });
  const updates: { t: number; progress: number }[] = [];
  el.addEventListener('timeupdate', (e) => updates.push((e as CustomEvent).detail));
  el.seek(7);
  expect(el.sectionProgress(['Opening', 'Step 2', 'End card'])).toEqual([1, 0.5, 0]);
  expect(el.sectionProgress(['step 2', 'Nope', 9])).toEqual([0.5, 0, 0]);
  expect(updates.at(-1)).toEqual({ t: 7, progress: 0.7 });
});

test('a film that fails to start says so in place', () => {
  register({ ...film('d'), scripts: [() => { throw new Error('no stage'); }] } as unknown as Film);
  const el = place({ film: 'd' });
  expect(el.shadowRoot!.textContent).toMatch(/could not start: no stage/);
});

test('a film exported for a newer player says so, instead of playing wrongly', () => {
  register({ ...film('g'), player: PLAYER_VERSION + 1 } as unknown as Film);
  const el = place({ film: 'g' });
  expect(el.shadowRoot!.textContent).toMatch(/exported for player \d+, and this page has player \d+\. Export it again/);
});

test('register hands the film back, so a film module can export it', () => {
  const f = film('h');
  expect(register(f)).toBe(f);
});

test('re-registering a film (an export again) restarts the element on the new one', () => {
  register(film('e'));
  const el = place({ film: 'e' });
  register({ ...film('e'), params: { greeting: 'hello' } } as unknown as Film);
  expect(el.shadowRoot!.getElementById('out')!.textContent).toBe('hello 0');
});

test('the snippets follow how the film is driven', () => {
  const s = snippets('tour', 'scroll', 6, 0.2, 'Step 2');
  expect(s.html).toMatch(/height: 600vh/);
  expect(s.html).toMatch(/mode="scroll" smoothing="0.2"/);
  expect(s.react).toMatch(/goTo\('Step 2'\)/);
  expect(s.react).toMatch(/import tour from '\.\/films\/tour\.film\.js'/);
  expect(s.react).toMatch(/<MotionFilm ref=\{film\} film=\{tour\} mode="scroll" smoothing=\{0\.2\}/);
  expect(snippets('hello-board', 'buttons', 4, 0.12, 'x').react).toMatch(/import helloBoard from/);
  expect(snippets('tour', 'buttons', 4, 0.12, 'Step 2').html).not.toMatch(/mode=/);
});

/* a page the test scrolls: the window's scroll position and a 1,100-unit section starting at the top */
function scrollPage() {
  let y = 0;
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => y);
  vi.spyOn(window, 'innerHeight', 'get').mockImplementation(() => 100);
  vi.stubGlobal('scrollTo', ({ top }: { top: number }) => { y = top; });
  const section = document.createElement('section');
  section.getBoundingClientRect = () => ({ top: -y, height: 1100, bottom: 1100 - y, left: 0, right: 0, width: 0, x: 0, y: -y, toJSON() {} });
  document.body.append(section);
  return { section, get y() { return y; }, set y(v) { y = v; } };
}
const scrollFilm = (name: string, section: HTMLElement) => {
  register(film(name));
  const el = document.createElement('motion-film') as ReturnType<typeof place>;
  el.setAttribute('film', name); el.setAttribute('mode', 'scroll'); el.setAttribute('smoothing', '0');
  section.append(el);
  return el;
};

test('in scroll mode a cut moves the page at once and draws only that moment', async () => {
  const page = scrollPage(), el = scrollFilm('sc', page.section);
  const drawn: number[] = [];
  el.addEventListener('timeupdate', (e) => drawn.push((e as CustomEvent).detail.t));
  await expect(el.goTo('Step 2')).resolves.toBe(true);
  expect(page.y).toBe(500); // half of the 1,000 the section scrolls
  expect([...new Set(drawn)]).toEqual([5]); // (drawn again once fonts are ready, at the same moment)
  vi.restoreAllMocks();
});

test('in scroll mode a duration glides the page there, and the film plays through on the way', async () => {
  const page = scrollPage(), el = scrollFilm('sg', page.section);
  const drawn: number[] = [];
  el.addEventListener('timeupdate', (e) => drawn.push((e as CustomEvent).detail.t));
  await expect(el.goTo('End card', { duration: 0.15 })).resolves.toBe(true);
  expect(page.y).toBe(900);
  expect(el.time).toBe(9);
  expect(drawn.length).toBeGreaterThan(2);
  expect(drawn.some((t) => t > 0.5 && t < 8.5)).toBe(true); // moments in between were drawn
  vi.restoreAllMocks();
});

test('scrolling by hand during a glide takes over, and the glide says it did not arrive', async () => {
  const page = scrollPage(), el = scrollFilm('sh', page.section);
  const going = el.goTo('End card', { duration: 5 });
  await new Promise((r) => setTimeout(r, 60));
  page.y += 40; // the reader scrolls
  await expect(going).resolves.toBe(false);
  vi.restoreAllMocks();
});

test('in scroll mode a page that jumps cuts the film, while scrolling keeps its smoothing', async () => {
  const page = scrollPage(), el = scrollFilm('sj', page.section);
  el.setAttribute('smoothing', '0.5');
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await frame();
  page.y = 30; // a small scroll: eased, so the film is still on its way to 0.3 s
  await frame();
  expect(el.time).toBeGreaterThan(0);
  expect(el.time).toBeLessThan(0.3);
  page.y = 900; // a jump: straight to 9 s
  await frame();
  expect(el.time).toBe(9);
  vi.restoreAllMocks();
});
