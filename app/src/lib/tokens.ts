// Theme colours for canvases. A canvas can't read CSS custom properties, so the studio's drawings (waveforms,
// the motion graph, the meter) ask for a token by name here and get it resolved to rgba(), with an optional
// alpha. Everything else uses the tokens in index.css directly. Resolved once per colour and cached; a token
// change (hot reload of index.css) shows on the next full reload.

const cache = new Map<string, [number, number, number, number]>();
let probe: HTMLElement | null = null;

function rgbaOf(name: string): [number, number, number, number] {
  const hit = cache.get(name);
  if (hit) return hit;
  if (!probe) {
    probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
  }
  probe.style.color = '';
  probe.style.color = name.startsWith('var(') ? name : `var(--${name})`;
  const m = getComputedStyle(probe).color.match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
  const v: [number, number, number, number] = [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, m[3] ?? 1];
  cache.set(name, v);
  return v;
}

/** A theme token ("primary", "foreground", "data-1", or "var(--data-1)") as an rgba() string for a canvas. */
export function token(name: string, alpha = 1) {
  const [r, g, b, a] = rgbaOf(name);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * alpha * 1000) / 1000})`;
}
