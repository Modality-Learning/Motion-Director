import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { formatComment, logComment, validateComment } from './comments.mjs';

const FILMS = [{ name: 'tall', title: 'Tall film', duration: 35 }];
const ELEMENT = {
  film: 'tall', view: 'storyboard', frame: 'Where to start', t: 8.2,
  target: { scope: 'param:title-2', label: 'The question', value: "Don't spend it\nfiguring out where" }, text: '  Make this shorter.  ',
};
const FRAME = { ...ELEMENT, target: null, text: 'This beat drags.' };

test('a comment about an element names it, its frame and its current text', () => {
  const { comment } = validateComment(ELEMENT, FILMS);

  assert.equal(formatComment(comment, FILMS[0], 'promo'), [
    'Motion Director comment on "Tall film"',
    'Film: promo/films/tall/index.html',
    'About: The question (param:title-2) in "Where to start" (storyboard, 0:08.2), currently "Don\'t spend it / figuring out where"',
    'Comment: Make this shorter.',
  ].join('\n'));
});

test('a comment on the background is about the frame, named by its title', () => {
  const note = formatComment(validateComment(FRAME, FILMS).comment, FILMS[0], 'promo');

  assert.match(note, /^About: "Where to start" \(storyboard, 0:08\.2\)$/m);
  assert.doesNotMatch(note, /param:/);
});

test('refuses unknown films, empty or oversized text, bad times and half-formed targets', () => {
  assert.equal(validateComment({ ...ELEMENT, film: '../x' }, FILMS).error, 'Unknown film');
  assert.equal(validateComment({ ...ELEMENT, text: '   ' }, FILMS).error, 'Write a comment first');
  assert.equal(validateComment({ ...ELEMENT, text: 'x'.repeat(2001) }, FILMS).error, 'Write a comment first');
  assert.equal(validateComment({ ...ELEMENT, t: 99 }, FILMS).error, 'Bad time');
  assert.equal(validateComment({ ...ELEMENT, view: 'export' }, FILMS).error, 'Unknown view');
  assert.equal(validateComment({ ...ELEMENT, target: { scope: 'param:x' } }, FILMS).error, 'Bad target');
  assert.equal(validateComment({ ...ELEMENT, target: { scope: 'param:x', label: 42 } }, FILMS).error, 'Bad target');
});

test('logs each note as one line, newest last', () => {
  const out = mkdtempSync(join(tmpdir(), 'promo-comments-'));
  const c = validateComment(FRAME, FILMS).comment;

  logComment(out, c, 'first'); logComment(out, c, 'second');
  const lines = readFileSync(join(out, 'comments', 'tall.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.note), ['first', 'second']);
  assert.equal(lines[0].text, 'This beat drags.');
});

test('preview comments: the video at a moment, an element with parameters, or any other element', () => {
  const at = { film: 'tall', view: 'motion', frame: null, t: 18.6, text: 'Hold this longer.' };
  const video = formatComment(validateComment({ ...at, target: null }, FILMS).comment, FILMS[0], 'promo');
  const title = formatComment(validateComment({ ...at, target: { scope: 'param:title-4', label: 'The tutor line', value: 'A tutor that\nknows you' } }, FILMS).comment, FILMS[0], 'promo');
  const other = formatComment(validateComment({ ...at, target: { selector: '#aPlan > li.p-row > div.p-area', text: 'Price elasticity 3/3' } }, FILMS).comment, FILMS[0], 'promo');

  assert.match(video, /^About: the video at 0:18\.6$/m);
  assert.match(title, /^About: The tutor line \(param:title-4\) at 0:18\.6, currently "A tutor that \/ knows you"$/m);
  assert.match(other, /^About: "Price elasticity 3\/3" \(#aPlan > li\.p-row > div\.p-area\) at 0:18\.6$/m);
  assert.equal(validateComment({ ...at, target: { text: 'no selector' } }, FILMS).error, 'Bad target');
  assert.equal(validateComment({ ...at, target: { selector: 'x'.repeat(241) } }, FILMS).error, 'Bad target');
});

const CLIP = { film: 'tall', view: 'edit', frame: null, t: 11.5, text: 'Too loud.',
  target: { item: { kind: 'clip', label: 'gate-latch-click', detail: 'Track 12', id: 'flap-2' } } };

test('a comment on a timeline clip names the clip, its track and its cue in the sound sheet', () => {
  const note = formatComment(validateComment(CLIP, FILMS).comment, FILMS[0], 'promo');

  assert.equal(note, [
    'Motion Director comment on "Tall film"',
    'Film: promo/films/tall/index.html',
    'Sounds: promo/films/tall/sound.json (cue "flap-2")',
    'About: gate-latch-click on the sound timeline at 0:11.5 (Track 12)',
    'Comment: Too loud.',
  ].join('\n'));
});

test('a comment on a beat points at the film\'s list of key moments', () => {
  const note = formatComment(validateComment({ ...CLIP, target: { item: { kind: 'beat', label: 'Where to start', detail: 'Course materials spawn' } } }, FILMS).comment, FILMS[0], 'promo');

  assert.match(note, /^Beats: the KEYS list in promo\/films\/tall\/index\.html$/m);
  assert.match(note, /^About: the "Where to start" beat at 0:11\.5 \(Course materials spawn\)$/m);
});

test('a timeline item must be a known kind with a name', () => {
  assert.equal(validateComment({ ...CLIP, target: { item: { kind: 'wobble', label: 'x' } } }, FILMS).error, 'Bad target');
  assert.equal(validateComment({ ...CLIP, target: { item: { kind: 'clip', label: '' } } }, FILMS).error, 'Bad target');
  assert.equal(validateComment({ ...CLIP, view: 'sound' }, FILMS).error, 'Unknown view');
});

test('text selected in the brief is quoted, with where it was: a section, or a beat beside the storyboard', () => {
  const at = { film: 'tall', view: 'treatment', frame: null, t: 9.4, text: 'Make this calmer.' };
  const section = formatComment(validateComment({ ...at, target: { quote: { text: 'one   continuous canvas', section: 'Visual direction' } } }, FILMS).comment, FILMS[0], 'promo');
  const beat = formatComment(validateComment({ ...at, target: { quote: { text: 'the picker hops', beat: { time: '9.4–16.2 s', title: 'Give *precise* edits.' } } } }, FILMS).comment, FILMS[0]);

  assert.match(section, /^Treatment: promo\/films\/tall\/TREATMENT\.md$/m);
  assert.match(section, /^About: the treatment's "Visual direction": "one continuous canvas"$/m);
  assert.match(beat, /^Treatment: films\/tall\/TREATMENT\.md$/m); // a project at the top of its repository
  assert.match(beat, /^About: the beat at 9\.4–16\.2 s \("Give precise edits\."\): "the picker hops"$/m);
  assert.match(beat, /^Comment: Make this calmer\.$/m);
});

test('a quote needs its text, and keeps to its limits', () => {
  const at = { film: 'tall', view: 'brief', frame: null, t: 0, text: 'x' }; // the old view name still reads

  assert.ok(validateComment({ ...at, target: { quote: { text: '   ' } } }, FILMS).error);
  assert.ok(validateComment({ ...at, target: { quote: { text: 'a'.repeat(601) } } }, FILMS).error);
  assert.ok(validateComment({ ...at, target: { quote: { text: 'ok', beat: { title: 'no time' } } } }, FILMS).error);
  assert.ok(!validateComment({ ...at, target: { quote: { text: 'ok' } } }, FILMS).error);
});

test('any element on a storyboard frame: what it shows, its selector, and the frame', () => {
  const at = { film: 'tall', view: 'storyboard', frame: 'Where to start', t: 8.2, text: 'Bigger.' };
  const note = formatComment(validateComment({ ...at, target: { selector: '#chat > div.c-msg', text: 'Make me a launch animation.' } }, FILMS).comment, FILMS[0], 'promo');

  assert.match(note, /^About: "Make me a launch animation\." \(#chat > div\.c-msg\) in "Where to start" \(storyboard, 0:08\.2\)$/m);
});

test('an older BRIEF.md is named as it is', () => {
  const c = validateComment({ film: 'tall', view: 'treatment', frame: null, t: 0, text: 'x', target: { quote: { text: 'y' } } }, FILMS).comment;
  assert.match(formatComment(c, FILMS[0], 'promo', { treatment: 'BRIEF.md' }), /^Treatment: promo\/films\/tall\/BRIEF\.md$/m);
});

test('a pin on the vibe board: the board, the pin by its id, and what it is', () => {
  const vibe = { pins: [{ id: 'grid', kind: 'image', src: 'vibe/grid.png', group: 'Look', take: 'Faint grid paper behind everything.' }] };
  const c = validateComment({ film: 'tall', view: 'vibe', frame: null, t: 0, text: 'Less of this.', target: { pin: { id: 'grid' } } }, FILMS).comment;
  const note = formatComment(c, FILMS[0], 'promo', { vibe });

  assert.match(note, /^Vibe: promo\/films\/tall\/vibe\.json \(pin "grid"\)$/m);
  assert.match(note, /^About: the vibe board's image pin "Faint grid paper behind everything\." \(Look\)$/m);
  assert.match(note, /^Comment: Less of this\.$/m);
});

test('a comment on the music brief names the brief, the part, and what it says now', () => {
  const brief = { bpm: 101, sections: [{ name: 'Synced', at: 21.21, note: 'the lift: full but light', drop: true }], prompt: { style: 'Instrumental, light playful electronic pop, 101 BPM' } };
  const at = { film: FILMS[0].name, view: 'edit', frame: null, t: 21.21, text: 'More of a tight minimalist funk feel here' };
  const section = formatComment(validateComment({ ...at, target: { music: { part: 'section', section: 'Synced' } } }, FILMS).comment, FILMS[0], 'promo', { brief });
  assert.match(section, /^Music: promo\/films\/[a-z-]+\/music\.json \(section "Synced"\)$/m);
  assert.match(section, /^About: the music brief's section "Synced" at 0:21\.2: "the lift: full but light"$/m);
  assert.match(section, /^Comment: More of a tight minimalist funk feel here$/m);
  const prompt = formatComment(validateComment({ ...at, target: { music: { part: 'prompt' } } }, FILMS).comment, FILMS[0], 'promo', { brief });
  assert.match(prompt, /^About: the music brief's prompt: "Instrumental, light playful electronic pop, 101 BPM"$/m);
  const whole = formatComment(validateComment({ ...at, target: { music: { part: 'brief' } } }, FILMS).comment, FILMS[0], 'promo', { brief });
  assert.match(whole, /^Music: promo\/films\/[a-z-]+\/music\.json$/m);
  assert.match(whole, /^About: the music brief \(101 BPM, 1 section\)$/m);
  assert.equal(validateComment({ ...at, target: { music: { part: 'section' } } }, FILMS).error, 'Bad target');
  assert.equal(validateComment({ ...at, target: { music: { part: 'lyrics' } } }, FILMS).error, 'Bad target');
});
