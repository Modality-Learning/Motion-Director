// The library (left): your sound files (never tracked). Play one, drag it onto the timeline, + to add it at the
// playhead, ✎ to edit it. Sound files dragged in from Finder are copied in.
import { useRef, useState } from 'react';
import { ChevronRight, Pencil, Plus, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { secs } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FAMILIES, TRAITS, suggestFor, type TraitKey } from './kit';
import { nameOf, shortName } from './geometry';
import { fileLen, loadSound } from './audio';
import { matches, soundsInfo, tipOf, type SoundInfo } from './sound-info';
import { MARKS } from './motion';
import { addHere, importFiles, openEditor, soundDefaults, useEdit } from './store';
import { PlayButton, SideK } from './controls';

export function Library() {
  useEdit((s) => s.rev);
  const files = useEdit((s) => s.files), lib = useEdit((s) => s.lib), analysis = useEdit((s) => s.analysis);
  const query = useEdit((s) => s.query), traitFilter = useEdit((s) => s.traitFilter), suggest = useEdit((s) => s.suggest);
  const [dropping, setDropping] = useState(false);
  const colRef = useRef<HTMLElement>(null);
  const info = soundsInfo(files, lib, analysis, fileLen), byPath = new Map(info.map((x) => [x.path, x]));
  const shown = info.filter((x) => matches(x, query, traitFilter));
  const toggleTrait = (k: TraitKey) => { const next = new Set(traitFilter); if (next.has(k)) next.delete(k); else next.add(k); useEdit.setState({ traitFilter: next }); };

  // the whole library column takes the drop; only Finder files (not a sound dragged from the list)
  const fromFinder = (e: React.DragEvent) => e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes('text/x-promo-sound');
  const suggested = suggest ? suggestFor(suggest.kind === 'out' ? 'in' : suggest.kind, info).map((p) => byPath.get(p)!).filter(Boolean) : [];
  return (
    <aside ref={colRef} aria-label="Sound library"
      className={cn('min-h-0 min-w-0 overflow-hidden border-r bg-card', dropping && 'bg-primary/8 shadow-[inset_0_0_0_2px_var(--primary)]')}
      onDragOver={(e) => { if (!fromFinder(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropping(true); }}
      onDragLeave={(e) => { if (!colRef.current?.contains(e.relatedTarget as Node)) setDropping(false); }}
      onDrop={(e) => { if (!fromFinder(e)) return; e.preventDefault(); setDropping(false); importFiles(e.dataTransfer.files); }}>
      <div className="grid h-full min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] gap-2 px-3.5 py-3 [&>*]:min-w-0">
        <SideK as="div">Library</SideK>
        <Input type="search" placeholder="Find: name, family, tag" aria-label="Find a sound" value={query} className="h-8 bg-background"
          onChange={(e) => useEdit.setState({ query: e.target.value })} />
        <div role="group" aria-label="Filter by sound" className="flex flex-wrap gap-1">
          {(Object.entries(TRAITS) as [TraitKey, (typeof TRAITS)[TraitKey]][]).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={traitFilter.has(k)} title={t.hint} onClick={() => toggleTrait(k)}
              className="cursor-pointer rounded-md border px-2 py-1 text-xs leading-none font-semibold text-muted-foreground hover:border-muted-foreground hover:text-foreground aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground">
              {t.label}
            </button>
          ))}
        </div>
        {files.length ? (shown.length || suggest ? (
          <div className="grid min-h-0 content-start gap-1.5 overflow-auto">
            {suggest ? (
              <Group id="suggest" special label={`For ${MARKS[suggest.kind].suggest} at ${secs(suggest.t)}`} items={suggested} onClear={() => useEdit.setState({ suggest: null })} />
            ) : null}
            {FAMILIES.map((f) => <Group key={f.id} id={f.id} label={f.label} items={shown.filter((x) => x.family === f.id)} />)}
          </div>
        ) : <p className="text-sm text-muted-foreground">No sound matches.</p>)
          : <p className="text-sm text-muted-foreground">No sounds yet. Drag sound files here from Finder.</p>}
        <p className={cn('rounded-lg border border-dashed px-2.5 py-2 text-center text-sm text-muted-foreground', dropping && 'border-primary text-foreground')}>Drop sound files from Finder here to add them.</p>
      </div>
    </aside>
  );
}

function Group({ id, label, items, special = false, onClear }: { id: string; label: string; items: SoundInfo[]; special?: boolean; onClear?: () => void }) {
  const closed = useEdit((s) => s.closed.has(id));
  if (!items.length) return null;
  const setOpen = (open: boolean) => { const next = new Set(useEdit.getState().closed); if (open) next.delete(id); else next.add(id); useEdit.setState({ closed: next }); };
  return (
    <Collapsible open={!closed} onOpenChange={setOpen} className={cn(special && 'rounded-lg border border-primary/30 bg-primary/6 px-1.5 pt-0.5 pb-1.5')}>
      <div className="flex items-center gap-1.5">
        <CollapsibleTrigger className="group flex flex-1 cursor-pointer items-center gap-1.5 py-1.5 pl-0.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground">
          <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" />{label}
        </CollapsibleTrigger>
        {onClear ? <button type="button" aria-label={`Close ${label}`} onClick={onClear} className="cursor-pointer text-muted-foreground hover:text-primary"><X className="size-3.5" /></button> : null}
      </div>
      <CollapsibleContent>
        <ul className="m-0 grid list-none content-start p-0">{items.map((x) => <LibRow key={x.path} x={x} />)}</ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function LibRow({ x }: { x: SoundInfo }) {
  const f = x.path;
  const editing = useEdit((s) => s.editing === f), fresh = useEdit((s) => s.fresh.has(f)), own = useEdit((s) => !!s.lib.sounds[f]);
  const mini = 'grid size-[26px] cursor-pointer place-items-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:text-primary focus-visible:border-border focus-visible:text-primary';
  return (
    <li draggable data-path={f} title={tipOf(x)}
      onDragStart={(e) => { e.dataTransfer.setData('text/x-promo-sound', f); e.dataTransfer.effectAllowed = 'copy'; loadSound(f); }}
      className={cn('grid cursor-grab grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-primary/8', editing && 'bg-primary/8', fresh && 'bg-primary/14')}>
      <PlayButton path={f} settings={() => soundDefaults(f)} icon />
      <span className="truncate text-sm" onDoubleClick={() => openEditor(f)}>
        {f.includes('/') ? <span className="text-muted-foreground">{f.slice(0, f.lastIndexOf('/') + 1)}</span> : null}{shortName(f)}
        {x.len ? <span className="text-xs text-muted-foreground"> {x.len < 10 ? x.len.toFixed(1) : Math.round(x.len)}s</span> : null}
      </span>
      {own ? <span className="size-1.5 rounded-full bg-primary" title={x.uses.length || x.description ? 'Has its own defaults, uses or description' : 'Has its own defaults'} /> : <span />}
      <button type="button" className={mini} title="Add at the playhead (⌘: its hit at the playhead)" aria-label={`Add ${nameOf(f)} at the playhead`} onClick={(e) => addHere(f, e.metaKey || e.ctrlKey)}><Plus className="size-4" /></button>
      <button type="button" className={mini} title="Edit the sound" aria-label={`Edit ${nameOf(f)}`} onClick={() => openEditor(f)}><Pencil className="size-3.5" /></button>
    </li>
  );
}
