#!/usr/bin/env node
// Motion Director's command line. Every command works on a project: a folder with films/, comps/, sounds/ and
// a motion-director.config.mjs (see server/project.mjs). It is found from --root, else MD_ROOT, else the nearest
// folder above the working directory that has a config file.
//
//   motion-director studio [--port 4321]        the studio (MD_DEV=1 for hot reloading while working on it)
//   motion-director render <film> [out]         a video (env: CODEC, DSF, SOUND, WAV, BG; see render/render.sh)
//   motion-director board <film>                the storyboard as one image, in out/
//   motion-director bundle <film>               the film as one self-contained HTML file, in out/
//   motion-director purity <film> [step]        does the film draw the same opened at a time as played to it?
//   motion-director sound-check <film> [moments.json] [--hits id,id]
//   motion-director init [folder]               a new project with a starter film
//   motion-director skill                       where the Claude skill is, to link into a project's skills
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CONFIG, PKG, findRoot, loadConfig } from '../server/project.mjs';

const USAGE = `usage: motion-director <command> [--root <project>]
  studio [--port n]               open the studio
  render <film> [out]             render a video
  board <film>                    save the storyboard image
  bundle <film>                   save the film as one HTML file
  purity <film> [step]            check render(t) is a pure function of time
  sound-check <film> [moments] [--hits ids]
  init [folder]                   start a new project
  skill                           print where the Claude skill lives`;

const argv = process.argv.slice(2);
const take = (flag) => { const i = argv.indexOf(flag); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v ?? null; };
const rootArg = take('--root'), port = take('--port');
const [cmd, ...rest] = argv;

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { console.log(USAGE); process.exit(cmd ? 0 : 2); }

if (cmd === 'skill') { console.log(join(PKG, 'skill')); process.exit(0); }

if (cmd === 'init') {
  const dir = resolve(rest[0] || '.');
  if (existsSync(join(dir, CONFIG))) { console.error(`${dir} is already a Motion Director project`); process.exit(1); }
  for (const d of ['films', 'comps', 'sounds', 'kit', 'out']) mkdirSync(join(dir, d), { recursive: true });
  cpSync(join(PKG, 'templates', 'film'), join(dir, 'films', '_template'), { recursive: true });
  writeFileSync(join(dir, CONFIG), `// Motion Director project. See ${join(PKG, 'README.md')}.\nexport default {\n  name: '',\n  // checks: { drift: 'scripts/ui-drift.mjs' }, // your own check that a film's screens still match your app\n};\n`);
  writeFileSync(join(dir, '.gitignore'), 'out/\n');
  writeFileSync(join(dir, 'sounds', '.gitignore'), '# your own sound files stay out of git; their settings (library.json) are tracked\n*\n!.gitignore\n!library.json\n!README.md\n');
  console.log(`New project in ${dir}. Copy films/_template to films/<name> to start a film, then: motion-director studio --root ${dir}`);
  process.exit(0);
}

const root = resolve(rootArg || process.env.MD_ROOT || findRoot() || process.cwd());
if (!existsSync(join(root, 'films'))) { console.error(`No project at ${root} (no films/ folder). Pass --root, or run motion-director init.`); process.exit(2); }
const config = await loadConfig(root);
const env = { ...process.env, MD_ROOT: root, MD_DRIFT: config.checks.drift || '', ...(port ? { MD_PORT: port } : {}) };
const node = (script, args) => run(process.execPath, [join(PKG, script), ...args]);
function run(file, args) {
  const p = spawn(file, args, { env, stdio: 'inherit', cwd: root });
  p.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1));
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => p.kill(s));
}

const SCRIPTS = { studio: 'server/server.mjs', board: 'render/board.mjs', bundle: 'render/bundle.mjs', purity: 'render/purity.mjs', 'sound-check': 'render/sound-check.mjs' };
if (cmd === 'render') run('bash', [join(PKG, 'render', 'render.sh'), ...rest]);
else if (SCRIPTS[cmd]) node(SCRIPTS[cmd], rest);
else { console.error(`Unknown command ${cmd}\n${USAGE}`); process.exit(2); }
