import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoSupport } from './can-render.mjs';

const mac = { platform: 'darwin', hasSwiftc: () => true, chromium: async () => '/chromium' };

test('a Mac with the Command Line Tools and the browser can render video', async () => {
  assert.deepEqual(await videoSupport(mac), { ok: true });
});

test('another system says video needs macOS, and that everything else still works', async () => {
  for (const platform of ['linux', 'win32']) {
    const r = await videoSupport({ ...mac, platform });
    assert.equal(r.ok, false);
    assert.match(r.reason, /needs macOS/);
    assert.match(r.reason, /web export/);
    assert.equal(r.fix, undefined);
  }
});

test('a Mac without the Command Line Tools or the browser is told the one command that fixes it', async () => {
  assert.deepEqual(await videoSupport({ ...mac, hasSwiftc: () => false }).then((r) => [r.ok, r.fix]), [false, 'xcode-select --install']);
  assert.deepEqual(await videoSupport({ ...mac, chromium: async () => null }).then((r) => [r.ok, r.fix]), [false, 'npx playwright install chromium']);
});

test('this machine is checked without throwing', async () => {
  const r = await videoSupport();
  assert.equal(typeof r.ok, 'boolean');
});
