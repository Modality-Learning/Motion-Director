// A grip on the edge of a side column: drag to resize it, double-click to reset, arrow keys for steps. The width
// is the column's own, remembered in this browser (lib/store.ts local), so it is layout only.
import { useCallback, useState } from 'react';
import { local } from '@/lib/store';
import { cn } from '@/lib/utils';

/** A column width remembered in this browser, kept between min and max. */
export function useColumnWidth(key: string, def: number, min: number, max: number) {
  const clampW = useCallback((v: number) => Math.round(Math.min(max, Math.max(min, v))), [min, max]);
  const [width, setWidth] = useState(() => { const v = parseFloat(local.get(`width-${key}`) ?? ''); return Number.isFinite(v) ? clampW(v) : def; });
  const set = useCallback((v: number | null, save = true) => {
    const next = v == null ? def : clampW(v);
    setWidth(next);
    if (save) { if (v == null) local.del(`width-${key}`); else local.set(`width-${key}`, String(next)); }
  }, [key, def, clampW]);
  return [width, set, { min, max }] as const;
}

/** The grip itself, on the column's inner edge: `edge` says which side of the column it sits on. */
export function ColumnGrip({ label, width, onWidth, edge, min, max }: {
  label: string; width: number; onWidth: (v: number | null, save?: boolean) => void; edge: 'left' | 'right'; min: number; max: number;
}) {
  const [dragging, setDragging] = useState(false);
  const dir = edge === 'right' ? 1 : -1; // dragging away from the column widens it
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button) return;
    const grip = e.currentTarget, x0 = e.clientX, w0 = width;
    e.preventDefault(); grip.setPointerCapture(e.pointerId); setDragging(true);
    document.body.classList.add('col-resizing'); // the previews don't take the pointer meanwhile
    const move = (ev: PointerEvent) => onWidth(w0 + (ev.clientX - x0) * dir, false);
    const up = (ev: PointerEvent) => {
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up);
      document.body.classList.remove('col-resizing'); setDragging(false);
      onWidth(w0 + (ev.clientX - x0) * dir);
    };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up);
  };
  return (
    <div role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={width} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
      title="Drag to resize · double-click to reset" data-dragging={dragging || undefined}
      className={cn('group absolute inset-y-0 z-[9] flex w-2.5 cursor-col-resize touch-none justify-center outline-none', edge === 'right' ? '-right-[5px]' : '-left-[5px]')}
      onPointerDown={down} onDoubleClick={() => onWidth(null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault(); onWidth(width + (e.key === 'ArrowRight' ? 24 : -24) * dir);
      }}>
      <div className="h-full w-px bg-transparent group-hover:bg-primary group-focus-visible:bg-primary group-data-[dragging]:bg-primary" />
    </div>
  );
}
