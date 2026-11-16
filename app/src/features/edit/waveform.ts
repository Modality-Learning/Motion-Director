// Drawing sound: a clip's waveform, the sound editor's whole file, and the mix's equaliser. Canvas work only,
// done straight onto the element (never through React state).
import { clamp, dB, gainY } from './geometry';
import type { Settings } from './types';
import { token } from '@/lib/tokens';

const dprOf = () => Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);

/** The loudest sample in each of `n` columns across [a, b) of the data. */
export function peaks(d: ArrayLike<number>, a: number, b: number, n: number) {
  const per = Math.max(1, (b - a) / n), out = new Float32Array(n);
  for (let x = 0; x < n; x++) {
    let peak = 0;
    for (let i = Math.floor(a + x * per), e = Math.min(b, Math.floor(a + (x + 1) * per)); i < e; i++) peak = Math.max(peak, Math.abs(d[i]));
    out[x] = peak;
  }
  return out;
}

/** A clip's waveform: the part of the file it plays, across its width. */
export function drawWave(canvas: HTMLCanvasElement, buf: AudioBuffer, s: Pick<Settings, 'from' | 'to'>, w: number, h: number) {
  const W = Math.min(3000, Math.max(1, Math.round(w))), dpr = dprOf();
  canvas.width = W * dpr; canvas.height = h * dpr; canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const g = canvas.getContext('2d'); if (!g) return;
  g.scale(dpr, dpr);
  const d = buf.getChannelData(0), sr = buf.sampleRate, a = Math.floor(s.from * sr), b = Math.min(d.length, Math.floor((s.to ?? buf.duration) * sr));
  const p = peaks(d, a, b, W);
  g.fillStyle = token('foreground', 0.5);
  for (let x = 0; x < W; x++) { const y = p[x] * h * 0.42; g.fillRect(x * (w / W), h / 2 - y, Math.max(1, w / W), Math.max(1, y * 2)); }
}

/** The loudest 10 ms in the kept part of a sound: a good first guess at where it lands. */
export function findHit(d: ArrayLike<number>, sampleRate: number, from: number, to: number) {
  const win = Math.max(1, Math.floor(sampleRate * 0.01));
  const a = Math.floor(from * sampleRate), b = Math.min(d.length, Math.floor(to * sampleRate));
  let best = -1, at: number | null = null;
  for (let i = a; i + win <= b; i += win) {
    let e = 0;
    for (let j = i; j < i + win; j++) e += d[j] * d[j];
    if (e > best) { best = e; at = i / sampleRate; }
  }
  return at;
}

/* ── the sound editor's canvas: the whole file, with its trim, volume, fades and hit point ── */
export const ED_PAD = 10;
export function edGeom(len: number, w: number, h: number) {
  return { len, w, h, x: (t: number) => ED_PAD + (t / len) * (w - ED_PAD * 2), t: (x: number) => clamp(((x - ED_PAD) / (w - ED_PAD * 2)) * len, 0, len) };
}
export type EdHandle = 'from' | 'to' | 'gain' | 'fadeIn' | 'fadeOut' | 'hit';
/** What a press at (ox, oy) on the editor's canvas takes hold of. */
export function edHandleAt(s: Settings, gm: ReturnType<typeof edGeom>, ox: number, oy: number): EdHandle | null {
  const to = s.to ?? gm.len;
  if (s.hit != null && Math.abs(ox - gm.x(s.hit)) < 6 && oy > gm.h - 18) return 'hit';
  if (oy < 16 && Math.abs(ox - gm.x(s.from + s.fadeIn * s.rate)) < 8) return 'fadeIn';
  if (oy < 16 && Math.abs(ox - gm.x(to - s.fadeOut * s.rate)) < 8) return 'fadeOut';
  if (Math.abs(ox - gm.x(s.from)) < 8) return 'from';
  if (Math.abs(ox - gm.x(to)) < 8) return 'to';
  if (s.hit != null && Math.abs(ox - gm.x(s.hit)) < 5) return 'hit';
  if (Math.abs(oy - gainY(s.gain, gm.h)) < 6 && ox > gm.x(s.from) && ox < gm.x(to)) return 'gain';
  return null;
}
/** Draws the editor; `playedAt` is where in the file the audition is now, if it plays. */
export function drawEditor(canvas: HTMLCanvasElement, buf: AudioBuffer, s: Settings, len: number, playedAt: number | null) {
  const gm = edGeom(len || 1, canvas.clientWidth, canvas.clientHeight), dpr = dprOf();
  canvas.width = gm.w * dpr; canvas.height = gm.h * dpr;
  const g = canvas.getContext('2d'); if (!g) return;
  g.scale(dpr, dpr);
  const d = buf.getChannelData(0), to = s.to ?? gm.len, a = gm.x(s.from), b = gm.x(to), mid = gm.h / 2, level = Math.pow(10, s.gain / 20);
  // waveform: the kept part brighter, scaled by the volume
  for (let px = ED_PAD; px < gm.w - ED_PAD; px++) {
    const i0 = Math.floor((gm.t(px) / gm.len) * d.length), i1 = Math.floor((gm.t(px + 1) / gm.len) * d.length);
    let peak = 0;
    for (let i = i0; i < i1; i++) peak = Math.max(peak, Math.abs(d[i]));
    const inside = px >= a && px <= b, y = Math.min(mid - 4, peak * (inside ? level : 1) * (mid - 6));
    g.fillStyle = inside ? token('primary', 0.9) : token('muted-foreground', 0.35); g.fillRect(px, mid - y, 1, Math.max(1, y * 2));
  }
  // trimmed-away parts, fades, the volume line, the edges and the hit point
  g.fillStyle = token('background', 0.55); g.fillRect(0, 0, a, gm.h); g.fillRect(b, 0, gm.w - b, gm.h);
  g.fillStyle = token('background', 0.45);
  if (s.fadeIn) { g.beginPath(); g.moveTo(a, 0); g.lineTo(gm.x(s.from + s.fadeIn * s.rate), 0); g.lineTo(a, gm.h); g.fill(); }
  if (s.fadeOut) { g.beginPath(); g.moveTo(b, 0); g.lineTo(gm.x(to - s.fadeOut * s.rate), 0); g.lineTo(b, gm.h); g.fill(); }
  const gy = gainY(s.gain, gm.h);
  g.strokeStyle = token('foreground'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(a, gy); g.lineTo(b, gy); g.stroke();
  g.fillStyle = token('foreground'); g.font = '600 11px sans-serif'; g.fillText(dB(s.gain), a + 6, gy - 5);
  for (const x of [a, b]) { g.fillStyle = token('data-2'); g.fillRect(x - 2, 0, 4, gm.h); g.fillRect(x - 6, mid - 14, 12, 28); }
  for (const x of [gm.x(s.from + s.fadeIn * s.rate), gm.x(to - s.fadeOut * s.rate)]) { g.fillStyle = token('foreground'); g.fillRect(x - 5, 2, 10, 10); }
  if (s.hit != null) {
    const hx = gm.x(s.hit);
    g.fillStyle = token('warning'); g.fillRect(hx - 1, 0, 2, gm.h);
    g.beginPath(); g.moveTo(hx, gm.h - 14); g.lineTo(hx + 10, gm.h - 7); g.lineTo(hx, gm.h); g.fill(); g.fillText('hit', hx + 4, 24);
  }
  // the playhead while it plays
  if (playedAt != null) { const px = gm.x(playedAt); g.fillStyle = token('destructive'); g.fillRect(px - 1, 0, 2, gm.h); }
}

/* ── the mix's equaliser: what is playing, in bands spaced like hearing (more of them low down) ── */
export const EQ_BARS = 28;
/** The bars after one more frame: each rises at once to its band's level and falls back gently. */
export function eqStep(bars: Float32Array, a: ArrayLike<number> | null) {
  const n = bars.length;
  let live = false;
  for (let i = 0; i < n; i++) {
    const lo = Math.floor(Math.pow(100, i / n)), hi = Math.max(lo + 1, Math.floor(Math.pow(100, (i + 1) / n)));
    let v = 0;
    if (a) for (let j = lo; j < hi && j < a.length; j++) v = Math.max(v, a[j] / 255);
    bars[i] = Math.max(v, bars[i] * 0.86);
    if (bars[i] > 0.01) live = true;
  }
  return live;
}
export function drawEq(canvas: HTMLCanvasElement, bars: Float32Array) {
  const w = canvas.clientWidth, h = canvas.clientHeight, dpr = dprOf(), n = bars.length;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d'); if (!g) return;
  g.scale(dpr, dpr);
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const bh = Math.max(2, bars[i] * (h - 2));
    g.fillStyle = bars[i] > 0.85 ? token('warning') : token('foreground', 0.7);
    g.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
  }
}
