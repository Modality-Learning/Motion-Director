// The preview's view bar, under it like a compositor's viewer: zoom out and in, the zoom level (as a share of the
// stage's real size: 100% is one stage pixel to one screen pixel), Fit, 100%, and the hand tool for panning by
// dragging. A pinch (or ⌘/Ctrl-scroll) on the preview zooms about the pointer, and scrolling or a middle-button
// drag pans. The film page does the zooming (kit/player.js, ?bare); this only asks and shows where it is.
import { useEffect, useState } from 'react';
import { Hand, Maximize, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import { Hint } from '@/components/Hint';
import { onFilmMessage } from '@/lib/frames';
import { tellEdit } from './store';

const LEVELS = [0.125, 0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.5, 2, 3, 4];
const pct = (s: number) => `${Math.round(s * 100)}%`;

export function ViewBar() {
  const [view, setView] = useState({ scale: 0, fit: true });
  const [hand, setHand] = useState(false);
  useEffect(() => onFilmMessage((tab, m) => {
    if (tab !== 'edit') return;
    if (m.type === 'view') setView({ scale: Number(m.scale) || 0, fit: !!m.fit });
    // a reloaded preview starts fitted, without the hand
    if (m.type === 'ready') { setView((v) => ({ ...v, fit: true })); if (hand) tellEdit({ type: 'view', hand: true }); }
  }), [hand]);
  // H holds nothing: it toggles the hand tool, as in most viewers (not while typing)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key.toLowerCase() !== 'h' || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) return;
      setHand((h) => { tellEdit({ type: 'view', hand: !h }); return !h; });
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  const ask = (msg: Record<string, unknown>) => tellEdit({ type: 'view', ...msg });
  const value = view.fit ? 'fit' : String(view.scale);

  return (
    <div role="toolbar" aria-label="Preview view" className="flex h-9 items-center gap-1 border-b bg-card px-2">
      <Hint label="Hand tool: drag to pan (H)">
        <Toggle size="sm" aria-label="Hand tool" pressed={hand} onPressedChange={(on) => { setHand(on); ask({ hand: on }); }} className="h-7 min-w-7 px-1.5"><Hand /></Toggle>
      </Hint>
      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <Hint label="Zoom out"><Button variant="ghost" size="icon-xs" aria-label="Zoom out" onClick={() => ask({ do: 'out' })}><Minus /></Button></Hint>
      <Select value={value} onValueChange={(v) => ask(v === 'fit' ? { do: 'fit' } : { do: 'set', scale: Number(v) })}>
        <SelectTrigger size="sm" aria-label="Zoom" className="h-7 w-[104px] text-xs tabular-nums">
          <SelectValue>{view.scale ? `${view.fit ? 'Fit · ' : ''}${pct(view.scale)}` : 'Fit'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="fit">Fit</SelectItem>
          {view.fit || LEVELS.includes(view.scale) ? null : <SelectItem value={String(view.scale)}>{pct(view.scale)}</SelectItem>}
          {LEVELS.map((l) => <SelectItem key={l} value={String(l)}>{pct(l)}</SelectItem>)}
        </SelectContent>
      </Select>
      <Hint label="Zoom in"><Button variant="ghost" size="icon-xs" aria-label="Zoom in" onClick={() => ask({ do: 'in' })}><Plus /></Button></Hint>
      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <Hint label="Fit the film in the view">
        <Button variant={view.fit ? 'secondary' : 'ghost'} size="xs" aria-pressed={view.fit} onClick={() => ask({ do: 'fit' })}><Maximize />Fit</Button>
      </Hint>
      <Hint label="Real size: one stage pixel to one screen pixel">
        <Button variant="ghost" size="xs" onClick={() => ask({ do: 'set', scale: 1 })}>100%</Button>
      </Hint>
      <span className="ml-auto pr-1 text-xs text-muted-foreground">Pinch or ⌘-scroll to zoom · scroll to pan</span>
    </div>
  );
}
