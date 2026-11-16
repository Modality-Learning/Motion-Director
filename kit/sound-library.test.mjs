import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMeta, familyFromName, familyFromSound, familyOf, similar, suggestFor, suggestUses, traitsOf } from './sound-library.mjs';
import { cleanEntry, validateLibrary } from './sound.mjs';

// measurements shaped like the audio tool's, for kinds of sound
const M = {
  click: { ok: true, length: 0.3, attack: 0.0, decay: 0.01, active: 0.05, sustain: 0.5, onsets: 1, onsetRate: 20, brightness: 3100, rmsDb: -27 },
  thump: { ok: true, length: 0.9, attack: 0.01, decay: 0.3, active: 0.4, sustain: 0.3, onsets: 1, onsetRate: 2.5, brightness: 180, rmsDb: -14 },
  whoosh: { ok: true, length: 0.8, attack: 0.25, decay: 0.15, active: 0.5, sustain: 0.2, onsets: 2, onsetRate: 4, brightness: 900, rmsDb: -18 },
  typing: { ok: true, length: 19.6, attack: 18, decay: 0.6, active: 19, sustain: 0.08, onsets: 160, onsetRate: 8.4, brightness: 6000, rmsDb: -27 },
  music: { ok: true, length: 99, attack: 60, decay: 33, active: 99, sustain: 0.16, onsets: 240, onsetRate: 2.4, brightness: 210, rmsDb: -15 },
};

test('a sound\'s name decides its family when it says what it is, plurals included', () => {
  assert.equal(familyFromName('mixkit-arrow-whoosh-1491.wav'), 'whooshes');
  assert.equal(familyFromName('mixkit-papers-being-moved-or-wrinkling-2379.wav'), 'paper');
  assert.equal(familyFromName('mixkit-paper-slide-1530.wav'), 'paper'); // paper before doors' "slide"
  assert.equal(familyFromName('mixkit-cabinet-door-slide-1524.wav'), 'doors');
  assert.equal(familyFromName('Funky Piano Groove.m4a'), 'music');
  assert.equal(familyFromName('mixkit-cbpd-400.mp3'), null);
});

test('without a telling name, how it sounds decides', () => {
  assert.equal(familyFromSound(M.music), 'music');
  assert.equal(familyFromSound(M.click), 'clicks');
  assert.equal(familyFromSound(M.thump), 'impacts');
  assert.equal(familyFromSound(M.whoosh), 'whooshes');
  assert.equal(familyFromSound({ ok: false }), 'other');
  assert.equal(familyOf('mixkit-cbpd-400.mp3', M.music), 'music');
});

test('a family set by hand wins over the name and the sound', () => {
  assert.equal(familyOf('mixkit-message-pop-alert-2354.mp3', M.click, null), 'clicks');
  assert.equal(familyOf('mixkit-message-pop-alert-2354.mp3', M.click, { family: 'alerts' }), 'alerts');
  assert.equal(familyOf('x.wav', M.click, { family: 'nonsense' }), 'clicks'); // an unknown family is ignored
});

test('traits describe shape, brightness, busyness and length', () => {
  assert.deepEqual(traitsOf(M.click), ['short', 'sharp', 'bright']);
  assert.deepEqual(traitsOf(M.thump), ['sharp', 'heavy']);
  assert.deepEqual(traitsOf(M.whoosh), ['swell']);
  assert.deepEqual(traitsOf(M.typing), ['bright', 'busy', 'long']);
  assert.deepEqual(traitsOf(M.music), ['heavy', 'long']);
  assert.deepEqual(traitsOf(undefined), []);
});

test('more like this: the closest-measuring sounds first', () => {
  const lib = [
    { path: 'click-a.wav', m: M.click, family: 'clicks' },
    { path: 'click-b.wav', m: { ...M.click, brightness: 2800, length: 0.35 }, family: 'clicks' },
    { path: 'thump.wav', m: M.thump, family: 'impacts' },
    { path: 'groove.m4a', m: M.music, family: 'music' },
    { path: 'broken.m4a', m: { ok: false }, family: 'other' },
  ];
  const like = similar('click-a.wav', lib, 3);
  assert.equal(like[0], 'click-b.wav');
  assert.equal(like.at(-1), 'groove.m4a');
  assert.ok(!like.includes('broken.m4a') && !like.includes('click-a.wav'));
  assert.deepEqual(similar('missing.wav', lib), []);
});

test('suggestions suit the motion: swells for the fastest moment, sharp sounds for a stop, never long beds', () => {
  const lib = [
    { path: 'whoosh.wav', family: 'whooshes', traits: ['swell'] },
    { path: 'thump.wav', family: 'impacts', traits: ['sharp', 'heavy'] },
    { path: 'click.wav', family: 'clicks', traits: ['short', 'sharp', 'bright'] },
    { path: 'music.mp3', family: 'music', traits: ['heavy', 'long'] },
  ];
  assert.equal(suggestFor('peak', lib)[0], 'whoosh.wav');
  assert.deepEqual(suggestFor('stop', lib).slice(0, 2), ['thump.wav', 'click.wav']);
  assert.equal(suggestFor('in', lib)[0], 'click.wav');
  assert.ok(!suggestFor('stop', lib).includes('music.mp3'));
});

test('family and tags set by hand are checked and kept with the sound\'s settings', () => {
  assert.deepEqual(cleanMeta({ family: 'alerts', tags: [' Soft ', 'logo', 'soft'] }), { values: { family: 'alerts', tags: ['soft', 'logo'] } });
  assert.match(cleanMeta({ family: 'bogus' }).error, /family/);
  assert.match(cleanMeta({ tags: ['<script>'] }).error, /Tags/);
  assert.match(cleanMeta({ tags: Array(13).fill('a') }).error, /12/);
  assert.deepEqual(cleanEntry({ gain: -3, family: 'clicks', tags: ['ui'] }), { values: { gain: -3, family: 'clicks', tags: ['ui'] } });
  assert.deepEqual(validateLibrary({ sounds: { 'pop.mp3': { family: 'alerts' } } }), { library: { sounds: { 'pop.mp3': { family: 'alerts' } } } });
});

test('a sound\'s name suggests what it is good for, else its family does', () => {
  assert.deepEqual(suggestUses('mixkit-message-pop-alert-2354.mp3'), ['notification', 'appear']);
  assert.deepEqual(suggestUses('mixkit-fast-small-sweep-transition-166.wav'), ['transition']);
  assert.deepEqual(suggestUses('sfx/0042.wav', 'impacts'), ['impact']);
  assert.deepEqual(suggestUses('sfx/0042.wav'), []);
});

test('a description and uses set by hand are checked and kept with the sound\'s settings', () => {
  assert.deepEqual(cleanMeta({ description: '  A soft wooden   latch.\nGood for UI. ', uses: ['impact', 'ui-click', 'impact'] }),
    { values: { description: 'A soft wooden latch. Good for UI.', uses: ['ui-click', 'impact'] } });
  assert.match(cleanMeta({ uses: ['<b>'] }).error, /own uses/);
  assert.match(cleanMeta({ description: 'x'.repeat(281) }).error, /280/);
  assert.deepEqual(cleanMeta({ description: '   ', uses: [] }), { values: {} });
  assert.deepEqual(cleanEntry({ gain: -3, uses: ['typing'] }), { values: { gain: -3, uses: ['typing'] } });
});

test('what the user marked a sound as good for leads the suggestions for a moment', () => {
  const sounds = [
    { path: 'a.wav', family: 'other', traits: [], uses: ['impact'] },
    { path: 'b.wav', family: 'clicks', traits: ['sharp'], uses: [] },
  ];

  assert.deepEqual(suggestFor('stop', sounds), ['a.wav', 'b.wav']);
});

test('your own uses are kept as you wrote them; one that names a built-in use becomes it', () => {
  assert.deepEqual(cleanMeta({ uses: ['Logo sting', 'Transition', 'impact', 'logo sting'] }), { values: { uses: ['transition', 'impact', 'logo sting'] } });
  assert.match(cleanMeta({ uses: Array.from({ length: 13 }, (_, i) => `use ${i}`) }).error, /12/);
});
