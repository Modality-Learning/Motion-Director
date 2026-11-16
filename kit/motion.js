/* Motion Director kit: motion helpers and motion tokens.
 * Every film is a pure function of time, render(t), so frames can be scrubbed and rendered exactly.
 * These helpers carry the house feel; see promo/MOTION.md for when to use each one.
 * Load before a film's own script: <script src="../../kit/motion.js"></script>, then read window.Motion. */
(() => {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;

  /* Eases. io for moves between two rests, out for arrivals, in for departures, back for a small
   * settle past the mark. lin only for things that never stop (drift, scrolling clocks). */
  const E = {
    lin: (p) => p,
    io: (p) => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    out: (p) => 1 - Math.pow(1 - p, 3),
    in: (p) => p * p * p,
    back: (p) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
  };

  /* Progress of t through [a, b], eased: the building block of every animation. */
  const P = (t, a, b, e = E.io) => e(clamp((t - a) / (b - a)));
  /* The same, within an already-normalised progress p. */
  const sm = (p, a, b) => E.io(clamp((p - a) / (b - a)));

  /* Motion tokens: the numbers behind the house feel. Change them here, never per film. */
  const T = {
    spring: { damping: 5.5, freq: 9.5 }, // overshoots about 15% at 0.33 s, settles by about 0.8 s
    titleHold: [3.2, 5.6],               // seconds a title stays readable
    titleIn: .45, titleOut: .35,         // a title arrives a little slower than it leaves
    anticipation: [.12, .2],             // wind-up before a big move: a dip, lean or hinge back
    impact: { amp: 7, decay: 5.5, hz: 2 }, // the bump when something lands
    peekHide: 124,                       // px a peeking title sits below the card edge before it springs up
  };

  /* Underdamped spring from rest to 1 (u = seconds since it was released). */
  const spring = (u, k = T.spring) => (u <= 0 ? 0 : 1 - Math.exp(-k.damping * u) * (Math.cos(k.freq * u) + (k.damping / k.freq) * Math.sin(k.freq * u)));
  /* A decaying wobble after a landing (u = seconds since impact), in px or degrees. */
  const impact = (u, k = T.impact) => (u > 0 && u < 1 ? k.amp * Math.exp(-k.decay * u) * Math.sin(2 * Math.PI * k.hz * u) : 0);

  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, p) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * p)).join(',')})`; };
  function el(tag, cls, html, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
  function op(n, o) { n.style.opacity = o; n.style.visibility = o <= 0.001 ? 'hidden' : 'visible'; }
  const tr = (n, x, y, s = 1, r = 0) => { n.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`; };

  /* Keyframes: the film's key moments, [{ t, name, note }] in time order.
   * keyAt(keys, t) gives the moment t sits in and how far it is towards the next one. In the
   * keyframes pass a film renders each key as a held state; the transitions pass fills the gaps. */
  function keyAt(keys, t) {
    let i = 0;
    while (i < keys.length - 1 && t >= keys[i + 1].t) i++;
    const next = keys[i + 1];
    return { i, key: keys[i], next, u: next ? clamp((t - keys[i].t) / (next.t - keys[i].t)) : 0 };
  }

  /* Parameters (see promo/render/params.mjs): the page URL first (the renderer, storyboard and studio
   * pass every value), then values baked into a bundled page, then the film's own fallback. */
  const query = new URLSearchParams(location.search);
  function param(name, fallback) {
    // values the studio sends while you edit win, so a change shows without reloading
    const live = window.__promoLive;
    if (live && name in live) return live[name];
    if (query.has(name)) {
      const v = query.get(name), n = Number(v);
      return typeof fallback === 'number' && Number.isFinite(n) ? n : v;
    }
    const baked = window.__promoParams;
    return baked && name in baked ? baked[name] : fallback;
  }

  /* Scopes: what a parameter covers, so the studio can show the ones on screen and find their element.
   *   Motion.scope('param:title-0', { ranges: [[0.4, 3.6]], host: titleEl })  a film's own parameter
   *   Motion.place('logo-reveal', { start: 30.85, end: 35, host })             a composition placed in a film
   * The host gets data-scope=<id>; the player reports every scope to the studio. */
  const scopes = [];
  function scope(id, { ranges = [], host = null, label = null } = {}) {
    [].concat(host || []).forEach((n) => { n.dataset.scope = id; });
    const existing = scopes.find((x) => x.id === id);
    if (existing) Object.assign(existing, { ranges, host: host || existing.host, label: label || existing.label });
    else scopes.push({ id, ranges, host, label });
    return id;
  }
  /* Moments: the instants a sound can be tied to, each on the element that makes it.
   *   Motion.moment('fold-1', { t: FOLD[0], dur: 0.4, host: foldEl, label: 'First fold' })
   *   Motion.moment('events-in', { times: evs.map((e) => e.at), host: evs.map((e) => e.node), label: 'Events pop in' })
   * Use the same constants the animation uses, so retiming the animation moves its sounds too. Keep ids
   * stable once sounds use them (promo/films/<film>/sound.json refers to them). dur is how long the action
   * lasts (typing, a swipe), so a sound can be fitted to it. Hosts get data-moments="<ids>". */
  const moments = [];
  function moment(id, { t, times, dur = 0, host = null, label = null } = {}) {
    const ts = (times || [t]).filter(Number.isFinite).sort((a, b) => a - b);
    [].concat(host || []).forEach((n) => { if (n) n.dataset.moments = [...new Set(`${n.dataset.moments || ''} ${id}`.trim().split(/\s+/))].join(' '); });
    const existing = moments.find((m) => m.id === id);
    if (existing) Object.assign(existing, { times: ts, dur, label: label || existing.label });
    else moments.push({ id, times: ts, dur, label: label || id });
    return id;
  }
  /* A composition placed in a film; its own moments (comp.moments, in its local time) join the film's as
   * "<comp>.<id>", on the composition's elements. */
  function place(comp, { start, end = Infinity, host, label, moments: own = [] } = {}) {
    for (const m of own) moment(`${comp}.${m.id}`, { times: (m.times || [m.t]).map((x) => start + x), dur: m.dur, host, label: `${label || comp}: ${m.label || m.id}` });
    return scope(`comp:${comp}`, { ranges: [[start, end]], host, label });
  }

  window.Motion = { clamp, lerp, E, P, sm, T, spring, impact, hex, mix, el, op, tr, keyAt, param, scope, place, scopes, moment, moments };
})();
