// The example's sounds are generated here, from nothing but maths and a seeded PRNG, so it ships with sounds it
// owns (no samples, no licences). `node example/sounds/make-sounds.mjs` rebuilds them, byte for byte.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const OUT = dirname(fileURLToPath(import.meta.url));
const TAU = Math.PI * 2;

// --- tools -----------------------------------------------------------------------------------------------

/** Seeded PRNG (mulberry32): returns () => number in [0, 1). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const makeNoise = (seed) => { const r = mulberry32(seed); return () => r() * 2 - 1; };

const buf = (seconds) => new Float32Array(Math.round(seconds * SR));
const lerp = (a, b, x) => a + (b - a) * x;
const expDrop = (a, b, x) => a * Math.pow(b / a, x); // exponential glide from a to b as x goes 0..1
const smooth = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

/** State-variable band-pass over `src`; `fc(t)` is the centre in Hz at time t, `q` the sharpness. */
function bandpass(src, fc, q) {
  const out = new Float32Array(src.length);
  let low = 0, band = 0;
  for (let i = 0; i < src.length; i++) {
    const f = 2 * Math.sin(Math.PI * Math.min(fc(i / SR), SR / 6) / SR);
    low += f * band;
    const high = src[i] - low - band / q;
    band += f * high;
    out[i] = band * Math.sqrt(1000 / Math.max(f * SR / (2 * Math.PI), 200)); // even out loudness as the centre moves
  }
  return out;
}
/** One-pole low-pass (cut in Hz) and high-pass. */
function lowpass(src, cut) {
  const a = 1 - Math.exp(-TAU * cut / SR), out = new Float32Array(src.length);
  let y = 0;
  for (let i = 0; i < src.length; i++) out[i] = y += a * (src[i] - y);
  return out;
}
const highpass = (src, cut) => { const lp = lowpass(src, cut); return src.map((v, i) => v - lp[i]); };

/** Sine whose frequency follows `freq(t)`, scaled by `amp(t)`. */
function tone(len, freq, amp) {
  const out = buf(len);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    ph += TAU * freq(t) / SR;
    out[i] = Math.sin(ph) * amp(t);
  }
  return out;
}
const white = (len, noise) => buf(len).map(() => noise());
/** Adds `src` into `dst` starting at `at` seconds, times `gain`. */
function mixIn(dst, src, at = 0, gain = 1) {
  const o = Math.round(at * SR);
  for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * gain;
}
const decay = (tau) => (t) => Math.exp(-t / tau);
const attackDecay = (att, tau) => (t) => Math.min(1, t / att) * Math.exp(-t / tau);
/** Multiplies a buffer by an envelope of time. */
const shape = (b, env) => b.map((v, i) => v * env(i / SR));
/** Bell-shaped swell: rises to its peak at `peak` seconds, falls to 0 at `end`. */
const swell = (peak, end, rise = 1.6, fall = 1.6) => (t) =>
  t < peak ? Math.pow(Math.sin((t / peak) * Math.PI / 2), rise) : Math.pow(Math.cos(((t - peak) / (end - peak)) * Math.PI / 2), fall) * (t < end ? 1 : 0);

/** Finishes a sound: fade-in against clicks, raised-cosine fade-out tail, normalise the peak to -1 dBFS. */
function finish(b, { fadeIn = 0.004, fadeOut = 0.05 } = {}) {
  const fi = Math.round(fadeIn * SR), fo = Math.round(fadeOut * SR);
  for (let i = 0; i < fi; i++) b[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fi);
  for (let i = 0; i < fo; i++) b[b.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fo);
  let peak = 0;
  for (const v of b) peak = Math.max(peak, Math.abs(v));
  const g = peak ? Math.pow(10, -1 / 20) / peak : 1;
  return b.map((v) => v * g);
}

/** 16-bit mono 44.1 kHz WAV bytes. */
function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

// --- shared building blocks --------------------------------------------------------------------------------

/** A tiny noisy tick: band-passed noise with a very fast decay. */
const tick = (noise, len, centre, tau, q = 1.2) => shape(bandpass(white(len, noise), () => centre, q), decay(tau));
/** A keyboard key: a bright tick plus a short low body thump. `tone` shifts the pitch, `len` is the length. */
function keyHit(noise, len, pitch = 1) {
  const b = tick(noise, len, 2600 * pitch, 0.006, 0.9);
  mixIn(b, tone(len, () => 170 * pitch, attackDecay(0.0008, 0.012)), 0, 0.9);
  return b;
}

// --- the sounds --------------------------------------------------------------------------------------------

/** Airy whoosh: band-passed noise, its centre sweeping up then down, peaking at 0.35 s. */
function softWhoosh() {
  const noise = makeNoise(1);
  const b = bandpass(white(0.7, noise), (t) => 500 + 2600 * Math.sin(Math.PI * Math.min(t / 0.7, 1)), 1.4);
  return finish(shape(b, swell(0.35, 0.7, 1.5, 1.5)), { fadeOut: 0.12 });
}
/** Fast bright swipe, for a title leaving: noise sweeping quickly upward, peak ~0.12 s. */
function quickSwish() {
  const noise = makeNoise(2);
  const b = bandpass(white(0.35, noise), (t) => expDrop(1200, 8000, Math.min(t / 0.3, 1)), 1.8);
  return finish(shape(b, swell(0.12, 0.35, 1.2, 1.8)), { fadeOut: 0.1 });
}
/** Rising airy swell that resolves into a soft tone, for a title arriving; peak near 0.5 s. */
function titleSwell() {
  const noise = makeNoise(3);
  const air = bandpass(white(0.6, noise), (t) => expDrop(700, 4200, Math.min(t / 0.5, 1)), 1.3);
  const b = shape(air, (t) => (t < 0.5 ? Math.pow(t / 0.5, 2.2) : Math.exp(-(t - 0.5) / 0.03)));
  // a quiet two-note bloom as the air lands
  mixIn(b, tone(0.2, () => 659.3, attackDecay(0.02, 0.08)), 0.46, 0.25);
  mixIn(b, tone(0.2, () => 987.8, attackDecay(0.02, 0.08)), 0.46, 0.12);
  return finish(b, { fadeIn: 0.005, fadeOut: 0.08 });
}
/** Rubber ball on a floor: pitched thump (180 -> 70 Hz) plus a short noise transient. */
function ballBounce() {
  const noise = makeNoise(4), len = 0.45, hit = 0.005;
  const b = buf(len);
  mixIn(b, tone(0.4, (t) => expDrop(180, 70, Math.min(t / 0.08, 1)), attackDecay(0.002, 0.07)), hit, 1);
  mixIn(b, shape(lowpass(white(0.05, noise), 3500), decay(0.006)), hit, 0.45);
  mixIn(b, tone(0.3, (t) => expDrop(360, 140, Math.min(t / 0.06, 1)), attackDecay(0.002, 0.03)), hit, 0.25);
  return finish(b, { fadeIn: 0.003, fadeOut: 0.12 });
}
/** Deep soft cinematic thud with a short low tail, for something landing. */
function softImpact() {
  const noise = makeNoise(5);
  const b = buf(0.8);
  mixIn(b, tone(0.8, (t) => expDrop(95, 42, Math.min(t / 0.25, 1)), attackDecay(0.004, 0.2)), 0.004, 1);
  mixIn(b, shape(lowpass(white(0.15, noise), 260), decay(0.03)), 0.004, 0.8);
  mixIn(b, tone(0.8, () => 31, attackDecay(0.01, 0.3)), 0.004, 0.35); // sub weight
  return finish(b, { fadeIn: 0.004, fadeOut: 0.25 });
}
/** Round bubbly pop: a short sine blip whose pitch falls fast. */
function popOf(startHz, endHz, len, seed) {
  const noise = makeNoise(seed);
  const b = tone(len, (t) => expDrop(startHz, endHz, Math.min(t / 0.05, 1)), attackDecay(0.002, 0.035));
  mixIn(b, tone(len, (t) => 2 * expDrop(startHz, endHz, Math.min(t / 0.05, 1)), attackDecay(0.001, 0.012)), 0, 0.18);
  mixIn(b, shape(bandpass(white(0.01, noise), () => 3000, 1), decay(0.002)), 0, 0.12);
  return finish(b, { fadeIn: 0.002, fadeOut: 0.06 });
}
const pop = () => popOf(720, 260, 0.2, 6);
const popHigh = () => popOf(1100, 430, 0.18, 7);
/** Crisp UI click, like a trackpad. */
function click() {
  const noise = makeNoise(8), b = buf(0.08);
  mixIn(b, tick(noise, 0.03, 3200, 0.003, 1.0), 0, 1);
  mixIn(b, tone(0.03, () => 1500, attackDecay(0.0005, 0.004)), 0, 0.5);
  return finish(b, { fadeIn: 0.001, fadeOut: 0.03 });
}
/** Toggle latch: two tiny transients close together, the second a little heavier. */
function latch() {
  const noise = makeNoise(9), b = buf(0.15);
  mixIn(b, tick(noise, 0.04, 3500, 0.003, 1.0), 0.002, 0.7);
  mixIn(b, tone(0.04, () => 1700, attackDecay(0.0005, 0.004)), 0.002, 0.3);
  mixIn(b, tick(noise, 0.06, 2200, 0.006, 0.9), 0.04, 1);
  mixIn(b, tone(0.08, () => 220, attackDecay(0.001, 0.02)), 0.04, 0.7);
  return finish(b, { fadeIn: 0.001, fadeOut: 0.06 });
}
/** One soft keyboard key. */
function keyTap() {
  const noise = makeNoise(10);
  return finish(keyHit(noise, 0.06), { fadeIn: 0.001, fadeOut: 0.02 });
}
/** Quick typing: ~14 taps at slightly uneven intervals, levels and tone. */
function typing() {
  const noise = makeNoise(11), r = mulberry32(111), b = buf(1.6);
  let t = 0.005;
  for (let n = 0; n < 14; n++) {
    mixIn(b, keyHit(noise, 0.06, 0.85 + r() * 0.35), t, 0.55 + r() * 0.45);
    t += 0.08 + r() * 0.07 + (n % 5 === 4 ? 0.06 : 0); // a small hesitation every few keys
  }
  return finish(b, { fadeIn: 0.001, fadeOut: 0.1 });
}
/** One soft bell: a sine, a faint inharmonic partial and an octave, with exponential decay. */
function bell(hz, len, tau) {
  const b = tone(len, () => hz, attackDecay(0.003, tau));
  mixIn(b, tone(len, () => hz * 2.76, attackDecay(0.002, tau * 0.35)), 0, 0.12);
  mixIn(b, tone(len, () => hz * 2, attackDecay(0.002, tau * 0.6)), 0, 0.18);
  return b;
}
/** Friendly two-note chime a fifth apart, for "copied". */
function successChime() {
  const b = buf(0.9);
  mixIn(b, bell(880, 0.9, 0.22), 0.005, 0.8);
  mixIn(b, bell(1318.5, 0.75, 0.25), 0.15, 1);
  return finish(b, { fadeIn: 0.003, fadeOut: 0.25 });
}
/** A card sliding over a desk: filtered noise with a soft rise and fall and a little grain. */
function paperSlide() {
  const noise = makeNoise(12), grainNoise = makeNoise(112);
  const grain = lowpass(white(0.6, grainNoise), 90);
  const body = bandpass(white(0.6, noise), (t) => 2600 + 900 * Math.sin(t * 5), 0.9);
  const b = body.map((v, i) => v * (0.7 + 3 * grain[i]) * swell(0.24, 0.6, 1.4, 1.2)(i / SR));
  return finish(highpass(b, 500), { fadeIn: 0.005, fadeOut: 0.15 });
}
/** Light camera shutter: two quick mechanical clicks with a short noise burst between. */
function shutter() {
  const noise = makeNoise(13), b = buf(0.35);
  mixIn(b, tick(noise, 0.04, 3800, 0.004, 1.1), 0.004, 1);
  mixIn(b, tone(0.04, () => 900, attackDecay(0.0005, 0.006)), 0.004, 0.5);
  mixIn(b, shape(bandpass(white(0.05, noise), () => 5500, 0.8), (t) => Math.sin(Math.PI * t / 0.05)), 0.03, 0.35);
  mixIn(b, tick(noise, 0.08, 2300, 0.01, 1.0), 0.085, 0.85);
  mixIn(b, tone(0.12, () => 620, attackDecay(0.001, 0.03)), 0.085, 0.45);
  return finish(b, { fadeIn: 0.001, fadeOut: 0.12 });
}

// name -> builder
const SOUNDS = {
  'soft-whoosh': softWhoosh, 'quick-swish': quickSwish, 'title-swell': titleSwell, 'ball-bounce': ballBounce,
  'soft-impact': softImpact, 'pop': pop, 'pop-high': popHigh, 'click': click, 'latch': latch, 'key-tap': keyTap,
  'typing': typing, 'success-chime': successChime, 'paper-slide': paperSlide, 'shutter': shutter,
};

for (const [name, build] of Object.entries(SOUNDS)) writeFileSync(join(OUT, `${name}.wav`), wav(build()));
console.log(`wrote ${Object.keys(SOUNDS).length} sounds to ${OUT}`);
