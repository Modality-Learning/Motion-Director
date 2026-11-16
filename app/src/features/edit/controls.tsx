// The Edit tab's small controls: a play button for one sound, a number field that saves when you're done
// with it, and a setting's row (its value, and whether it is its own or inherited).
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Hint } from '@/components/Hint';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { SETTINGS } from './kit';
import { G, nameOf } from './geometry';
import { play, stopAudition, usePlayingPath, type Audition } from './audio';
import { say, useEdit } from './store';
import type { SettingKey, Settings } from './types';

/** A play button that pauses the sound when it is the one playing. */
export function PlayButton({ path, settings, label = 'Play', icon = false, variant = 'secondary', className, onStart }: {
  path: string; settings: () => Settings; label?: string; icon?: boolean; variant?: 'default' | 'secondary' | 'ghost' | 'outline'; className?: string; onStart?: (a: Audition) => void;
}) {
  const on = usePlayingPath() === path, name = nameOf(path);
  const click = () => (on ? stopAudition() : play(path, settings(), { audioTool: useEdit.getState().audio, onStart, onFail: () => say('That sound could not be played') }));
  if (icon) {
    return (
      <Hint label={on ? 'Pause' : 'Play'}>
        <Button type="button" size="icon-xs" variant={on ? 'default' : 'outline'} aria-label={`${on ? 'Pause' : 'Play'} ${name}`} onClick={click}
          className={cn('rounded-full', className)}>
          {on ? <Pause className="fill-current" /> : <Play className="translate-x-px fill-current" />}
        </Button>
      </Hint>
    );
  }
  return <Button type="button" size="xs" variant={on ? 'default' : variant} className={className} onClick={click}>{on ? 'Pause' : label}</Button>;
}

/** A number field: shows the value given, unless you are typing in it; hands back what you typed when you're done
 * with it (Enter, leaving the field, or the arrows), as the browser's change event says. */
export function NumInput({ value, onCommit, className, ...props }: { value: number | null | undefined; onCommit: (raw: string) => void } & Omit<React.ComponentProps<'input'>, 'value' | 'onChange'>) {
  const ref = useRef<HTMLInputElement>(null), focused = useRef(false), commit = useRef(onCommit);
  commit.current = onCommit;
  const shown = value == null ? '' : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => { if (!focused.current) setText(shown); }, [shown]);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const fn = () => commit.current(el.value);
    el.addEventListener('change', fn);
    return () => el.removeEventListener('change', fn);
  }, []);
  return (
    <Input ref={ref} type="number" value={text} onChange={(e) => setText(e.target.value)}
      onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(shown); }}
      className={cn('h-8 w-[84px] bg-background px-2 text-sm tabular-nums', className)} {...props} />
  );
}

/** A setting's row: its label, where its value comes from (its own, or the default it inherits), and the control. */
export function SettingRow({ k, value, own, onSet, onReset, ownLabel, inheritLabel }: {
  k: SettingKey; value: unknown; own: boolean; onSet: (v: unknown) => void; onReset: () => void; ownLabel: string; inheritLabel: string;
}) {
  const s = SETTINGS[k], id = `snd-${k}`;
  const badge = own
    ? <Hint label={`Use ${inheritLabel.toLowerCase()} instead`}>
        <Button type="button" size="xs" variant="outline" onClick={onReset} className="ml-auto h-5 rounded-full text-primary">{ownLabel}<RotateCcw /></Button>
      </Hint>
    : <Badge variant="outline" className="ml-auto text-muted-foreground">{inheritLabel}</Badge>;
  let control: React.ReactNode;
  if (s.bool) control = <Checkbox id={id} data-key={k} checked={!!value} onCheckedChange={(v) => onSet(v === true)} />;
  else if (k === 'gain' || k === 'rate') control = <RangePair id={id} k={k} value={value as number} onSet={onSet} />;
  else control = (
    <NumInput id={id} data-key={k} min={s.min} max={s.max} step={0.01} value={value as number | null} placeholder={k === 'to' ? 'End' : k === 'hit' ? 'None' : ''}
      onCommit={(raw) => onSet(raw === '' ? s.def : +raw)} />
  );
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">
        {s.label}{s.unit ? <span className="text-xs font-normal text-muted-foreground">{s.unit}</span> : null}{badge}
      </label>
      {control}
    </div>
  );
}
/* volume and speed: a slider beside the exact value; the slider is heard when you let go */
function RangePair({ id, k, value, onSet }: { id: string; k: 'gain' | 'rate'; value: number; onSet: (v: unknown) => void }) {
  const s = SETTINGS[k], [live, setLive] = useState(value);
  useEffect(() => setLive(value), [value]);
  const gain = k === 'gain';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Slider id={id} data-key={k} aria-label={s.label} className="min-w-[100px] flex-1" min={gain ? G.min : 0.25} max={gain ? G.max : 4} step={gain ? 0.5 : 0.01}
        value={[live]} onValueChange={([v]) => setLive(v)} onValueCommit={([v]) => onSet(v)} />
      <NumInput aria-label={`${s.label} value`} data-key={`${k}-n`} min={s.min} max={s.max} step={gain ? 0.5 : 0.01} value={live}
        onCommit={(raw) => { if (raw !== '') onSet(+raw); }} />
    </div>
  );
}

/** A section's small heading in the inspector and the library. */
export function SideK({ children, className, as: As = 'h3' }: { children: React.ReactNode; className?: string; as?: 'h3' | 'div' | 'span' }) {
  return <As className={cn('m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase', className)}>{children}</As>;
}
