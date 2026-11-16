// Comments from the studio are messages to an agent: the studio copies each one as a note to paste into
// the chat. A plain log of the notes is also kept in promo/out/comments/<film>.jsonl (not tracked, not
// shown anywhere), so a note that never got pasted can still be found.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);

/** Checks a comment sent by the studio page. Returns { comment } or { error }. */
const ITEM_KINDS = ['clip', 'object', 'track', 'beat', 'timeline'];
export function validateComment(body, films) {
  const film = films.find((f) => f.name === body?.film);
  if (!film) return { error: 'Unknown film' };
  const text = str(body.text, 2000);
  if (!text || !text.trim()) return { error: 'Write a comment first' };
  // 'motion' is the old name of the Edit tab's preview, kept so older logs still read
  const view = ['storyboard', 'motion', 'edit'].includes(body.view) ? body.view : null;
  if (!view) return { error: 'Unknown view' };
  const t = typeof body.t === 'number' && Number.isFinite(body.t) && body.t >= 0 && body.t <= (film.duration ?? 3600) ? body.t : null;
  if (t === null) return { error: 'Bad time' };
  const frame = body.frame == null ? null : str(body.frame, 120);
  // the target is an element with parameters, any other element (preview), or nothing (the frame or video)
  const tg = body.target;
  let target = null;
  if (tg != null && tg.item != null) {
    // something on the Edit tab's timeline: a clip, an object, a track, a beat, or the timeline at a time
    const it = tg.item;
    target = { item: { kind: ITEM_KINDS.includes(it.kind) ? it.kind : null, label: str(it.label, 120), detail: it.detail == null ? null : str(it.detail, 240), id: it.id == null ? null : str(it.id, 60) } };
    if (!target.item.kind || !target.item.label || (it.detail != null && target.item.detail === null) || (it.id != null && target.item.id === null)) return { error: 'Bad target' };
  } else if (tg != null && tg.scope != null) {
    target = { scope: str(tg.scope, 120), label: str(tg.label, 120), value: tg.value == null ? null : str(tg.value, 400) };
    if (!target.scope || !target.label || (tg.value != null && target.value === null)) return { error: 'Bad target' };
  } else if (tg != null) {
    target = { selector: str(tg.selector, 240), text: tg.text == null ? null : str(tg.text, 160) };
    if (!target.selector || (tg.text != null && target.text === null)) return { error: 'Bad target' };
  }
  return { comment: { film: film.name, view, frame, t, target, text: text.trim() } };
}

/** The comment as a note to paste into a chat with an agent. */
export function formatComment(c, film) {
  const time = `${Math.floor(c.t / 60)}:${(c.t % 60).toFixed(1).padStart(4, '0')}`;
  const tg = c.target, current = tg?.value ? `, currently "${tg.value.replace(/\n/g, ' / ')}"` : '';
  let about;
  if (c.view === 'storyboard') {
    const frame = `"${c.frame}" (storyboard, ${time})`;
    about = tg ? `${tg.label} (${tg.scope}) in ${frame}${current}` : frame;
  } else if (!tg) about = `the video at ${time}`;
  else if (tg.item) {
    const it = tg.item, detail = it.detail ? ` (${it.detail})` : '';
    about = it.kind === 'beat' ? `the "${it.label}" beat at ${time}${detail}`
      : it.kind === 'timeline' ? `the sound timeline at ${time}`
      : `${it.label} on the sound timeline at ${time}${detail}`;
    const where = it.kind === 'beat' ? `Beats: the KEYS list in promo/films/${film.name}/index.html` : `Sounds: promo/films/${film.name}/sound.json${it.id ? ` (${it.kind === 'clip' ? 'cue' : it.kind} "${it.id}")` : ''}`;
    return [`Motion Director comment on "${film.title}"`, `Film: promo/films/${film.name}/index.html`, where, `About: ${about}`, `Comment: ${c.text}`].join('\n');
  } else if (tg.scope) about = `${tg.label} (${tg.scope}) at ${time}${current}`;
  // an element without parameters: what it shows, and a selector to find it in the film's code
  else about = `${tg.text ? `"${tg.text}" ` : ''}(${tg.selector}) at ${time}`;
  return [`Motion Director comment on "${film.title}"`, `Film: promo/films/${film.name}/index.html`, `About: ${about}`, `Comment: ${c.text}`].join('\n');
}

/** Appends the note to the film's log, newest last. */
export function logComment(outDir, comment, note, now = new Date()) {
  mkdirSync(join(outDir, 'comments'), { recursive: true });
  appendFileSync(join(outDir, 'comments', `${comment.film}.jsonl`), JSON.stringify({ at: now.toISOString(), ...comment, note }) + '\n');
}
