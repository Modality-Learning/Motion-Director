// The Brief tab: the film in words beside the film in pictures. On the left, the treatment Claude writes before
// anything visual (BRIEF.md beside the film's page: purpose, look, hits, ending), read as a document; in the
// middle, the storyboard laid out by the brief's beats (lib/beats.ts): each beat's time, its title and what
// happens, beside the frames that fall in it, so it reads as text first and gains pictures as the storyboard
// fills in; on the right, the parameters of what is on screen in the frame you clicked. The brief follows the
// file live, as Claude keeps it current.
import { useEffect, useMemo, useState } from 'react';
import { beatsOf, type Beat } from '@/lib/beats';
import { onFilmMessage, tell } from '@/lib/frames';
import type { Block } from '@/lib/markdown';
import { FileText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ColumnGrip, useColumnWidth } from '@/components/ColumnGrip';
import { ParamsPanel } from '@/features/params/ParamsPanel';
import { PreviewFrame } from '@/features/preview/preview';
import { getJson } from '@/lib/api';
import { onLive } from '@/lib/live';
import { Markdown, parse } from '@/lib/markdown';
import { useStudio } from '@/lib/store';
import { openQuoteBox } from '@/features/comments/comments';

export function BriefTab() {
  const doc = useBrief();
  const blocks = useMemo(() => (doc?.text ? parse(doc.text) : null), [doc]);
  const { beats, at } = useMemo(() => (blocks ? beatsOf(blocks) : { beats: [] as Beat[], at: [] as number[] }), [blocks]);
  // the storyboard takes the beats now, and again whenever it (re)loads
  useEffect(() => { tell('storyboard', { type: 'beats', beats }); }, [beats]);
  useEffect(() => onFilmMessage((from, m) => { if (from === 'storyboard' && m.type === 'ready') tell('storyboard', { type: 'beats', beats }); }), [beats]);
  const [docW, setDocW, docR] = useColumnWidth('brief', 400, 280, 900);
  const [sideW, setSideW, sideR] = useColumnWidth('brief-params', 340, 260, 560);
  return (
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: `${docW}px minmax(0,1fr) ${sideW}px` }}>
      <div className="relative grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] border-r bg-card">
        <BriefDoc doc={doc} blocks={blocks} beatsAt={at} beats={beats.length} />
        <ColumnGrip label="Brief width" width={docW} onWidth={setDocW} edge="right" {...docR} />
      </div>
      <PreviewFrame tab="storyboard" title="Storyboard" className="min-h-[480px]" />
      <div className="relative grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] border-l">
        <ScrollArea className="min-h-0 [&_[data-slot=scroll-area-viewport]>div]:block!"><div className="p-4"><ParamsPanel tab="storyboard" /></div></ScrollArea>
        <ColumnGrip label="Parameters width" width={sideW} onWidth={setSideW} edge="left" {...sideR} />
      </div>
    </div>
  );
}

type Doc = { key: string; text: string | null } | null;

/* In comment mode the brief takes comments a paragraph at a time: what you point at (a paragraph, a list item, a
 * heading, a table row) is outlined, and a click comments on it, quoting it with the section it is in (the
 * nearest heading above it). Enough for Claude to know where to look, without selecting words exactly. */
const BLOCK = 'p, li, h1, h2, h3, h4, tr, blockquote';
const blockAt = (e: React.MouseEvent<HTMLElement>) => (useStudio.getState().commentMode ? (e.target as HTMLElement).closest<HTMLElement>(BLOCK) : null);
let hovered: HTMLElement | null = null;
function hoverBlock(e: React.MouseEvent<HTMLElement>) {
  const n = blockAt(e);
  if (n === hovered) return;
  hovered?.classList.remove('quote-hover'); hovered = n; n?.classList.add('quote-hover');
}
function quoteBlock(e: React.MouseEvent<HTMLElement>) {
  const n = blockAt(e), article = e.currentTarget;
  if (!n || !article.contains(n)) return;
  e.preventDefault();
  let top: Element | null = n;
  while (top && top.parentElement !== article) top = top.parentElement;
  let section: string | null = null;
  for (let h: Element | null = /^H[1-6]$/.test(n.tagName) ? null : top; h; h = h.previousElementSibling) if (/^H[1-6]$/.test(h.tagName)) { section = h.textContent?.trim() || null; break; }
  const text = (n.tagName === 'TR' ? [...n.children].map((c) => c.textContent?.trim()).filter(Boolean).join(' · ') : n.textContent || '').replace(/\s+/g, ' ').trim();
  if (text) openQuoteBox({ text: text.slice(0, 600), section }, 0, e.clientX, e.clientY);
}
/** The open piece's BRIEF.md, kept current as the file changes. */
function useBrief(): Doc {
  const route = useStudio((s) => s.route);
  const kind = route.view === 'work' ? route.kind : null, name = route.view === 'work' ? route.name : null;
  const [doc, setDoc] = useState<Doc>(null);
  const key = `${kind}/${name}`;
  useEffect(() => {
    if (!kind || !name) return;
    let live = true;
    const load = () => getJson<{ text: string | null }>(`/api/brief?kind=${kind}&name=${encodeURIComponent(name)}`)
      .then((r) => { if (live) setDoc({ key, text: r.text ?? null }); }).catch(() => { if (live) setDoc({ key, text: null }); });
    load();
    const off = onLive((ev) => { if (ev.type === 'brief' && (kind === 'film' ? ev.film : ev.comp) === name) load(); });
    return () => { live = false; off(); };
  }, [kind, name, key]);
  return doc && doc.key === key ? doc : null;
}

/** The brief as a document, its beats left to the storyboard beside it; or what a brief is when there isn't one. */
function BriefDoc({ doc, blocks, beatsAt, beats }: { doc: Doc; blocks: Block[] | null; beatsAt: number[]; beats: number }) {
  const route = useStudio((s) => s.route);
  const kind = route.view === 'work' ? route.kind : null, name = route.view === 'work' ? route.name : null;
  const folder = kind === 'comp' ? 'comps' : 'films';
  const shown = blocks && beatsAt.length ? blocks.filter((_, i) => !beatsAt.includes(i)) : blocks;

  return (
    <ScrollArea className="min-h-0 [&_[data-slot=scroll-area-viewport]>div]:block!">
      <article aria-label="Brief" onMouseOver={hoverBlock} onMouseLeave={() => { hovered?.classList.remove('quote-hover'); hovered = null; }} onClick={quoteBlock} className="grid gap-3 px-5 py-4 text-[14px]">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="size-3.5" aria-hidden="true" />
          <span className="font-semibold tracking-wide uppercase">Brief</span>
          <code className="ml-auto truncate">{folder}/{name}/BRIEF.md</code>
        </div>
        {!doc ? <p className="text-muted-foreground">Loading…</p>
          : shown ? (
            <>
              <Markdown blocks={shown} />
              {beats ? <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">Its {beats} beats are beside the storyboard, each with the frames that fall in it.</p> : null}
            </>
          ) : (
            <div className="grid gap-2 text-muted-foreground">
              <p className="text-foreground">No brief yet.</p>
              <p>The brief is the film in words, written and agreed before the storyboard: what it's for, how it looks, its beats and titles, where the sound hits, and how it ends.</p>
              <p>Ask Claude for one. It saves it as <code>BRIEF.md</code> in the film's folder and keeps it current. It shows here, and its beats line up with the storyboard beside it.</p>
            </div>
          )}
      </article>
    </ScrollArea>
  );
}
