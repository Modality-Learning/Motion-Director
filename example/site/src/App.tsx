import { useRef, useState } from 'react';
import { MotionFilm, type MotionFilmElement, type MotionFilmPoint } from './films/MotionFilm';
import tour from './films/tour.film.js';

/* The film's own key moments: "Step 1" … "Step 6", each with a short note ("Set the vibe."). The site reads them
 * from the film, so renaming a step in the film renames it here on the next export. */
const isStep = (p: MotionFilmPoint) => /^Step \d+$/.test(p.name);
const short = (p: MotionFilmPoint) => (p.note ?? p.name).replace(/\.$/, '');
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The step a moment of the film belongs to: the last step at or before it. */
function stepAt(steps: MotionFilmPoint[], point: MotionFilmPoint | null) {
  if (!point) return -1;
  let i = -1;
  steps.forEach((s, j) => { if (s.t <= point.t + 1e-3) i = j; });
  return i;
}

export function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <OnYourSite />
      </main>
      <footer className="footer"><p>An example site for Motion Director. The films on this page are playing from code, not video.</p></footer>
    </>
  );
}

function Nav() {
  return (
    <header className="nav">
      <a className="brand" href="#top">Motion Director</a>
      <nav aria-label="Sections">
        <a href="#how">How it works</a>
        <a href="#site">On your site</a>
        <a href="https://github.com/Modality-Learning/Motion-Director">GitHub</a>
      </nav>
    </header>
  );
}

/** Fills each section's button as the film plays through it: --fill (0 to 1) on every button marked with
 * data-section. Written straight to the page each frame, so React doesn't re-render 60 times a second. */
function fillSections(nav: HTMLElement | null, film: MotionFilmElement) {
  if (!nav) return;
  const buttons = [...nav.querySelectorAll<HTMLElement>('[data-section]')];
  const fills = film.sectionProgress(buttons.map((b) => b.dataset.section!));
  buttons.forEach((b, i) => b.style.setProperty('--fill', fills[i].toFixed(4)));
}

/** The film moved by buttons: it plays through on its own, each chapter filling as it goes. A chapter button
 * cuts to that chapter and plays on from there. */
function Hero() {
  const film = useRef<MotionFilmElement>(null);
  const nav = useRef<HTMLElement>(null);
  const [steps, setSteps] = useState<MotionFilmPoint[]>([]);
  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const play = (from?: string) => {
    const el = film.current;
    if (!el) return;
    if (prefersReducedMotion()) { if (from) el.goTo(from); return; } // a cut, and no autoplay
    el.play({ from: from ?? (el.time >= el.duration - 0.05 ? 'start' : undefined) });
    setPlaying(true);
  };
  const pause = () => { film.current?.pause(); setPlaying(false); };
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="eyebrow">Motion Director</p>
        <h1>Films about your product, made with&nbsp;Claude.</h1>
        <p className="lede">You direct, Claude edits. Comment on any frame of the film, and Claude makes the change while you watch.</p>
        <div className="actions">
          <a className="button primary" href="#how">See how it works</a>
          <a className="button" href="https://github.com/Modality-Learning/Motion-Director">Get it on GitHub</a>
        </div>
      </div>
      <figure className="hero-film">
        <MotionFilm
          ref={film}
          film={tour}
          className="frame"
          onReady={(el) => { setSteps(el.points.filter(isStep)); play(); }}
          onTimeUpdate={(_t, el) => fillSections(nav.current, el)}
          onPointChange={(point) => setCurrent(stepAt(film.current?.points.filter(isStep) ?? [], point))}
          onEnded={() => setPlaying(false)}
        />
        <nav className="chapters" aria-label="Chapters of the film" ref={nav}>
          <button type="button" className="toggle" onClick={() => (playing ? pause() : play())} aria-label={playing ? 'Pause the film' : 'Play the film'}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          {steps.map((s, i) => (
            <button key={s.name} type="button" className="fill" data-section={s.name} aria-current={i === current ? 'step' : undefined} onClick={() => play(s.name)}>
              <span className="n">{i + 1}</span>{short(s)}
            </button>
          ))}
        </nav>
      </figure>
    </section>
  );
}

const PlayIcon = () => <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>;
const PauseIcon = () => <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" /></svg>;

/* How the scroll section's steps move the page, to try each: a cut jumps; a glide scrolls there in a second, eased;
 * a play scrolls there at four times the film's speed. The film follows whichever it is. The arrows to the page's
 * other sections jump with Cut and scroll smoothly otherwise. */
type Move = 'cut' | 'glide' | 'play';
const MOVES: { id: Move; label: string; opts?: { speed?: number; duration?: number } }[] = [
  { id: 'cut', label: 'Cut' },
  { id: 'glide', label: 'Glide (1 s)', opts: { duration: 1 } },
  { id: 'play', label: 'Play (4×)', opts: { speed: 4 } },
];

/** The same film tied to scrolling: pinned beside the steps while the section scrolls past, each step filling as
 * the page scrolls through it. The steps and the arrows move the page, so the list and the scrollbar agree. */
function HowItWorks() {
  const film = useRef<MotionFilmElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [steps, setSteps] = useState<MotionFilmPoint[]>([]);
  const [current, setCurrent] = useState(-1);
  const [caption, setCaption] = useState('');
  const [move, setMove] = useState<Move>('cut');
  const opts = MOVES.find((m) => m.id === move)!.opts;
  const go = (name: string) => film.current?.goTo(name, opts);
  // the arrows go to the page's sections either side of this one: a jump with Cut, else the browser's smooth scroll,
  // during which the film runs through whatever the page passes on the way
  const leave = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: move === 'cut' ? 'instant' : 'smooth' });
  return (
    <section className="how" id="how" style={{ height: `${Math.max(4, steps.length + 1) * 100}vh` }}>
      <div className="how-pin">
        <button type="button" className="arrow up" onClick={() => leave('top')}>
          <ArrowIcon up />Back to the top
        </button>
        <div className="how-copy">
          <p className="eyebrow">How it works</p>
          <h2>Six steps, one conversation.</h2>
          <ol className="steps" ref={list}>
            {steps.map((s, i) => (
              <li key={s.name}>
                <button type="button" className="fill" data-section={s.name} aria-current={i === current ? 'step' : undefined} onClick={() => go(s.name)}>
                  <span className="n">{i + 1}</span>
                  <span>{short(s)}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="moves" role="group" aria-label="How the steps and arrows move the page">
            {MOVES.map((m) => (
              <button key={m.id} type="button" aria-pressed={move === m.id} onClick={() => setMove(m.id)}>{m.label}</button>
            ))}
          </div>
        </div>
        <figure className="how-film">
          <MotionFilm
            ref={film}
            film={tour}
            mode="scroll"
            track="#how"
            smoothing={0.2}
            label="A tour of Motion Director, following the page as it scrolls"
            className="frame"
            onReady={(el) => setSteps(el.points.filter(isStep))}
            onTimeUpdate={(_t, el) => fillSections(list.current, el)}
            onPointChange={(point) => {
              setCaption(point?.note ?? '');
              setCurrent(stepAt(film.current?.points.filter(isStep) ?? [], point));
            }}
          />
          <figcaption>{caption || 'Scroll to play the film.'}</figcaption>
        </figure>
        <button type="button" className="arrow down" onClick={() => leave('site')}>
          On your site<ArrowIcon />
        </button>
      </div>
    </section>
  );
}

const ArrowIcon = ({ up = false }: { up?: boolean }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style={up ? { transform: 'rotate(180deg)' } : undefined}>
    <path d="M8 2.5v10M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function OnYourSite() {
  return (
    <section className="site" id="site">
      <div>
        <p className="eyebrow">On your site</p>
        <h2>Export it into your app. Then it's just a component.</h2>
        <p className="lede">The film, its player and a React component are written into your codebase as files you own. Nothing to install, no iframe, and it stays crisp at any size because it's drawn live.</p>
      </div>
      <pre><code>{`$ motion-director web tour --out src/films

import { MotionFilm } from './films/MotionFilm';
import tour from './films/tour.film.js';

<MotionFilm film={tour} ref={film}
  onTimeUpdate={(t, f) => paint(f.sectionProgress(chapters))} />

<button onClick={() => film.current?.play({ from: 'Step 2' })}>
  Plan it out
</button>`}</code></pre>
    </section>
  );
}
