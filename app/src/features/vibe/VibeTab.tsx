// The Vibe tab: the film's direction as a board of references, before anything is written or drawn. Images,
// videos (YouTube and Vimeo as thumbnails, opening at the moment that matters), links, music (a link, or a track
// from the sound library to play in place), colours and type, and notes; each with what to take from it. Claude
// fills it in the direction step (vibe.json beside the film, images in vibe/); you add to it here: drop or paste
// images, paste a link, write a note. Grouped (Look, Motion, Type, Sound…) when the pins say so, laid out as a
// masonry wall. It follows the file live, and every pin takes comments.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, ImagePlus, Link2, Music, Play, StickyNote, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Hint } from '@/components/Hint';
import { getJson, post } from '@/lib/api';
import { onLive } from '@/lib/live';
import { useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';
import { openPinBox } from '@/features/comments/comments';
import { pinIdFor, videoOf, type Pin } from './vibe';

type Board = { key: string; pins: Pin[]; version: number; problem?: string };

export function VibeTab() {
  const route = useStudio((s) => s.route);
  const kind = route.view === 'work' ? route.kind : null, name = route.view === 'work' ? route.name : null;
  const key = `${kind}/${name}`, base = `/${kind === 'comp' ? 'comps' : 'films'}/${encodeURIComponent(name || '')}`;
  const [board, setBoard] = useState<Board | null>(null);
  const [dropping, setDropping] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null); // the image pin open large
  const boardRef = useRef(board); boardRef.current = board;

  const load = useCallback(async () => {
    if (!kind || !name) return;
    const r = await getJson<{ vibe: { pins: Pin[] }; version: number; problem?: string }>(`/api/vibe?kind=${kind}&name=${encodeURIComponent(name)}`).catch(() => null);
    if (r) setBoard({ key, pins: r.vibe.pins, version: r.version, problem: r.problem });
  }, [kind, name, key]);
  useEffect(() => { load(); return onLive((ev) => { if (ev.type === 'vibe' && (kind === 'film' ? ev.film : ev.comp) === name) load(); }); }, [load, kind, name]);

  /** Saves the board as changed here, from the version this window has: never over a change made elsewhere. */
  const save = useCallback(async (pins: Pin[], said?: string, undo?: Pin[]) => {
    const b = boardRef.current; if (!b || !kind || !name) return;
    setBoard({ ...b, pins });
    const r = await post<{ version: number }>('/api/vibe', { kind, name, base: b.version, vibe: { pins } });
    if (r.ok) {
      setBoard((x) => (x ? { ...x, version: r.data.version } : x));
      if (said) toast(said, undo ? { action: { label: 'Undo', onClick: () => save(undo) } } : undefined);
    } else { toast.error(r.status === 409 ? 'The board changed elsewhere: showing the latest' : r.data.error || 'Could not save the board'); load(); }
  }, [kind, name, load]);

  const addImages = useCallback(async (files: File[]) => {
    const added: Pin[] = [];
    for (const f of files.filter((x) => x.type.startsWith('image/'))) {
      const r = await fetch(`/api/vibe/image?kind=${kind}&name=${encodeURIComponent(name || '')}&file=${encodeURIComponent(f.name || 'pasted.png')}`, { method: 'POST', headers: { 'x-promo-studio': '1' }, body: f })
        .then(async (x) => ({ ok: x.ok, data: await x.json().catch(() => ({})) })).catch(() => ({ ok: false, data: {} as { error?: string } }));
      if (!r.ok) { toast.error(r.data.error || `Could not add ${f.name}`); continue; }
      const all = [...(boardRef.current?.pins || []), ...added];
      added.push({ id: pinIdFor(all, f.name || 'image'), kind: 'image', src: r.data.src });
    }
    if (added.length) save([...(boardRef.current?.pins || []), ...added], `Added ${added.length === 1 ? 'an image' : `${added.length} images`}: say what to take from ${added.length === 1 ? 'it' : 'them'}`);
  }, [kind, name, save]);

  const addLink = useCallback((url: string) => {
    let u: URL; try { u = new URL(url.trim()); } catch { toast.error('That is not a web address'); return false; }
    if (!/^https?:$/.test(u.protocol)) { toast.error('Only web addresses (http or https)'); return false; }
    const pins = boardRef.current?.pins || [], host = u.hostname.replace(/^www\./, '');
    const k = videoOf(u.href) ? 'video' : /(^|\.)(spotify\.com|soundcloud\.com|music\.apple\.com|bandcamp\.com)$/.test(host) ? 'music' : 'link';
    const at = u.searchParams.get('t');
    save([...pins, { id: pinIdFor(pins, host.split('.')[0]), kind: k, url: u.href, title: host, ...(k === 'video' && at ? { at: fmtAt(at) } : {}) }]);
    return true;
  }, [save]);

  // paste anywhere on the tab: an image, or a link (not while typing in a field)
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      if (route.view !== 'work' || route.tab !== 'vibe' || /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName)) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); addImages(files); return; }
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (text && /^https?:\/\//.test(text)) { e.preventDefault(); addLink(text); }
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [route, addImages, addLink]);

  const groups = useMemo(() => {
    const pins = board?.key === key ? board.pins : [];
    if (!pins.some((p) => p.group)) return [{ name: '', pins }];
    const order: string[] = [];
    for (const p of pins) { const g = p.group || 'Other'; if (!order.includes(g)) order.push(g); }
    return order.map((g) => ({ name: g, pins: pins.filter((p) => (p.group || 'Other') === g) }));
  }, [board, key]);
  const pins = board?.key === key ? board.pins : null;
  const update = (id: string, change: Partial<Pin>) => pins && save(pins.map((p) => (p.id === id ? clean({ ...p, ...change }) : p)));
  const remove = (id: string) => pins && save(pins.filter((p) => p.id !== id), 'Removed from the board', pins);

  return (
    <div className="relative h-full min-h-0 overflow-auto" onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false); }}
      onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDropping(false); addImages([...e.dataTransfer.files]); }}>
      <div className="mx-auto grid max-w-[1500px] gap-5 px-6 py-5">
        <AddBar onImages={addImages} onLink={addLink} onNote={() => pins && save([...pins, { id: pinIdFor(pins, 'note'), kind: 'note', take: 'A note on the feel' }])} />
        {board?.problem ? <p className="rounded-lg border border-warning/60 px-3 py-2 text-sm">vibe.json has a problem, so the board shows empty until it's fixed: {board.problem}</p> : null}
        {!pins ? <p className="text-muted-foreground">Loading…</p> : !pins.length ? <Empty /> : groups.map((g) => (
          <section key={g.name || 'all'} aria-label={g.name || 'Vibe board'} className="grid gap-3">
            {g.name ? <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.name} <span className="font-normal">{g.pins.length}</span></h2> : null}
            <div className="columns-[260px] gap-4">
              {g.pins.map((p) => <PinCard key={p.id} pin={p} base={base} onOpen={() => setViewing(p.id)} onChange={(c) => update(p.id, c)} onRemove={() => remove(p.id)} />)}
            </div>
          </section>
        ))}
      </div>
      <Viewer pins={groups.flatMap((g) => g.pins).filter((p) => p.kind === 'image')} base={base} id={viewing} onId={setViewing} />
      {dropping ? <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-primary/5 text-sm text-foreground">Drop images to pin them</div> : null}
    </div>
  );
}

function AddBar({ onImages, onLink, onNote }: { onImages: (f: File[]) => void; onLink: (url: string) => boolean; onNote: () => void }) {
  const [url, setUrl] = useState('');
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="mr-auto text-lg font-semibold tracking-tight">Vibe</h1>
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (url && onLink(url)) setUrl(''); }}>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link: a film, a site, a track" aria-label="Add a link" className="h-8 w-80" />
        <Button type="submit" size="sm" variant="secondary" disabled={!url.trim()}><Link2 />Add link</Button>
      </form>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { onImages([...(e.target.files || [])]); e.target.value = ''; }} />
      <Button size="sm" variant="secondary" onClick={() => file.current?.click()}><ImagePlus />Add images</Button>
      <Button size="sm" variant="secondary" onClick={onNote}><StickyNote />Add note</Button>
    </div>
  );
}

function Empty() {
  return (
    <div className="mx-auto grid max-w-xl gap-2 py-16 text-center text-muted-foreground">
      <p className="text-foreground">No vibe yet.</p>
      <p>The vibe board is where the film's direction comes from: films and sites you like, screenshots, colours, type, the music you hear for it, and what to take from each.</p>
      <p>Drop or paste images here, paste a link, or tell Claude what you're after: it pins what you share and keeps the board as the treatment's starting point.</p>
    </div>
  );
}

function PinCard({ pin, base, onOpen, onChange, onRemove }: { pin: Pin; base: string; onOpen: () => void; onChange: (c: Partial<Pin>) => void; onRemove: () => void }) {
  const label = pin.title || pin.font || pin.take || pin.url || pin.src || pin.sound || pin.kind;
  return (
    <figure data-pin={pin.id} className="group relative mb-4 break-inside-avoid overflow-hidden rounded-xl border bg-card"
      onClickCapture={(e) => {
        // in comment mode a pin takes a comment, and nothing on it (a link, a field) does anything else
        if (!useStudio.getState().commentMode) return;
        e.preventDefault(); e.stopPropagation();
        openPinBox({ id: pin.id, kind: pin.kind, label }, e.clientX, e.clientY);
      }}>
      <PinBody pin={pin} base={base} onOpen={onOpen} />
      <figcaption className="grid gap-1.5 px-3 pt-2 pb-3">
        <Take pin={pin} onChange={onChange} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="capitalize">{pin.kind}</span>
          {pin.url ? <a href={pin.url} target="_blank" rel="noreferrer noopener" className="inline-flex min-w-0 items-center gap-1 truncate text-muted-foreground hover:text-foreground"><ExternalLink className="size-3 flex-none" />{hostOf(pin.url)}</a> : null}
          <Hint label="Remove from the board">
            <Button variant="ghost" size="icon-xs" aria-label={`Remove ${label}`} onClick={onRemove} className="ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100"><Trash2 /></Button>
          </Hint>
        </div>
      </figcaption>
    </figure>
  );
}

/* what to take from a pin: shown as written; click to change it */
function Take({ pin, onChange }: { pin: Pin; onChange: (c: Partial<Pin>) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(pin.take || '');
  useEffect(() => { if (!editing) setValue(pin.take || ''); }, [pin.take, editing]);
  if (editing) {
    return <Textarea autoFocus value={value} maxLength={400} rows={2} aria-label="What to take from it" className="min-h-0 resize-none text-sm"
      onChange={(e) => setValue(e.target.value)} onBlur={() => { setEditing(false); if (value.trim() !== (pin.take || '')) onChange({ take: value.trim() || undefined }); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } if (e.key === 'Escape') { setValue(pin.take || ''); setEditing(false); } }} />;
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className={cn('text-left text-sm leading-snug', pin.take ? 'text-foreground' : 'text-muted-foreground italic')}>
      {pin.take || 'What to take from it…'}
    </button>
  );
}

const imageUrl = (pin: Pin, base: string) => (pin.src ? `${base}/${pin.src.split('/').map(encodeURIComponent).join('/')}` : pin.url);

function PinBody({ pin, base, onOpen }: { pin: Pin; base: string; onOpen: () => void }) {
  if (pin.kind === 'image') {
    return (
      <button type="button" onClick={onOpen} aria-label={`View ${pin.title || 'the image'} larger`} className="block w-full cursor-zoom-in">
        <img src={imageUrl(pin, base)} alt={pin.title || pin.take || 'A reference image'} loading="lazy" className="block w-full bg-muted" />
      </button>
    );
  }
  if (pin.kind === 'video') {
    const v = pin.url ? videoOf(pin.url) : null;
    return (
      <a href={pin.url} target="_blank" rel="noreferrer noopener" className="relative block bg-black text-foreground">
        {v?.provider === 'youtube' ? <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" className="block aspect-video w-full object-cover opacity-90" /> : <div className="aspect-video w-full" />}
        <span className="absolute inset-0 grid place-items-center"><span className="grid size-11 place-items-center rounded-full bg-background/80"><Play className="size-5 translate-x-px fill-current" /></span></span>
        {pin.at ? <span className="absolute right-2 bottom-2 rounded bg-background/85 px-1.5 text-xs tabular-nums">from {pin.at}</span> : null}
      </a>
    );
  }
  // up to four swatches a row, so a long palette wraps instead of squeezing its labels
  if (pin.kind === 'colour') return <div className="grid grid-cols-4">{pin.colours?.map((c) => <div key={c} style={{ background: c }} className="flex h-16 items-end p-1.5"><span className="rounded bg-background/80 px-1 font-mono text-[11px]">{c}</span></div>)}</div>;
  if (pin.kind === 'type') return <div className="grid gap-1 px-3 pt-3"><span className="text-xs text-muted-foreground">{pin.font}</span><span style={{ fontFamily: `"${pin.font}", serif` }} className="text-2xl leading-tight">{pin.sample || 'The quick brown fox'}</span></div>;
  if (pin.kind === 'music') {
    return (
      <div className="grid gap-2 px-3 pt-3">
        <span className="flex items-center gap-2 text-sm font-medium"><Music className="size-4 text-muted-foreground" />{pin.title || (pin.sound ? pin.sound.split('/').pop()?.replace(/\.[^.]+$/, '') : hostOf(pin.url || ''))}</span>
        {pin.sound ? <audio controls preload="none" src={`/sounds/${pin.sound.split('/').map(encodeURIComponent).join('/')}`} className="h-8 w-full" /> : null}
      </div>
    );
  }
  if (pin.kind === 'link') return <div className="px-3 pt-3 text-sm font-medium">{pin.title || hostOf(pin.url || '')}</div>;
  return pin.title ? <div className="px-3 pt-3 text-sm font-medium">{pin.title}</div> : null; // a note is its words
}

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const fmtAt = (t: string) => { const s = parseInt(t, 10); return Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : t; };
const clean = (p: Pin): Pin => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '')) as Pin;

/* An image pin, large: the image as big as the window allows, what to take from it beneath, and the board's other
 * images a click (or ← →) away. */
function Viewer({ pins, base, id, onId }: { pins: Pin[]; base: string; id: string | null; onId: (id: string | null) => void }) {
  const i = pins.findIndex((p) => p.id === id), pin = i >= 0 ? pins[i] : null;
  const step = (d: number) => { if (pins.length) onId(pins[(i + d + pins.length) % pins.length].id); };
  return (
    <Dialog open={!!pin} onOpenChange={(o) => { if (!o) onId(null); }}>
      <DialogContent className="grid w-[min(1400px,94vw)] max-w-none gap-3 border-0 bg-card p-3 sm:max-w-none"
        onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } }}>
        {pin ? (
          <>
            <img src={imageUrl(pin, base)} alt={pin.title || pin.take || 'A reference image'} className="mx-auto block h-auto max-h-[78vh] w-full rounded-lg object-contain" />
            <div className="flex items-start gap-3 px-1 pb-1">
              <div className="grid min-w-0 flex-1 gap-1">
                <DialogTitle className="text-sm font-semibold">{pin.title || pin.group || 'Image'}</DialogTitle>
                <DialogDescription className="text-sm text-foreground">{pin.take || 'No take yet: what should the film take from it?'}</DialogDescription>
              </div>
              {pins.length > 1 ? (
                <div className="flex flex-none items-center gap-1 pr-8 text-xs text-muted-foreground tabular-nums">
                  <Button variant="ghost" size="icon-sm" aria-label="Previous image" onClick={() => step(-1)}><ChevronLeft /></Button>
                  {i + 1} of {pins.length}
                  <Button variant="ghost" size="icon-sm" aria-label="Next image" onClick={() => step(1)}><ChevronRight /></Button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
