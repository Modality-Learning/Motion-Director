import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barTimes, beatPhase, biggestLift, fitPlan, onsets, tempoCandidates, tempoNear, tempoOverall, validateBrief } from './music.mjs';

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
