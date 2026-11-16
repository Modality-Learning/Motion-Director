import { describe, expect, it } from 'vitest';
import { matches, ownUses, parseTags, soundsInfo, withUses } from './sound-info';

const lib = { sounds: { 'clicks/latch.wav': { tags: ['soft'], uses: ['ui-click', 'logo sting'], description: 'A wooden latch' }, 'whoosh-air.wav': { uses: ['transition'] } } };
const analysis = { 'clicks/latch.wav': { ok: true, length: 0.3, attack: 0.01, brightness: 4000, active: 0.2, onsetRate: 1 } };
const info = soundsInfo([{ path: 'clicks/latch.wav' }, { path: 'whoosh-air.wav' }], lib, analysis, () => 2);

describe('the library', () => {
  it('shelves each sound by family, with its traits and what it was marked good for', () => {
    expect(info[0]).toMatchObject({ family: 'clicks', traits: ['short', 'sharp', 'bright'], tags: ['soft'], len: 0.3 });
    expect(info[1]).toMatchObject({ family: 'whooshes', traits: [], len: 2 });
  });
  it('finds sounds by name, family, tag, use, description and trait', () => {
    const find = (q: string) => info.filter((x) => matches(x, q, new Set())).map((x) => x.path);
    expect(find('latch')).toEqual(['clicks/latch.wav']);
    expect(find('Whooshes')).toEqual(['whoosh-air.wav']);
    expect(find('soft')).toEqual(['clicks/latch.wav']);
    expect(find('transition')).toEqual(['whoosh-air.wav']);
    expect(find('wooden')).toEqual(['clicks/latch.wav']);
    expect(find('bright')).toEqual(['clicks/latch.wav']);
    expect(find('')).toHaveLength(2);
  });
  it('keeps only sounds with every trait asked for', () => {
    expect(info.filter((x) => matches(x, '', new Set(['short', 'sharp']))).map((x) => x.path)).toEqual(['clicks/latch.wav']);
    expect(info.filter((x) => matches(x, '', new Set(['long'])))).toEqual([]);
  });
  it('offers your own uses from every sound', () => {
    expect(ownUses(lib)).toEqual(['logo sting']);
  });
  it('stores the built-in uses in their own order, then yours', () => {
    expect(withUses({}, ['my use', 'impact', 'ui-click']).uses).toEqual(['ui-click', 'impact', 'my use']);
    expect(withUses({ uses: ['impact'], gain: -3 }, [])).toEqual({ gain: -3 });
  });
  it('reads tags as typed', () => {
    expect(parseTags(' Soft, logo,soft ,, UI')).toEqual(['soft', 'logo', 'ui']);
  });
});
