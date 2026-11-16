import { expect, test } from 'vitest';
import { beatsOf, range, seconds } from './beats';
import { parse } from './markdown';

test('times and ranges as a brief writes them', () => {
  expect(seconds('4.6 s')).toBe(4.6);
  expect(seconds('0:04.6')).toBe(4.6);
  expect(seconds('1:02')).toBe(62);
  expect(seconds('soon')).toBeNull();
  expect(range('0–4.6 s')).toEqual([0, 4.6]);
  expect(range('16-19.6s')).toEqual([16, 19.6]);
  expect(range('0:04 – 0:09.4')).toEqual([4, 9.4]);
  expect(range('23.5 to 28.6 s')).toEqual([23.5, 28.6]);
  expect(range('5–5 s')).toBeNull();
});

test("the beats table becomes ranges with each beat's title and text, and says where it was", () => {
  const blocks = parse(`# Film

Intro.

## Beats

| Time | What happens | Title |
|---|---|---|
| 0–4.6 s | A prompt is **typed** and sent. | Claude builds *great* motion. |
| 4.6–9.4 s | A tweak in words. | |
| later | Not a time, so left out. | x |

## Ending

The end.`);
  const { beats, at } = beatsOf(blocks);

  expect(beats).toEqual([
    { from: 0, to: 4.6, time: '0–4.6 s', title: 'Claude builds *great* motion.', text: 'A prompt is **typed** and sent.', extra: [] },
    { from: 4.6, to: 9.4, time: '4.6–9.4 s', title: '', text: 'A tweak in words.', extra: [] },
  ]);
  expect(at.map((i) => blocks[i].kind)).toEqual(['heading', 'table']);
});

test('no beats table, or one without a time column, gives no beats', () => {
  expect(beatsOf(parse('# Film\n\n## Beats\n\nOne, then two.')).beats).toEqual([]);
  expect(beatsOf(parse('## Beats\n\n| What | Title |\n|---|---|\n| a | b |')).beats).toEqual([]);
});

test('titles are optional, and other columns come along under their own names', () => {
  const { beats } = beatsOf(parse(`## Beats

| Time | Voice-over | What happens | Sound |
|---|---|---|---|
| 0–3 s | "Meet Flow." | The pill rises. | A soft swell |
| 3–6 s | | The text cleans itself up. | |`));

  expect(beats[0]).toMatchObject({ title: '', text: 'The pill rises.', extra: [{ label: 'Voice-over', value: '"Meet Flow."' }, { label: 'Sound', value: 'A soft swell' }] });
  expect(beats[1]).toMatchObject({ text: 'The text cleans itself up.', extra: [] });
});
