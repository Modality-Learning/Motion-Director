// The picked object's graph: how it moves, grows, turns and shows across the film. Hover for exact values,
// click a mark for sounds that suit it, drop a sound on it to give the object that sound.
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { GUT, PAD, clamp, round, xAt } from './geometry';
import { LINES, MARKS, readAt } from './motion';
import { addCue, hasSound, setLine, tellEdit, useEdit } from './store';
import { Row, type Axis } from './rows';
import { isCurve, type Curve, type LineKey, type Mark } from './types';

const H = 76;

export function GraphRow({ axis, rows, colour, name }: { axis: Axis; rows: number; colour: number; name: React.ReactNode }) {
  const curve = useEdit((s) => s.curve);
  const hiddenLines = useEdit((s) => s.hiddenLines);
  const cls = `obj-c${colour % 6} border-b border-dashed [&>div:first-child]:flex-col [&>div:first-child]:items-stretch [&>div:first-child]:justify-center [&>div:first-child]:gap-1 [&>div:first-child]:bg-[color-mix(in_srgb,var(--obj)_10%,var(--card))]`;
  const gut = (
    <>
      <span className="flex min-w-0 items-center gap-1.5 text-(--obj)">{name}</span>
      {isCurve(curve) ? <LinesButton /> : null}
    </>
  );
  if (!isCurve(curve)) {
    return (
      <Row height={30} className={cls} name={gut}>
        <span className="sticky left-[148px] self-center px-2.5 text-xs whitespace-nowrap text-muted-foreground">
          {curve && 'missing' in curve ? 'This element can\'t be measured right now.' : 'Measuring how it moves…'}
        </span>
      </Row>
    );
  }
  return <Row height={H} className={cls} name={gut} data-graph-row=""><Graph cv={curve} axis={axis} rows={rows} hiddenLines={hiddenLines} /></Row>;
}

function Graph({ cv, axis, rows, hiddenLines }: { cv: Curve; axis: Axis; rows: number; hiddenLines: Set<LineKey> }) {
  const { k, tAt, duration } = axis;
  const ref = useRef<HTMLCanvasElement>(null), readRef = useRef<HTMLSpanElement>(null);
  const on = (key: LineKey) => !hiddenLines.has(key);
  // the marks of the lines that are on (marks measured before lines were told apart belong to all of them)
  const marks: Mark[] = cv.marks.filter((m) => !m.line || on(m.line));
  const W = Math.round(GUT + duration * k + PAD);

  useLayoutEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d'); if (!g) return;
    g.scale(dpr, dpr);
    const y = (v: number) => H - 4 - v * (H - 16);
    const line = (vals: number[], stroke: string, fill?: string, dash?: number[]) => {
      g.beginPath(); g.setLineDash(dash || []);
      cv.samples.forEach((p, i) => (i ? g.lineTo(xAt(p[0], k), y(vals[i])) : g.moveTo(xAt(p[0], k), y(vals[i]))));
      if (fill) { g.lineTo(xAt(duration, k), H); g.lineTo(xAt(0, k), H); g.closePath(); g.fillStyle = fill; g.fill(); }
      g.strokeStyle = stroke; g.lineWidth = 1.4; g.stroke(); g.setLineDash([]);
    };
    if (on('moves')) line(cv.nm, LINES.moves.colour, LINES.moves.fill);
    if (on('grows')) line(cv.ng, LINES.grows.colour, LINES.grows.fill);
    if (on('turns') && cv.nt) line(cv.nt, LINES.turns.colour, LINES.turns.fill);
    if (on('shows')) line(cv.samples.map((p) => p[5]), 'rgba(227,232,214,.55)', undefined, [3, 3]);
    // where it can't be seen, the lane is greyed out
    g.fillStyle = 'rgba(15,37,42,.6)';
    cv.samples.forEach((p) => { if (p[5] < 0.05) g.fillRect(xAt(p[0], k) - 1, 0, Math.max(2, 0.04 * k + 1), H); });
    g.font = '11px sans-serif'; g.textAlign = 'center';
    for (const m of marks) { g.fillStyle = MARKS[m.kind].colour; g.fillText(MARKS[m.kind].glyph, xAt(m.t, k), 11); }
  });

  // hovering reads out the exact values at that moment
  const at = (clientX: number) => { const t = tAt(clientX); return Math.max(0, Math.min(cv.samples.length - 1, cv.samples.findIndex((p) => p[0] >= t))); };
  const move = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const read = readRef.current; if (!read) return;
    read.textContent = readAt(cv, at(e.clientX));
    const box = e.currentTarget.getBoundingClientRect(), x = e.clientX - box.left, flip = x > box.width - 300;
    Object.assign(read.style, { left: `${flip ? x - 12 : x + 12}px`, transform: flip ? 'translateX(-100%)' : '' });
    read.hidden = false;
  };
  const click = (e: React.MouseEvent) => {
    const t = tAt(e.clientX), near = marks.reduce<Mark | null>((b, m) => (Math.abs(m.t - t) < Math.abs((b?.t ?? Infinity) - t) ? m : b), null);
    const onMark = !!near && Math.abs(near.t - t) * k < 8;
    tellEdit({ type: 'seek', t: onMark ? near!.t : clamp(t, 0, duration) });
    // a mark asks the library for sounds that suit it, ready to add with their hit on that moment
    if (onMark) useEdit.setState({ suggest: { kind: near!.kind, t: round(near!.t) } });
  };
  const focus = useEdit((s) => s.focus);
  return (
    <>
      <canvas ref={ref} data-graph="" aria-label={`How ${focus?.label ?? 'it'} moves, grows, turns and shows across the film`}
        className="absolute top-0 left-0 block cursor-pointer data-[drop]:outline-2 data-[drop]:-outline-offset-2 data-[drop]:outline-primary" style={{ width: W, height: H }}
        onMouseMove={move} onMouseLeave={() => { if (readRef.current) readRef.current.hidden = true; }} onClick={click}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-promo-sound')) { e.preventDefault(); e.currentTarget.dataset.drop = ''; } }}
        onDragLeave={(e) => { delete e.currentTarget.dataset.drop; }}
        // sounds can be dropped on the graph too: they go on the object's first free row
        onDrop={(e) => {
          e.preventDefault(); delete e.currentTarget.dataset.drop;
          const path = e.dataTransfer.getData('text/x-promo-sound');
          const f = useEdit.getState().focus;
          if (path && hasSound() && f) addCue(path, tAt(e.clientX), rows - 1, f);
        }} />
      <span ref={readRef} hidden className="pointer-events-none absolute top-1.5 z-[5] rounded-[5px] border bg-ink px-[7px] py-0.5 text-[11px] leading-normal font-semibold whitespace-nowrap tabular-nums" />
    </>
  );
}

/* the graph's lines: a chevron under the object's name opens what each one means, and turns them on and off */
function LinesButton() {
  const hiddenLines = useEdit((s) => s.hiddenLines);
  const entries = Object.entries(LINES) as [LineKey, (typeof LINES)[LineKey]][];
  // kept on screen and off the graph: it opens below the whole graph row, or above it when there's no room
  const btn = useRef<HTMLButtonElement>(null);
  const row = useRef({ getBoundingClientRect: () => (btn.current?.closest('[data-graph-row]') ?? btn.current ?? document.body).getBoundingClientRect() });
  return (
    <Popover>
      <PopoverAnchor virtualRef={row as RefObject<{ getBoundingClientRect: () => DOMRect }>} />
      <PopoverTrigger asChild>
        <button ref={btn} type="button" aria-label="Graph lines: what they mean, and which are shown"
          className="inline-flex cursor-pointer items-center gap-[5px] self-start rounded-md border bg-secondary py-[3px] pr-1.5 pl-[7px] text-foreground hover:border-foreground/35 aria-expanded:border-foreground/35">
          {entries.map(([key, l]) => {
            const off = hiddenLines.has(key);
            return <span key={key} title={key} style={{ '--c': l.colour } as React.CSSProperties}
              className={cn('rounded-full', off ? 'size-1.5 border-[1.5px] border-[color-mix(in_srgb,var(--c)_45%,transparent)]' : l.dashed ? 'size-1.5 border-[1.5px] border-dashed border-(--c)' : 'size-[9px] bg-(--c)')} />;
          })}
          <ChevronDown aria-hidden="true" className="size-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] bg-card p-2 text-[13px]" aria-label="Graph lines">
        {entries.map(([key, l]) => (
          <label key={key} className="grid cursor-pointer grid-cols-[auto_18px_1fr] items-start gap-2 rounded-md p-1.5 hover:bg-secondary">
            <Checkbox checked={!hiddenLines.has(key)} onCheckedChange={(v) => setLine(key, v === true)} className="mt-0.5" />
            <span style={{ '--c': l.colour } as React.CSSProperties} className={cn('mt-[7px]', l.dashed ? 'h-0 border-t-2 border-dashed border-(--c)' : 'h-[3px] rounded-sm bg-(--c)')} />
            <span className="flex flex-col gap-px"><b>{key}</b><span className="text-xs text-muted-foreground">{l.means}</span></span>
          </label>
        ))}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 border-t px-1.5 pt-2 pb-0.5 text-xs">
          {(['peak', 'stop', 'in', 'out'] as const).map((m) => <span key={m}><b style={{ color: MARKS[m].colour }}>{MARKS[m].glyph}</b> {MARKS[m].means}</span>)}
          <span className="basis-full text-muted-foreground">Click a mark for sounds that suit it.</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
