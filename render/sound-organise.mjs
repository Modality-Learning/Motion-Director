// Organising the sound library with Claude (skill/LIBRARY.md). Two steps, repeated batch by batch:
//
//   motion-director organise [--all] [--folder <dir>] [--n 150] [--json]
//       lists the sounds not organised yet: path, length, measured traits, where the studio files it now and
//       why, and any tags, uses or description already given. --all includes the organised ones.
//   motion-director organise apply <batch.json | ->
//       takes Claude's decisions, { "<path>": { family, tags, description, uses } }, merges them into the
//       project's sounds/library.json in one write, and marks each sound organised today. Bad entries are
//       listed and skipped. The studio picks the change up live.
//
// Families: whooshes, impacts, clicks, typing, paper, doors, alerts, music, ambience, other (kit/sound-library.mjs).
// Exit codes: 0 done, 1 something was refused (see the output), 2 usage.
import { readFileSync } from 'node:fs';
import { FAMILIES } from '../kit/sound-library.mjs';
import { projectRoot } from '../server/project.mjs';
import { analyseLibrary, listSounds, readLibrary, saveLibraryEntries } from '../server/sound-lib.mjs';
import { lineOf, mergeOrganised, toOrganise } from '../server/organise.mjs';

const ROOT = projectRoot();
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v ?? ''; };
const has = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };

if (args[0] === 'apply') {
  const src = args[1];
  if (!src) { console.error('usage: motion-director organise apply <batch.json | ->'); process.exit(2); }
  let batch;
  try { batch = JSON.parse(readFileSync(src === '-' ? 0 : src, 'utf8')); } catch (e) { console.error(`Could not read the batch: ${e.message}`); process.exit(2); }
  const known = new Set(listSounds(ROOT).map((f) => f.path));
  const today = new Date().toISOString().slice(0, 10);
  const { entries, errors } = mergeOrganised(readLibrary(ROOT), batch.sounds || batch, today, known);
  const r = Object.keys(entries).length ? saveLibraryEntries(ROOT, entries) : { count: 0 };
  if (r.error) { console.error(r.error); process.exit(1); }
  console.log(`organised ${r.count} sound${r.count === 1 ? '' : 's'} (${today})`);
  for (const e of errors) console.log(`skipped ${e}`);
  process.exit(errors.length ? 1 : 0);
}

const json = has('--json'), all = has('--all'), folder = flag('--folder') || '', n = +(flag('--n') || 150);
const files = listSounds(ROOT), lib = readLibrary(ROOT);
// measurements help with names that say little; measuring a big new library takes a while, once (it is cached)
const analysis = files.length ? await analyseLibrary(ROOT) : {};
const r = toOrganise(files, lib, analysis, { all, folder, n });
if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
console.log(`${r.organised} of ${r.total} sounds organised; ${r.waiting} ${all ? 'listed' : 'to go'}${r.waiting > r.sounds.length ? `, showing ${r.sounds.length}` : ''}.`);
console.log(`families: ${FAMILIES.map((f) => f.id).join(', ')}\n`);
for (const s of r.sounds) console.log(lineOf(s));
