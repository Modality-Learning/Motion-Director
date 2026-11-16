// The previews and the messages the studio itself takes from them (the Edit tab takes its own, too).
import { useEffect } from 'react';
import { pageBase } from '@/lib/api';
import { forgetFrames, frameKey, loadFrame, onFilmMessage, registerFrame, tell, type FrameTab } from '@/lib/frames';
import { frameOf, useStudio, type Scope } from '@/lib/store';
import { cn } from '@/lib/utils';
import { focusScope } from '@/features/params/ParamsPanel';
import { scopeLabels } from '@/features/params/params';

/** An iframe for one of the previews; the studio loads pages into it (loadPreview). */
export function PreviewFrame({ tab, title, className }: { tab: FrameTab; title: string; className?: string }) {
  // the ids are what agents use to find a preview from the page (skill/SOUND.md)
  return <iframe id={tab === 'edit' ? 'editFrame' : 'boardFrame'} ref={(el) => { registerFrame(tab, el); return () => registerFrame(tab, null); }} title={title} allow="autoplay"
    className={cn('size-full border-0 bg-background', className)} />;
}

const pieceKey = () => { const r = useStudio.getState().route; return r.view === 'work' ? `${r.kind}/${r.name}` : ''; };
function srcFor(tab: FrameTab) {
  const { route, catalog, playhead } = useStudio.getState();
  if (route.view !== 'work' || !catalog) return null;
  const x = (route.kind === 'film' ? catalog.films : catalog.comps).find((y) => y.name === route.name);
  if (!x) return null;
  const base = pageBase(route.kind, route.name);
  // Edit opens at the remembered playhead; its timeline is the transport (the preview has no player bar)
  return tab === 'storyboard' ? `${base}?board&${x.query}` : `${base}?bare&t=${playhead.toFixed(2)}&${x.query}`;
}
/** Loads the open piece into a preview, once (after that, edits reach it live), or again when forced. */
export function loadPreview(tab: FrameTab, force = false) {
  const src = srcFor(tab);
  if (src) loadFrame(tab, pieceKey(), src, force);
}
/** A piece's code or manifest changed on disk: its previews reload in place, at the playhead. */
export function reloadPreviews() {
  for (const tab of ['storyboard', 'edit'] as const) if (frameKey(tab)) loadPreview(tab, true);
}

/** Keeps the previews in step with the open piece and tab, and takes what they report. */
export function usePreviews() {
  const route = useStudio((s) => s.route);
  const catalog = useStudio((s) => !!s.catalog);
  const key = route.view === 'work' ? `${route.kind}/${route.name}` : '';
  const tab = route.view === 'work' ? route.tab : null;

  useEffect(() => { forgetFrames(); lastEditTime = null; }, [key]);
  useEffect(() => {
    if (!catalog || !key) return;
    if (tab === 'brief') loadPreview('storyboard');
    if (tab === 'edit') {
      // a preview already loaded catches up with the playhead (it moved while you were away)
      if (frameKey('edit') === key) { const t = useStudio.getState().playhead, at = lastEditTime; if (at == null || Math.abs(at - t) > 0.005) tell('edit', { type: 'seek', t }); }
      else loadPreview('edit');
    } else tell('edit', { type: 'pause' });
  }, [catalog, key, tab]);

  useEffect(() => onFilmMessage((from, m) => {
    const s = useStudio.getState();
    if (m.type === 'ready') {
      useStudio.setState({ scopes: { ...s.scopes, [from]: (m.scopes as Scope[]) || [] } });
      if (from === 'storyboard') tell('storyboard', { type: 'commentMode', on: s.commentMode && s.route.view === 'work' && s.route.tab === 'brief' });
      if (from === 'edit') tell('edit', { type: 'labels', labels: scopeLabels() });
    } else if (m.type === 'time') {
      const t = m.t as number;
      if (from === 'edit') { lastEditTime = t; if (s.route.view === 'work' && s.route.tab === 'edit') s.setPlayhead(t); }
      useStudio.setState({ times: { ...s.times, [from]: t }, ...(from === 'storyboard' && m.key ? { boardKey: String(m.key) } : {}) });
    } else if (m.type === 'pick' && s.route.view === 'work' && frameOf(s.route.tab) === from) focusScope(String(m.id));
  }), []);
}
let lastEditTime: number | null = null;
