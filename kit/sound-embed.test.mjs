import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RATE, alike, dot, mono, pack, parseArgs, pending, rank, silent, unit, unpack } from './sound-embed.mjs';

const v = (...xs) => unit(Float32Array.from(xs));

test('a decoded sound becomes one channel, cut to what the model hears', () => {
  const stereo = { samples: Float32Array.from([1, 0, 0.5, 0.5, -1, 1]), channels: 2, sampleRate: RATE };
  assert.deepEqual([...mono(stereo)], [0.5, 0.5, 0]);
  const long = { samples: new Float32Array(RATE * 3), channels: 1, sampleRate: RATE };
  assert.equal(mono(long, 2).length, RATE * 2);
  assert.throws(() => mono({ samples: new Float32Array(4), channels: 1, sampleRate: 44100 }), /48000/);
});

test('silence is told apart from a quiet sound', () => {
  assert.equal(silent(new Float32Array(100)), true);
  assert.equal(silent(Float32Array.from([0, 0, 0.01])), false);
});

test('embeddings are compared at length 1, and survive the cache', () => {
  const a = v(3, 4);
  assert.ok(Math.abs(dot(a, a) - 1) < 1e-6);
  assert.deepEqual([...unit(new Float32Array(2))], [0, 0]); // nothing to scale: no NaN
  assert.deepEqual([...unpack(pack(a))], [...a]);
});

test('a search ranks the closest sounds first, and "like" leaves the sound itself out', () => {
  const sounds = [{ path: 'b.wav', v: v(1, 0.2) }, { path: 'a.wav', v: v(0, 1) }, { path: 'c.wav', v: v(1, 0) }];
  assert.deepEqual(rank(v(1, 0), sounds, 2).map((s) => s.path), ['c.wav', 'b.wav']);
  assert.deepEqual(alike('c.wav', sounds).map((s) => s.path), ['b.wav', 'a.wav']);
  assert.deepEqual(alike('gone.wav', sounds), []);
});

test('only new or changed sounds are embedded again, and another model starts over', () => {
  const cache = { model: 'm', sounds: { 'a.wav': { key: '1|1', v: 'x' }, 'b.wav': { key: '1|1', v: 'y' }, 'gone.wav': { key: '1|1', v: 'z' } } };
  const files = [{ path: 'a.wav', key: '1|1' }, { path: 'b.wav', key: '2|9' }, { path: 'new.wav', key: '3|3' }];
  const r = pending(files, cache, 'm');
  assert.deepEqual(Object.keys(r.keep), ['a.wav']);
  assert.deepEqual(r.todo.map((f) => f.path), ['b.wav', 'new.wav']);
  assert.equal(pending(files, cache, 'other').todo.length, 3);
  assert.equal(pending(files, null, 'm').todo.length, 3);
});

test('the command takes searches in words or by example, and refuses what it does not know', () => {
  assert.deepEqual(parseArgs(['soft  paper rustle', '--n', '3']), { queries: ['soft paper rustle'], like: null, n: 3, json: false });
  assert.deepEqual(parseArgs(['--like', 'ui/pop.wav', '--json']), { queries: [], like: 'ui/pop.wav', n: 8, json: true });
  assert.ok(parseArgs([]).error);
  assert.ok(parseArgs(['x', '--n', '0']).error);
  assert.ok(parseArgs(['x', '--loud']).error);
  assert.ok(parseArgs(['--like']).error);
  assert.ok(parseArgs(['x'.repeat(201)]).error);
});
