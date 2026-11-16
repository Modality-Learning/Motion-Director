/* A film is a pure function of time: render(t) must draw the same frame whether the film was played up to t or
 * opened at t. These compare what the viewer can see on the two (render/purity.mjs gathers the states) and
 * name what differs. No I/O; tested in purity.test.mjs. */

/** What the page shows, element by element (run in the film's page; serialisable). */
export function pageState() {
  const stage = document.getElementById('stage'), sr = stage.getBoundingClientRect(), out = {};
  // where an element is, precisely enough to match it on another page: up to the nearest id, each step by its
  // place among its parent's children
  const address = (n) => {
    const parts = [];
    for (let e = n; e && e !== stage; e = e.parentElement) {
      if (e.id) { parts.unshift(`#${e.id}`); break; }
      parts.unshift(`${e.tagName.toLowerCase()}${e.classList.length ? `.${[...e.classList].slice(0, 2).join('.')}` : ''}:${[...e.parentElement.children].indexOf(e) + 1}`);
    }
    return parts.join(' > ');
  };
  const shown = (n) => {
    let o = 1;
    for (let e = n; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      o *= +cs.opacity;
    }
    return o;
  };
  for (const n of stage.querySelectorAll('*')) {
    const r = n.getBoundingClientRect();
    const onStage = r.width > 0 && r.height > 0 && r.right > sr.left && r.left < sr.right && r.bottom > sr.top && r.top < sr.bottom;
    const k = sr.width / (stage.offsetWidth || sr.width || 1); // in the stage's own pixels
    out[address(n)] = {
      shown: onStage ? Math.round(shown(n) * 100) / 100 : 0,
      box: [r.left - sr.left, r.top - sr.top, r.width, r.height].map((v) => Math.round(v / k)),
      text: n.children.length ? '' : (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    };
  }
  return out;
}

const SEEN = 0.03, OPACITY = 0.05, PIXELS = 2;
/** What differs on screen between a page opened fresh at a time and one played up to it: elements visible on
 * either whose visibility, place or size, or text differ. Most visible first. */
export function compareStates(fresh, played) {
  const out = [];
  for (const key of new Set([...Object.keys(fresh), ...Object.keys(played)])) {
    const a = fresh[key], b = played[key];
    if (Math.max(a?.shown ?? 0, b?.shown ?? 0) < SEEN) continue; // invisible on both: nothing to see
    const what = [];
    if (!a || !b) what.push(a ? 'only on a fresh page' : 'only when played through');
    else {
      if (Math.abs(a.shown - b.shown) > OPACITY) what.push(`shown ${Math.round(a.shown * 100)}% fresh, ${Math.round(b.shown * 100)}% played`);
      if (a.box.some((v, i) => Math.abs(v - b.box[i]) > PIXELS)) what.push(`at ${a.box.join(',')} fresh, ${b.box.join(',')} played`);
      if (a.text !== b.text) what.push(`text "${a.text}" fresh, "${b.text}" played`);
    }
    if (what.length) out.push({ element: key, what, weight: Math.max(a?.shown ?? 0, b?.shown ?? 0) });
  }
  return out.sort((x, y) => y.weight - x.weight);
}
