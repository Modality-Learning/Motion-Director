import { useEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Tabs } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { TopBar } from '@/components/TopBar';
import { Home } from '@/views/Home';
import { Workspace } from '@/views/Workspace';
import { CommentBox } from '@/features/comments/CommentBox';
import { useCommentKeys } from '@/features/comments/comments';
import { useLiveCatalog } from '@/lib/useLiveCatalog';
import { go, parseHash, useStudio, type Tab } from '@/lib/store';

export function App() {
  const catalog = useStudio((s) => s.catalog);
  const route = useStudio((s) => s.route);

  useEffect(() => {
    useStudio.getState().load();
    const onHash = () => useStudio.getState().setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useLiveCatalog();
  useCommentKeys();

  // an unknown film or composition, or an old tab name: the address says where you really are
  useEffect(() => {
    if (!catalog || route.view !== 'work') return;
    const list = route.kind === 'film' ? catalog.films : catalog.comps;
    if (!list.some((x) => x.name === route.name)) { location.replace('#/'); return; }
    const want = `#/${route.kind}/${encodeURIComponent(route.name)}/${route.tab}`;
    if (location.hash !== want) history.replaceState(null, '', want);
  }, [catalog, route]);

  const known = catalog && route.view === 'work' && (route.kind === 'film' ? catalog.films : catalog.comps).some((x) => x.name === route.name);
  const shell = (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
      <TopBar />
      {!catalog ? <p className="p-6 text-muted-foreground">Loading…</p> : known ? <Workspace /> : <Home />}
    </div>
  );
  return (
    <TooltipProvider delayDuration={400}>
      {/* the workspace's tabs sit in the top bar; their panels fill the page below it */}
      {route.view === 'work' ? <Tabs value={route.tab} onValueChange={(tab) => go({ ...route, tab: tab as Tab })} className="contents">{shell}</Tabs> : shell}
      <CommentBox />
      <Toaster position="bottom-center" />
    </TooltipProvider>
  );
}
