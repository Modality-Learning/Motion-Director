import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barTimes, beatPhase, biggestLift, clockOf, fitPlan, onsets, promptText, structureLines, tempoCandidates, tempoNear, tempoOverall, validateBrief } from './music.mjs';

const SR = 11025;
/** A click track: a short burst on every beat from `phase`, louder from `lift` on (a drop), with some noise. */
function clicks({ bpm, phase, seconds = 30, lift = null }) {
  const out = new Float32Array(SR * seconds);
  let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < out.length; i++) out[i] = rand() * 0.01;
  for (let t = phase; t < seconds; t += 60 / bpm) {
    const amp = lift != null && t >= lift ? 0.9 : 0.35;
    for (let i = 0; i < SR * 0.04; i++) { const k = Math.round(t * SR) + i; if (k < out.length) out[k] += amp * Math.exp(-i / (SR * 0.008)) * rand(); }
  }
  return out;
}

test('a brief is checked and tidied: sections in time order, only known fields', () => {
  const { brief } = validateBrief({ bpm: 120, sections: [{ name: 'Drop', at: 8, drop: true, extra: 1 }, { name: ' Intro ', at: 0 }], prompt: { style: 'warm house', x: 1 }, junk: true });
  assert.deepEqual(brief, { bpm: 120, beatsPerBar: 4, offset: 0, sections: [{ name: 'Intro', at: 0 }, { name: 'Drop', at: 8, drop: true }], prompt: { style: 'warm house' } });
  assert.match(validateBrief({ bpm: 400 }).error, /bpm/);
  assert.match(validateBrief({ bpm: 120, sections: [{ name: 'x' }] }).error, /needs a time/);
  assert.match(validateBrief({ bpm: 120, ending: 'explode' }).error, /ending/);
  assert.match(validateBrief({ bpm: 120, prompt: { style: 'x'.repeat(1001) } }).error, /style/);
});

test('tempo candidates put the key moments on bar lines: keys every 2 s suit 120 BPM', () => {
  const best = tempoCandidates([0, 2, 4, 6, 8, 10.002], { min: 90, max: 140 })[0];
  assert.equal(best.bpm, 120);
  assert.ok(best.barError < 0.005, `bar error ${best.barError}`);
  assert.deepEqual(barTimes({ bpm: 120, beatsPerBar: 4, offset: 0 }, 9), [0, 2, 4, 6, 8]);
  assert.deepEqual(tempoCandidates([]), []);
});

test('a track at 118 BPM is measured as 118, with its beats where they are', () => {
  const { onset } = onsets(clicks({ bpm: 118, phase: 0.13 }), SR);
  const bpm = tempoNear(onset, 120);
  assert.ok(Math.abs(bpm - 118) <= 0.1, `measured ${bpm}`);
  assert.ok(Math.abs(beatPhase(onset, bpm) - 0.13) <= 0.02);
});

test('the drop is found where the track gets louder', () => {
  const { onset, energy } = onsets(clicks({ bpm: 120, phase: 0.25, lift: 12.25 }), SR);
  const lift = biggestLift(energy, tempoNear(onset, 120), 0.25);
  assert.ok(Math.abs(lift - 12.25) <= 0.3, `lift at ${lift}`);
});

test('fitting: the rate makes its tempo the brief\'s, and the drop lands on the drop section', () => {
  const brief = { bpm: 120, beatsPerBar: 4, offset: 0, sections: [{ name: 'Intro', at: 0 }, { name: 'Payoff', at: 8, drop: true }] };
  const plan = fitPlan(brief, { bpm: 118, phase: 0.13, lift: 12.25 }, { at: 0, from: 0 });
  assert.equal(plan.rate, 1.0169); // a 118 BPM track speeds up a little to make 120
  // the lift would play 4 s before the film starts: the clip starts at 0 with the track's first 4 s trimmed off
  assert.equal(plan.at, 0);
  assert.ok(Math.abs(plan.at + (12.25 - plan.from) / plan.rate - 8) < 0.002, 'the lift plays at 8 s');
  assert.equal(plan.drop, 'Payoff');
  assert.equal(plan.matched, true);
  assert.match(plan.note, /1\.0169× \(pitch kept\)/);
  // with room before the drop, the clip starts later and nothing is trimmed
  const late = fitPlan(brief, { bpm: 120, phase: 0, lift: 4 }, { at: 0, from: 0 });
  assert.deepEqual([late.at, late.from, late.rate], [4, 0, 1]);
});

test('without a drop it moves the least it can to put beats on beats; a far-off tempo is left alone and said', () => {
  const brief = { bpm: 120, beatsPerBar: 4, offset: 0, sections: [] };
  const near = fitPlan(brief, { bpm: 120, phase: 0.1, lift: null }, { at: 1, from: 0 });
  assert.equal(near.at, 0.9);
  const far = fitPlan(brief, { bpm: 90, phase: 0, lift: null }, { at: 0, from: 0 });
  assert.equal(far.rate, 1);
  assert.match(far.note, /too far from the brief's 120/);
});

test('measured to within a tenth of a beat per minute across tempos, phases and briefs a few BPM away', () => {
  for (const [bpm, phase, briefBpm] of [[92, 0.31, 90], [105.5, 0.02, 108], [128, 0.4, 124], [140, 0.2, 140], [76, 0.6, 80]]) {
    const { onset } = onsets(clicks({ bpm, phase }), SR);
    const got = tempoNear(onset, briefBpm);
    assert.ok(Math.abs(got - bpm) <= 0.1, `${bpm} BPM measured as ${got}`);
    const ph = beatPhase(onset, got), beat = 60 / bpm;
    const off = Math.min(Math.abs(ph - phase), beat - Math.abs(ph - phase));
    assert.ok(off <= 0.02, `${bpm} BPM: phase ${ph}, expected ${phase}`);
  }
});

test('a track that ignored the requested tempo is found out, and its speed is left alone', () => {
  const { onset } = onsets(clicks({ bpm: 95, phase: 0.05 }), SR);
  assert.ok(Math.abs(tempoOverall(onset).bpm - 95) <= 0.1, 'the whole range finds 95');
  const brief = { bpm: 124, beatsPerBar: 4, offset: 0, sections: [] };
  const plan = fitPlan(brief, { bpm: 126.7, phase: 0.05, lift: null, strength: 60, overall: 95, overallStrength: 98 }, { at: 0, from: 0 });
  assert.equal(plan.rate, 1);
  assert.match(plan.note, /seems to run at 95 BPM, not near the brief's 124/);
  assert.equal(plan.matched, false);
  // close to the brief and agreeing with the whole range: corrected as usual
  assert.equal(fitPlan(brief, { bpm: 122, phase: 0, lift: null, strength: 98, overall: 122, overallStrength: 98 }, { at: 0 }).rate, 1.0164);
});

test('the structure counts each section in bars, to the next section and the last to the end', () => {
  const brief = { bpm: 120, beatsPerBar: 4, offset: 0, sections: [{ name: 'Intro', at: 0, note: 'a pad' }, { name: 'Lift', at: 8 }, { name: 'Outro', at: 30 }] };
  assert.deepEqual(structureLines(brief, 35), ['[Intro: 4 bars, a pad]', '[Lift: 11 bars]', '[Outro: 3 bars]']);
  assert.equal(clockOf(95), '1:35');
});

test('a track longer than the film ends with it, faded to suit the ending; a shorter one is said', () => {
  const brief = { bpm: 120, beatsPerBar: 4, offset: 0, sections: [], ending: 'button' };
  const long = fitPlan(brief, { bpm: 120, phase: 0, lift: null, seconds: 147 }, { at: 0, from: 0 }, { duration: 96 });
  assert.deepEqual([long.to, long.fadeOut], [96, 1]);
  assert.match(long.note, /runs to 2:27: it ends with the film at 1:36, fading out over 1 s/);
  assert.equal(fitPlan({ ...brief, ending: 'fade' }, { bpm: 120, phase: 0, lift: null, seconds: 147 }, { at: 0 }, { duration: 96 }).fadeOut, 4);
  const short = fitPlan(brief, { bpm: 120, phase: 0, lift: null, seconds: 30 }, { at: 0 }, { duration: 96 });
  assert.equal(short.to, null);
  assert.match(short.note, /ends at 30\.0 s, before the film does \(96 s\)/);
});

test('the prompt says how long the track should be, and ends on [End]', () => {
  const brief = { bpm: 101, length: 35, sections: [], prompt: { style: 'Instrumental, light playful pop, 101 BPM.', structure: '[Instrumental]\n[Intro: 2 bars]' } };
  assert.equal(promptText(brief), 'Instrumental, light playful pop, 101 BPM, 0:35 long, ending at 0:35\n\n[Instrumental]\n[Intro: 2 bars]\n[End]');
  // a style that already names a length keeps its own
  assert.match(promptText({ ...brief, prompt: { style: 'pop, 0:40 long' } }), /^pop, 0:40 long$/);
});

test('a lift far from the drop is not lined up on it: a track the right length stays under the whole film', () => {
  // the case that cut a track in half: 95.6 s at 125 BPM for a 96 s film, its strongest lift near the end
  const brief = { bpm: 124, beatsPerBar: 4, offset: 0.47, sections: [{ name: 'Claude makes it', at: 31.44, drop: true }], ending: 'button' };
  const track = { bpm: 125.22, phase: 0.363, seconds: 95.6, lifts: [{ t: 79.42, lift: 0.63 }, { t: 11.38, lift: 0.47 }, { t: 20.97, lift: 0.37 }] };
  const plan = fitPlan(brief, track, { at: 0.34, from: 0 }, { duration: 96 });
  assert.ok(plan.at < 1 && plan.from < 1, `placed at ${plan.at}, from ${plan.from}`);
  assert.equal(plan.drop, null);
  assert.match(plan.note, /no clear lift near "Claude makes it"/);
  // a strong lift near where the drop falls is put on it
  const near = fitPlan(brief, { ...track, lifts: [{ t: 79.42, lift: 0.63 }, { t: 33.1, lift: 0.6 }] }, { at: 0.34, from: 0 }, { duration: 96 });
  assert.equal(near.drop, 'Claude makes it');
  assert.ok(Math.abs(near.at + (33.1 - near.from) / near.rate - 31.44) < 0.01);
});

test('a track far longer than the film may use a lift anywhere, if the music still runs to the film\'s end', () => {
  const brief = { bpm: 120, beatsPerBar: 4, offset: 0, sections: [{ name: 'Lift', at: 30, drop: true }] };
  // 147 s for a 96 s film: its lift at 70 s puts 40 s of track before the drop and 77 s after it
  const plan = fitPlan(brief, { bpm: 120, phase: 0, seconds: 147, lifts: [{ t: 70, lift: 1 }] }, { at: 0, from: 0 }, { duration: 96 });
  assert.equal(plan.drop, 'Lift');
  assert.deepEqual([plan.at, plan.from, plan.to], [0, 40, 136]);
  // one whose lift is too late to leave music for the end isn't used
  const late = fitPlan(brief, { bpm: 120, phase: 0, seconds: 147, lifts: [{ t: 140, lift: 1 }] }, { at: 0, from: 0 }, { duration: 96 });
  assert.equal(late.drop, null);
});
