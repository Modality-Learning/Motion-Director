import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSettings, effective, fitRate, followEvent, overrides, playLength, resolveVoices, soundPathOk, validateLibrary, validateSheet } from './sound.mjs';

const LIB = { sounds: { 'typing/keys.wav': { rate: 2, gain: -6 } } };
const MOMENTS = [{ id: 'fold-1', times: [27.4], dur: 0.4 }, { id: 'events-in', times: [0.3, 0.6, 0.9], dur: 0 }];

test('sound paths stay inside the library and are audio files', () => {
  assert.equal(soundPathOk('whooshes/air-02.wav'), true);
  assert.equal(soundPathOk('Typing Burst.aiff'), true);
  for (const bad of ['../x.wav', '/etc/x.wav', 'a/../../x.wav', 'a//x.wav', '.hidden/x.wav', 'x.txt', 'a\\x.wav', '', 'x'.repeat(300) + '.wav']) assert.equal(soundPathOk(bad), false, bad);
});

test('a cue plays at each time of its moment, shifted by its offset, with the sound\'s defaults unless it sets its own', () => {
  const sheet = { master: -2, cues: [{ id: 'c1', sound: 'typing/keys.wav', moment: 'events-in', offset: 0.1, gain: 0 }] };

  const { voices } = resolveVoices(sheet, LIB, MOMENTS, 35);

  assert.deepEqual(voices.map((v) => v.at), [0.4, 0.7, 1.0].map((x) => voices.find((v) => Math.abs(v.at - x) < 1e-9).at));
  assert.equal(voices.length, 3);
  assert.equal(voices[0].rate, 2); // the sound's default
  assert.equal(voices[0].gain, -2); // the cue's own 0 dB, plus the master
  assert.equal(voices[0].keepPitch, true); // the built-in default
});

test('cues on a missing moment are reported, muted cues are silent, the start moment always exists', () => {
  const sheet = { cues: [
    { id: 'a', sound: 'x.wav', moment: 'gone', offset: 0 },
    { id: 'b', sound: 'x.wav', moment: 'fold-1', offset: 0, mute: true },
    { id: 'c', sound: 'bed.wav', moment: 'start', offset: 0 },
  ] };

  const { voices, orphans } = resolveVoices(sheet, LIB, MOMENTS, 35);

  assert.deepEqual(orphans, ['a']);
  assert.deepEqual(voices.map((v) => v.cue), ['c']);
});

test('voices that would start after the film ends are left out', () => {
  const sheet = { cues: [{ id: 'a', sound: 'x.wav', moment: 'fold-1', offset: 8 }] };
  assert.equal(resolveVoices(sheet, LIB, MOMENTS, 35).voices.length, 0);
});

test('a cue\'s overrides are the settings it sets; the rest are inherited', () => {
  const cue = { id: 'c1', sound: 'typing/keys.wav', moment: 'fold-1', offset: 0, from: 0.2 };
  assert.deepEqual(overrides(cue), ['from']);
  assert.deepEqual({ ...effective(cue, LIB) }, { gain: -6, from: 0.2, to: null, rate: 2, keepPitch: true, fadeIn: 0, fadeOut: 0, hit: null });
});

test('speed sets how long a trimmed sound plays, and fitting matches a moment\'s length', () => {
  const s = { ...effective({}, null), from: 0.5, to: 2.5, rate: 1 };
  assert.equal(playLength(s, 3), 2);
  assert.equal(playLength({ ...s, rate: 4 }, 3), 0.5);
  assert.equal(playLength({ ...s, to: null }, 3), 2.5); // to the end of the file
  assert.equal(fitRate(s, 3, 0.65), 3.077);
  assert.equal(fitRate(s, 3, 100), 0.25); // clamped to the slowest speed
});

test('settings are checked: ranges, types, trim order', () => {
  assert.deepEqual(cleanSettings({ gain: -6, keepPitch: false, to: null }), { values: { gain: -6, keepPitch: false, to: null } });
  assert.match(cleanSettings({ gain: 99 }).error, /Volume/);
  assert.match(cleanSettings({ rate: 0 }).error, /Speed/);
  assert.match(cleanSettings({ keepPitch: 'yes' }).error, /Keep pitch/);
  assert.match(cleanSettings({ from: 2, to: 1 }).error, /after trim start/);
  assert.match(cleanSettings([]).error, /object/);
});

test('sheets keep known fields only and refuse bad cues', () => {
  const { sheet } = validateSheet({ master: 0, cues: [{ id: 'c1', sound: 'a.wav', moment: 'fold-1', offset: -0.04, gain: -3, extra: 'dropped' }] });
  assert.deepEqual(sheet.cues[0], { id: 'c1', sound: 'a.wav', moment: 'fold-1', offset: -0.04, track: 0, gain: -3 });
  assert.match(validateSheet({ cues: [{ id: 'c1', sound: '../a.wav', moment: 'm' }] }).error, /library/);
  assert.match(validateSheet({ cues: [{ id: 'c1', sound: 'a.wav', moment: 'm' }, { id: 'c1', sound: 'a.wav', moment: 'm' }] }).error, /own id/);
  assert.match(validateSheet({ cues: [{ id: 'c1', sound: 'a.wav', moment: 'Bad Id' }] }).error, /time or a moment/);
  assert.match(validateSheet({ cues: [{ id: 'c1', sound: 'a.wav' }] }).error, /time or a moment/);
  assert.match(validateSheet({ cues: [{ id: 'c1', sound: 'a.wav', at: 1, track: 16 }] }).error, /track/);
  assert.match(validateSheet({ cues: [{ id: 'c1', sound: 'a.wav', moment: 'm', offset: 99 }] }).error, /offset/);
  assert.match(validateSheet({ master: 40, cues: [] }).error, /Master/);
  assert.match(validateSheet({}).error, /No cues/);
});

test('library defaults are checked per sound, and empty ones dropped', () => {
  assert.deepEqual(validateLibrary({ sounds: { 'a.wav': { gain: -3 }, 'b.wav': {} } }), { library: { sounds: { 'a.wav': { gain: -3 } } } });
  assert.match(validateLibrary({ sounds: { '../a.wav': {} } }).error, /Not a sound path/);
  assert.match(validateLibrary({ sounds: { 'a.wav': { rate: 9 } } }).error, /Speed/);
});

test('the number of tracks is kept, within 1 to 16', () => {
  assert.equal(validateSheet({ tracks: 5, cues: [] }).sheet.tracks, 5);
  assert.equal('tracks' in validateSheet({ cues: [] }).sheet, false);
  assert.match(validateSheet({ tracks: 0, cues: [] }).error, /Track count/);
  assert.match(validateSheet({ tracks: 2.5, cues: [] }).error, /Track count/);
});

test('a cue placed on the timeline plays at its own time, on its track', () => {
  const { sheet } = validateSheet({ cues: [{ id: 'c1', sound: 'typing/keys.wav', at: 19.2, track: 2, from: 0.1, hit: 0.3 }] });
  assert.deepEqual(sheet.cues[0], { id: 'c1', sound: 'typing/keys.wav', at: 19.2, track: 2, from: 0.1, hit: 0.3 });

  const { voices, orphans } = resolveVoices(sheet, LIB, MOMENTS, 35);

  assert.deepEqual(orphans, []);
  assert.equal(voices.length, 1);
  assert.equal(voices[0].at, 19.2);
  assert.equal(voices[0].from, 0.1);
  assert.equal(voices[0].rate, 2); // still the sound's default speed
});

test('a hit point is a sound setting like any other: checked, inherited, clearable', () => {
  assert.deepEqual(cleanSettings({ hit: 0.42 }), { values: { hit: 0.42 } });
  assert.deepEqual(cleanSettings({ hit: null }), { values: { hit: null } });
  assert.match(cleanSettings({ hit: -1 }).error, /Hit point/);
  assert.equal(effective({ sound: 'w.wav' }, { sounds: { 'w.wav': { hit: 0.42 } } }).hit, 0.42);
});

test('a cue can belong to an object of the film, with the event it sits nearest', () => {
  const { sheet } = validateSheet({
    objects: { o1: { label: 'Study timer', selector: '#timer' }, o2: { label: 'Unused', selector: '#x' } },
    cues: [{ id: 'c1', sound: 'thump.wav', at: 11.7, object: 'o1', anchor: { kind: 'stop', n: 0, t: 11.76 } }],
  });
  assert.deepEqual(sheet.objects, { o1: { label: 'Study timer', selector: '#timer' } }); // unused objects are dropped
  assert.deepEqual(sheet.cues[0].anchor, { kind: 'stop', n: 0, t: 11.76 });
  assert.equal(resolveVoices(sheet, LIB, [], 35).voices[0].at, 11.7); // it plays at its own time

  assert.match(validateSheet({ cues: [{ id: 'c1', sound: 'a.wav', at: 1, object: 'o9' }] }).error, /unknown object/);
  assert.match(validateSheet({ objects: { o1: { label: 'x', selector: '#a' } }, cues: [{ id: 'c1', sound: 'a.wav', at: 1, object: 'o1', anchor: { kind: 'wobble', n: 0, t: 1 } }] }).error, /anchor/);
  assert.match(validateSheet({ objects: { bad: { label: 'x', selector: '#a' } }, cues: [] }).error, /object/);
  assert.match(validateSheet({ objects: { o1: { label: 'x', selector: '' } }, cues: [] }).error, /name and an element/);
});

test('a clip follows the event of its kind nearest where it was, not the one with its old number', () => {
  const was = { kind: 'peak', n: 1, t: 10.92 };
  // marks found differently now: an extra peak early on renumbers them, but the one at 10.92 moved to 11.1
  const now = [{ kind: 'in', t: 5.4 }, { kind: 'peak', t: 5.44 }, { kind: 'peak', t: 6 }, { kind: 'peak', t: 11.1 }, { kind: 'stop', t: 11.3 }];

  assert.deepEqual(followEvent(was, now), { kind: 'peak', t: 11.1 });
});

test('a clip stays where it is when its kind of event is gone or moved too far', () => {
  const was = { kind: 'peak', n: 0, t: 3.08 };

  assert.equal(followEvent(was, [{ kind: 'in', t: 0 }, { kind: 'out', t: 5.48 }]), null); // measured unseen: only arrivals and exits
  assert.equal(followEvent(was, [{ kind: 'peak', t: 6 }]), null);
  assert.deepEqual(followEvent(was, [{ kind: 'peak', t: 4 }]), { kind: 'peak', t: 4 });
});

test('a music cue is kept as music, and music never belongs to an object', () => {
  const ok = validateSheet({ master: 0, cues: [{ id: 'm1', sound: 'music/groove.wav', at: 0, track: 1, music: true, gain: -14 }] });
  assert.deepEqual(ok.sheet.cues[0], { id: 'm1', sound: 'music/groove.wav', at: 0, track: 1, music: true, gain: -14 });
  assert.match(validateSheet({ master: 0, objects: { o1: { label: 'A', selector: '#a' } }, cues: [{ id: 'm1', sound: 'a.wav', at: 0, music: true, object: 'o1' }] }).error, /music doesn't belong to an object/);
  assert.match(validateSheet({ master: 0, cues: [{ id: 'm1', sound: 'a.wav', at: 0, music: 'yes' }] }).error, /bad music/);
  // it plays like any other cue
  const { voices } = resolveVoices(ok.sheet, { sounds: {} }, []);
  assert.deepEqual(voices.map((v) => [v.cue, v.at, v.gain]), [['m1', 0, -14]]);
});

test('muting a lane or a track: kept tidy, and its sounds are neither heard nor rendered', () => {
  const sheet = validateSheet({ master: 0, muted: ['music', 'sfx:1', 'sfx:1'], objects: { o1: { label: 'Ball', selector: '#b' } }, cues: [
    { id: 'm', sound: 'm.wav', at: 0, music: true },
    { id: 'a', sound: 'a.wav', at: 1, track: 0 },
    { id: 'b', sound: 'b.wav', at: 2, track: 1 },
    { id: 'o', sound: 'o.wav', at: 3, track: 1, object: 'o1' },
  ] }).sheet;
  assert.deepEqual(sheet.muted, ['music', 'sfx:1']);
  // an object's clip on its own track 1 isn't your track 1
  assert.deepEqual(resolveVoices(sheet, { sounds: {} }, []).voices.map((v) => v.cue), ['a', 'o']);
  assert.deepEqual(resolveVoices({ ...sheet, muted: ['sfx'] }, { sounds: {} }, []).voices.map((v) => v.cue), ['m']);
  assert.match(validateSheet({ master: 0, muted: ['drums'], cues: [] }).error, /Muted tracks/);
});
