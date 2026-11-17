// Setting up a project for someone new: the starter sounds, and NOTES.md for what's particular to the project.
// `motion-director init` runs both. The skill itself comes from the Claude Code plugin (see the README), or for
// Codex and other agents that read .agents/skills, `motion-director codex` links it (linkAgentSkill).
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { PKG } from './project.mjs';

/** The starter sounds (generated, so they're ours to give: templates/sounds/make-sounds.mjs) and their
 * descriptions, written into a project's sounds folder. Sounds already there are left alone. */
export async function addStarterSounds(projectDir) {
  const { makeSounds, STARTER_SOUNDS } = await import(join(PKG, 'templates', 'sounds', 'make-sounds.mjs'));
  const dir = join(projectDir, 'sounds');
  const fresh = STARTER_SOUNDS.filter((f) => !existsSync(join(dir, f)));
  if (fresh.length) makeSounds(dir); // writes all of them; the ones already there are byte-for-byte the same
  const libFile = join(dir, 'library.json');
  const starter = JSON.parse(readFileSync(join(PKG, 'templates', 'sounds', 'library.json'), 'utf8')).sounds;
  const lib = existsSync(libFile) ? JSON.parse(readFileSync(libFile, 'utf8')) : { sounds: {} };
  lib.sounds = { ...starter, ...lib.sounds }; // the project's own notes win
  writeFileSync(libFile, `${JSON.stringify(lib, null, 2)}\n`);
  return STARTER_SOUNDS;
}

/** The project's own notes, which the skill reads before starting: brand, reference films, house rules. Written
 * once by init; the project owns it after that. */
export function writeNotes(projectDir) {
  const file = join(projectDir, 'NOTES.md');
  if (existsSync(file)) return { file, written: false };
  writeFileSync(file, `# Notes for Claude

Claude reads this before making or changing a film here (the Motion Director skill says to). Keep it short and
true; delete what doesn't apply.

## Brand

The palette and fonts are in \`kit/brand.css\` once you add one (it wins over the package's). Say here anything
the files can't: the tone, words to use or avoid, how the logo may be used.

## Reference films

Films that show the look you want, by name or link, with a line on what each one shows.

## The product

Where the product's UI lives in the code, so films can copy real screens, and which parts change often.

## House rules

Anything else Claude should always or never do in this project's films.
`);
  return { file, written: true };
}

/** The repository a project sits in (where an agent is started), else the project itself. */
export function repoRoot(projectDir) {
  const r = spawnSync('git', ['-C', projectDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() ? resolve(r.stdout.trim()) : resolve(projectDir);
}

/** The skill for agents that read the shared Agent Skills folder (Codex, and others): <repo>/.agents/skills/
 * motion-director, a link to the package's skill/ folder, so it updates with the package. A relative link when
 * the package is inside the repository (commit it; it works for anyone after npm install), else an absolute one
 * (this machine only). Anything already there is left alone. */
export function linkAgentSkill(projectDir) {
  const repo = repoRoot(projectDir), at = join(repo, '.agents', 'skills', 'motion-director'), target = join(PKG, 'skill');
  let there = false; try { lstatSync(at); there = true; } catch { /* not there */ }
  if (there) return { at, written: false, shared: null };
  const inside = !relative(repo, target).startsWith('..');
  mkdirSync(dirname(at), { recursive: true });
  symlinkSync(inside ? relative(dirname(at), target) : target, at, 'dir');
  return { at, written: true, shared: inside };
}

/** The command that adds Motion Director's MCP server to Codex for this project, with this machine's paths. */
export const codexMcpCommand = (projectDir) =>
  `codex mcp add motion-director -- ${JSON.stringify(process.execPath)} ${JSON.stringify(join(PKG, 'bin', 'motion-director.mjs'))} mcp --root ${JSON.stringify(resolve(projectDir))}`;
