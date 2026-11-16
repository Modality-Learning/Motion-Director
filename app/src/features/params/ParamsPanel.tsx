import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Hint } from '@/components/Hint';
import { tell, type FrameTab } from '@/lib/frames';
import { isFilm, useOpenItem, useStudio, type Scope } from '@/lib/store';
import { cn } from '@/lib/utils';
import { fmtT } from '@/lib/format';
import { liveValue, paramRefs, saveParam, scopeIdOf, type ParamRef } from './params';

/* ── the parameters: the Storyboard tab's sidebar, and the Edit tab's inspector ──
 * The preview reports its time and the scopes it covers: a film's own titles, a placed composition. Fields
 * whose element is on screen come first; the rest fold away; parameters with no scope are Global. In Edit the
 * inspector follows the selection: an element shows only its own parameters, a clip hides them.
 * Every field stays in one list and only its order changes, so a field you are typing in keeps its focus. The
 * folds are Collapsibles holding only their trigger: the fields they open stay in that one list, shown or hidden
 * in place, so a fold never moves a field into a different parent (which would remount it and lose the focus). */

const picks = new Set<(id: string) => void>();
/** The preview's picker chose an element: its fields come into view and take focus. */
export function focusScope(id: string) { for (const f of picks) f(id); }

const onScreen = (sc: Scope, t: number | null) => t == null || sc.ranges.some(([a, b]) => t >= a && t <= b);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function ParamsPanel({ tab, className }: { tab: FrameTab; className?: string }) {
  const item = useOpenItem();
  const catalog = useStudio((s) => s.catalog);
  const scopes = useStudio((s) => s.scopes[tab]);
  const t = useStudio((s) => s.times[tab]);
  const boardKey = useStudio((s) => s.boardKey);
  const selection = useStudio((s) => s.selection);
  const [note, setNote] = useState('');
  const [laterOpen, setLaterOpen] = useState(false);
  const [globalOpen, setGlobalOpen] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refs = useMemo(() => paramRefs(), [catalog, item?.name]);
  const only = tab === 'edit' && selection.kind === 'element' ? selection.scope : null;

  const placed = refs.map((r) => {
    const sc = item ? scopes.find((s) => s.id === scopeIdOf(r, item.kind)) : undefined;
    const group = !sc ? 'global' : only ? (sc.id === only ? 'now' : 'hidden') : onScreen(sc, t) ? 'now' : 'later';
    return { r, sc, group: group as 'now' | 'later' | 'global' | 'hidden' };
  });
  const count = (g: string) => placed.filter((x) => x.group === g).length;

  useEffect(() => {
    const fn = (id: string) => {
      const mine = placed.filter((x) => x.sc?.id === id);
      if (!mine.length) return;
      if (mine[0].group === 'later') setLaterOpen(true);
      setFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }));
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-scope="${CSS.escape(id)}"]`);
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        // the chosen option, else the text, else the first control
        (el?.querySelector<HTMLElement>('[data-state=on]') || el?.querySelector<HTMLElement>('textarea') || el?.querySelector<HTMLElement>('input,button'))?.focus({ preventScroll: true });
      });
    };
    picks.add(fn);
    return () => { picks.delete(fn); };
  });

  if (!item) return null;
  const hl = (id: string | null) => tell(tab, { type: 'highlight', id });
  const where = t == null ? (tab === 'storyboard' ? 'Click a frame to see its parameters.' : '') : tab === 'storyboard' ? `${boardKey ?? ''} · ${fmtT(t)}` : `At ${fmtT(t)}`;
  const order = { now: 1, later: 3, global: 5, hidden: 9 };
  const shown = (g: string) => g === 'now' || (g === 'later' && laterOpen) || (g === 'global' && globalOpen && !only);
  const used = isFilm(item) ? item.comps.map((c) => catalog?.comps.find((y) => y.name === c)).filter((c) => !!c) : [];
  const usedBy = !isFilm(item) ? item.usedBy.map((n) => catalog?.films.find((f) => f.name === n)).filter((f) => !!f) : [];

  return (
    <aside aria-labelledby={`side-${tab}`} className={cn('grid content-start gap-3', className)}>
      {!only ? (
        <div>
          <h2 id={`side-${tab}`} className="text-base font-semibold">Parameters</h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">{[where, note].filter(Boolean).join(' · ')}</p>
        </div>
      ) : <h2 id={`side-${tab}`} className="sr-only">Parameters</h2>}
      <div ref={listRef} className="flex flex-col gap-3">
        <h3 className="order-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{only ? 'Parameters' : 'On screen now'}</h3>
        {!count('now') ? <p className="order-1 text-sm text-muted-foreground">{placed.some((x) => x.sc) ? 'Nothing with its own parameters is on screen.' : 'This piece has no element parameters.'}</p> : null}
        {count('later') && !only ? <Fold order={2} open={laterOpen} onOpen={setLaterOpen}>Not on screen ({count('later')})</Fold> : null}
        {count('global') && !only ? <Fold order={4} open={globalOpen} onOpen={setGlobalOpen}>Global ({count('global')})</Fold> : null}
        {placed.map(({ r, sc, group }) => (
          <div key={`${r.kind}/${r.name}/${r.key}`} data-scope={sc?.id} style={{ order: order[group] }} hidden={!shown(group)}
            className={cn('rounded-lg', flash && sc?.id === flash.id && 'animate-[flash_1.2s_ease-out]')}
            onMouseEnter={sc ? () => hl(sc.id) : undefined} onMouseLeave={sc ? () => hl(null) : undefined}
            onFocus={sc ? () => hl(sc.id) : undefined} onBlur={sc ? () => hl(null) : undefined}>
            <Field r={r} openKind={item.kind} say={setNote} />
          </div>
        ))}
        {!only ? (
          // this one holds its own content (links, not fields), so it is a whole Collapsible
          <Collapsible open={ctxOpen} onOpenChange={setCtxOpen} style={{ order: 7 }} className="grid gap-2">
            <FoldTrigger open={ctxOpen}>
              {isFilm(item) ? `Compositions in this film${used.length ? ` (${used.length})` : ''}` : `Used by${usedBy.length ? ` (${usedBy.length})` : ''}`}
            </FoldTrigger>
            <CollapsibleContent>
              {isFilm(item)
                ? used.length ? <ul className="grid gap-1 text-sm">{used.map((c) => <li key={c.name}><a href={`#/comp/${encodeURIComponent(c.name)}/edit`}>{c.title}</a><span className="text-muted-foreground"> · {c.description}</span></li>)}</ul>
                  : <p className="text-sm text-muted-foreground">None. Its scenes are all its own.</p>
                : usedBy.length ? <div className="grid gap-1 text-sm"><p className="text-muted-foreground">Changes to these parameters reach every one of these films:</p><ul>{usedBy.map((f) => <li key={f.name}><a href={`#/film/${encodeURIComponent(f.name)}/edit`}>{f.title}</a></li>)}</ul></div>
                  : <p className="text-sm text-muted-foreground">No film uses this composition yet.</p>}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </aside>
  );
}

/** A fold over fields in the one list: only its trigger is in the Collapsible (the fields stay where they are). */
function Fold({ order, open, onOpen, children }: { order: number; open: boolean; onOpen: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <Collapsible open={open} onOpenChange={onOpen} style={{ order }} className="flex">
      {/* no CollapsibleContent to point at: the fields are siblings in the list */}
      <FoldTrigger open={open} aria-controls={undefined}>{children}</FoldTrigger>
    </Collapsible>
  );
}
function FoldTrigger({ open, children, ...rest }: { open: boolean; children: React.ReactNode; 'aria-controls'?: string }) {
  return (
    <CollapsibleTrigger asChild {...rest}>
      <Button variant="ghost" size="xs" className="justify-start tracking-wide text-muted-foreground uppercase">
        <ChevronRight className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-90')} />{children}
      </Button>
    </CollapsibleTrigger>
  );
}

let fieldSeq = 0;
function Field({ r, openKind, say }: { r: ParamRef; openKind: string; say: (m: string) => void }) {
  const [id] = useState(() => `f${++fieldSeq}`);
  const { p, key } = r;
  const shared = r.comp && openKind === 'film'
    ? <Hint label={`Part of ${r.comp.title}, shared by every film that uses it`}>
        <Badge asChild variant="outline" className="ml-2 no-underline"><a href={`#/comp/${encodeURIComponent(r.name)}/edit`}>Shared</a></Badge>
      </Hint>
    : null;
  const label = <>{p.label || key}{shared}</>;

  if (p.type === 'choice') {
    return (
      <div className="grid gap-1.5">
        <span id={`${id}-l`} className="text-sm font-medium">{label}</span>
        <ToggleGroup type="single" variant="outline" size="sm" aria-labelledby={`${id}-l`} value={String(p.value)} className="flex-wrap"
          onValueChange={(o) => { if (!o) return; liveValue(r, o); saveParam(r, o, say); }}>
          {p.options!.map((o) => <ToggleGroupItem key={o} value={o}>{cap(o)}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
    );
  }
  if (p.type === 'text') return <TextField id={id} r={r} label={label} say={say} />;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" defaultValue={p.value} min={p.min} max={p.max} step={p.step || 'any'}
        onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) liveValue(r, v); }}
        onBlur={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v) && v !== p.value) saveParam(r, v, say); }} />
    </div>
  );
}

/* shows in the previews as you type, and is saved a moment after you stop (or when you leave the field) */
function TextField({ id, r, label, say }: { id: string; r: ParamRef; label: React.ReactNode; say: (m: string) => void }) {
  const { p } = r;
  const [value, setValue] = useState(String(p.value));
  const saved = useRef(String(p.value));
  const focused = useRef(false);
  const timers = useRef<{ live?: ReturnType<typeof setTimeout>; save?: ReturnType<typeof setTimeout> }>({});
  // a value changed elsewhere (an agent, another window) shows here, unless you are typing in it
  useEffect(() => { if (!focused.current && String(p.value) !== value) { setValue(String(p.value)); saved.current = String(p.value); } }, [p.value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { clearTimeout(timers.current.live); clearTimeout(timers.current.save); }, []);
  const keep = (v: string) => { clearTimeout(timers.current.save); if (v.trim() && v !== saved.current) { saved.current = v; saveParam(r, v, say); } };
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={value} maxLength={p.maxLength || 120} spellCheck rows={Math.max(1, value.split('\n').length)} className="min-h-0 resize-none"
        onFocus={() => { focused.current = true; }}
        onBlur={(e) => { focused.current = false; keep(e.target.value); }}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          clearTimeout(timers.current.live); timers.current.live = setTimeout(() => { if (v.trim()) liveValue(r, v); }, 120);
          clearTimeout(timers.current.save); timers.current.save = setTimeout(() => keep(v), 700);
        }} />
    </div>
  );
}
