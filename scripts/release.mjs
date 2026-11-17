// Makes a release: one version number for the package, the plugin and the skill, and the CHANGELOG's Unreleased
// notes turned into that release's entry. It changes only those lines, then says what to commit, tag and push;
// it never pushes. Projects learn of the release from the tag (server/updates.mjs).
// usage: node scripts/release.mjs <x.y.z>
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SEMVER = /^\d+\.\d+\.\d+$/;
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };

/** The files' new text for a release, or throws to say why it can't be made. `files` maps a path to its text. */
export function bump(files, version, date = new Date().toISOString().slice(0, 10)) {
  if (!SEMVER.test(version || '')) throw new Error(`Not a version: ${version} (x.y.z)`);
  const current = JSON.parse(files['package.json']).version;
  if (cmp(version, current) <= 0) throw new Error(`${version} isn't newer than ${current}`);
  const log = files['CHANGELOG.md'];
  const unreleased = log.match(/^## Unreleased\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!unreleased || !unreleased[1].trim()) throw new Error('CHANGELOG.md has no notes under "## Unreleased": write what changed first');
  const out = { ...files };
  // only the version lines change, so whatever else is edited in these files stays as it is
  out['package.json'] = files['package.json'].replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
  out['package-lock.json'] = files['package-lock.json']
    .replace(/^(\{\s*"name":\s*"motion-director",\s*"version":\s*")[^"]+(")/, `$1${version}$2`)
    .replace(/("packages":\s*\{\s*"":\s*\{\s*"name":\s*"motion-director",\s*"version":\s*")[^"]+(")/, `$1${version}$2`);
  out['skill/.claude-plugin/plugin.json'] = (() => { const j = JSON.parse(files['skill/.claude-plugin/plugin.json']); j.version = version; return `${JSON.stringify(j, null, 2)}\n`; })();
  if (!/Motion Director skill \d+\.\d+\.\d+/.test(files['skill/SKILL.md'])) throw new Error('skill/SKILL.md has no "Motion Director skill x.y.z" line');
  out['skill/SKILL.md'] = files['skill/SKILL.md'].replace(/Motion Director skill \d+\.\d+\.\d+/g, `Motion Director skill ${version}`);
  out['CHANGELOG.md'] = log.replace(/^## Unreleased\n/m, `## Unreleased\n\n## ${version} (${date})\n`);
  return out;
}

const FILES = ['package.json', 'package-lock.json', 'skill/.claude-plugin/plugin.json', 'skill/SKILL.md', 'CHANGELOG.md'];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  try {
    const files = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
    const out = bump(files, version);
    for (const f of FILES) if (out[f] !== files[f]) writeFileSync(join(ROOT, f), out[f]);
    console.log(`Motion Director ${version}: the package, plugin, skill and CHANGELOG say so.
Next (after npm test and a look at CHANGELOG.md):
  git commit -m "chore: release ${version}" -- ${FILES.join(' ')}
  git tag -a v${version} -m "Motion Director ${version}"
  git push origin main v${version}
Projects see the release once the tag is on GitHub.`);
  } catch (err) { console.error(err.message); process.exit(1); }
}
