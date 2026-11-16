// The sound editor: Edit swaps the centre for the whole file. Its defaults are set by dragging: trim, volume,
// fades and the hit point, used by every clip that doesn't set its own.
import { useLayoutEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { secs } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DEFAULTS, FAMILIES, SETTINGS, TRAITS, familyLabel, familyOf, suggestUses, traitsOf, useId, USES } from './kit';
import { clamp, nameOf, round, yGain } from './geometry';
import { bufOf, currentAudition, ctx, fileLen, usePlayingPath } from './audio';
import { OWN_USE, ownUses, parseTags, withUses } from './sound-info';
import { closeEditor, setDefaults, soundDefaults, useEdit } from './store';
import { PlayButton, SettingRow } from './controls';
import { drawEditor, edGeom, edHandleAt, findHit } from './waveform';
import type { LibEntry, SettingKey } from './types';

const FIELDS: SettingKey[] = ['from', 'to', 'gain', 'fadeIn', 'fadeOut', 'hit', 'rate', 'keepPitch'];

export function SoundEditor({ path }: { path: string }) {
  useEdit((s) => s.rev);
  const lib = useEdit((s) => s.lib), status = useEdit((s) => s.status), sheet = useEdit((s) => s.sheet);
  const def: LibEntry = lib.sounds[path] || {}, s = soundDefaults(path), len = fileLen(path), used = sheet.cues.filter((c) => c.sound === path).length;
  const canvas = useRef<HTMLCanvasElement>(null), line = useRef<HTMLSpanElement>(null);
  const set = (k: SettingKey, v: unknown) => {
    const next: LibEntry = { ...def, [k]: v };
    if (v === SETTINGS[k].def) delete next[k];
    if (k === 'to' && v != null && (v as number) <= (next.from ?? 0)) delete next.to;
    setDefaults(path, next);
  };
  const reset = (k: SettingKey) => { const next = { ...def }; delete next[k]; setDefaults(path, next); };

  /* the canvas: drawn whenever anything changes, and every frame while the sound plays */
  const playing = usePlayingPath() === path;
  useLayoutEffect(() => {
    let raf = 0;
    const draw = () => {
      const cv = canvas.current, buf = bufOf(path); if (!cv || !buf) return;
      const a = currentAudition();
      const el = a && a.path === path ? ctx().currentTime - a.start : null;
      const now = soundDefaults(path);
      drawEditor(cv, buf, now, fileLen(path) || buf.duration, el != null && el >= 0 && el <= a!.len ? now.from + el * now.rate : null);
      if (a?.path === path) raf = requestAnimationFrame(draw);
    };
    draw();
    const again = () => draw();
    window.addEventListener('resize', again);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', again); };
  });

  const geom = () => edGeom(fileLen(path) || 1, canvas.current!.clientWidth, canvas.current!.clientHeight);
  const hover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons) return;
    const k = edHandleAt(soundDefaults(path), geom(), e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    e.currentTarget.style.cursor = !k ? 'default' : k === 'gain' ? 'ns-resize' : 'ew-resize';
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget, key = edHandleAt(soundDefaults(path), geom(), e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    if (!key) return;
    cv.setPointerCapture(e.pointerId);
    const def0 = { ...(useEdit.getState().lib.sounds[path] || {}) };
    const move = (ev: PointerEvent) => {
      const s0 = { ...DEFAULTS, ...def0 }, gm = geom(), to = s0.to ?? gm.len, t = gm.t(ev.offsetX), next: LibEntry = { ...def0 };
      if (key === 'from') next.from = round(clamp(t, 0, to - 0.02));
      else if (key === 'to') next.to = round(clamp(t, s0.from + 0.02, gm.len));
      else if (key === 'gain') next.gain = yGain(ev.offsetY, gm.h);
      else if (key === 'fadeIn') next.fadeIn = round(clamp((t - s0.from) / s0.rate, 0, (to - s0.from) / s0.rate));
      else if (key === 'fadeOut') next.fadeOut = round(clamp((to - t) / s0.rate, 0, (to - s0.from) / s0.rate));
      else if (key === 'hit') next.hit = round(t);
      // drawn in place as it moves; saved (and undoable) when you let go
      useEdit.getState().lib.sounds[path] = next;
      const buf = bufOf(path);
      if (buf) drawEditor(cv, buf, soundDefaults(path), fileLen(path) || buf.duration, null);
      if (line.current) line.current.textContent = key === 'gain' ? `Volume ${next.gain} dB` : `${SETTINGS[key].label} ${secs((next[key] as number) ?? 0)}`;
    };
    const up = () => {
      cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up);
      setDefaults(path, useEdit.getState().lib.sounds[path] || {});
    };
    cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up);
  };

  return (
    <section aria-label="Sound editor" className="grid min-h-0 content-start gap-3.5 overflow-auto px-5 py-4">
      <div className="flex items-center gap-4">
        <Button size="xs" variant="secondary" onClick={closeEditor}><ArrowLeft /> Timeline</Button>
        <div>
          <p className="text-base font-semibold">{nameOf(path)}</p>
          <p className="text-sm text-muted-foreground">{path}{len ? ` · ${secs(len)}` : ''} · used by {used} clip{used === 1 ? '' : 's'} in this film</p>
        </div>
        <span ref={line} aria-live="polite" className="ml-auto text-sm text-muted-foreground">{status}</span>
      </div>
      <p className="text-sm text-muted-foreground">These are the sound's defaults: they change every use of it, except where a clip sets its own value. Drag the edges to trim, the line for volume, the squares for fades, the orange marker for the hit point.</p>
      <canvas ref={canvas} onPointerMove={hover} onPointerDown={down}
        aria-label={`Waveform of ${nameOf(path)}. Drag the edges to trim, the line for volume, the top squares for fades, the orange marker for the hit point.`}
        className={cn('h-60 w-full touch-none rounded-xl border bg-background', playing && 'border-primary/40')} />
      <div className="flex flex-wrap gap-1.5">
        <PlayButton path={path} settings={() => soundDefaults(path)} variant="default" />
        <Button size="xs" variant="secondary" title="Put the hit point on the loudest moment" onClick={() => {
          const buf = bufOf(path); if (!buf) return;
          const t = findHit(buf.getChannelData(0), buf.sampleRate, s.from, s.to ?? buf.duration);
          if (t != null) set('hit', round(t));
        }}>Find the hit</Button>
        {Object.keys(def).length ? <Button size="xs" variant="outline" onClick={() => setDefaults(path, {})}>Reset all</Button> : null}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-5 gap-y-3">
        {FIELDS.map((k) => <SettingRow key={k} k={k} value={s[k]} own={k in def} onSet={(v) => set(k, v)} onReset={() => reset(k)} ownLabel="Set" inheritLabel="Default" />)}
      </div>
      <SortRow path={path} def={def} />
    </section>
  );
}

/* where the sound is shelved: its family (worked out, or set here) and your own tags, plus what was measured */
function SortRow({ path, def }: { path: string; def: LibEntry }) {
  const analysis = useEdit((s) => s.analysis), lib = useEdit((s) => s.lib);
  const m = analysis[path], auto = familyOf(path, m, null), traits = traitsOf(m);
  const save = (next: LibEntry) => setDefaults(path, next);
  const chosen = new Set(def.uses || []), offered = suggestUses(path, familyOf(path, m, def)).filter((u) => !chosen.has(u));
  const own = ownUses(lib);
  const setUses = (list: string[]) => save(withUses(def, list));
  const badge = (u: { id: string; label: string; own?: boolean }) => {
    const on = chosen.has(u.id), suggested = offered.includes(u.id);
    return (
      <button key={u.id} type="button" aria-pressed={on} onClick={() => setUses(on ? [...chosen].filter((x) => x !== u.id) : [...chosen, u.id])}
        title={on ? `Good for: ${u.label} (click to remove)` : suggested ? 'Suggested from its name: click to add' : `Mark as good for: ${u.label}`}
        className={cn('cursor-pointer rounded-md border px-2.5 py-[3px] text-xs leading-[1.4] font-semibold text-muted-foreground hover:border-foreground/35 hover:text-foreground',
          on && 'border-primary bg-primary text-primary-foreground hover:text-primary-foreground', suggested && 'border-dashed border-primary text-foreground', u.own && 'italic')}>
        {u.label}
      </button>
    );
  };
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] items-end gap-x-5 gap-y-3 border-t pt-3">
      <div className="col-span-full grid gap-1">
        <label htmlFor="snd-desc" className="flex items-center gap-1.5 text-sm font-medium">Description<span className="text-xs font-normal text-muted-foreground">optional</span></label>
        <Textarea key={`${path}:${def.description ?? ''}`} id="snd-desc" rows={2} maxLength={280} defaultValue={def.description || ''} className="min-h-11 resize-y bg-background"
          placeholder="What it is and what it suits, e.g. a soft wooden latch, good for small UI confirmations"
          onBlur={(e) => { const d = e.target.value.replace(/\s+/g, ' ').trim(); if (d === (def.description || '')) return; const next = { ...def }; if (d) next.description = d; else delete next.description; save(next); }} />
      </div>
      <div className="col-span-full grid gap-1">
        <span id="snd-uses-l" className="flex items-center justify-between gap-2 text-sm font-medium">
          Good for
          {offered.length ? <button type="button" className="cursor-pointer text-xs text-primary hover:underline" onClick={() => setUses([...chosen, ...offered])}>Add suggested ({offered.length})</button> : null}
        </span>
        <div role="group" aria-labelledby="snd-uses-l" className="flex flex-wrap gap-1.5">
          {USES.map(badge)}
          {own.map((id) => badge({ id, label: id, own: true }))}
          <Input aria-label="Your own use" placeholder="+ Your own" maxLength={24} className="h-[26px] w-[120px] rounded-md bg-background px-2.5 text-xs"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const el = e.currentTarget, id = useId(el.value);
              if (OWN_USE.test(id) && !chosen.has(id)) { setUses([...chosen, id]); el.value = ''; } else el.value = '';
            }} />
        </div>
      </div>
      <div className="grid gap-1">
        <label htmlFor="snd-family" className="text-sm font-medium">Family</label>
        <select id="snd-family" value={def.family || ''} onChange={(e) => { const next = { ...def }; if (e.target.value) next.family = e.target.value; else delete next.family; save(next); }}
          className="h-8 rounded-md border bg-background px-2 text-sm text-foreground">
          <option value="">{familyLabel(auto)} (worked out)</option>
          {FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>
      <div className="grid gap-1">
        <label htmlFor="snd-tags" className="flex items-center gap-1.5 text-sm font-medium">Tags<span className="text-xs font-normal text-muted-foreground">comma between</span></label>
        <Input key={`${path}:${(def.tags || []).join(',')}`} id="snd-tags" defaultValue={(def.tags || []).join(', ')} placeholder="e.g. soft, logo, ui" className="h-8 bg-background"
          onBlur={(e) => {
            const tags = parseTags(e.target.value), next = { ...def };
            if (JSON.stringify(tags) === JSON.stringify(def.tags || [])) return;
            if (tags.length) next.tags = tags; else delete next.tags;
            save(next);
          }} />
      </div>
      <p className="col-span-full text-sm text-muted-foreground">
        {m?.ok ? `Measured: ${traits.length ? traits.map((t) => TRAITS[t].label.toLowerCase()).join(', ') : 'nothing stands out'} · loudest at ${secs(m.hit ?? 0)} · ${Math.round(m.brightness ?? 0)} Hz bright` : 'Measuring…'}
      </p>
    </div>
  );
}
