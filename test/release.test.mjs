import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bump } from '../scripts/release.mjs';

const files = () => ({
  'package.json': '{\n  "name": "motion-director",\n  "version": "0.2.0",\n  "optionalDependencies": { "x": "1" }\n}\n',
  'package-lock.json': '{\n  "name": "motion-director",\n  "version": "0.2.0",\n  "packages": {\n    "": {\n      "name": "motion-director",\n      "version": "0.2.0"\n    },\n    "node_modules/x": { "version": "0.2.0" }\n  }\n}\n',
  'skill/.claude-plugin/plugin.json': '{ "name": "motion-director", "version": "0.2.0" }',
  'skill/SKILL.md': 'This is the Motion Director skill 0.2.0.',
  'CHANGELOG.md': '# Changelog\n\n## Unreleased\n\n- **Music.** A lane.\n\n## 0.2.0 (2026-11-17)\n\n- Codex.\n',
});

test('a release changes only the version lines, and turns Unreleased into the release', () => {
  const out = bump(files(), '0.3.0', '2026-12-01');
  assert.match(out['package.json'], /"version": "0\.3\.0"/);
  assert.match(out['package.json'], /optionalDependencies/, 'other edits stay');
  const lock = JSON.parse(out['package-lock.json']);
  assert.deepEqual([lock.version, lock.packages[''].version, lock.packages['node_modules/x'].version], ['0.3.0', '0.3.0', '0.2.0']);
  assert.equal(JSON.parse(out['skill/.claude-plugin/plugin.json']).version, '0.3.0');
  assert.equal(out['skill/SKILL.md'], 'This is the Motion Director skill 0.3.0.');
  assert.match(out['CHANGELOG.md'], /## Unreleased\n\n## 0\.3\.0 \(2026-12-01\)\n\n- \*\*Music\.\*\* A lane\.\n\n## 0\.2\.0/);
});

test('it refuses a release with nothing to say, an older version, or not a version', () => {
  assert.throws(() => bump({ ...files(), 'CHANGELOG.md': '## Unreleased\n\n## 0.2.0\n' }, '0.3.0'), /no notes under "## Unreleased"/);
  assert.throws(() => bump(files(), '0.2.0'), /isn't newer/);
  assert.throws(() => bump(files(), 'next'), /Not a version/);
});
