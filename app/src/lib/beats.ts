// The beats of a brief: the table under its "Beats" heading (| Time | What happens | Title |), read into time
// ranges, so the storyboard can lay its frames out beside them (each frame in the beat its time falls in).
import type { Block } from './markdown';

export interface Beat { from: number; to: number; time: string; title: string; text: string }

/** A time as a brief writes it: "4.6", "4.6 s", "0:04.6", "1:02". */
export function seconds(s: string): number | null {
  const v = s.trim().replace(/\s*s(ec(onds?)?)?$/i, '');
  const m = v.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  return m ? (m[1] ? +m[1] * 60 : 0) + +m[2] : null;
}
/** A time range: "0–4.6 s", "16-19.6s", "0:04 – 0:09.4", "23.5 to 28.6 s". */
export function range(s: string): [number, number] | null {
  const unit = /s(ec(onds?)?)?\s*$/i.test(s.trim()) ? ' s' : '';
  const parts = s.split(/\s*(?:–|—|-|to)\s*/);
  if (parts.length !== 2) return null;
  const a = seconds(parts[0] + unit), b = seconds(parts[1]);
  return a != null && b != null && b > a ? [a, b] : null;
}

const plain = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/(^|[^\w])[*_]([^*_]+)[*_](?=[^\w]|$)/g, '$1$2').trim();

/** The brief's beats, or [] when it has no beats table (then the storyboard keeps its grid). Also says which
 * blocks the table was, so the document can leave them out where the storyboard shows them instead. */
export function beatsOf(blocks: Block[]): { beats: Beat[]; at: number[] } {
  for (let i = 0; i < blocks.length; i++) {
    const h = blocks[i];
    if (h.kind !== 'heading' || !/beats?/i.test(h.text)) continue;
    const ti = blocks.slice(i + 1).findIndex((b) => b.kind === 'table' || b.kind === 'heading');
    const t = ti < 0 ? null : blocks[i + 1 + ti];
    if (!t || t.kind !== 'table') return { beats: [], at: [] };
    const head = t.head.map((c) => plain(c).toLowerCase());
    const timeCol = head.findIndex((c) => /^time|^when/.test(c));
    if (timeCol < 0) return { beats: [], at: [] };
    const titleCol = head.findIndex((c, k) => k !== timeCol && /title|line|says|caption|text on screen/.test(c));
    const beats: Beat[] = [];
    for (const row of t.rows) {
      const r = range(plain(row[timeCol] || ''));
      if (!r) continue;
      const rest = row.filter((_, k) => k !== timeCol && k !== titleCol).map((c) => c.trim()).filter(Boolean);
      beats.push({ from: r[0], to: r[1], time: row[timeCol].trim(), title: titleCol >= 0 ? (row[titleCol] || '').trim() : '', text: rest.join(' ') });
    }
    return beats.length ? { beats, at: [i, i + 1 + ti] } : { beats: [], at: [] };
  }
  return { beats: [], at: [] };
}
