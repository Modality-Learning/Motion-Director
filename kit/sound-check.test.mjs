import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envelope, hitOf, loudest, overlaps, quiet, readWav, usage } from './sound-check.mjs';

const LIB = { sounds: { 'pop.wav': { hit: 0.05 } } };
const AN = { 'pop.wav': { length: 0.5, hit: 0.05 }, 'whoosh.wav': { length: 1, hit: 0.3 } };
const cue = (id, sound, at, more = {}) => ({ id, sound, at, track: 0, ...more });

test('a clip lands at its hit point: the sound\'s, at the clip\'s speed', () => {
  assert.equal(hitOf(cue('a', 'pop.wav', 2), LIB, AN), 2.05);
  assert.equal(hitOf(cue('b', 'pop.wav', 2, { rate: 0.5 }), LIB, AN), 2.1);
});

test('a run of hits close together is one moment; spread-out uses are counted apart', () => {
  // a week filling: 5 pops 0.1 s apart, then the same pop alone at 5, 9, 12, 15 and 20 s
  const run = [0, 0.1, 0.2, 0.3, 0.4].map((t, i) => cue(`r${i}`, 'pop.wav', t, { rate: 1.1 + i / 10 }));
  const apart = [5, 9, 12, 15, 20].map((t, i) => cue(`s${i}`, 'pop.wav', t));
  const [u] = usage({ cues: [...run, ...apart] }, LIB, AN);

  assert.equal(u.clips, 10);
  assert.equal(u.moments, 6);
  assert.match(u.flags.join('\n'), /heard at 6 separate moments/);
  assert.match(u.flags.join('\n'), /5 clips at the same pitch \(1×\) across 5 moments/);
});

test('a sound repeated with its pitch varied, at few moments, is not flagged', () => {
  const cues = [3, 8, 13].map((t, i) => cue(`w${i}`, 'whoosh.wav', t, { rate: [0.9, 1, 1.1][i] }));

  assert.deepEqual(usage({ cues }, LIB, AN)[0].flags, []);
});

test('muted clips are not heard, so not counted', () => {
  const cues = [1, 4, 8].map((t, i) => cue(`m${i}`, 'whoosh.wav', t, { mute: i > 0 }));

  assert.equal(usage({ cues }, LIB, AN)[0].clips, 1);
});

test('clips that overlap on one track are named; on different tracks or objects they are not', () => {
  const sheet = { cues: [cue('a', 'whoosh.wav', 1), cue('b', 'whoosh.wav', 1.5), cue('c', 'whoosh.wav', 1.2, { track: 1 }), cue('d', 'whoosh.wav', 1.2, { object: 'ox' })] };

  assert.deepEqual(overlaps(sheet, LIB, AN), [{ lane: 'track 1', first: 'a', second: 'b', by: 0.5 }]);
});

test('quiet stretches and the loudest moments come from the mix\'s envelope', () => {
  // 100 windows of 10 ms: loud at 0.1 s and 0.9 s, silent between
  const env = Array.from({ length: 100 }, (_, i) => (i === 10 ? 0.5 : i === 90 ? 0.25 : 0.0001));
  const e = { env, step: 0.01 };

  assert.deepEqual(quiet(e, { min: 0.5 }), [[0.11, 0.9]]);
  assert.deepEqual(loudest(e, 2, 0.5).map((l) => l.t), [0.1, 0.9]);
  assert.equal(loudest(e, 1)[0].db, -6);
});

test('the envelope steps by whole samples, so its times don\'t drift', () => {
  // 44.1 kHz in "2 ms" windows is 88 samples, 1.995 ms: counting 2 ms would put 12 s at 12.03 s
  const { step } = envelope(new Float32Array(44100 * 2), 2, 44100, 0.002);

  assert.equal(step, 88 / 44100);
});

test('a 24-bit WAV reads back as floats', () => {
  const frames = [0, 4194304, -8388608]; // 0, +0.5, -1
  const data = Buffer.alloc(frames.length * 3); frames.forEach((v, i) => data.writeIntLE(v, i * 3, 3));
  const fmt = Buffer.alloc(16); fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(48000, 4); fmt.writeUInt16LE(24, 14);
  const chunk = (id, b) => Buffer.concat([Buffer.from(id), Buffer.from(Uint32Array.of(b.length).buffer), b]);
  const body = Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', fmt), chunk('data', data)]);
  const w = readWav(Buffer.concat([Buffer.from('RIFF'), Buffer.from(Uint32Array.of(body.length).buffer), body]));

  assert.deepEqual([...w.samples], [0, 0.5, -1]);
  assert.equal(w.sampleRate, 48000);
});
