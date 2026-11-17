import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO, compareVersions, dependencyOf, installPlan, installedVersion, latestRelease, notesBetween, parseChangelog, skillVersion, updateInfo, updateRequest } from './updates.mjs';

const LOG = `# Changelog

## Unreleased

## 0.3.0 (2026-12-01)

- **Music.** A soundtrack lane.

## 0.2.0 (2026-11-17)

- **Codex.** Comments over MCP.

## 0.1.0 (2026-11-17)

- First.
`;
/* GitHub, faked: the tags and the CHANGELOG at a tag; counts its requests */
function github(tags = ['v0.1.0', 'v0.3.0', 'v0.2.0', 'not-a-release'], { fail = false } = {}) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    if (fail) throw new Error('offline');
    if (url.includes('/tags')) return new Response(JSON.stringify(tags.map((name) => ({ name }))));
    return new Response(LOG);
  };
  return { fetch, calls };
}
const env = () => ({ MD_CACHE: mkdtempSync(join(tmpdir(), 'md-up-')) });

test('versions compare as numbers, and the CHANGELOG reads as releases, newest first', () => {
  assert.deepEqual([compareVersions('0.10.0', '0.9.9'), compareVersions('1.0.0', '1.0.0'), compareVersions('0.2.0', '0.3.0')], [1, 0, -1]);
  assert.deepEqual(parseChangelog(LOG).map((r) => [r.version, r.date]), [['0.3.0', '2026-12-01'], ['0.2.0', '2026-11-17'], ['0.1.0', '2026-11-17']]);
  assert.deepEqual(notesBetween(LOG, '0.1.0', '0.3.0').map((r) => r.version), ['0.3.0', '0.2.0']);
  assert.match(notesBetween(LOG, '0.2.0', '0.3.0')[0].notes, /A soundtrack lane/);
});

test('the latest release comes from the tags, and GitHub is asked at most once a day', async () => {
  const gh = github(), e = env(), now = Date.parse('2026-12-02T10:00:00Z');
  const first = await latestRelease({ fetch: gh.fetch, env: e, now });
  assert.equal(first.latest, '0.3.0');
  assert.match(gh.calls[0], new RegExp(`api.github.com/repos/${REPO}/tags`));
  assert.match(gh.calls[1], /raw.githubusercontent.com\/.*\/v0\.3\.0\/CHANGELOG\.md/);
  await latestRelease({ fetch: gh.fetch, env: e, now: now + 60_000 });
  assert.equal(gh.calls.length, 2, 'the cache answered');
  await latestRelease({ fetch: gh.fetch, env: e, now: now + 25 * 3600_000 });
  assert.equal(gh.calls.length, 4, 'a day later it asks again');
});

test('offline, the last answer stands; with nothing cached it says why', async () => {
  const e = env();
  assert.match((await latestRelease({ fetch: github([], { fail: true }).fetch, env: e })).error, /offline/);
  await latestRelease({ fetch: github().fetch, env: e, now: 0 });
  assert.equal((await latestRelease({ fetch: github([], { fail: true }).fetch, env: e, now: 3 * 86_400_000 })).latest, '0.3.0');
});

test('a project on 0.2.0 sees 0.3.0 and only the notes it lacks; the request tells the agent every step', async () => {
  const pkg = mkdtempSync(join(tmpdir(), 'md-pkg-'));
  mkdirSync(join(pkg, 'skill'));
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ version: '0.2.0' }));
  writeFileSync(join(pkg, 'skill', 'SKILL.md'), 'This is the Motion Director skill 0.2.0.');
  const info = await updateInfo({ pkgDir: pkg, fetch: github().fetch, env: env() });
  assert.deepEqual([info.current, info.skill, info.latest, info.available, info.notes.map((n) => n.version)], ['0.2.0', '0.2.0', '0.3.0', true, ['0.3.0']]);
  const ask = updateRequest(info);
  assert.match(ask, /Motion Director 0\.3\.0 is out \(this project has 0\.2\.0\)/);
  assert.match(ask, /npx motion-director update/);
  assert.match(ask, /claude plugin update motion-director@motion-director/);
  assert.match(ask, /A soundtrack lane/);
});

test('update installs this repository at the release tag, with fixed options, and only from GitHub installs', () => {
  const top = mkdtempSync(join(tmpdir(), 'md-dep-')), project = join(top, 'promo');
  mkdirSync(project);
  writeFileSync(join(project, 'package.json'), JSON.stringify({ devDependencies: { 'motion-director': 'github:Modality-Learning/Motion-Director#v0.1.0' } }));
  const dep = dependencyOf(project);
  assert.deepEqual(installPlan(dep, '0.3.0'), { dir: project, args: ['install', '--save-dev', `github:${REPO}#v0.3.0`] });
  assert.match(installPlan({ ...dep, spec: 'file:../motion-director' }, '0.3.0').problem, /installed from a folder/);
  assert.match(installPlan({ ...dep, spec: 'github:someone/else' }, '0.3.0').problem, /doesn't update/);
  assert.match(installPlan(null, '0.3.0').problem, /doesn't list motion-director/);
  assert.match(installPlan(dep, '0.3.0; rm -rf /').problem, /Not a release/);
});

test('this repository says one version everywhere: package, plugin, skill and the newest CHANGELOG release', () => {
  const v = installedVersion();
  const plugin = JSON.parse(readFileSync(new URL('../skill/.claude-plugin/plugin.json', import.meta.url), 'utf8')).version;
  const released = parseChangelog(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'))[0].version;
  assert.deepEqual({ plugin, skill: skillVersion(), released }, { plugin: v, skill: v, released: v });
});
