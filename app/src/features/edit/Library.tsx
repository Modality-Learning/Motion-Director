// The library (left): your sound files (never tracked). Play one, drag it onto the timeline, + to add it at the
// playhead, ✎ to edit it. Sound files dragged in from the computer's files are copied in.
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { Hint } from '@/components/Hint';
import { secs } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FAMILIES, TRAITS, suggestFor, type TraitKey } from './kit';
import { nameOf, shortName } from './geometry';
import { fileLen, loadSound } from './audio';
import { matches, soundsInfo, tipOf, type SoundInfo } from './sound-info';
import { MARKS } from './motion';
import { addHere, droppedSounds, importFiles, openEditor, soundDefaults, useEdit } from './store';
import { PlayButton, SideK } from './controls';

/* The sections start folded, so a big library opens as a short list of families with a count each; a search
 * or a filter opens every section that has a match, and suggestions are always open.
 * A library can hold thousands of sounds, so the list is virtual: it is one flat list of group headings and
 * sounds at fixed heights, and only the rows in view (and a few either side) are built. The library also
 * doesn't follow the timeline's changes (useEdit's rev): it changes only when the files, their settings or
 * their analysis do. */
const HEAD = 30, ROW = 32, OVERSCAN = 8;
type Line = { kind: 'head'; id: string; label: string; count: number; open: boolean; special?: boolean; onClear?: () => void } | { kind: 'sound'; x: SoundInfo };

export function Library() {
  const files = useEdit((s) => s.files), lib = useEdit((s) => s.lib), analysis = useEdit((s) => s.analysis);
  const query = useEdit((s) => s.query), traitFilter = useEdit((s) => s.traitFilter), suggest = useEdit((s) => s.suggest);
  const opened = useEdit((s) => s.opened), folded = useEdit((s) => s.folded);
  const searching = !!query.trim() || traitFilter.size > 0;
  const [dropping, setDropping] = useState(false);
  const colRef = useRef<HTMLElement>(null);
  // a sound's length comes from its analysis, else from the file once decoded (read at the time, not followed)
  const info = useMemo(() => soundsInfo(files, lib, analysis, fileLen), [files, lib, analysis]);
  const byPath = useMemo(() => new Map(info.map((x) => [x.path, x])), [info]);
  const shown = useMemo(() => info.filter((x) => matches(x, query, traitFilter)), [info, query, traitFilter]);
  // how much of the library Claude has organised (skill/LIBRARY.md); the rest is filed by name and sound alone
  const organised = useMemo(() => files.filter((f) => lib.sounds[f.path]?.organised).length, [files, lib]);
  const toggleTrait = (k: TraitKey) => { const next = new Set(traitFilter); if (next.has(k)) next.delete(k); else next.add(k); useEdit.setState({ traitFilter: next, folded: new Set() }); };

  // the whole library column takes the drop; only files from the computer (not a sound dragged from the list)
  const fromFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes('text/x-promo-sound');
  const suggested = useMemo(() => (suggest ? suggestFor(suggest.kind === 'out' ? 'in' : suggest.kind, info).map((p) => byPath.get(p)!).filter(Boolean) : []), [suggest, info, byPath]);
  const lines = useMemo(() => {
    const out: Line[] = [];
    const group = (id: string, label: string, items: SoundInfo[], extra: Partial<Extract<Line, { kind: 'head' }>> = {}) => {
      if (!items.length) return;
      const open = extra.special ? true : searching ? !folded.has(id) : opened.has(id);
      out.push({ kind: 'head', id, label, count: items.length, open, ...extra });
      if (open) for (const x of items) out.push({ kind: 'sound', x });
    };
    if (suggest) group('suggest', `For ${MARKS[suggest.kind].suggest} at ${secs(suggest.t)}`, suggested, { special: true, onClear: () => useEdit.setState({ suggest: null }) });
    const byFamily = new Map<string, SoundInfo[]>();
    for (const x of shown) { const list = byFamily.get(x.family); if (list) list.push(x); else byFamily.set(x.family, [x]); }
    for (const f of FAMILIES) group(f.id, f.label, byFamily.get(f.id) || []);
    return out;
  }, [shown, suggested, suggest, opened, folded, searching]);
  return (
    <aside ref={colRef} aria-label="Sound library"
      className={cn('min-h-0 min-w-0 overflow-hidden border-r bg-card', dropping && 'bg-primary/8 shadow-[inset_0_0_0_2px_var(--primary)]')}
      onDragOver={(e) => { if (!fromFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropping(true); }}
      onDragLeave={(e) => { if (!colRef.current?.contains(e.relatedTarget as Node)) setDropping(false); }}
      onDrop={async (e) => { if (!fromFiles(e)) return; e.preventDefault(); setDropping(false); const { sounds, skipped } = await droppedSounds(e.dataTransfer.items, e.dataTransfer.files); importFiles(sounds, skipped); }}>
      <div className="grid h-full min-h-0 grid-rows-[auto_auto_auto_auto_minmax(0,1fr)_auto] gap-2 px-3.5 py-3 [&>*]:min-w-0">
        <SideK as="div">Sound library</SideK>
        <Input type="search" placeholder="Find: name, family, tag" aria-label="Find a sound" value={query} className="h-8 bg-background"
          onChange={(e) => useEdit.setState({ query: e.target.value, folded: new Set() })} />
        <div role="group" aria-label="Filter by sound" className="flex flex-wrap gap-1">
          {(Object.entries(TRAITS) as [TraitKey, (typeof TRAITS)[TraitKey]][]).map(([k, t]) => (
            // the hint sits on a wrapper: a Tooltip trigger's data-state would replace the Toggle's own (on/off)
            <Hint key={k} label={t.hint}>
              <span className="inline-flex">
                <Toggle size="sm" variant="outline" pressed={traitFilter.has(k)} onPressedChange={() => toggleTrait(k)} className="h-7 text-xs">{t.label}</Toggle>
              </span>
            </Hint>
          ))}
        </div>
        <p className="text-xs text-muted-foreground" title="Claude files sounds by their names, folders and how they sound: ask it to organise the library. The rest are filed by simple rules.">
          {files.length ? (organised === files.length ? `All ${files.length} sounds organised by Claude` : `${organised} of ${files.length} sounds organised by Claude`) : ''}
        </p>
        {files.length ? (shown.length || suggest ? (
          <VirtualList lines={lines} />
        ) : <p className="text-sm text-muted-foreground">No sound matches.</p>)
          : <p className="text-sm text-muted-foreground">No sounds yet. Drag sound files here to add them.</p>}
        <p className={cn('rounded-lg border border-dashed px-2.5 py-2 text-center text-sm text-muted-foreground', dropping && 'border-primary text-foreground')}>Drop sound files here to add them.</p>
      </div>
    </aside>
  );
}

function VirtualList({ lines }: { lines: Line[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 600 });
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight });
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    return () => ro.disconnect();
  }, []);
  // each line's top, so a scroll position finds its first line without walking the list
  const tops = useMemo(() => { const t = new Array<number>(lines.length + 1); t[0] = 0; lines.forEach((l, i) => { t[i + 1] = t[i] + (l.kind === 'head' ? HEAD : ROW); }); return t; }, [lines]);
  const firstAt = (y: number) => { let lo = 0, hi = lines.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (tops[mid + 1] <= y) lo = mid + 1; else hi = mid; } return lo; };
  const from = Math.max(0, firstAt(view.top) - OVERSCAN), to = Math.min(lines.length, firstAt(view.top + view.height) + OVERSCAN + 1);
  return (
    <div ref={box} onScroll={(e) => { const top = e.currentTarget.scrollTop; setView((v) => (v.top === top ? v : { ...v, top })); }} className="min-h-0 overflow-y-auto overscroll-contain pr-1.5 [scrollbar-width:thin]">
      <ul aria-label="Sounds" className="relative m-0 list-none p-0" style={{ height: tops[lines.length] }}>
        {lines.slice(from, to).map((l, i) => {
          const at = tops[from + i];
          return l.kind === 'head'
            ? <GroupHead key={`h:${l.id}`} line={l} top={at} />
            : <LibRow key={l.x.path} x={l.x} top={at} />;
        })}
      </ul>
    </div>
  );
}

const GroupHead = memo(function GroupHead({ line, top }: { line: Extract<Line, { kind: 'head' }>; top: number }) {
  const { open } = line;
  // browsing, a click opens or folds a section; while searching, it folds or reopens one with matches
  const toggle = () => {
    const s = useEdit.getState(), searching = !!s.query.trim() || s.traitFilter.size > 0, key = searching ? 'folded' : 'opened';
    const next = new Set(s[key]);
    if (next.has(line.id)) next.delete(line.id); else next.add(line.id);
    useEdit.setState({ [key]: next });
  };
  return (
    <li style={{ top, height: HEAD }} className={cn('absolute inset-x-0 flex items-center gap-1.5', line.special && 'rounded-t-lg bg-primary/6')}>
      <Button variant="ghost" size="xs" aria-expanded={open} onClick={toggle} className="group flex-1 justify-start tracking-wide text-muted-foreground uppercase">
        <ChevronRight className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')} />{line.label}<span className="ml-auto font-normal tabular-nums normal-case">{line.count}</span>
      </Button>
      {line.onClear ? <Hint label="Close"><Button variant="ghost" size="icon-xs" aria-label={`Close ${line.label}`} onClick={line.onClear} className="text-muted-foreground"><X /></Button></Hint> : null}
    </li>
  );
});

const LibRow = memo(function LibRow({ x, top }: { x: SoundInfo; top: number }) {
  const f = x.path;
  const editing = useEdit((s) => s.editing === f), fresh = useEdit((s) => s.fresh.has(f)), own = useEdit((s) => !!s.lib.sounds[f]);
  return (
    <li draggable data-path={f} title={tipOf(x)} style={{ top, height: ROW }}
      onDragStart={(e) => { e.dataTransfer.setData('text/x-promo-sound', f); e.dataTransfer.effectAllowed = 'copy'; loadSound(f); }}
      className={cn('absolute inset-x-0 grid cursor-grab grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-1 rounded-lg px-1.5 hover:bg-primary/8', editing && 'bg-primary/8', fresh && 'bg-primary/14')}>
      <PlayButton path={f} settings={() => soundDefaults(f)} icon />
      <span className="truncate text-sm" onDoubleClick={() => openEditor(f)}>
        {f.includes('/') ? <span className="text-muted-foreground">{f.slice(0, f.lastIndexOf('/') + 1)}</span> : null}{shortName(f)}
        {x.len ? <span className="text-xs text-muted-foreground"> {x.len < 10 ? x.len.toFixed(1) : Math.round(x.len)}s</span> : null}
      </span>
      {own ? <span className="size-1.5 rounded-full bg-primary" title={x.uses.length || x.description ? 'Has its own defaults, uses or description' : 'Has its own defaults'} /> : <span />}
      <Hint label="Add at the playhead (⌘: its hit at the playhead)">
        <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={`Add ${nameOf(f)} at the playhead`} onClick={(e) => addHere(f, e.metaKey || e.ctrlKey)}><Plus /></Button>
      </Hint>
      <Hint label="Edit the sound">
        <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={`Edit ${nameOf(f)}`} onClick={() => openEditor(f)}><Pencil /></Button>
      </Hint>
    </li>
  );
});
