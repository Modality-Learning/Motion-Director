/* Motion Director kit: the web player. A film on a web page, played live instead of as a video, with no iframe.
 * `motion-director web <film> --out src/films` writes this file into your project once, as motion-film.js, and each
 * film beside it as <film>.film.js, which imports it. Both are generated: export again to update them. Several films
 * share the one player. Import a film, then place the element:
 *
 *   <script type="module" src="/films/tour.film.js"></script>
 *   <motion-film film="tour"></motion-film>
 *
 * In React, MotionFilm.tsx (written beside them) does both: <MotionFilm film={tour} onPointChange={…} ref={…} />.
 *
 * The film runs in the element's shadow root, so its styles and the page's stay apart. It draws a moment with
 * the film's own render(t), so it can be scrubbed, jumped and played backwards, and looks exactly as the video.
 *
 * Driven by the page (a button, a menu, your own state):
 *   el.goTo('Step 2')        cut to a key moment by name (or a time in seconds, 'next', 'prev', 'start', 'end')
 *   el.goTo('Step 2', { speed: 4 })     or play there (backwards too) at 4× speed
 *   el.goTo('Step 2', { duration: 1 })  or move there in a set time, eased
 *   (with mode="scroll" these move the page: a cut jumps it; a speed or duration scrolls it at that pace while the
 *   film plays through. Scrolling by hand during the move takes over.)
 *   el.play({ from, to, speed })        play a stretch (from 'Step 2' cuts there first; to the end by default)
 *   el.pause(); el.seek(t) cuts without waiting; el.paused
 *   Anything else is the page's to build: the film is drawn from its time alone, so a loop of your own that calls
 *   seek(t) every frame can move it however you like.
 *   el.time, el.duration, el.progress (0–1, settable), el.points ([{ name, t, note }]), el.size, el.ready (a promise)
 *   el.sectionProgress(['Step 1', 'Step 2', …])  how far through each section the film is, 0–1 each (a section runs
 *                                                from its moment to the next one in the list, the last to the end)
 *   events: ready, timeupdate ({ detail: { t, progress } }), pointchange ({ detail: { point, index } }),
 *           arrive ({ detail: { point, t } }), ended
 *
 * Driven by scrolling: set mode="scroll" and pin the film in a tall section; the film's time follows how far the
 * section has scrolled. goTo then scrolls the page to that moment, so buttons and scrolling agree. Whatever moves
 * the page (a wheel, a scrollbar, a smooth anchor link) moves the film through the moments it passes while the
 * film is on screen. A jump (a link or button that moves the page at once, Home, End) cuts the film to where the
 * page landed, and a film that was off screen catches up at once when it's back.
 *
 *   <section style="height: 400vh">
 *     <motion-film film="tour" mode="scroll" style="position: sticky; top: 0"></motion-film>
 *   </section>
 *
 *   track="#id"       the section to follow (default: the element's parent)
 *   smoothing="0.12"  seconds the film takes to catch up with the scroll (0 follows it exactly)
 *
 * With reduced motion asked for, goTo always cuts, and scrolling steps between key moments instead of animating.
 * The film is announced as one image (role="img", labelled with its title or the label attribute), so a screen
 * reader doesn't read half-typed text. There is no sound yet. Importing this on a server (server rendering) is
 * safe: the element is only defined where there is a browser. */

/** The player's version. A film records the version it was exported with; a newer player plays older films, and
 * an older player refuses a newer film rather than play it wrongly. Raise it when films come to need something new. */
export const PLAYER_VERSION = 1;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, p) => a + (b - a) * p;
const easeIO = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** Films the page has loaded, by name. Each exported module registers its film here. */
export const films = (globalThis.__motionFilms ||= {});
/** Makes a film available to <motion-film film="name">; returns it, so a film module can export it. */
export function register(film) {
  films[film.name] = film;
  globalThis.dispatchEvent?.(new CustomEvent('motion-film:registered', { detail: film.name }));
  return film;
}

/** The moments a page can go to: the film's keys, else its scenes. */
export function pointsOf(keys = [], scenes = []) {
  if (keys.length) return keys.map((k) => (k.note ? { name: k.name, t: k.t, note: k.note } : { name: k.name, t: k.t }));
  return scenes.map(([name, t]) => ({ name, t }));
}

/** A target (seconds, a point's name, 'next', 'prev', 'start' or 'end') as a time, or null.
 * @param {number | string} target
 * @param {{ points?: { name: string, t: number }[], duration: number, time?: number }} at */
export function resolveTime(target, { points = [], duration, time = 0 }) {
  if (typeof target === 'number') return Number.isFinite(target) ? clamp(target, 0, duration) : null;
  if (typeof target !== 'string') return null;
  const s = target.trim().toLowerCase();
  if (s === 'start') return 0;
  if (s === 'end') return duration;
  if (s === 'next') return points.find((p) => p.t > time + 0.01)?.t ?? duration;
  if (s === 'prev' || s === 'previous') return [...points].reverse().find((p) => p.t < time - 0.01)?.t ?? 0;
  const p = points.find((x) => x.name.trim().toLowerCase() === s);
  if (p) return clamp(p.t, 0, duration);
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? clamp(n, 0, duration) : null;
}

/** How to move from one time to another, or null to cut. With a speed it plays there at that speed (backwards when
 * the moment is behind); with a duration it moves there in that time, eased; with neither it cuts.
 * @param {number} from @param {number} to
 * @param {{ speed?: number, duration?: number }} [opts] */
export function tweenPlan(from, to, { speed, duration } = {}) {
  const d = to - from;
  if (Math.abs(d) < 1e-4) return null;
  if (Number.isFinite(duration) && duration > 0) return { from, to, dur: duration, eased: true };
  if (Number.isFinite(speed) && speed > 0) return { from, to, dur: Math.abs(d) / speed, eased: false };
  return null;
}
export const tweenAt = (plan, elapsed) => (plan.dur <= 0 ? plan.to : lerp(plan.from, plan.to, (plan.eased ? easeIO : (p) => p)(clamp(elapsed / plan.dur))));

/** How far a pinned section has scrolled through its scrolling box, 0 to 1. Rects in the same coordinates. */
export function scrollProgress(track, port) {
  const range = track.height - port.height;
  if (range <= 0) return track.top <= port.top ? 1 : 0;
  return clamp((port.top - track.top) / range);
}
/** The scroll distance (from where the box is now) that brings the section to progress p. */
export const scrollDelta = (p, track, port) => track.top - port.top + clamp(p) * Math.max(0, track.height - port.height);

/** How far through each section a time is, 0 to 1 each: a section runs from its moment to the next section's (the
 * last to the end of the film). Sections before the time are 1, after it 0. Give them in the film's order.
 * @param {{ t: number }[]} sections @param {number} t @param {number} duration */
export function sectionFills(sections, t, duration) {
  return sections.map((s, i) => {
    const end = sections[i + 1]?.t ?? duration;
    return end > s.t ? clamp((t - s.t) / (end - s.t)) : (t >= s.t ? 1 : 0);
  });
}

/** The key moment a time sits in (the last one at or before it). */
export const pointIndex = (points, t) => { let i = -1; points.forEach((p, j) => { if (t >= p.t - 1e-3) i = j; }); return i; };
/** The nearest key moment to a time, for reduced motion. */
export const nearestPoint = (points, t) => points.reduce((best, p) => (best == null || Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best), null);

/* ── running a film's scripts in a shadow root ──
 * Film scripts were written for a page of their own: they call document.querySelector('#stage') and write
 * window.Motion and window.__film. Each film here gets a document that looks inside its own shadow root and a
 * window of its own for what it writes, so two films (or two copies of one) on a page don't collide. */
const bindIf = (v, to) => (typeof v === 'function' && /^[a-z]/.test(v.name) ? v.bind(to) : v); // methods, not classes
function shimDocument(root, title) {
  const own = {
    querySelector: (s) => root.querySelector(s),
    querySelectorAll: (s) => root.querySelectorAll(s),
    getElementById: (id) => root.getElementById(id),
    title,
  };
  return new Proxy(document, {
    get: (d, k) => (k in own ? own[k] : bindIf(Reflect.get(d, k), d)),
    set: (d, k, v) => (k === 'title' ? true : Reflect.set(d, k, v)),
  });
}
function shimWindow(store) {
  return new Proxy(window, {
    get: (w, k) => (k in store ? store[k] : bindIf(Reflect.get(w, k), w)),
    set: (w, k, v) => { store[k] = v; return true; },
    has: (w, k) => k in store || k in w,
  });
}
const stubLocation = () => ({ search: '', hash: '', href: location.href, origin: location.origin, protocol: location.protocol, host: location.host, pathname: location.pathname });

const HOST_CSS = `:host { all: initial; display: block; position: relative; overflow: hidden; aspect-ratio: var(--md-ratio, 16 / 9); contain: paint; }
:host([hidden]) { display: none; }
.md-frame { position: absolute; inset: 0; }
.md-error { position: absolute; inset: 0; display: grid; place-items: center; font: 14px/1.4 system-ui, sans-serif; color: #a33; background: #fff5f5; padding: 16px; text-align: center; }`;

/* the box that scrolls the section: the nearest scrolling ancestor, else the window (null) */
function scrollPortOf(node) {
  for (let n = node.parentElement || node.getRootNode()?.host; n && n !== document.body && n !== document.documentElement; n = n.parentElement || n.getRootNode()?.host) {
    const oy = getComputedStyle(n).overflowY;
    if (/(auto|scroll|overlay)/.test(oy) && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}
const portRect = (port) => (port ? { top: port.getBoundingClientRect().top + port.clientTop, height: port.clientHeight } : { top: 0, height: window.innerHeight });
const scrollPortTop = (port) => (port ? port.scrollTop : window.scrollY);
// 'instant' overrides a page's scroll-behavior: smooth, which would otherwise ease every step of a glide
const scrollPortTo = (port, top) => (port || window).scrollTo({ top, behavior: 'instant' });
const reducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* on a server (server rendering) there is no HTMLElement: the class still loads, and nothing is defined */
const Base = globalThis.HTMLElement ?? class {};

export class MotionFilmElement extends Base {
  static observedAttributes = ['film', 'mode', 'track', 'label'];
  #film = null; #render = null; #invalidate = () => {}; #stage = null; #W = 1920; #H = 1080;
  #t = 0; #duration = 0; #points = []; #pointI = -1;
  #raf = 0; #last = 0; #visible = true; #anim = null; #playing = null; #waiters = []; #hold = null; #snap = true; #lastTarget = null;
  #resize = null; #io = null; #readyResolve; #onRegistered = (e) => { if (e.detail === this.getAttribute('film')) this.#mount(); };
  ready = new Promise((ok) => { this.#readyResolve = ok; });

  get time() { return this.#t; }
  get duration() { return this.#duration; }
  get points() { return this.#points.map((p) => ({ ...p })); }
  get progress() { return this.#duration ? this.#t / this.#duration : 0; }
  set progress(p) { this.seek(clamp(+p || 0) * this.#duration); }
  get scrolling() { return this.getAttribute('mode') === 'scroll'; }
  /** Whether the film is standing still (not playing, moving to a moment or catching up with the scroll). */
  get paused() { return !this.#playing && !this.#anim; }
  /** How far through each named section the film is now, 0 to 1 each (see sectionFills). Unknown names are 0. */
  sectionProgress(names) {
    const pts = names.map((n) => (typeof n === 'number' ? { t: n } : this.#points.find((p) => p.name.trim().toLowerCase() === String(n).trim().toLowerCase())));
    const known = pts.filter(Boolean), fills = sectionFills(known, this.#t, this.#duration);
    return pts.map((p) => (p ? fills[known.indexOf(p)] : 0));
  }
  /** The stage's own size (1920 × 1080 unless the film sets another), for laying the element out. */
  get size() { return { w: this.#W, h: this.#H }; }

  connectedCallback() {
    window.addEventListener('motion-film:registered', this.#onRegistered);
    if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
    this.#mount();
  }
  disconnectedCallback() {
    window.removeEventListener('motion-film:registered', this.#onRegistered);
    this.#stop(); this.#resize?.disconnect(); this.#io?.disconnect();
  }
  attributeChangedCallback(name, was, now) {
    if (was === now || !this.isConnected) return;
    if (name === 'film') this.#mount();
    if (name === 'label') this.#label();
    if (name === 'mode' || name === 'track') { this.#settle(false); this.#anim = null; this.#playing = null; this.#loop(); }
  }

  /** Jump to a moment without animating. */
  seek(target) {
    const t = resolveTime(target, { points: this.#points, duration: this.#duration, time: this.#t });
    if (t == null || !this.#render) return;
    this.#anim = null; this.#playing = null;
    this.#draw(t);
  }
  /** Go to a moment: a cut, unless a speed (play there) or a duration (an eased move) is given. Resolves true when
   * the film gets there, false when it's sent somewhere else first. */
  goTo(target, opts = {}) {
    const t = resolveTime(target, { points: this.#points, duration: this.#duration, time: this.#t });
    if (t == null || !this.#render) return Promise.resolve(false);
    if (this.scrolling) return this.#scrollTo(t, opts);
    this.#playing = null;
    this.#settle(false);
    const plan = reducedMotion() ? null : tweenPlan(this.#t, t, opts);
    if (!plan) { this.#anim = null; this.#draw(t); this.#arrive(t); return Promise.resolve(true); }
    this.#anim = { plan, start: null };
    this.#loop();
    return new Promise((ok) => this.#waiters.push(ok));
  }
  /** Play a stretch of the film at speed (to the end by default). */
  play({ from, to, speed = 1 } = {}) {
    if (!this.#render || this.scrolling) return;
    if (from != null) this.seek(from);
    const end = resolveTime(to ?? 'end', { points: this.#points, duration: this.#duration, time: this.#t }) ?? this.#duration;
    this.#anim = null; this.#playing = { to: end, speed };
    this.#loop();
  }
  pause() { this.#anim = null; this.#playing = null; this.#settle(false); }

  #mount() {
    const film = films[this.getAttribute('film')];
    if (!film || film === this.#film) return;
    this.#stop(); this.#settle(false);
    this.#film = film; this.#render = null;
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.replaceChildren();
    if ((film.player || 1) > PLAYER_VERSION) return this.#fail(root, new Error(`it was exported for player ${film.player}, and this page has player ${PLAYER_VERSION}. Export it again, which updates motion-film.js`));
    const style = document.createElement('style'); style.textContent = `${HOST_CSS}\n${film.css}`;
    const frame = document.createElement('div'); frame.className = 'md-frame'; frame.innerHTML = film.html;
    root.append(style, frame);
    // fonts can't be declared inside a shadow root: the page gets each font stylesheet once
    for (const href of film.fonts || []) {
      if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === href)) continue;
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l);
    }
    const store = { __promoParams: { ...film.params } };
    const win = shimWindow(store), doc = shimDocument(root, film.title), loc = stubLocation();
    let opts = null;
    try {
      for (const run of film.scripts) {
        run(doc, win, loc, store.Motion);
        if (store.Motion && store.Motion.mountPlayer?.embedded !== true) {
          const mountPlayer = (o) => { opts = o; return store.__film; };
          mountPlayer.embedded = true;
          store.Motion.mountPlayer = mountPlayer;
        }
      }
      if (!opts) throw new Error('The film never called Motion.mountPlayer');
    } catch (err) { return this.#fail(root, err); }
    const stage = root.getElementById('stage');
    this.#stage = stage;
    // measured, else (while the page hides the element) the size the film's stylesheet sets
    const css = stage ? getComputedStyle(stage) : null;
    this.#W = stage?.offsetWidth || parseFloat(css?.getPropertyValue('--stage-w')) || 1920;
    this.#H = stage?.offsetHeight || parseFloat(css?.getPropertyValue('--stage-h')) || 1080;
    // the shape, inside the shadow root: the page's own styles win, and the element's style attribute stays the page's
    const shape = document.createElement('style'); shape.textContent = `:host { --md-ratio: ${this.#W} / ${this.#H}; }`; root.append(shape);
    stage?.classList.toggle('plain', store.Motion.param('background', 'white') !== 'textured');
    this.#render = opts.render; this.#invalidate = opts.invalidate || (() => {});
    this.#duration = opts.duration; this.#points = pointsOf(opts.keys, opts.scenes); this.#pointI = -2; this.#snap = true; this.#hold = null; this.#lastTarget = null;
    this.#label();
    this.#fit();
    this.#resize?.disconnect();
    if (globalThis.ResizeObserver) { this.#resize = new ResizeObserver(() => this.#fit()); this.#resize.observe(this); }
    this.#io?.disconnect();
    if (globalThis.IntersectionObserver) {
      // back in view after being away: catch up with the scroll at once, rather than race through what it missed
      this.#io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !this.#visible) this.#snap = true; this.#visible = e.isIntersecting; if (this.#visible) this.#loop(); });
      this.#io.observe(this);
    }
    const start = resolveTime(this.getAttribute('start') ?? 0, { points: this.#points, duration: this.#duration }) ?? 0;
    this.#draw(start, true);
    (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (this.#film !== film) return;
      this.#invalidate(); this.#draw(this.#t, true);
      this.#readyResolve(this);
      this.dispatchEvent(new CustomEvent('ready'));
      this.#loop();
    });
  }
  #fail(root, err) {
    const box = document.createElement('div'); box.className = 'md-error'; box.textContent = `This film could not start: ${err.message}`;
    root.append(box);
    this.dispatchEvent(new CustomEvent('error', { detail: err }));
  }
  #label() {
    if (this.#film && (!this.hasAttribute('aria-label') || this.dataset.mdLabel === '1')) {
      this.setAttribute('aria-label', this.getAttribute('label') || this.#film.title || this.#film.name);
      this.dataset.mdLabel = '1';
    }
  }
  #fit() {
    if (!this.#stage) return;
    const w = this.clientWidth, h = this.clientHeight;
    if (!w || !h) return;
    const s = Math.min(w / this.#W, h / this.#H);
    this.#stage.style.transform = `translate(${(w - this.#W * s) / 2}px,${(h - this.#H * s) / 2}px) scale(${s})`;
  }
  #draw(t, force = false) {
    t = clamp(t, 0, this.#duration);
    if (!force && Math.abs(t - this.#t) < 1e-5) return;
    this.#t = t;
    this.#render?.(t);
    this.dispatchEvent(new CustomEvent('timeupdate', { detail: { t, progress: this.#duration ? t / this.#duration : 0 } }));
    const i = pointIndex(this.#points, t);
    if (i !== this.#pointI) { this.#pointI = i; this.dispatchEvent(new CustomEvent('pointchange', { detail: { point: this.#points[i] ?? null, index: i } })); }
  }
  #arrive(t) { this.dispatchEvent(new CustomEvent('arrive', { detail: { point: this.#points.find((p) => Math.abs(p.t - t) < 1e-3) ?? null, t } })); }
  #settle(value) { const w = this.#waiters; this.#waiters = []; w.forEach((ok) => ok(value)); }

  /* scrolling: the page moves to the moment, and the film follows the scroll there */
  #track() { const sel = this.getAttribute('track'); return (sel ? this.getRootNode().querySelector?.(sel) : null) || this.parentElement; }
  #scrollTo(t, opts = {}) {
    const track = this.#track(); if (!track) return Promise.resolve(false);
    const port = scrollPortOf(track), dy = scrollDelta(this.#duration ? t / this.#duration : 0, track.getBoundingClientRect(), portRect(port));
    this.#settle(false);
    const plan = reducedMotion() ? null : tweenPlan(this.#t, t, opts);
    if (!plan) {
      // a cut: the page moves at once and the moment is drawn straight away. The page can only land on a whole
      // pixel, a hair either side of the moment, so the moment itself is held until the page scrolls again
      scrollPortTo(port, scrollPortTop(port) + dy);
      this.#hold = { t, top: track.getBoundingClientRect().top };
      this.#anim = null; this.#draw(t); this.#arrive(t); this.#loop();
      return Promise.resolve(true);
    }
    // a glide: the page scrolls there over the plan's time (a speed through the film, or a set duration, eased),
    // and the film is drawn from the plan, so it plays through exactly at that pace. Scrolling by hand stops it.
    const y0 = scrollPortTop(port);
    this.#hold = null;
    this.#anim = { glide: { plan, port, y0, dy, track, set: y0 }, start: null };
    this.#loop();
    return new Promise((ok) => this.#waiters.push(ok));
  }

  #stop() { cancelAnimationFrame(this.#raf); this.#raf = 0; }
  #loop() { if (!this.#raf && this.#render && this.isConnected) { this.#last = performance.now(); this.#raf = requestAnimationFrame((n) => this.#tick(n)); } }
  #tick(now) {
    this.#raf = 0;
    // real time, so playing keeps pace on a slow device; capped so a tab coming back from hiding does not leap
    const dt = Math.min(0.5, Math.max(0, (now - this.#last) / 1000)); this.#last = now;
    let more = false;
    if (this.scrolling && this.#anim?.glide) {
      const a = this.#anim, g = a.glide; a.start ??= now;
      if (Math.abs(scrollPortTop(g.port) - g.set) > 2) { this.#anim = null; this.#settle(false); this.#loop(); return; } // scrolled by hand
      const elapsed = (now - a.start) / 1000, p = g.plan.dur > 0 ? clamp(elapsed / g.plan.dur) : 1;
      g.set = Math.round(g.y0 + g.dy * (g.plan.eased ? easeIO(p) : p));
      scrollPortTo(g.port, g.set);
      this.#draw(tweenAt(g.plan, elapsed));
      if (p >= 1) {
        this.#hold = { t: g.plan.to, top: g.track.getBoundingClientRect().top };
        this.#anim = null; this.#arrive(g.plan.to); this.#settle(true);
      }
      more = true;
    } else if (this.scrolling) {
      more = this.#visible;
      const track = this.#track();
      if (track && this.#visible) {
        const rect = track.getBoundingClientRect();
        if (this.#hold && Math.abs(rect.top - this.#hold.top) > 1) this.#hold = null;
        let target = this.#hold ? this.#hold.t : scrollProgress(rect, portRect(scrollPortOf(track))) * this.#duration;
        if (reducedMotion()) target = nearestPoint(this.#points, target)?.t ?? target;
        // the page jumped (a link, a button, Home/End) rather than scrolled: cut to the new moment instead of easing
        // through everything between. Scrolling, even fast, moves the target far less than this in one frame
        if (this.#lastTarget != null && Math.abs(target - this.#lastTarget) > Math.max(3, this.#duration * 0.08)) this.#snap = true;
        this.#lastTarget = target;
        const tau = Math.max(0, parseFloat(this.getAttribute('smoothing') ?? '0.12') || 0);
        const next = tau > 0 && !reducedMotion() && !this.#snap ? lerp(this.#t, target, 1 - Math.exp(-dt / tau)) : target;
        this.#snap = false;
        this.#draw(Math.abs(next - target) < 0.002 ? target : next);
      }
    } else if (this.#anim?.plan) {
      const a = this.#anim; a.start ??= now;
      const elapsed = (now - a.start) / 1000;
      this.#draw(tweenAt(a.plan, elapsed));
      if (elapsed >= a.plan.dur) { this.#anim = null; this.#arrive(a.plan.to); this.#settle(true); } else more = true;
    } else if (this.#playing) {
      const p = this.#playing, next = Math.min(p.to, this.#t + dt * p.speed);
      this.#draw(next);
      if (next >= p.to) { this.#playing = null; this.dispatchEvent(new CustomEvent(p.to >= this.#duration ? 'ended' : 'arrive', { detail: { point: null, t: p.to } })); } else more = true;
    }
    // carry on from this frame's time (restarting the clock here would lose each frame's own work from the next step)
    if (more && this.#render && this.isConnected) this.#raf = requestAnimationFrame((n) => this.#tick(n));
  }
}
if (globalThis.customElements && !customElements.get('motion-film')) customElements.define('motion-film', MotionFilmElement);
