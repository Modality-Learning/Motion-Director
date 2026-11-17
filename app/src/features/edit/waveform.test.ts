import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './kit';
import { gainY } from './geometry';
import { EQ_BARS, edGeom, edHandleAt, eqStep, findHit, levels } from './waveform';

describe('waveforms', () => {
  it('take the loudest sample in each column, across every channel', () => {
    const { peak } = levels([[0, 0.5, -0.9, 0.1, 0.2, -0.3], [0, 0, 0, 0, 0, -0.7]], 0, 6, 3);
    [0.5, 0.9, 0.7].forEach((v, i) => expect(peak[i]).toBeCloseTo(v));
  });
  it('give each column its RMS level, so a quiet click under a loud peak reads as quiet', () => {
    const d = new Float32Array(200);
    d[10] = 0.8; // a single click: a tall peak, little level
    d.fill(0.5, 100, 200); // a steady tone: its level is its height
    const { peak, rms } = levels([d], 0, 200, 2);
    expect(peak[0]).toBeCloseTo(0.8); expect(rms[0]).toBeLessThan(0.1);
    expect(rms[1]).toBeCloseTo(0.5);
  });
  it('map a slice of the file evenly, even with more columns than samples', () => {
    const d = Float32Array.from({ length: 100 }, (_, i) => (i === 40 ? 1 : 0)); // a click at sample 40
    const { peak } = levels([d], 20, 60, 400); // ten columns a sample
    const at = peak.findIndex((v) => v === 1);
    expect(at).toBe(200); // (40 - 20) / 40 of the way across
    expect(peak.filter((v) => v === 1)).toHaveLength(10);
  });
  it('find the hit at the loudest 10 ms in the kept part', () => {
    const sr = 1000, d = new Float32Array(2000);
    d.fill(0.9, 300, 310); // a loud click at 0.3 s
    d.fill(0.5, 1500, 1510); // a quieter one at 1.5 s
    expect(findHit(d, sr, 0, 2)).toBeCloseTo(0.3);
    expect(findHit(d, sr, 1, 2)).toBeCloseTo(1.5); // the first is trimmed away
  });
});

describe('the sound editor', () => {
  const gm = edGeom(2, 420, 240), s = { ...DEFAULTS, from: 0.5, to: 1.5, hit: 1, fadeIn: 0.2 };
  it('maps the whole file across the canvas inside its padding', () => {
    expect(gm.x(0)).toBe(10); expect(gm.x(2)).toBe(410); expect(gm.t(210)).toBe(1);
  });
  it('takes hold of what is under the pointer', () => {
    expect(edHandleAt(s, gm, gm.x(0.5), 120)).toBe('from');
    expect(edHandleAt(s, gm, gm.x(1.5), 120)).toBe('to');
    expect(edHandleAt(s, gm, gm.x(0.7), 5)).toBe('fadeIn');
    expect(edHandleAt(s, gm, gm.x(1), 235)).toBe('hit');
    expect(edHandleAt(s, gm, gm.x(0.8), gainY(0, 240))).toBe('gain');
    expect(edHandleAt(s, gm, gm.x(0.1), 60)).toBeNull();
  });
});

describe('the equaliser', () => {
  it('rises at once and falls back gently', () => {
    const bars = new Float32Array(EQ_BARS), loud = new Uint8Array(128).fill(255);
    expect(eqStep(bars, loud)).toBe(true);
    expect(bars[0]).toBe(1);
    eqStep(bars, null);
    expect(bars[0]).toBeCloseTo(0.86);
    for (let i = 0; i < 60; i++) eqStep(bars, null);
    expect(eqStep(bars, null)).toBe(false);
  });
});
