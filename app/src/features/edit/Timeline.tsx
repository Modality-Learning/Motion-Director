// The timeline. A name column on the left stays put when you scroll sideways; the ruler stays at the top when
// you scroll down, with play and the time in its corner. Then the storyboard's beats, the objects (one row
// with all their sounds, which twirls open into a layer per object), then your own tracks. Drop a sound
// anywhere, then on a clip: drag to move · drag an edge to trim · Option-drag an edge to squash or stretch ·
// drag the volume line · double-click to edit the sound.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CircleHelp, Minus, Pause, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/Hint';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { clock, secs } from '@/lib/format';
import { local, useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';
import { openItemBox, openMusicBox, useComments, type MusicPart, type TimelineItem } from '@/features/comments/comments';
import { SETTINGS, barTimes, effective, overrides } from './kit';
import { MusicBrief } from './MusicBrief';
import { FRAME, GUT, MINI, PAD, TRK, clamp, dB, dragModeAt, dragTo, freeze, gainY, laneOf, layerRows, nameOf, ppsFor, readout, round, shortName, ticks, trackCount, xAt, type DragStart } from './geometry';
import { bufOf, fileLen, loadSound } from './audio';
import { drawWave } from './waveform';
import { GraphRow } from './MotionGraph';
import { ViewBar } from './ViewBar';
import { Gut, Row, type Axis } from './rows';
import {
  M, addCue, addMusic, addTrack, changed, closeFocus, cueById, cueLen, cueStart, focusObject, hasSound, nudge, objectBy, openEditor, removeCue,
  removeTrack, select, setMusicOpen, tellEdit, useEdit,
} from './store';
import type { Cue } from './types';

const SOUND = 'text/x-promo-sound';

export function Timeline({ hidden }: { hidden: boolean }) {
  const duration = useEdit((s) => s.duration);
  const zoom = useEdit((s) => s.zoom);
  useEdit((s) => s.rev); // the sheet changed in place: draw again
  const film = useEdit((s) => s.film);
  const kind = useEdit((s) => s.kind);
  const scRef = useRef<HTMLDivElement>(null), inRef = useRef<HTMLDivElement>(null), headRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLElement>(null), nowRef = useRef<HTMLSpanElement>(null), gripRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const k = ppsFor(width, duration, zoom);
  const kRef = useRef(k);
  kRef.current = k;
  const tAt = (clientX: number) => (clientX - (inRef.current?.getBoundingClientRect().left ?? 0) - GUT) / kRef.current;
  const axis: Axis = { k, tAt, duration };

  // the visible width sets the scale (the whole film fills it at zoom 1)
  useLayoutEffect(() => {
    const sc = scRef.current; if (!sc) return;
    const fit = () => { if (sc.clientWidth > 0) setWidth(sc.clientWidth); };
    const ro = new ResizeObserver(fit);
    ro.observe(sc); fit();
    return () => ro.disconnect();
  }, [film]); // the scroller exists once a film is open

  /* the playhead; when the time changes (playing, seeking) the timeline follows it, never just because it redrew */
  useLayoutEffect(() => {
    M.placeHead = (follow) => {
      const x = xAt(M.t, kRef.current), sc = scRef.current;
      if (headRef.current) headRef.current.style.left = `${x}px`;
      if (markRef.current) markRef.current.style.left = `${x}px`;
      if (nowRef.current) nowRef.current.textContent = clock(M.t);
      if (sc && follow && (x < sc.scrollLeft + GUT || x > sc.scrollLeft + sc.clientWidth - 20)) sc.scrollLeft = Math.max(0, x - GUT - (sc.clientWidth - GUT) / 3);
    };
    M.toTop = () => { if (scRef.current) scRef.current.scrollTop = 0; };
  }, []);
  useLayoutEffect(() => { M.placeHead(false); });

  /* zooming keeps a time where it was on screen: Option-scroll and pinching keep the one under the pointer */
  const keep = useRef<{ at: number; before: number } | null>(null);
  const zoomBy = (f: number, at: number) => {
    const sc = scRef.current, { zoom: z0 } = useEdit.getState(); if (!sc) return;
    const z = clamp(z0 * f, 1, 64); if (z === z0) return;
    keep.current = { at, before: xAt(at, kRef.current) - sc.scrollLeft };
    useEdit.setState({ zoom: z });
  };
  useLayoutEffect(() => {
    const p = keep.current, sc = scRef.current; keep.current = null;
    if (p && sc) sc.scrollLeft = Math.max(0, xAt(p.at, k) - p.before);
  }, [k]);
  const zoomRef = useRef(zoomBy);
  zoomRef.current = zoomBy;
  useEffect(() => {
    const sc = scRef.current; if (!sc) return;
    // a pinch on a trackpad arrives as many small steps: they're gathered and applied once a frame
    let pinch: { f: number; x: number | null } | null = null;
    const soon = (f: number, clientX: number | null) => {
      if (!pinch) {
        pinch = { f: 1, x: clientX };
        requestAnimationFrame(() => { const p = pinch!; pinch = null; zoomRef.current(p.f, p.x == null ? M.t : clamp(tAt(p.x), 0, useEdit.getState().duration)); });
      }
      pinch.f *= f; if (clientX != null) pinch.x = clientX;
    };
    const wheel = (e: WheelEvent) => {
      // Chrome and Firefox send a trackpad pinch as a wheel with Ctrl held (and the page would zoom)
      if (e.ctrlKey) { e.preventDefault(); soon(Math.exp(-e.deltaY * 0.01), e.clientX); return; }
      // ⌘-scroll (Ctrl elsewhere) zooms, as on the preview
      if (!e.metaKey) return;
      e.preventDefault();
      soon(Math.exp(-(e.deltaY || e.deltaX) * 0.0025), e.clientX);
    };
    // Safari sends its own gesture events for a pinch
    type Gesture = Event & { scale: number; clientX: number };
    let scale = 1;
    const gs = (e: Event) => { e.preventDefault(); scale = 1; };
    const gc = (e: Event) => { e.preventDefault(); soon((e as Gesture).scale / scale, (e as Gesture).clientX); scale = (e as Gesture).scale; };
    const ge = (e: Event) => e.preventDefault();
    sc.addEventListener('wheel', wheel, { passive: false });
    sc.addEventListener('gesturestart', gs); sc.addEventListener('gesturechange', gc); sc.addEventListener('gestureend', ge);
    return () => { sc.removeEventListener('wheel', wheel); sc.removeEventListener('gesturestart', gs); sc.removeEventListener('gesturechange', gc); sc.removeEventListener('gestureend', ge); };
  }, [film]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the timeline's height: a grip on its top edge (above the preview's view bar, the timeline's top) trades
   * height with the preview, the same kind of grip as the side columns'. Layout only: it shows more or less of
   * the timeline and never adds tracks (+ Add track does that). Remembered; double-click resets. */
  const active = useStudio((s) => s.route.view === 'work' && s.route.tab === 'edit');
  useEffect(() => {
    if (!active || hidden) return;
    savedHeight(scRef.current, gripRef.current);
    const again = () => savedHeight(scRef.current, gripRef.current);
    window.addEventListener('resize', again);
    return () => window.removeEventListener('resize', again);
  }, [active, hidden, film]);

  useTimelineComments(inRef, tAt, kind === 'film');

  if (!film) return <section aria-label="Timeline" hidden={hidden} className="border-t bg-card" />;
  const W = GUT + duration * k + PAD;
  return (
    <section aria-label="Timeline" hidden={hidden} className="relative grid min-h-0 min-w-0 border-t bg-card">
      <Grip scRef={scRef} gripRef={gripRef} />
      <ViewBar />
      <div ref={scRef} className="max-h-[46vh] overflow-auto">
        <div ref={inRef} className="relative" style={{ width: W }}>
          <Ruler axis={axis} markRef={markRef} nowRef={nowRef} />
          <BeatsRow axis={axis} />
          {hasSound() ? <MusicRows axis={axis} /> : null}
          <ObjectRows axis={axis} />
          {hasSound() ? <TrackRows axis={axis} /> : null}
          <div ref={headRef} className="pointer-events-none absolute top-0 bottom-0 z-[4] w-0.5 bg-destructive" />
        </div>
      </div>
    </section>
  );
}

/* ── the grip ── */
const TL_H = 'timeline-height';
function setHeight(sc: HTMLElement | null, grip: HTMLElement | null, px: number | null, save = true) {
  const main = sc?.closest<HTMLElement>('[data-edit-main]');
  if (!sc || !main?.clientHeight) return;
  if (px == null) {
    sc.style.height = ''; sc.style.maxHeight = ''; grip?.removeAttribute('aria-valuenow');
    if (save) local.del(TL_H);
    return;
  }
  const h = clamp(Math.round(px), 120, Math.max(120, main.clientHeight - 220 - 38)); // the preview keeps 220 px (the view bar is the other 36)
  Object.assign(sc.style, { height: `${h}px`, maxHeight: 'none' });
  grip?.setAttribute('aria-valuenow', String(h));
  if (save) local.set(TL_H, String(h));
}
function savedHeight(sc: HTMLElement | null, grip: HTMLElement | null) {
  const v = parseFloat(local.get(TL_H) ?? '');
  if (Number.isFinite(v)) setHeight(sc, grip, v, false);
}
// the height as set (its box, scrollbar included), else as laid out
const heightOf = (sc: HTMLElement) => parseFloat(sc.style.height) || sc.offsetHeight;
function Grip({ scRef, gripRef }: { scRef: React.RefObject<HTMLDivElement | null>; gripRef: React.RefObject<HTMLDivElement | null> }) {
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const sc = scRef.current, grip = gripRef.current; if (e.button || !sc || !grip) return;
    e.preventDefault(); grip.setPointerCapture(e.pointerId); grip.dataset.dragging = '';
    document.body.classList.add('tl-resizing');
    const y0 = e.clientY, h0 = heightOf(sc);
    const move = (ev: PointerEvent) => setHeight(sc, grip, h0 - (ev.clientY - y0), false);
    const up = (ev: PointerEvent) => {
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up);
      delete grip.dataset.dragging; document.body.classList.remove('tl-resizing');
      setHeight(sc, grip, h0 - (ev.clientY - y0));
    };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up);
  };
  return (
    <div ref={gripRef} role="separator" aria-orientation="horizontal" aria-label="Timeline height" tabIndex={0} title="Drag to resize the timeline · double-click to reset"
      className="group absolute inset-x-0 -top-[5px] z-[9] flex h-2.5 cursor-row-resize touch-none items-center outline-none"
      onPointerDown={down} onDoubleClick={() => setHeight(scRef.current, gripRef.current, null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault(); const sc = scRef.current; if (sc) setHeight(sc, gripRef.current, heightOf(sc) + (e.key === 'ArrowUp' ? 24 : -24));
      }}>
      <div className="h-px w-full bg-transparent group-hover:bg-primary group-focus-visible:bg-primary group-data-[dragging]:bg-primary" />
    </div>
  );
}

/* ── rows ── */
function Ruler({ axis, markRef, nowRef }: { axis: Axis; markRef: React.RefObject<HTMLElement | null>; nowRef: React.RefObject<HTMLSpanElement | null> }) {
  const playing = useEdit((s) => s.playing);
  const { k, tAt, duration } = axis;
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-corner]')) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const seek = (ev: PointerEvent | React.PointerEvent) => tellEdit({ type: 'seek', t: clamp(tAt(ev.clientX), 0, duration) });
    seek(e);
    const up = () => { el.removeEventListener('pointermove', seek); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', seek); el.addEventListener('pointerup', up);
  };
  return (
    <div className="tl-ruler sticky top-0 z-[6] flex h-[30px] cursor-col-resize touch-none border-b bg-card" title="Click or drag to move the playhead" onPointerDown={down}>
      <Gut data-corner="" className="z-[7] cursor-default gap-2">
        <span className="contents">
          <button type="button" aria-label={playing ? 'Pause' : 'Play'} title="Play or pause (Space)" onClick={() => tellEdit({ type: 'toggle' })}
            className="grid size-[26px] flex-none cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/85">
            {playing ? <Pause className="size-3 fill-current" /> : <Play className="size-3 translate-x-px fill-current" />}
          </button>
          <span ref={nowRef} className="text-xs leading-none font-semibold text-foreground tabular-nums">{clock(M.t)}</span>
          <ShortcutsButton />
        </span>
      </Gut>
      {ticks(k, duration).map(({ t, major }) => (
        <i key={t} className={cn('absolute bottom-0 w-px', major ? 'h-2.5 bg-muted-foreground' : 'h-[5px] bg-border')} style={{ left: xAt(t, k) }}>
          {major ? <span className="absolute bottom-[11px] left-[3px] text-[11px] whitespace-nowrap text-muted-foreground not-italic tabular-nums">{t}s</span> : null}
        </i>
      ))}
      <i ref={markRef} className="pointer-events-none absolute bottom-0 z-[2] -ml-1.5 size-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-destructive" />
    </div>
  );
}

/* the keyboard shortcuts, from the ? in the timeline's corner */
const KEYS: [string, string][] = [
  ['Space', 'Play or pause'], ['C', 'Comment mode: click anything to comment on it'], ['⌘Z, ⇧⌘Z', 'Undo, redo'], ['Pinch, ⌘ scroll', 'Zoom the timeline or the preview (scroll pans the preview)'], ['H', 'Hand tool: drag the preview to pan'],
  ['Clip edges', 'Drag to trim; ⌥ drag to stretch'], ['Clip line', 'Drag for volume'], ['← →, Delete', 'Nudge a clip a frame, remove it'],
];
function ShortcutsButton() {
  return (
    <Popover>
      <Hint label="Keyboard shortcuts">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="Keyboard shortcuts" className="ml-auto text-muted-foreground"><CircleHelp /></Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent side="top" align="start" className="w-[330px] bg-card px-3.5 py-3 text-[13px]" aria-label="Keyboard shortcuts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {KEYS.map(([k, v]) => [<dt key={`${k}t`} className="font-semibold">{k}</dt>, <dd key={`${k}d`} className="text-muted-foreground">{v}</dd>])}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

/* the storyboard's beats (the film's key moments), under the ruler: click one to go to it */
function BeatsRow({ axis }: { axis: Axis }) {
  const beats = useEdit((s) => s.beats);
  const { k, duration } = axis;
  if (!beats.length) return null;
  return (
    <Row height={26} className="bg-primary/[.03]" name={<span>Beats</span>}>
      {beats.map((b, i) => {
        const next = beats[i + 1]?.t ?? duration, room = Math.max(14, (next - b.t) * k - 8);
        return (
          <button key={i} type="button" data-beat={i} title={`${b.name} · ${secs(b.t)}${b.note ? `\n${b.note}` : ''}`} onClick={() => tellEdit({ type: 'seek', t: b.t })}
            style={{ left: xAt(b.t, k), maxWidth: room }}
            className="absolute top-[3px] inline-flex h-5 cursor-pointer items-center gap-[5px] overflow-hidden rounded pr-1 text-[11px] leading-none font-semibold whitespace-nowrap text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:bg-secondary focus-visible:text-foreground">
            <i aria-hidden="true" className="-ml-1 size-2 flex-none rotate-45 rounded-[1px] bg-primary" />
            <span className="overflow-hidden text-ellipsis">{b.name}</span>
          </button>
        );
      })}
    </Row>
  );
}

/* ── the objects: one row with every object's sounds; open, a layer per object (the picked one first, with its
 * graph and room to drop) ── */
function ObjectRows({ axis }: { axis: Axis }) {
  const sheet = useEdit((s) => s.sheet);
  const focus = useEdit((s) => s.focus);
  const objectsOpen = useEdit((s) => s.objectsOpen);
  const sel = useEdit((s) => s.sel);
  const { k } = axis;
  // a composition has no sounds: a selected element shows its graph and nothing else
  if (!hasSound()) {
    return focus ? (
      <GraphRow axis={axis} rows={1} colour={0} name={<><span className="overflow-hidden font-semibold text-ellipsis">{focus.label}</span><CloseButton label={`Deselect ${focus.label}`} tip="Deselect (Esc)" /></>} />
    ) : null;
  }
  const ids = [...new Set(sheet.cues.map((c) => c.object).filter((id): id is string => !!id && !!sheet.objects?.[id]))];
  const focusId = focus ? objectBy(focus.address)?.[0] ?? null : null;
  if (!ids.length && !focus) return null;
  const open = objectsOpen || !!focus;
  const twirl = () => {
    if (open) { useEdit.setState({ objectsOpen: false }); if (focus) closeFocus(); } else useEdit.setState({ objectsOpen: true });
  };
  return (
    <>
      <Row height={MINI} className="bg-warning/[.04]" name={
        <button type="button" aria-expanded={open} title={open ? 'Show the objects as one row' : 'Show each object on its own layer'} onClick={twirl}
          className="inline-flex cursor-pointer items-center gap-1.5 text-xs leading-none font-semibold text-foreground">
          <span className="w-2.5 text-muted-foreground">{open ? '▾' : '▸'}</span>Objects<span className="text-muted-foreground"> {ids.length || ''}</span>
        </button>
      }>
        {sheet.cues.filter((c) => c.object && ids.includes(c.object)).map((c) => (
          <MiniClip key={c.id} c={c} k={k} i={ids.indexOf(c.object!)} on={sel === c.id} label={sheet.objects![c.object!].label} />
        ))}
      </Row>
      {open ? (
        <>
          {focus && !focusId ? <ObjectLayer id={null} axis={axis} i={ids.length} /> : null}
          {(focusId ? [focusId, ...ids.filter((i) => i !== focusId)] : ids).map((id) => <ObjectLayer key={id} id={id} axis={axis} i={ids.indexOf(id)} />)}
        </>
      ) : null}
    </>
  );
}
function CloseButton({ label, tip }: { label: string; tip: string }) {
  return <Hint label={tip}><Button variant="ghost" size="icon-xs" aria-label={label} onClick={closeFocus} className="ml-auto text-muted-foreground"><X /></Button></Hint>;
}
/** A clip on the objects row: in its object's colour; a click opens that object with the clip selected. */
function MiniClip({ c, k, i, on, label }: { c: Cue; k: number; i: number; on: boolean; label: string }) {
  const s = effective(c, useEdit.getState().lib), w = Math.max(4, cueLen(c) * k);
  return (
    <button type="button" data-cue={c.id} title={`${label}: ${nameOf(c.sound)} at ${secs(cueStart(c))}`}
      onClick={() => { useEdit.setState({ sel: c.id }); focusObject(c.object!); }}
      className={cn(`obj-c${i % 6} absolute top-[5px] h-5 cursor-pointer overflow-hidden rounded border border-(--obj) bg-[color-mix(in_srgb,var(--obj)_22%,transparent)] p-0`, on && 'shadow-[0_0_0_1px_var(--foreground)]', c.mute && 'opacity-45')}
      style={{ left: xAt(cueStart(c), k), width: w }}>
      <Wave sound={c.sound} from={s.from} to={s.to} w={w} h={MINI - 10} />
    </button>
  );
}
/* an object: its name in the left column like a track's; open, its graph first (name and ✕ beside it), then
 * its sounds, with a row to spare for dropping */
function ObjectLayer({ id, axis, i }: { id: string | null; axis: Axis; i: number }) {
  const sheet = useEdit((s) => s.sheet), focus = useEdit((s) => s.focus), lostSet = useEdit((s) => s.lost);
  const ob = id ? sheet.objects![id] : { label: focus!.label, selector: focus!.address };
  const focused = focus?.address === ob.selector, lost = !!id && lostSet.has(id);
  const cues = id ? sheet.cues.filter((c) => c.object === id) : [];
  const rows = layerRows(cues, focused);
  const tip = `${ob.label} · ${cues.length} sound${cues.length === 1 ? '' : 's'}${lost ? ' · not found in the film: its sounds stay where they were' : ''} · ${focused ? 'click to close' : 'click to open its graph'}`;
  const name = (
    <button type="button" data-obj={id || ''} title={tip} onClick={() => (focused ? closeFocus() : id && focusObject(id))}
      className={cn('min-w-0 cursor-pointer overflow-hidden text-left font-semibold text-ellipsis whitespace-nowrap text-(--obj) hover:text-primary', lost && 'text-muted-foreground line-through')}>
      {lost ? <span aria-label="not found" className="font-bold text-destructive no-underline">! </span> : '◆ '}{ob.label}
    </button>
  );
  return (
    <div className={`obj-c${i % 6} contents`}>
      {focused ? <GraphRow axis={axis} rows={rows} colour={i} name={<>{name}<CloseButton label={`Close ${ob.label}`} tip="Close (Esc)" /></>} /> : null}
      <Lane axis={axis} cues={cues} rows={rows} objId={id}
        className={cn('bg-[color-mix(in_srgb,var(--obj)_5%,transparent)]', focused && '[&>[data-row]:first-child>div:first-child]:bg-[color-mix(in_srgb,var(--obj)_10%,var(--card))]')}
        rowClass="border-b-[color-mix(in_srgb,var(--obj)_18%,transparent)]"
        clipClass="border-[color-mix(in_srgb,var(--obj)_70%,transparent)] bg-[color-mix(in_srgb,var(--obj)_18%,transparent)] data-[on]:bg-[color-mix(in_srgb,var(--obj)_35%,transparent)] data-[on]:shadow-[0_0_0_1px_var(--obj)]"
        gutter={(r) => (r === 0 ? (focused ? <span>Sounds</span> : name) : null)}
        onDrop={(path, t, r) => addCue(path, t, r, { address: ob.selector, label: ob.label })} />
    </div>
  );
}

/* ── the music: one thin row with the soundtrack and the brief's sections, so it takes no more room than it needs;
 * open, a row per music track (one spare to drop on) with the brief's bar lines. Open or closed is remembered. ── */
function MusicRows({ axis }: { axis: Axis }) {
  const sheet = useEdit((s) => s.sheet), brief = useEdit((s) => s.brief), open = useEdit((s) => s.musicOpen), sel = useEdit((s) => s.sel);
  const { k, tAt, duration } = axis;
  const cues = sheet.cues.filter((c) => c.music);
  const rows = layerRows(cues, true);
  const sections = brief?.sections ?? [];
  const twirl = () => setMusicOpen(!open);
  const dropOn = { // a sound dropped on the thin row goes on the first music track free there
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(SOUND)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); const path = e.dataTransfer.getData(SOUND); if (path) addMusic(path, clamp(tAt(e.clientX), 0, duration)); },
  };
  return (
    <>
      <Row height={MINI} data-music-lane="" className="music-lane bg-(--music)/[.05]" {...dropOn} name={
        <>
          <button type="button" aria-expanded={open} title={open ? 'Show the music as one row' : 'Show each music track'} onClick={twirl}
            className="inline-flex cursor-pointer items-center gap-1.5 text-xs leading-none font-semibold text-foreground">
            <span className="w-2.5 text-muted-foreground">{open ? '▾' : '▸'}</span>Music<span className="text-muted-foreground"> {cues.length || ''}</span>
          </button>
          <MusicBrief />
        </>
      }>
        {sections.map((s) => (
          <span key={`${s.name}-${s.at}`} data-music-section={s.name} title={`${s.name}${s.drop ? ' (the drop)' : ''} at ${secs(s.at)}${s.note ? `: ${s.note}` : ''}`}
            className="pointer-events-auto absolute top-0 z-[2] h-full border-l border-(--music)/70" style={{ left: xAt(s.at, k) }}>
            <span className="absolute top-0.5 left-1 text-[10px] leading-none font-semibold whitespace-nowrap text-(--music)">{s.drop ? '◆ ' : ''}{s.name}</span>
          </span>
        ))}
        {open ? null : cues.map((c) => <MusicMini key={c.id} c={c} k={k} on={sel === c.id} />)}
      </Row>
      {open ? (
        <div data-music-lane="" className="music-lane relative">
          {brief ? barTimes(brief, duration).map((t) => <i key={t} className="pointer-events-none absolute top-0 bottom-0 z-0 border-l border-(--music)/15" style={{ left: xAt(t, k) }} />) : null}
          <Lane axis={axis} cues={cues} rows={rows} className="bg-(--music)/[.03]" rowClass="border-b-(--music)/15"
            clipClass="border-(--music)/70 bg-(--music)/15 data-[on]:bg-(--music)/30 data-[on]:shadow-[0_0_0_1px_var(--music)]"
            gutter={(r) => <span className="text-muted-foreground">Music {r + 1}</span>}
            onDrop={(path, t, r) => addCue(path, t, r, null, true)} />
        </div>
      ) : null}
    </>
  );
}
/** A music clip on the thin row: a click opens the lane with the clip selected. */
function MusicMini({ c, k, on }: { c: Cue; k: number; on: boolean }) {
  const s = effective(c, useEdit.getState().lib), w = Math.max(4, cueLen(c) * k);
  return (
    <button type="button" data-cue={c.id} title={`Music: ${nameOf(c.sound)} at ${secs(cueStart(c))}`}
      onClick={() => { useEdit.setState({ sel: c.id }); setMusicOpen(true); }}
      className={cn('absolute top-[11px] z-[1] h-4 cursor-pointer overflow-hidden rounded border border-(--music)/70 bg-(--music)/20 p-0', on && 'shadow-[0_0_0_1px_var(--foreground)]', c.mute && 'opacity-45')}
      style={{ left: xAt(cueStart(c), k), width: w }}>
      <Wave sound={c.sound} from={s.from} to={s.to} w={w} h={14} />
    </button>
  );
}

/* ── your own tracks, numbered, and + Add track under them ── */
function TrackRows({ axis }: { axis: Axis }) {
  const sheet = useEdit((s) => s.sheet);
  const free = sheet.cues.filter((c) => laneOf(c) === null), n = trackCount(sheet);
  const name = (i: number) => {
    const count = free.filter((c) => (c.track ?? 0) === i).length;
    const what = `Remove track ${i + 1}${count ? ` and its ${count} sound${count === 1 ? '' : 's'}` : ''}`;
    return (
      <>
        <span>Track {i + 1}</span>
        {n > 1 ? (
          <Hint label={what}>
            <Button variant="outline" size="icon-xs" aria-label={what} onClick={() => removeTrack(i)}
              className="ml-auto opacity-0 group-hover/trk:opacity-100 hover:text-destructive focus-visible:opacity-100"><Minus /></Button>
          </Hint>
        ) : null}
      </>
    );
  };
  return (
    <>
      <Lane axis={axis} cues={free} rows={n} tracks gutter={name} className="tl-tracks" rowClass="odd:bg-foreground/[.025]" onDrop={(path, t, r) => addCue(path, t, r)} />
      <Row height={34} className="border-b-0" gutClass="border-r-0" name={<Button size="xs" variant="ghost" onClick={addTrack} disabled={n >= 16}>+ Add track</Button>} />
    </>
  );
}

/* a lane of rows holding clips; sounds dropped on it are added where they land */
function Lane({ axis, cues, rows, gutter, onDrop, className, rowClass, clipClass, tracks = false, objId }: {
  axis: Axis; cues: Cue[]; rows: number; gutter: (i: number) => React.ReactNode; onDrop: (path: string, t: number, row: number) => void;
  className?: string; rowClass?: string; clipClass?: string; tracks?: boolean; objId?: string | null;
}) {
  const { k, tAt, duration } = axis;
  const ref = useRef<HTMLDivElement>(null), ghost = useRef<HTMLDivElement>(null);
  const rowAt = (e: React.DragEvent) => clamp(Math.floor((e.clientY - ref.current!.getBoundingClientRect().top) / TRK), 0, rows - 1);
  return (
    <div ref={ref} data-obj={objId ?? undefined} className={cn('relative', className)} style={{ height: rows * TRK }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(SOUND)) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
        const t = clamp(tAt(e.clientX), 0, duration), g = ghost.current!;
        Object.assign(g.style, { left: `${xAt(t, k)}px`, top: `${rowAt(e) * TRK + 3}px`, height: `${TRK - 6}px` });
        g.firstElementChild!.textContent = secs(t); g.hidden = false;
      }}
      onDragLeave={(e) => { if (!ref.current!.contains(e.relatedTarget as Node)) ghost.current!.hidden = true; }}
      onDrop={(e) => {
        e.preventDefault(); ghost.current!.hidden = true;
        const path = e.dataTransfer.getData(SOUND); if (path) onDrop(path, tAt(e.clientX), rowAt(e));
      }}
      onPointerDown={(e) => { const t = e.target as HTMLElement; if (t === ref.current || t.dataset.row !== undefined) select(null); }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} data-row="" data-track={tracks ? i : undefined} className={cn('group/trk absolute inset-x-0 flex border-b', rowClass)} style={{ top: i * TRK, height: TRK }}>
          <Gut>{gutter(i)}</Gut>
        </div>
      ))}
      <div ref={ghost} hidden className="pointer-events-none absolute z-[3] w-0.5 bg-primary">
        <span className="absolute -top-0.5 left-1.5 rounded bg-primary px-1.5 text-[11px] leading-[1.6] font-semibold whitespace-nowrap text-primary-foreground" />
      </div>
      {cues.map((c) => <Clip key={c.id} c={c} k={k} className={clipClass} />)}
    </div>
  );
}

/** A waveform, drawn once its file has decoded. */
function Wave({ sound, from, to, w, h, className }: { sound: string; from: number; to: number | null; w: number; h: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null), buf = bufOf(sound);
  useLayoutEffect(() => {
    if (!ref.current) return;
    if (!buf) { loadSound(sound); return; }
    drawWave(ref.current, buf, { from, to }, w, h);
  }, [buf, sound, from, to, w, h]);
  return <canvas ref={ref} aria-hidden="true" className={cn('pointer-events-none absolute top-0 left-0', className)} />;
}

const HGT = TRK - 8;
function Clip({ c, k, className }: { c: Cue; k: number; className?: string }) {
  const lib = useEdit((s) => s.lib);
  const on = useEdit((s) => s.sel === c.id);
  const ref = useRef<HTMLDivElement>(null), glRef = useRef<HTMLElement>(null);
  const s = effective(c, lib), len = cueLen(c), start = cueStart(c), w = Math.max(6, len * k);
  const own = overrides(c).filter((x) => x !== 'hit');
  const to = s.to ?? fileLen(c.sound);
  const hit = s.hit != null && s.hit >= s.from && (to == null || s.hit < to) ? ((s.hit - s.from) / s.rate) * k : null;

  /* dragging: move (and change track), trim an edge, Option-drag an edge to squash or stretch, or set the
   * volume line; only this clip changes. The element moves in place; the full redraw waits for the drop. */
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current; if (e.button || !el) return;
    e.stopPropagation(); el.focus({ preventScroll: true });
    const { lib: l, moments, duration } = useEdit.getState();
    const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    const s0 = effective(c, l), len0 = cueLen(c), start0 = cueStart(c);
    const flen = fileLen(c.sound) ?? s0.from + len0 * s0.rate, to0 = Math.min(s0.to ?? flen, flen);
    const mode = dragModeAt(ox, oy, r.width, s0.gain, HGT, e.altKey);
    const d: DragStart = { s0, len0, start0, track0: c.track ?? 0, flen, to0, oy, h: HGT, duration };
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      if (!moved) { moved = true; freeze(c, moments); el.dataset.on = ''; el.dataset.dragging = ''; }
      Object.assign(c, dragTo(mode, d, dx / k, dy));
      const sn = effective(c, useEdit.getState().lib), ln = (Math.min(sn.to ?? flen, flen) - sn.from) / sn.rate, st = cueStart(c);
      Object.assign(el.style, { left: `${xAt(st, k)}px`, top: `${(c.track ?? 0) * TRK + 4}px`, width: `${Math.max(6, ln * k)}px` });
      if (glRef.current) glRef.current.style.top = `${gainY(sn.gain, HGT)}px`;
      el.dataset.readout = readout(mode, sn, st, ln);
    };
    const up = () => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      delete el.dataset.readout; delete el.dataset.dragging;
      select(c.id);
      if (moved) changed();
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const hover = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons) return;
    const el = e.currentTarget, r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    el.style.cursor = ox < 7 || ox > r.width - 7 ? (e.altKey ? 'col-resize' : 'ew-resize') : Math.abs(oy - gainY(effective(c, useEdit.getState().lib).gain, HGT)) <= 5 ? 'ns-resize' : 'grab';
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeCue(c); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); nudge(c, e.key === 'ArrowLeft' ? -FRAME : FRAME); }
  };
  return (
    <div ref={ref} data-cue={c.id} data-on={on ? '' : undefined} tabIndex={0} role="button" aria-label={`${nameOf(c.sound)} at ${secs(start)}`}
      title={`${c.sound} · ${secs(start)} · ${secs(len)}${own.length ? ` · own: ${own.map((x) => SETTINGS[x].label.toLowerCase()).join(', ')}` : ''}`}
      onPointerDown={down} onPointerMove={hover} onKeyDown={key} onDoubleClick={() => openEditor(c.sound)}
      className={cn('tl-clip absolute z-[1] cursor-grab touch-none overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--clip)_55%,transparent)] bg-[color-mix(in_srgb,var(--clip)_16%,transparent)] select-none hover:border-(--clip)',
        'data-[on]:border-(--clip) data-[on]:bg-[color-mix(in_srgb,var(--clip)_30%,transparent)] data-[on]:shadow-[0_0_0_1px_var(--clip)] data-[dragging]:z-[2] data-[dragging]:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground',
        c.mute && 'border-dashed opacity-45', className)}
      style={{ left: xAt(start, k), top: (c.track ?? 0) * TRK + 4, width: w, height: HGT }}>
      <Wave sound={c.sound} from={s.from} to={s.to} w={w} h={HGT} />
      <span className="pointer-events-none absolute top-0.5 left-1.5 text-[11px] leading-[1.3] font-semibold whitespace-nowrap text-foreground [text-shadow:0_1px_2px_color-mix(in_srgb,var(--background)_90%,transparent)]">
        {nameOf(c.sound)}{own.length ? <b className="text-primary" title="This clip sets some values itself"> •</b> : null}
      </span>
      {s.fadeIn ? <i className="pointer-events-none absolute inset-y-0 left-0 bg-linear-to-r from-background/70 to-transparent" style={{ width: s.fadeIn * k }} /> : null}
      {s.fadeOut ? <i className="pointer-events-none absolute inset-y-0 right-0 bg-linear-to-l from-background/70 to-transparent" style={{ width: s.fadeOut * k }} /> : null}
      <i ref={glRef} title={dB(s.gain)} className="pointer-events-none absolute inset-x-0 h-0 border-t-[1.5px] border-foreground opacity-75" style={{ top: gainY(s.gain, HGT) }} />
      {hit != null ? <i title="Hit point" className="pointer-events-none absolute inset-y-0 -ml-px w-0.5 bg-warning" style={{ left: hit }} /> : null}
      <i className="pointer-events-none absolute inset-y-0 left-0 w-1.5 border-l-[3px] border-[color-mix(in_srgb,var(--clip)_70%,transparent)]" />
      <i className="pointer-events-none absolute inset-y-0 right-0 w-1.5 border-r-[3px] border-[color-mix(in_srgb,var(--clip)_70%,transparent)]" />
    </div>
  );
}

/* ── comments on the timeline (comment mode, C): a clip, an object, a track, a beat, or the timeline at a time.
 * Hovering outlines what a click would comment on; the click opens the comment box there. ── */
function useTimelineComments(inRef: React.RefObject<HTMLDivElement | null>, tAt: (x: number) => number, film: boolean) {
  const on = useStudio((s) => s.commentMode && s.route.view === 'work' && s.route.tab === 'edit') && film;
  const tRef = useRef(tAt);
  tRef.current = tAt;
  useEffect(() => {
    const tl = inRef.current; if (!tl || !on) return;
    tl.classList.add('tl-commenting');
    let hover: Element | null = null, frozen = false;
    const mark = (n: Element | null) => { if (hover === n) return; hover?.classList.remove('c-hover'); hover = n; n?.classList.add('c-hover'); };
    const itemAt = (el: Element, x: number): { node: Element | null; t: number; item?: TimelineItem; music?: MusicPart } | null => {
      const { duration, sheet, beats, focus } = useEdit.getState(), t = round(clamp(tRef.current(x), 0, duration), 2);
      // the ruler (and its corner: play, the time, the keys) keeps working, so you can scrub while commenting
      if (el.closest('.tl-ruler')) return null;
      const clip = el.closest<HTMLElement>('[data-cue]'), c = clip ? cueById(clip.dataset.cue!) : undefined;
      if (clip && c) {
        const ob = c.object && sheet.objects?.[c.object];
        return { node: clip, t: round(cueStart(c), 2), item: { kind: 'clip', label: shortName(c.sound), detail: ob ? `on ${ob.label}` : `Track ${(c.track ?? 0) + 1}`, id: c.id } };
      }
      // the music lane: a section of the brief by its marker, the brief from the lane's name column, or the music at a time
      const sec = el.closest<HTMLElement>('[data-music-section]'), s = sec ? useEdit.getState().brief?.sections.find((x) => x.name === sec.dataset.musicSection) : undefined;
      if (sec && s) return { node: sec, t: s.at, music: { part: 'section', section: s.name } };
      const lane = el.closest('[data-music-lane]');
      if (lane) return el.closest('[data-gut]') ? { node: lane, t, music: { part: 'brief' } } : { node: lane, t, music: { part: 'lane' } };
      const beat = el.closest<HTMLElement>('[data-beat]'), b = beat ? beats[+beat.dataset.beat!] : undefined;
      if (beat && b) return { node: beat, t: b.t, item: { kind: 'beat', label: b.name, detail: b.note ? b.note.slice(0, 200) : undefined } };
      const graph = el.closest('[data-graph]');
      if (graph && focus) return { node: graph, t, item: { kind: 'object', label: focus.label, detail: 'its motion graph', id: objectBy(focus.address)?.[0] ?? null } };
      const obj = el.closest<HTMLElement>('[data-obj]'), ob = obj?.dataset.obj ? sheet.objects?.[obj.dataset.obj] : undefined;
      if (obj && ob) return { node: obj, t, item: { kind: 'object', label: ob.label, id: obj.dataset.obj } };
      const trk = el.closest<HTMLElement>('[data-track]');
      if (trk) return { node: trk, t, item: { kind: 'track', label: `Track ${+trk.dataset.track! + 1}` } };
      return { node: null, t, item: { kind: 'timeline', label: 'The timeline' } };
    };
    const down = (e: PointerEvent) => {
      const hit = itemAt(e.target as Element, e.clientX); if (!hit) return;
      e.preventDefault(); e.stopPropagation();
      mark(hit.node); frozen = true;
      if (hit.music) openMusicBox(hit.music, hit.t, e.clientX, e.clientY);
      else if (hit.item) openItemBox(hit.item, hit.t, e.clientX, e.clientY);
    };
    const click = (e: MouseEvent) => { if (!(e.target as Element).closest('.tl-ruler')) { e.preventDefault(); e.stopPropagation(); } };
    const dbl = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
    const moveOver = (e: MouseEvent) => { if (!frozen) mark(itemAt(e.target as Element, e.clientX)?.node || null); };
    const leave = () => { if (!frozen) mark(null); };
    // the box closing unfreezes the outline
    const unsub = useComments.subscribe((s, p) => { if (p.open && !s.open) frozen = false; });
    tl.addEventListener('pointerdown', down, true); tl.addEventListener('click', click, true); tl.addEventListener('dblclick', dbl, true);
    tl.addEventListener('mousemove', moveOver); tl.addEventListener('mouseleave', leave);
    return () => {
      unsub(); mark(null); tl.classList.remove('tl-commenting');
      tl.removeEventListener('pointerdown', down, true); tl.removeEventListener('click', click, true); tl.removeEventListener('dblclick', dbl, true);
      tl.removeEventListener('mousemove', moveOver); tl.removeEventListener('mouseleave', leave);
    };
  }, [on, inRef]);
}
