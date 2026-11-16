import { expect, test } from 'vitest';
import { forgetFrames, frameKey, loadFrame, registerFrame } from './frames';

test('a preview remembers what it loaded when React registers the same iframe again', () => {
  const f = document.createElement('iframe');
  registerFrame('edit', f);
  expect(loadFrame('edit', 'film/tour', 'about:blank')).toBe(true);
  // a re-render: React's ref cleanup, then the same iframe again
  registerFrame('edit', null);
  registerFrame('edit', f);
  expect(frameKey('edit')).toBe('film/tour'); // so a change on disk still reloads it
  expect(loadFrame('edit', 'film/tour', 'about:blank')).toBe(false); // and it isn't reloaded for nothing
  expect(loadFrame('edit', 'film/tour', 'about:blank', true)).toBe(true);
});

test('a new iframe has nothing loaded; forgetting clears what the current one holds', () => {
  const a = document.createElement('iframe'), b = document.createElement('iframe');
  registerFrame('storyboard', a);
  loadFrame('storyboard', 'film/tour', 'about:blank');
  registerFrame('storyboard', b);
  expect(frameKey('storyboard')).toBeNull();
  loadFrame('storyboard', 'film/hello', 'about:blank');
  forgetFrames();
  expect(frameKey('storyboard')).toBeNull();
});
