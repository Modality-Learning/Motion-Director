#!/usr/bin/env node
// Motion Director's command line. Every command works on a project: a folder with films/, comps/, sounds/ and
// a motion-director.config.mjs (see server/project.mjs). It is found from --root, else MD_ROOT, else the nearest
// folder above the working directory that has a config file.
//
//   motion-director studio [--port 4321]        the studio (MD_DEV=1 for hot reloading while working on it)
//   motion-director render <film> [out]         a video (env: CODEC, DSF, SOUND, WAV, BG; see render/render.sh)
//   motion-director board <film>                the storyboard as one image, in out/
//   motion-director bundle <film>               the film as one self-contained HTML file, in out/
//   motion-director web <film> [--out <dir>]    the film as a <motion-film> element for a web page (render/web.mjs)
//   motion-director purity <film> [step]        does the film draw the same opened at a time as played to it?
//   motion-director sound-check <film> [moments.json] [--hits id,id]
//   motion-director sound-search "<words>"      library sounds by what they sound like (render/sound-embed.mjs)
//   motion-director organise [--n 150] | apply <batch.json>   sort the sound library with Claude (skill/LIBRARY.md)
//   motion-director comments [film] | resolve <id…>   the studio's open comments, or mark some done
//   motion-director init [folder]             a new project with a starter film
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
  web <film> [--out <folder>]     the film into a site: player, film and React component (no video)
  purity <film> [step]            check render(t) is a pure function of time
  sound-check <film> [moments] [--hits ids]
  sound-search "<words>" [--like path] [--n 8] [--json]
  organise [--n 150] | apply <file>  list sounds to organise, or apply Claude's batch
  comments [film] | resolve <ids> list open comments, or mark them done
  status "<a few words>" | --done what you're working on, shown in the studio with a spinner
  init [folder]                   start a new project
  skill                           print where the skill lives (Claude Code: install the plugin)
  codex                           set up Codex: link the skill into .agents/skills, print its MCP command
  mcp                             the MCP server agents use for studio comments (the agent starts it)`;

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
  // a vibe board's images are usually other people's work: kept out of git, its vibe.json tracked
  writeFileSync(join(dir, '.gitignore'), 'out/\nfilms/*/vibe/\ncomps/*/vibe/\n');
  // the starter sounds are Motion Director's own (generated), so they're tracked; other sounds stay out of git
  const { addStarterSounds, writeNotes } = await import('../server/setup.mjs');
  const starter = await addStarterSounds(dir);
  writeFileSync(join(dir, 'sounds', '.gitignore'), `# your own sound files stay out of git; their settings (library.json) are tracked\n*\n!.gitignore\n!library.json\n!README.md\n# the starter sounds, made by Motion Director, are yours to keep and share\n${starter.map((f) => `!${f}`).join('\n')}\n`);
  writeNotes(dir);
  console.log(`New project in ${dir}, with a starter film, ${starter.length} starter sounds and NOTES.md (your brand and references, for Claude).`);
  console.log(`Next: npx motion-director studio${dir === resolve('.') ? '' : ` --root ${dir}`}, and ask Claude for a film.`);
  console.log('Claude needs the skill, once (in Claude Code): /plugin install motion-director --marketplace Modality-Learning/Motion-Director');
  process.exit(0);
}

if (cmd === 'mcp') {
  // the agent starts this wherever it runs, often the repository's top with the project below it: mcp.mjs finds it
  if (rootArg) process.env.MD_ROOT = resolve(rootArg);
  const { serve } = await import('../server/mcp.mjs');
  serve();
  await new Promise(() => {}); // serves until the agent closes stdin
}

const root = resolve(rootArg || process.env.MD_ROOT || findRoot() || process.cwd());
if (!existsSync(join(root, 'films'))) { console.error(`No project at ${root} (no films/ folder). Pass --root, or run motion-director init.`); process.exit(2); }
const config = await loadConfig(root);
// commands run in the project folder; MD_CWD is where they were typed, for paths given on the command line (web --out)
const env = { ...process.env, MD_ROOT: root, MD_CWD: process.cwd(), MD_DRIFT: config.checks.drift || '', ...(port ? { MD_PORT: port } : {}) };
const node = (script, args) => run(process.execPath, [join(PKG, script), ...args]);
function run(file, args) {
  const p = spawn(file, args, { env, stdio: 'inherit', cwd: root });
  p.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1));
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => p.kill(s));
}

if (cmd === 'codex') {
  // Codex (and other agents that read .agents/skills): the skill linked into the repository, and the MCP server's
  // command for reading studio comments. Claude Code gets the skill as a plugin instead (see the README).
  const { codexMcpCommand, linkAgentSkill } = await import('../server/setup.mjs');
  const r = linkAgentSkill(root);
  console.log(r.written
    ? `Linked the skill: ${r.at}${r.shared ? ' (commit it: it works for anyone after npm install)' : ' (this machine only: the package is outside the repository)'}`
    : `Kept what's already at ${r.at}`);
  console.log(`\nTo let Codex read the studio's comments, add the MCP server once on this machine:\n\n  ${codexMcpCommand(root)}\n`);
  console.log('So Codex uses its comment tools without asking each time, add this to ~/.codex/config.toml:\n\n  [mcp_servers.motion-director]\n  default_tools_approval_mode = "approve"\n');
  console.log("Codex's sandbox blocks the browser and local port that the studio, storyboards and renders need: start the studio in");
  console.log('your own terminal (npx motion-director studio), and approve storyboards and renders when Codex asks to run them');
  console.log('outside the sandbox. Then ask Codex for a film, and say "check the studio comments" after commenting in the studio.');
  process.exit(0);
}

const SCRIPTS = { studio: 'server/server.mjs', board: 'render/board.mjs', bundle: 'render/bundle.mjs', purity: 'render/purity.mjs', 'sound-check': 'render/sound-check.mjs', organise: 'render/sound-organise.mjs', 'sound-search': 'render/sound-embed.mjs', comments: 'server/comments-cli.mjs' };
SCRIPTS.web = 'render/web.mjs';
SCRIPTS.status = 'server/status-cli.mjs';
if (cmd === 'render') {
  // say what's missing before starting, rather than failing part way (render/can-render.mjs)
  const { videoSupport } = await import('../render/can-render.mjs');
  const v = await videoSupport();
  if (!v.ok) { console.error(`${v.reason}${v.fix ? `\nTo fix it: ${v.fix}` : ''}`); process.exit(1); }
  run('bash', [join(PKG, 'render', 'render.sh'), ...rest]);
}
else if (SCRIPTS[cmd]) node(SCRIPTS[cmd], rest);
else { console.error(`Unknown command ${cmd}\n${USAGE}`); process.exit(2); }
