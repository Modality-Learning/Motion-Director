// A small Markdown reader for the documents Claude writes beside a film (TREATMENT.md): headings, paragraphs,
// lists (nested by indent), tables, quotes, rules, and inline bold, italic, code and links. It builds React
// elements, never HTML from the text, so whatever is in the file shows as text. Not a full CommonMark: what a
// treatment needs, read the way a person would write it.
import { Fragment, type ReactNode } from 'react';

export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'list'; ordered: boolean; items: { text: string; children: Block[] }[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' }
  | { kind: 'code'; text: string };

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

/** Reads Markdown into blocks. */
export function parse(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n'), out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m: RegExpMatchArray | null;
    if (/^```/.test(line.trim())) {
      const body: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) body.push(lines[i++]);
      i++; out.push({ kind: 'code', text: body.join('\n') }); continue;
    }
    if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) { out.push({ kind: 'heading', level: m[1].length, text: m[2] }); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push({ kind: 'rule' }); i++; continue; }
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(line), rows: string[][] = []; i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      out.push({ kind: 'table', head, rows }); continue;
    }
    if (line.trim().startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) body.push(lines[i++].trim().replace(/^>\s?/, ''));
      out.push({ kind: 'quote', text: body.join(' ') }); continue;
    }
    if (LIST.test(line)) { const r = list(lines, i, (line.match(LIST)![1] || '').length); out.push(r.block); i = r.next; continue; }
    // a paragraph: lines until a blank line or another kind of block
    const body = [line.trim()]; i++;
    while (i < lines.length && lines[i].trim() && !LIST.test(lines[i]) && !/^(#{1,6}\s|```|>|\|)/.test(lines[i].trim())) body.push(lines[i++].trim());
    out.push({ kind: 'para', text: body.join(' ') });
  }
  return out;
}

function list(lines: string[], start: number, indent: number) {
  const first = lines[start].match(LIST)!, ordered = /\d/.test(first[2]);
  const items: { text: string; children: Block[] }[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { // a blank line ends the list unless the next line carries it on
      const next = lines[i + 1];
      if (next && (LIST.test(next) && (next.match(LIST)![1] || '').length >= indent || /^\s{2,}\S/.test(next))) { i++; continue; }
      break;
    }
    const m = line.match(LIST);
    const at = m ? (m[1] || '').length : line.length - line.trimStart().length;
    if (m && at === indent) { items.push({ text: m[3], children: [] }); i++; continue; }
    if (m && at > indent && items.length) { const r = list(lines, i, at); items.at(-1)!.children.push(r.block); i = r.next; continue; }
    if (!m && at > indent && items.length) { items.at(-1)!.text += ` ${line.trim()}`; i++; continue; } // a wrapped item
    break;
  }
  return { block: { kind: 'list' as const, ordered, items }, next: i };
}

/** Inline Markdown: **bold**, *italic* or _italic_, `code`, [links](http…). Everything else is text. */
export function inline(text: string, key = ''): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*?)\*|(?<![\w])_([^_]+)_(?![\w]))/g;
  let last = 0, m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}${n++}`;
    if (m[2] || m[3]) out.push(<strong key={k}>{inline(m[2] || m[3], `${k}.`)}</strong>);
    else if (m[4]) out.push(<code key={k} className="rounded bg-muted px-1 py-px text-[0.9em]">{m[4]}</code>);
    else if (m[5]) out.push(/^https?:\/\//.test(m[6]) ? <a key={k} href={m[6]} target="_blank" rel="noreferrer noopener">{inline(m[5], `${k}.`)}</a> : <Fragment key={k}>{m[5]}</Fragment>);
    else out.push(<em key={k}>{inline(m[7] || m[8], `${k}.`)}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Renders blocks with the studio's type. */
export function Markdown({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((b, i) => <BlockView key={i} b={b} />)}</>;
}
function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case 'heading': {
      const cls = b.level === 1 ? 'text-xl font-semibold tracking-tight' : b.level === 2 ? 'mt-2 text-base font-semibold' : 'text-sm font-semibold text-muted-foreground uppercase tracking-wide';
      const H = (`h${Math.min(6, b.level + 1)}`) as 'h2';
      return <H className={cls}>{inline(b.text)}</H>;
    }
    case 'para': return <p className="leading-relaxed">{inline(b.text)}</p>;
    case 'quote': return <blockquote className="border-l-2 pl-3 text-muted-foreground">{inline(b.text)}</blockquote>;
    case 'rule': return <hr className="border-border" />;
    case 'code': return <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">{b.text}</pre>;
    case 'list': {
      const L = b.ordered ? 'ol' : 'ul';
      return (
        <L className={b.ordered ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5 marker:text-muted-foreground'}>
          {b.items.map((it, i) => <li key={i} className="leading-relaxed">{inline(it.text)}{it.children.length ? <div className="mt-1 space-y-1"><Markdown blocks={it.children} /></div> : null}</li>)}
        </L>
      );
    }
    case 'table': return (
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left"><tr>{b.head.map((h, i) => <th key={i} className="px-3 py-2 font-semibold">{inline(h)}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, i) => <tr key={i} className="border-t align-top">{r.map((c, j) => <td key={j} className="px-3 py-2">{inline(c)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
}
