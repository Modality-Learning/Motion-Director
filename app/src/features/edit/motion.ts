// How a picked element moves: speed peaks suggest a whoosh, sudden stops an impact. Objects are elements of
// the film that sounds belong to; each of their clips remembers the object's event it sits nearest (an
// arrival, a fast moment, a stop, an exit), so when the object is measured again and the event has moved,
// its clips move with it. No UI here.
import { effective } from './kit';
import { round, startOf } from './geometry';
import type { Anchor, Analysis, Cue, Curve, EventKind, LineKey, Library, Mark, Moment, Sample, Sheet } from './types';

/* the graph's lines, what each means, and the marks drawn over them */
// colours are theme tokens (index.css): CSS uses them as they are, a canvas resolves them (lib/tokens.ts)
export const LINES: Record<LineKey, { colour: string; fill?: number; dashed?: boolean; means: string }> = {
  moves: { colour: 'var(--data-1)', fill: 0.18, means: 'Where it is on screen: slides, drops and pans. Size changes are taken out.' },
  grows: { colour: 'var(--data-2)', fill: 0.14, means: 'Its size changing: a bar filling, a scale up or down.' },
  turns: { colour: 'var(--data-3)', fill: 0.14, means: 'Rotating: spins, and 3D tilts like a flap swinging or a card flipping.' },
  shows: { colour: 'var(--muted-foreground)', dashed: true, means: 'How much of it can be seen, 0 to 100%.' },
};
export const MARKS: Record<EventKind, { glyph: string; colour: string; means: string; suggest: string; anchor: string }> = {
  peak: { glyph: '●', colour: 'var(--data-1)', means: 'fastest', suggest: 'the fastest moment', anchor: 'fastest moment' },
  stop: { glyph: '▼', colour: 'var(--destructive)', means: 'lands', suggest: 'the stop', anchor: 'stop' },
  in: { glyph: '▲', colour: 'var(--data-2)', means: 'appears', suggest: 'the arrival', anchor: 'arrival' },
  out: { glyph: '△', colour: 'var(--data-2)', means: 'leaves', suggest: 'the exit', anchor: 'exit' },
};

/** Four things from the preview's samples, measured apart, each on its own scale:
 *   moves  where it is (stage px/s), with growth taken out: if an edge or its centre stays put, it isn't moving
 *   grows  how fast its size changes (a bar filling, a scale-up)
 *   turns  how fast it rotates (degrees a second): spins in the plane, and tilts like a flap swinging shut
 *   shows  how visible it is (0 to 1)
 * and the marks: where each is fastest, where it stops, where it appears and leaves. */
export function analyseCurve(samples: Sample[]): Curve {
  const least = (...xs: number[]) => xs.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
  const move: number[] = [], grow: number[] = [], turn: number[] = [];
  const spinBy = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180); // the short way round
  samples.forEach((p, i) => {
    const q = samples[Math.max(0, i - 1)], dt = p[0] - q[0] || 1;
    const dx = least(p[1] - q[1], (p[1] - p[3] / 2) - (q[1] - q[3] / 2), (p[1] + p[3] / 2) - (q[1] + q[3] / 2));
    const dy = least(p[2] - q[2], (p[2] - p[4] / 2) - (q[2] - q[4] / 2), (p[2] + p[4] / 2) - (q[2] + q[4] / 2));
    // changes while it can't be seen (laid out while hidden, or popping in) aren't motion anyone sees
    const seen = p[5] >= 0.05 && q[5] >= 0.05;
    move.push(seen ? Math.hypot(dx, dy) / dt : 0);
    grow.push(seen ? (Math.abs(p[3] - q[3]) + Math.abs(p[4] - q[4])) / dt : 0);
    turn.push(seen && p.length > 7 ? (spinBy(p[6], q[6]) + Math.abs(p[7] - q[7])) / dt : 0);
  });
  const smooth = (v: number[]) => v.map((_, i) => (v[Math.max(0, i - 1)] + 2 * v[i] + v[Math.min(v.length - 1, i + 1)]) / 4);
  const mv = smooth(move), gr = smooth(grow), tu = smooth(turn);
  // a curve that barely changes (under 2 px, or 2 degrees, a second) is flat, not scaled up to look busy
  const maxMove = Math.max(...mv), maxGrow = Math.max(...gr), maxTurn = Math.max(...tu);
  const norm = (v: number[], mx: number) => (mx < 2 ? v.map(() => 0) : v.map((x) => x / mx));
  const nm = norm(mv, maxMove), ng = norm(gr, maxGrow), nt = norm(tu, maxTurn), both = nm.map((x, i) => Math.max(x, ng[i], nt[i]));
  // the unsmoothed speeds on the same scales: smoothing finds stops reliably but puts them a step or two late,
  // and a hit 100 ms after the slam is heard
  const rm = norm(move, maxMove), rg = norm(grow, maxGrow), rt = norm(turn, maxTurn), raw = rm.map((x, i) => Math.max(x, rg[i], rt[i]));
  const marks: Mark[] = [];
  // which line made it: the one highest there
  const lineAt = (j: number): LineKey => (nt[j] >= nm[j] && nt[j] >= ng[j] ? 'turns' : ng[j] > nm[j] ? 'grows' : 'moves');
  for (let i = 1; i < both.length - 1; i++) {
    const t = samples[i][0];
    if (samples[i][5] < 0.05) continue;
    if (both[i] > 0.35 && both[i] >= both[i - 1] && both[i] > both[i + 1] && !marks.some((m) => m.kind === 'peak' && t - m.t < 0.25)) marks.push({ kind: 'peak', t, line: lineAt(i) });
    const win = both.slice(Math.max(0, i - 5), i), before = Math.max(...win);
    if (before > 0.3 && both[i] < 0.06 && both[i - 1] >= 0.06) {
      // where it lands: the last step that was still fast, halfway through it
      let j = i;
      while (j > Math.max(1, i - 6) && raw[j] < 0.1 * before) j--;
      marks.push({ kind: 'stop', t: (samples[j - 1][0] + samples[j][0]) / 2, line: lineAt(Math.max(0, i - 5) + win.indexOf(before)) });
    }
  }
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1][5] < 0.5 && samples[i][5] >= 0.5) marks.push({ kind: 'in', t: samples[i][0], line: 'shows' });
    if (samples[i - 1][5] >= 0.5 && samples[i][5] < 0.5) marks.push({ kind: 'out', t: samples[i][0], line: 'shows' });
  }
  return { samples, move: mv, grow: gr, turn: tu, nm, ng, nt, maxMove, maxGrow, maxTurn, marks };
}

/** What the object does, in order: each arrival, fastest moment, stop and exit (an object on screen from the
 * start arrives at 0). */
export function eventsOf(cv: Pick<Curve, 'marks' | 'samples'> | null | undefined): Mark[] {
  const evs = [...(cv?.marks || [])].sort((a, b) => a.t - b.t);
  if ((cv?.samples?.[0]?.[5] ?? 0) >= 0.5 && !evs.some((e) => e.kind === 'in' && e.t < 0.05)) evs.unshift({ kind: 'in', t: 0 });
  return evs;
}

/** Where a clip lands: its hit point (set, else measured) on the film, else its start. */
export function hitTimeOf(c: Cue, lib: Library, analysis: Record<string, Analysis>, moments: Moment[]) {
  const s = effective(c, lib), hit = s.hit ?? analysis[c.sound]?.hit, to = s.to ?? Infinity;
  return hit != null && hit >= s.from && hit <= to ? startOf(c, moments) + (hit - s.from) / s.rate : startOf(c, moments);
}
/** The event nearest a time, as an anchor: its kind, which of that kind it is, and when. */
export function anchorAt(at: number, evs: Mark[]): Anchor | null {
  if (!evs.length) return null;
  const near = evs.reduce((b, e) => (Math.abs(e.t - at) < Math.abs(b.t - at) ? e : b));
  return { kind: near.kind, n: evs.filter((e) => e.kind === near.kind).indexOf(near), t: round(near.t) };
}
/** Each object clip remembers the object's event nearest where it lands; objects with no clips are let go. */
export function reanchor(sheet: Sheet, curveOf: (selector: string) => Curve | null | undefined, landsAt: (c: Cue) => number) {
  for (const c of sheet.cues) {
    if (!c.object) continue;
    const cv = curveOf(sheet.objects?.[c.object]?.selector ?? '');
    if (!cv?.samples) continue;
    const a = anchorAt(landsAt(c), eventsOf(cv));
    if (a) c.anchor = a;
  }
  const used = new Set(sheet.cues.map((c) => c.object).filter(Boolean));
  if (sheet.objects) for (const id of Object.keys(sheet.objects)) if (!used.has(id)) delete sheet.objects[id];
}

/** The hover readout at one step of the graph. */
export function readAt(cv: Curve, i: number) {
  const p = cv.samples[i], secs = (t: number) => `${t.toFixed(2)} s`;
  const turned = p.length > 7 && (Math.abs(p[6]) >= 1 || p[7] >= 1)
    ? ` · turned ${[Math.abs(p[6]) >= 1 ? `${Math.round(p[6])}°` : '', p[7] >= 1 ? `${Math.round(p[7])}° tilt` : ''].filter(Boolean).join(', ')}${cv.turn?.[i] >= 2 ? ` (${Math.round(cv.turn[i])}°/s)` : ''}`
    : '';
  return `${secs(p[0])} · moving ${Math.round(cv.move[i])} px/s · ${Math.round(p[3])} × ${Math.round(p[4])} px${cv.grow[i] >= 1 ? `, changing ${Math.round(cv.grow[i])} px/s` : ''}${turned} · ${Math.round(p[5] * 100)}% shown`;
}
