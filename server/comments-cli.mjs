// motion-director comments [film]             the comments still open (queued or with Claude), newest last
// motion-director comments resolve <id> [id…]  mark comments done: the studio shows them resolved straight away
// The project is MD_ROOT (the CLI sets it from --root, or finds it).
import { join } from 'node:path';
import { filmsOf, readComments, setStatus } from './comment-queue.mjs';
import { projectRoot } from './project.mjs';

const OUT = join(projectRoot(), 'out');
const [sub, ...rest] = process.argv.slice(2);

if (sub === 'resolve') {
  const ids = rest.filter((a) => !a.startsWith('-'));
  if (!ids.length) { console.error('usage: motion-director comments resolve <id> [id…]'); process.exit(2); }
  const films = filmsOf(OUT, ids), missing = ids.filter((id) => !films.has(id));
  const byFilm = new Map();
  for (const [id, film] of films) byFilm.set(film, [...(byFilm.get(film) || []), id]);
  for (const [film, list] of byFilm) setStatus(OUT, film, list, 'resolved');
  if (films.size) console.log(`Resolved ${[...films.keys()].join(', ')}`);
  if (missing.length) { console.error(`No comment ${missing.join(', ')} in this project`); process.exit(1); }
} else {
  const { readdirSync, existsSync } = await import('node:fs');
  const dir = join(OUT, 'comments');
  const films = sub ? [sub] : existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => f.slice(0, -6)) : [];
  let any = false;
  for (const film of films) for (const c of readComments(OUT, film).filter((x) => x.status === 'queued' || x.status === 'sent')) {
    any = true;
    console.log(`[${c.id}] ${c.status} · ${film} · ${c.about || c.view}\n  ${c.text}`);
  }
  if (!any) console.log('No open comments.');
}
