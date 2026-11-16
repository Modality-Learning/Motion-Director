// The Brief tab: the film in words beside the film in pictures. On the left, the treatment Claude writes before
// anything visual (BRIEF.md beside the film's page: purpose, look, beats, titles, hits, ending), read as a
// document; in the middle, the storyboard (every key moment as a still); on the right, the parameters of what
// is on screen in the frame you clicked. The brief follows the file live, as Claude keeps it current.
import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ColumnGrip, useColumnWidth } from '@/components/ColumnGrip';
import { ParamsPanel } from '@/features/params/ParamsPanel';
import { PreviewFrame } from '@/features/preview/preview';
import { getJson } from '@/lib/api';
import { onLive } from '@/lib/live';
import { Markdown, parse } from '@/lib/markdown';
import { useStudio } from '@/lib/store';

export function BriefTab() {
  const [docW, setDocW, docR] = useColumnWidth('brief', 440, 280, 900);
  const [sideW, setSideW, sideR] = useColumnWidth('brief-params', 340, 260, 560);
  return (
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: `${docW}px minmax(0,1fr) ${sideW}px` }}>
      <div className="relative grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] border-r bg-card">
        <BriefDoc />
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

/** The open piece's BRIEF.md as a document, or what a brief is when there isn't one yet. */
function BriefDoc() {
  const route = useStudio((s) => s.route);
  const kind = route.view === 'work' ? route.kind : null, name = route.view === 'work' ? route.name : null;
  const [doc, setDoc] = useState<{ key: string; text: string | null } | null>(null);
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
  const blocks = useMemo(() => (doc?.text ? parse(doc.text) : null), [doc]);
  const folder = kind === 'comp' ? 'comps' : 'films';

  return (
    <ScrollArea className="min-h-0 [&_[data-slot=scroll-area-viewport]>div]:block!">
      <article aria-label="Brief" className="grid gap-3 px-5 py-4 text-[14px]">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="size-3.5" aria-hidden="true" />
          <span className="font-semibold tracking-wide uppercase">Brief</span>
          <code className="ml-auto truncate">{folder}/{name}/BRIEF.md</code>
        </div>
        {!doc || doc.key !== key ? <p className="text-muted-foreground">Loading…</p>
          : blocks ? <Markdown blocks={blocks} />
            : (
              <div className="grid gap-2 text-muted-foreground">
                <p className="text-foreground">No brief yet.</p>
                <p>The brief is the film in words, written and agreed before the storyboard: what it's for, how it looks, its beats and titles, where the sound hits, and how it ends.</p>
                <p>Ask Claude for one. It saves it as <code>BRIEF.md</code> in the film's folder and keeps it current, and it shows here beside the storyboard.</p>
              </div>
            )}
      </article>
    </ScrollArea>
  );
}
