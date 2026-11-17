import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './kit';
import { G, GUT, MUSIC, PAD, TRK, dragModeAt, dragTo, freeTrack, freeze, gainY, laneOf, layerRows, lenOf, placeAt, ppsFor, readout, removeTrack, startOf, ticks, trackCount, usedTracks, yGain, type DragStart } from './geometry';
import type { Cue, Sheet } from './types';

const sheet = (cues: Cue[], extra: Partial<Sheet> = {}): Sheet => ({ master: 0, cues, ...extra });
const cue = (id: string, at: number, track = 0, more: Partial<Cue> = {}): Cue => ({ id, sound: 'a.wav', at, track, ...more });

describe('gain and its line', () => {
  it('puts the loudest volume at the top and the quietest at the bottom', () => {
    expect(gainY(G.max, 40)).toBe(0);
    expect(gainY(G.min, 40)).toBe(40);
  });
  it('reads a point on the line back in half-dB steps, within the range', () => {
    expect(yGain(gainY(0, 44), 44)).toBe(0);
    expect(yGain(gainY(-6.3, 44), 44)).toBe(-6.5);
    expect(yGain(-20, 44)).toBe(G.max);
    expect(yGain(500, 44)).toBe(G.min);
  });
});

describe('the time axis', () => {
  it('fills the visible width with the whole film at zoom 1, and scales with zoom', () => {
    const k = ppsFor(1000, 10, 1);
    expect(GUT + 10 * k + PAD).toBeCloseTo(1000);
    expect(ppsFor(1000, 10, 4)).toBeCloseTo(4 * k);
  });
  it('labels a tick every few seconds, more often when zoomed in', () => {
    expect(ticks(20, 10).filter((t) => t.major).map((t) => t.t)).toEqual([0, 5, 10]);
    expect(ticks(200, 1).filter((t) => t.major).map((t) => t.t)).toEqual([0, 0.5, 1]);
  });
});

describe('clips', () => {
  it('start at their time, or at their moment plus its offset', () => {
    const moments = [{ id: 'fold', times: [3, 7] }];
    expect(startOf(cue('a', 2), moments)).toBe(2);
    expect(startOf({ id: 'b', sound: 'a.wav', moment: 'fold', offset: -0.1 }, moments)).toBeCloseTo(2.9);
    expect(startOf({ id: 'c', sound: 'a.wav', moment: 'start' }, moments)).toBe(0);
  });
  it('are placed freely once moved', () => {
    const c: Cue = { id: 'b', sound: 'a.wav', moment: 'fold', offset: 0.5 };
    freeze(c, [{ id: 'fold', times: [3] }]);
    expect(c).toEqual({ id: 'b', sound: 'a.wav', at: 3.5 });
  });
  it('play for their trimmed length at their speed, half a second until the file is known', () => {
    const lib = { sounds: { 'a.wav': { from: 0.5 } } };
    expect(lenOf(cue('a', 0, 0, { rate: 2 }), lib, 4.5)).toBe(2);
    expect(lenOf(cue('a', 0, 0, { to: 1.5 }), lib, 4.5)).toBe(1);
    expect(lenOf(cue('a', 0), lib, null)).toBe(0.5);
  });
});

describe('tracks', () => {
  it('count the ones your clips use, the saved count, and two at least when nothing says', () => {
    expect(trackCount(sheet([]))).toBe(2);
    expect(usedTracks(sheet([cue('a', 0, 3)]))).toBe(4);
    expect(trackCount(sheet([cue('a', 0, 3)]))).toBe(5);
    expect(trackCount(sheet([cue('a', 0, 3)], { tracks: 2 }))).toBe(4); // never fewer than the clips need
    expect(trackCount(sheet([], { tracks: 7 }))).toBe(7);
  });
  it('leave objects\' clips out of the count', () => {
    expect(usedTracks(sheet([cue('a', 0, 9, { object: 'o1' })]))).toBe(0);
  });
  it('take their clips with them when removed, and the tracks below move up', () => {
    const s = sheet([cue('a', 0, 0), cue('b', 0, 1), cue('c', 0, 2), cue('d', 0, 1, { object: 'o1' })], { tracks: 4 });
    removeTrack(s, 1);
    expect(s.cues.map((c) => [c.id, c.track])).toEqual([['a', 0], ['c', 1], ['d', 1]]);
    expect(s.tracks).toBe(3);
  });
  it('give an open object a row to spare', () => {
    expect(layerRows([], false)).toBe(1);
    expect(layerRows([cue('a', 0, 1)], false)).toBe(2);
    expect(layerRows([cue('a', 0, 1)], true)).toBe(3);
  });
  it('find the first track free at a time', () => {
    const s = sheet([cue('a', 1, 0), cue('b', 1, 1), cue('c', 5, 2)]);
    expect(freeTrack(s, null, 1.2, 1, () => 1, [])).toBe(2);
    expect(freeTrack(s, null, 3, 1, () => 1, [])).toBe(0);
    expect(freeTrack(s, 'o1', 1, 1, () => 1, [])).toBe(0);
  });
});

describe('adding at the playhead', () => {
  it('starts the sound there, or with its hit point there', () => {
    const s = { ...DEFAULTS, from: 0.2, hit: 0.7 };
    expect(placeAt(s, 5, false).at).toBe(5);
    expect(placeAt(s, 5, true).at).toBeCloseTo(4.5);
    expect(placeAt({ ...DEFAULTS }, 5, true, { hit: 0.3, length: 2 })).toEqual({ at: 4.7, len: 2 });
  });
});

describe('dragging a clip', () => {
  const s0 = { ...DEFAULTS };
  const d: DragStart = { s0, len0: 2, start0: 4, track0: 1, flen: 2, to0: 2, oy: 20, h: TRK - 8, duration: 10 };
  it('takes an edge to trim, Option on an edge to stretch, the line for volume, else moves', () => {
    expect(dragModeAt(3, 30, 100, 0, 44, false)).toBe('trim-l');
    expect(dragModeAt(97, 30, 100, 0, 44, true)).toBe('stretch-r');
    expect(dragModeAt(50, gainY(0, 44), 100, 0, 44, false)).toBe('gain');
    expect(dragModeAt(50, 2, 100, 0, 44, false)).toBe('move');
  });
  it('moves in time and across tracks', () => {
    expect(dragTo('move', d, 1.5, TRK)).toEqual({ at: 5.5, track: 2 });
    expect(dragTo('move', d, -100, -1000)).toEqual({ at: -30, track: 0 });
  });
  it('trims the start, keeping the rest where it was', () => {
    expect(dragTo('trim-l', d, 0.5, 0)).toEqual({ from: 0.5, at: 4.5 });
  });
  it('trims the end, never past the file', () => {
    expect(dragTo('trim-r', d, -0.5, 0)).toEqual({ to: 1.5 });
    expect(dragTo('trim-r', d, 5, 0)).toEqual({ to: 2 });
  });
  it('stretches from the left edge with its end staying put', () => {
    const r = dragTo('stretch-l', d, -2, 0);
    expect(r.rate).toBe(0.5);
    expect(r.at! + 4).toBeCloseTo(6); // starts 2 s earlier, ends where it did
  });
  it('sets the volume from the line', () => {
    expect(dragTo('gain', d, 0, gainY(-6, 44) - 20)).toEqual({ gain: -6 });
  });
  it('shows what it sets while dragging', () => {
    expect(readout('gain', { ...s0, gain: 3 }, 0, 1)).toBe('+3 dB');
    expect(readout('stretch-r', { ...s0, rate: 1.5 }, 0, 1)).toBe('1.5×');
    expect(readout('move', s0, 1, 2)).toBe('1.00 s · 2.00 s');
  });
});

describe('the music lane', () => {
  const sheet = (): Sheet => ({ master: 0, tracks: 2, cues: [
    { id: 'a', sound: 'a.wav', at: 0, track: 0 },
    { id: 'm', sound: 'music.wav', at: 0, track: 3, music: true },
    { id: 'n', sound: 'music2.wav', at: 10, track: 0, music: true },
  ] });
  it('keeps music out of your own tracks: not counted, and not removed with a track', () => {
    const s = sheet();
    expect(usedTracks(s)).toBe(1); // music on its track 3 doesn't make four tracks
    removeTrack(s, 0);
    expect(s.cues.map((c) => c.id)).toEqual(['m', 'n']);
  });
  it('finds a free music track within the music lane, apart from your own tracks', () => {
    const s = sheet();
    const len = () => 20;
    expect(freeTrack(s, MUSIC, 5, 5, len, [])).toBe(0); // music track 0 is free until 10
    expect(freeTrack(s, MUSIC, 12, 5, len, [])).toBe(1); // and busy from 10
    expect(freeTrack(s, null, 5, 5, len, [])).toBe(1); // your own track 0 is busy; music doesn't count
    expect(laneOf(s.cues[1])).toBe(MUSIC);
  });
});
