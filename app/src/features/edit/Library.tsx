// The library (left): your sound files (never tracked). Play one, drag it onto the timeline, + to add it at the
// playhead, ✎ to edit it. Sound files dragged in from Finder are copied in.
import { useRef, useState } from 'react';
import { ChevronRight, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toggle } from '@/components/ui/toggle';
import { Hint } from '@/components/Hint';
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
            // the hint sits on a wrapper: a Tooltip trigger's data-state would replace the Toggle's own (on/off)
            <Hint key={k} label={t.hint}>
              <span className="inline-flex">
                <Toggle size="sm" variant="outline" pressed={traitFilter.has(k)} onPressedChange={() => toggleTrait(k)} className="h-7 text-xs">{t.label}</Toggle>
              </span>
            </Hint>
          ))}
        </div>
        {files.length ? (shown.length || suggest ? (
          <ScrollArea className="min-h-0 [&_[data-slot=scroll-area-viewport]>div]:block!">
            <div className="grid content-start gap-1.5 pr-2.5">
            {suggest ? (
              <Group id="suggest" special label={`For ${MARKS[suggest.kind].suggest} at ${secs(suggest.t)}`} items={suggested} onClear={() => useEdit.setState({ suggest: null })} />
            ) : null}
            {FAMILIES.map((f) => <Group key={f.id} id={f.id} label={f.label} items={shown.filter((x) => x.family === f.id)} />)}
            </div>
          </ScrollArea>
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
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="xs" className="group flex-1 justify-start tracking-wide text-muted-foreground uppercase">
            <ChevronRight className="transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" />{label}
          </Button>
        </CollapsibleTrigger>
        {onClear ? <Hint label="Close"><Button variant="ghost" size="icon-xs" aria-label={`Close ${label}`} onClick={onClear} className="text-muted-foreground"><X /></Button></Hint> : null}
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
      <Hint label="Add at the playhead (⌘: its hit at the playhead)">
        <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={`Add ${nameOf(f)} at the playhead`} onClick={(e) => addHere(f, e.metaKey || e.ctrlKey)}><Plus /></Button>
      </Hint>
      <Hint label="Edit the sound">
        <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={`Edit ${nameOf(f)}`} onClick={() => openEditor(f)}><Pencil /></Button>
      </Hint>
    </li>
  );
}
