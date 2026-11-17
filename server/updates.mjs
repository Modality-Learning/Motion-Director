// Keeping a project's Motion Director current: which version is installed, the latest release on GitHub, what
// changed between them (CHANGELOG.md), and the update request an agent can act on. Used by `motion-director
// --version` and `update`, the studio's update notice, and the skill's version check.
//
// The check asks GitHub for this repository's release tags, at most once a day (cached in
// ~/.cache/motion-director/update.json, or MD_CACHE), and sends nothing about the project or the person.
// MD_NO_UPDATE_CHECK=1, or `updates: false` in motion-director.config.mjs, turns it off.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { PKG } from './project.mjs';

export const REPO = 'Modality-Learning/Motion-Director';
export const PLUGIN = 'motion-director@motion-director';
const DAY = 24 * 60 * 60_000;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** The package's version as it is on disk now (it changes under a running studio when someone updates). */
export const installedVersion = (pkgDir = PKG) => JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;

/** The version the skill is written for: its "Motion Director skill x.y.z" line. */
export function skillVersion(pkgDir = PKG) {
  try { return readFileSync(join(pkgDir, 'skill', 'SKILL.md'), 'utf8').match(/Motion Director skill (\d+\.\d+\.\d+)/)?.[1] ?? null; } catch { return null; }
}

/** -1, 0 or 1, comparing two x.y.z versions (anything else sorts first). */
export function compareVersions(a, b) {
  const pa = SEMVER.exec(a || ''), pb = SEMVER.exec(b || '');
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i = 1; i <= 3; i++) if (+pa[i] !== +pb[i]) return +pa[i] < +pb[i] ? -1 : 1;
  return 0;
}

/** The releases in a CHANGELOG, newest first: `## 0.3.0 (2026-11-20)` headings and the notes under each. */
export function parseChangelog(text) {
  const out = [];
  for (const block of String(text || '').split(/^## /m).slice(1)) {
    const [head, ...body] = block.split('\n');
    const version = head.match(/^(\d+\.\d+\.\d+)/)?.[1];
    if (version) out.push({ version, date: head.match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1] ?? null, notes: body.join('\n').trim() });
  }
  return out;
}

/** The releases after `from`, up to and including `to`, newest first. */
export const notesBetween = (changelog, from, to) =>
  parseChangelog(changelog).filter((r) => compareVersions(r.version, from) > 0 && compareVersions(r.version, to) <= 0);

const cacheFile = (env = process.env) => join(env.MD_CACHE || join(homedir(), '.cache', 'motion-director'), 'update.json');
export const checksOff = (config = {}, env = process.env) => env.MD_NO_UPDATE_CHECK === '1' || config?.updates === false;

/** The newest release on GitHub and its CHANGELOG: { latest, changelog, checkedAt } from the cache when it's less
 * than a day old, else from GitHub. { error } when GitHub can't be reached (and nothing is cached). */
export async function latestRelease({ fetch = globalThis.fetch, now = Date.now(), force = false, env = process.env } = {}) {
  const file = cacheFile(env);
  let cached = null;
  try { cached = JSON.parse(readFileSync(file, 'utf8')); } catch { /* none yet */ }
  if (!force && cached?.latest && now - Date.parse(cached.checkedAt) < DAY) return cached;
  try {
    const headers = { 'user-agent': 'motion-director-update-check', accept: 'application/vnd.github+json' };
    const res = await fetch(`https://api.github.com/repos/${REPO}/tags?per_page=100`, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const latest = (await res.json()).map((t) => t?.name?.match(/^v(\d+\.\d+\.\d+)$/)?.[1]).filter(Boolean).sort(compareVersions).at(-1);
    if (!latest) throw new Error('No releases yet');
    const log = await fetch(`https://raw.githubusercontent.com/${REPO}/v${latest}/CHANGELOG.md`, { headers, signal: AbortSignal.timeout(5000) });
    const result = { latest, changelog: log.ok ? await log.text() : '', checkedAt: new Date(now).toISOString() };
    try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(result)); } catch { /* only a cache */ }
    return result;
  } catch (err) {
    return cached?.latest ? cached : { error: err.message };
  }
}

/** Where this project stands: { current, skill, latest, available, notes, error } (notes: the releases it lacks). */
export async function updateInfo({ pkgDir = PKG, ...opts } = {}) {
  const current = installedVersion(pkgDir), skill = skillVersion(pkgDir);
  const r = await latestRelease(opts);
  if (r.error) return { current, skill, latest: null, available: false, notes: [], error: r.error };
  return { current, skill, latest: r.latest, available: compareVersions(r.latest, current) > 0, notes: notesBetween(r.changelog, current, r.latest), checkedAt: r.checkedAt };
}

/** The message for the agent: update the package, restart the studio, update the skill, and what's new. */
export function updateRequest({ current, latest, notes = [] }) {
  const news = notes.map((r) => `${r.version}:\n${r.notes}`).join('\n\n');
  return [
    `Motion Director ${latest} is out (this project has ${current}). Please update it:`,
    '1. In the project, run `npx motion-director update`.',
    '2. Restart the studio: start it again from this session, in the background, on the same port.',
    `3. If your Motion Director skill came from the Claude Code plugin, update it too: \`claude plugin update ${PLUGIN}\`, then ask me to run /reload-plugins. (In Codex and other agents the skill is linked to the package, so step 1 updates it.)`,
    news ? `\nWhat's new:\n\n${news}` : '',
  ].join('\n').trim();
}

/** How the project depends on Motion Director, from the nearest package.json at or above it that lists it:
 * { dir, field, spec } or null. */
export function dependencyOf(projectDir) {
  for (let dir = projectDir; ; dir = dirname(dir)) {
    const file = join(dir, 'package.json');
    if (existsSync(file)) {
      try {
        const pkg = JSON.parse(readFileSync(file, 'utf8'));
        for (const field of ['devDependencies', 'dependencies']) if (pkg[field]?.['motion-director']) return { dir, field, spec: pkg[field]['motion-director'] };
      } catch { /* not readable: keep looking */ }
    }
    if (dirname(dir) === dir) return null;
  }
}

/** What `motion-director update` runs, fixed options only: { dir, args } for npm, or { problem } to say instead. */
export function installPlan(dep, version) {
  if (!dep) return { problem: "This project's package.json doesn't list motion-director, so there's nothing to update here. Install it with: npm install -D github:" + REPO };
  if (!SEMVER.test(version || '')) return { problem: `Not a release: ${version}` };
  if (/^(file:|link:|\.{0,2}\/)/.test(dep.spec)) return { problem: `Motion Director is installed from a folder here (${dep.spec}): update that folder (git pull), then restart the studio.` };
  if (!/modality-learning\/motion-director/i.test(dep.spec)) return { problem: `Motion Director is installed from ${dep.spec}, which this command doesn't update. Install a release with: npm install ${dep.field === 'devDependencies' ? '-D ' : ''}github:${REPO}#v${version}` };
  return { dir: dep.dir, args: ['install', dep.field === 'devDependencies' ? '--save-dev' : '--save', `github:${REPO}#v${version}`] };
}
