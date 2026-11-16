import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareStates } from './purity-lib.mjs';

const el = (shown, box = [0, 0, 100, 40], text = '') => ({ shown, box, text });

test('an element visible on a fresh page but hidden when played through is named', () => {
  // the copied-note card: never hidden until the film passed it, so a page opened partway in shows it
  const [d] = compareStates({ '#note': el(1, [0, 0, 1290, 80]) }, { '#note': el(0, [0, 0, 1290, 80]) });

  assert.equal(d.element, '#note');
  assert.match(d.what[0], /shown 100% fresh, 0% played/);
});

test('place, size and text differences are named; invisible ones and small wobbles are not', () => {
  const fresh = { '#a': el(1, [10, 10, 100, 40]), '#b': el(1, [0, 0, 50, 50], 'Study?'), '#c': el(0, [0, 0, 9, 9]), '#d': el(1, [0, 0, 100, 40]) };
  const played = { '#a': el(1, [30, 10, 100, 40]), '#b': el(1, [0, 0, 50, 50], 'Study.'), '#c': el(0, [500, 0, 9, 9]), '#d': el(1, [1, 0, 101, 40]) };
  const found = compareStates(fresh, played);

  assert.deepEqual(found.map((d) => d.element).sort(), ['#a', '#b']);
  assert.match(found.find((d) => d.element === '#a').what[0], /at 10,10,100,40 fresh, 30,10,100,40 played/);
  assert.match(found.find((d) => d.element === '#b').what[0], /text "Study\?" fresh, "Study\." played/);
});

test('an element that exists on only one of the pages is named when it can be seen', () => {
  const found = compareStates({ '#late': el(0.8) }, {});

  assert.deepEqual(found[0].what, ['only on a fresh page']);
  assert.deepEqual(compareStates({}, { '#ghost': el(0) }), []);
});
