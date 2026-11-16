// The inspector (right): what is selected. A clip's exact values (each its own or the sound's default), or an
// element of the film (its sounds, then its parameters); with nothing selected, the piece's parameters. The
// mix at its foot: a level meter and master volume.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { secs } from '@/lib/format';
import { useStudio } from '@/lib/store';
import { ParamsPanel } from '@/features/params/ParamsPanel';
import { effective, overrides, playLength } from './kit';
import { FRAME, dB, nameOf, round } from './geometry';
import { fileLen } from './audio';
import { MARKS } from './motion';
import { EQ_BARS, drawEq, eqStep } from './waveform';
import {
  M, changed, closeFocus, cueById, cueStart, filmWindow, focusObject, momentLabel, nudge, objectBy, openEditor, pushVoices, removeCue,
  setDefaults, startAt, tellEdit, useEdit,
} from './store';
import { PlayButton, NumInput, SettingRow, SideK } from './controls';
import type { Cue, Focus, SettingKey } from './types';

export function Inspector({ hidden }: { hidden: boolean }) {
  useEdit((s) => s.rev);
  const sel = useEdit((s) => s.sel), focus = useEdit((s) => s.focus), kind = useEdit((s) => s.kind);
  const c = cueById(sel);
  // the parameters go with it: an element's own, none for a clip, the piece's otherwise
  const params = !c && !(focus && !focus.scope);
  return (
    <aside aria-label="Inspector" hidden={hidden} className="flex min-h-0 min-w-0 flex-col border-l bg-card">
      <div className="min-h-0 flex-1 overflow-auto">
        {c || focus ? (
          <div className="grid content-start gap-2.5 border-b px-4 py-3.5 [overflow-wrap:anywhere]">
            {c ? <ClipPanel c={c} /> : <ElementPanel f={focus!} />}
          </div>
        ) : null}
        {params ? <div className="p-4"><ParamsPanel tab="edit" /></div> : null}
      </div>
      {kind === 'film' ? <Mix /> : null}
    </aside>
  );
}

const Title = ({ children }: { children: React.ReactNode }) => <p className="text-base font-semibold break-words">{children}</p>;

/* a selected element of the film: its name, and the sounds that belong to it (its parameters follow below) */
function ElementPanel({ f }: { f: Focus }) {
  const sheet = useEdit((s) => s.sheet);
  const ob = objectBy(f.address), n = ob ? sheet.cues.filter((c) => c.object === ob[0]).length : 0;
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <SideK>Element</SideK>
        <Button size="icon-xs" variant="ghost" aria-label={`Deselect ${f.label}`} title="Deselect (Esc)" onClick={closeFocus}><X /></Button>
      </div>
      <Title>{f.label}</Title>
      {n ? <p className="text-sm text-muted-foreground">◆ {n} sound{n === 1 ? '' : 's'}, following it when it moves</p> : null}
    </>
  );
}

const KEYS: SettingKey[] = ['gain', 'from', 'to', 'rate', 'keepPitch', 'fadeIn', 'fadeOut'];
function ClipPanel({ c }: { c: Cue }) {
  const lib = useEdit((s) => s.lib), sheet = useEdit((s) => s.sheet), duration = useEdit((s) => s.duration);
  const s = effective(c, lib), own = new Set(overrides(c)), len = fileLen(c.sound);
  const set = (k: SettingKey, v: unknown) => {
    (c as unknown as Record<string, unknown>)[k] = v;
    if (k === 'to' && v != null && (v as number) <= (c.from ?? s.from)) delete c[k];
    changed();
  };
  const reset = (k: SettingKey) => { delete c[k]; changed(); };
  const ownKeys = KEYS.filter((k) => own.has(k));
  const ob = c.object ? sheet.objects?.[c.object] : undefined;
  return (
    <>
      <SideK>Clip</SideK>
      <Title>{nameOf(c.sound)}</Title>
      <p className="text-sm text-muted-foreground">{c.sound}{len ? ` · ${secs(len)} file · plays ${secs(playLength(s, len))}` : ''}</p>
      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" onClick={() => tellEdit({ type: 'play', from: Math.max(0, cueStart(c) - 0.6) })}>Play here</Button>
        <PlayButton path={c.sound} settings={() => effective(c, useEdit.getState().lib)} label="Sound only" />
        <Button size="xs" variant="outline" aria-pressed={!!c.mute} onClick={() => { if (c.mute) delete c.mute; else c.mute = true; changed(); }}>{c.mute ? 'Muted' : 'Mute'}</Button>
        <Button size="xs" variant="outline" onClick={() => removeCue(c)}>Remove</Button>
      </div>
      <div className="grid gap-1">
        <label htmlFor="snd-at" className="flex items-center gap-1.5 text-sm font-medium">Starts at<span className="text-xs font-normal text-muted-foreground">s</span></label>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="xs" variant="outline" aria-label="One frame earlier" onClick={() => nudge(c, -FRAME)}>−1f</Button>
          <NumInput id="snd-at" data-key="at" step={0.01} min={0} max={duration} value={round(cueStart(c))} onCommit={(raw) => startAt(c, +raw || 0)} />
          <Button size="xs" variant="outline" aria-label="One frame later" onClick={() => nudge(c, FRAME)}>+1f</Button>
          <Button size="xs" variant="outline" title="Start at the playhead" onClick={() => startAt(c, M.t)}>To playhead</Button>
        </div>
      </div>
      {c.moment !== undefined ? <p className="text-sm text-muted-foreground">Follows the moment "{momentLabel(c.moment)}". Moving it places it freely.</p> : null}
      {ob ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-warning/35 px-2.5 py-2">
          <p className="text-sm">
            ◆ Belongs to <button type="button" className="inline cursor-pointer text-left font-semibold hover:text-primary" onClick={() => focusObject(c.object!)}>{ob.label}</button>
            {c.anchor ? <span className="text-muted-foreground"> · sits by its {MARKS[c.anchor.kind].anchor}{c.anchor.n ? ` (${c.anchor.n + 1})` : ''} at {secs(c.anchor.t)}, and follows it if it moves</span> : null}
          </p>
          <Button size="xs" variant="outline" onClick={() => { delete c.object; delete c.anchor; c.track = 0; changed(); }}>Detach</Button>
        </div>
      ) : null}
      {KEYS.map((k) => (
        <SettingRow key={k} k={k} value={s[k]} own={own.has(k)} onSet={(v) => set(k, v)} onReset={() => reset(k)} ownLabel="This clip"
          inheritLabel={lib.sounds[c.sound]?.[k] !== undefined ? 'Sound default' : 'Default'} />
      ))}
      <div className="flex flex-wrap gap-1.5">
        {ownKeys.length ? <Button size="xs" variant="secondary" onClick={() => { ownKeys.forEach((k) => delete c[k]); changed(); }}>Reset to the sound</Button> : null}
        {ownKeys.length ? (
          <Button size="xs" variant="secondary" title="Every clip of this sound that doesn't set its own value will use these" onClick={() => {
            const values = Object.fromEntries(ownKeys.map((k) => [k, c[k]]));
            ownKeys.forEach((k) => delete c[k]); changed();
            setDefaults(c.sound, { ...(lib.sounds[c.sound] || {}), ...values });
          }}>Make these the sound's defaults</Button>
        ) : null}
        <Button size="xs" variant="outline" onClick={() => openEditor(c.sound)}>Edit the sound</Button>
      </div>
    </>
  );
}

/* ── the mix, at the foot of the inspector: what is playing, as an equaliser, over the master volume ── */
const bars = new Float32Array(EQ_BARS);
function Mix() {
  const master = useEdit((s) => s.sheet.master), playing = useEdit((s) => s.playing);
  useEdit((s) => s.rev);
  const active = useStudio((s) => s.route.view === 'work' && s.route.tab === 'edit');
  const [live, setLive] = useState(master);
  useEffect(() => setLive(master), [master]);
  const eq = useRef<HTMLCanvasElement>(null);
  // the equaliser moves while it plays, then settles
  useEffect(() => {
    const draw = () => {
      const cv = eq.current; if (!cv || !cv.clientWidth) return false;
      let a: Uint8Array | null = null;
      try { a = filmWindow()?.__film?.meter?.() ?? null; } catch { a = null; }
      const moving = eqStep(bars, a);
      drawEq(cv, bars);
      return moving || !!a;
    };
    if (!active) return;
    let raf = requestAnimationFrame(function tick() { if (draw()) raf = requestAnimationFrame(tick); });
    const again = () => draw();
    window.addEventListener('resize', again);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', again); };
  }, [playing, active]);
  return (
    <footer aria-label="Mix" className="grid flex-none gap-2 border-t bg-card px-4 pt-2.5 pb-3.5">
      <canvas ref={eq} aria-hidden="true" className="block h-11 w-full rounded-md bg-ink" />
      <div className="grid gap-1">
        <label htmlFor="snd-master" className="flex items-center gap-1.5 text-sm font-medium">Master volume<span className="text-muted-foreground">{dB(live)}</span></label>
        <Slider id="snd-master" aria-label="Master volume" min={-24} max={12} step={0.5} value={[live]}
          onValueChange={([v]) => { setLive(v); useEdit.getState().sheet.master = v; pushVoices(); }}
          onValueCommit={() => changed()} />
      </div>
    </footer>
  );
}

