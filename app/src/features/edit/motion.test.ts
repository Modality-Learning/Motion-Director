import { describe, expect, it } from 'vitest';
import { analyseCurve, anchorAt, eventsOf, hitTimeOf, reanchor } from './motion';
import type { Sample, Sheet } from './types';

/* an element that slides in from the left between 1 s and 1.5 s, stops, and leaves at 3 s */
function slide(): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i <= 100; i++) {
    const t = round(i * 0.04), u = Math.min(1, Math.max(0, (t - 1) / 0.5));
    out.push([t, -200 + 600 * u, 300, 100, 50, t >= 3 ? 0 : 1, 0, 0]);
  }
  return out;
}
const round = (v: number) => Math.round(v * 1000) / 1000;

describe('measuring how an element moves', () => {
  const cv = analyseCurve(slide());
  it('finds where it moves fastest and where it lands', () => {
    const peak = cv.marks.find((m) => m.kind === 'peak'), stop = cv.marks.find((m) => m.kind === 'stop');
    expect(peak?.line).toBe('moves');
    expect(peak!.t).toBeGreaterThan(1); expect(peak!.t).toBeLessThan(1.5);
    expect(stop!.t).toBeGreaterThan(1.4); expect(stop!.t).toBeLessThan(1.6);
  });
  it('finds where it leaves', () => {
    expect(cv.marks.find((m) => m.kind === 'out')?.t).toBe(3);
  });
  it('draws a curve that barely changes flat', () => {
    const still = analyseCurve(slide().map((p) => [p[0], 0, 0, 10, 10, 1, 0, 0]));
    expect(still.nm.every((v) => v === 0)).toBe(true);
    expect(still.marks.filter((m) => m.kind !== 'in' && m.kind !== 'out')).toEqual([]);
  });
  it('counts an element on screen from the start as arriving at 0', () => {
    expect(eventsOf(cv)[0]).toEqual({ kind: 'in', t: 0 });
  });
});

describe('anchors', () => {
  const evs = eventsOf(analyseCurve(slide()));
  it('name the nearest event, which of its kind it is, and when', () => {
    const stop = evs.find((e) => e.kind === 'stop')!;
    expect(anchorAt(stop.t + 0.05, evs)).toEqual({ kind: 'stop', n: 0, t: round(stop.t) });
    expect(anchorAt(2.95, evs)?.kind).toBe('out');
    expect(anchorAt(1, [])).toBeNull();
  });
  it('are given to every object clip, and objects with no clips are let go', () => {
    const sheet: Sheet = { master: 0, cues: [{ id: 'c1', sound: 'a.wav', at: 2.9, object: 'o1' }, { id: 'c2', sound: 'a.wav', at: 1 }],
      objects: { o1: { label: 'Card', selector: '#card' }, o2: { label: 'Gone', selector: '#gone' } } };
    const cv = analyseCurve(slide());
    reanchor(sheet, (s) => (s === '#card' ? cv : undefined), (c) => c.at!);
    expect(sheet.cues[0].anchor?.kind).toBe('out');
    expect(sheet.cues[1].anchor).toBeUndefined();
    expect(Object.keys(sheet.objects!)).toEqual(['o1']);
  });
});

describe('where a clip lands', () => {
  it('is its hit point on the film, set or measured, else its start', () => {
    const lib = { sounds: { 'a.wav': { from: 0.2 } } };
    expect(hitTimeOf({ id: 'c', sound: 'a.wav', at: 5, hit: 0.6 }, lib, {}, [])).toBeCloseTo(5.4);
    expect(hitTimeOf({ id: 'c', sound: 'a.wav', at: 5, rate: 2 }, lib, { 'a.wav': { hit: 1.2 } }, [])).toBeCloseTo(5.5);
    expect(hitTimeOf({ id: 'c', sound: 'a.wav', at: 5 }, lib, {}, [])).toBe(5);
    expect(hitTimeOf({ id: 'c', sound: 'a.wav', at: 5, hit: 0.1 }, lib, {}, [])).toBe(5); // trimmed away
  });
});
