import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageName, pinId, validateVibe, vibeSrcOk, videoOf } from '../server/vibe.mjs';

test('a board of every kind of pin is kept, cleaned', () => {
  const r = validateVibe({ pins: [
    { id: 'grid', kind: 'image', src: 'vibe/grid paper.png', group: 'Look', take: '  Faint grid paper.  ' },
    { id: 'launch', kind: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', at: '0:42', take: 'The push in.' },
    { id: 'palette', kind: 'colour', colours: ['#ffffeb', '#1A1A1A'] },
    { id: 'serif', kind: 'type', font: 'EB Garamond', sample: 'Just speak.' },
    { id: 'bed', kind: 'music', sound: 'Curious Groove.m4a' },
    { id: 'site', kind: 'link', url: 'https://wisprflow.ai', title: 'Their site' },
    { id: 'calm', kind: 'note', take: 'One idea per screen.' },
  ] });

  assert.ok(!r.error, r.error);
  assert.equal(r.vibe.pins.length, 7);
  assert.equal(r.vibe.pins[0].take, 'Faint grid paper.');
  assert.deepEqual(r.vibe.pins[2].colours, ['#FFFFEB', '#1A1A1A']);
});

test('what each kind needs, and what is refused', () => {
  const bad = (pin) => validateVibe({ pins: [pin] }).error;

  assert.match(bad({ id: 'a', kind: 'image' }), /needs src/);
  assert.match(bad({ id: 'a', kind: 'video', url: 'javascript:alert(1)' }), /web address/);
  assert.match(bad({ id: 'a', kind: 'image', src: '../film.json' }), /vibe\/<file>/);
  assert.match(bad({ id: 'a', kind: 'image', src: 'vibe/../../secret.png' }), /vibe\/<file>/);
  assert.match(bad({ id: 'a', kind: 'music', sound: '../x.wav' }), /sound library/);
  assert.match(bad({ id: 'a', kind: 'colour', colours: ['red'] }), /hex/);
  assert.match(bad({ id: 'A B', kind: 'note', take: 'x' }), /own id/);
  assert.match(bad({ id: 'a', kind: 'gif', take: 'x' }), /kind is one of/);
  assert.match(validateVibe({ pins: [{ id: 'a', kind: 'note', take: 'x' }, { id: 'a', kind: 'note', take: 'y' }] }).error, /own id/);
  assert.match(validateVibe({}).error, /pins/);
});

test('video links become players for YouTube and Vimeo, else stay links', () => {
  assert.deepEqual(videoOf('https://youtu.be/dQw4w9WgXcQ?t=42'), { provider: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(videoOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { provider: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(videoOf('https://youtube.com/shorts/dQw4w9WgXcQ'), { provider: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(videoOf('https://vimeo.com/76979871'), { provider: 'vimeo', id: '76979871' });
  assert.equal(videoOf('https://example.com/video'), null);
});

test('images added to the board get a plain, unique name; ids come from a word of their own', () => {
  assert.equal(imageName('Screen Shot 2026-11-16 at 12.00.png'), 'Screen Shot 2026-11-16 at 12.00.png');
  assert.equal(imageName('../../evil.png'), 'evil.png');
  assert.equal(imageName('ref.png', new Set(['ref.png'])), 'ref 2.png');
  assert.equal(imageName('notes.txt'), null);
  assert.ok(vibeSrcOk('vibe/ref 2.png') && !vibeSrcOk('vibe/.hidden.png') && !vibeSrcOk('vibe/a/b.png'));
  assert.equal(pinId([{ id: 'grid-paper' }], 'Grid Paper.png'), 'grid-paper-2');
  assert.equal(pinId([], 'Launch film (YouTube)'), 'launch-film-youtube');
});
