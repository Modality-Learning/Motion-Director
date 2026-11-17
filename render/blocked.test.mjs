import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockedBy, explainBlocked } from './blocked.mjs';

test('a sandbox that blocks the port or the browser is explained, with the command to run outside it', () => {
  const port = Object.assign(new Error('listen EPERM: operation not permitted 127.0.0.1'), { code: 'EPERM', syscall: 'listen' });
  const browser = new Error('browserType.launch: Target page, context or browser has been closed');
  assert.equal(blockedBy(port), 'port');
  assert.equal(blockedBy(browser), 'browser');
  const text = explainBlocked(browser, 'npx motion-director board launch');
  assert.match(text, /couldn't start its browser/);
  assert.match(text, /npx motion-director board launch/);
  assert.match(text, /Don't make a stand-in image/);
  assert.match(explainBlocked(port), /couldn't open a local port/);
});

test('a missing browser says how to install it, and any other error is left alone', () => {
  assert.match(explainBlocked(new Error("browserType.launch: Executable doesn't exist at /x/chromium")), /npx playwright install chromium/);
  assert.equal(explainBlocked(new Error('SyntaxError in the film')), null);
  assert.equal(blockedBy(Object.assign(new Error('x'), { code: 'EADDRINUSE', syscall: 'listen' })), null);
});
