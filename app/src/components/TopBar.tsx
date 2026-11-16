import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Hint } from '@/components/Hint';
import { Kbd } from '@/components/Kbd';
import { Badge } from '@/components/ui/badge';
import { TABS, isFilm, useOpenItem, useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';

const label = { brief: 'Brief', edit: 'Edit', export: 'Export' } as const;

/** The bar along the top: where you are, the save indicator and, while a piece is open, its tabs and comment mode. */
export function TopBar() {
  const project = useStudio((s) => s.catalog?.project);
  const route = useStudio((s) => s.route);
  const item = useOpenItem();
  const save = useStudio((s) => s.save);
  const commentMode = useStudio((s) => s.commentMode);
  const setCommentMode = useStudio((s) => s.setCommentMode);
  const work = route.view === 'work' && item ? route : null;
  const canComment = !!work && work.kind === 'film' && (work.tab === 'brief' || work.tab === 'edit');

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b px-5 py-3.5">
      <a href="#/" className="group flex items-baseline gap-2 text-foreground no-underline">
        <b className="text-lg tracking-tight group-hover:text-primary">Motion Director</b>
        {project?.name ? <span className="text-sm text-muted-foreground">{project.name}</span> : null}
      </a>
      {work && item ? (
        <>
          <nav aria-label="You are here" className="flex items-center gap-2 text-muted-foreground">
            <a className="text-muted-foreground no-underline hover:text-foreground hover:underline" href={work.kind === 'film' ? '#/' : '#/comps'}>{work.kind === 'film' ? 'Films' : 'Compositions'}</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="font-semibold text-foreground">{item.title}</span>
          </nav>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            {(isFilm(item) ? [item.orientation === 'vertical' ? 'Vertical 9:16' : 'Landscape 16:9', `${item.duration} s`] : [`${item.duration} s`, 'Composition']).map((c) => <Badge key={c} variant="outline" className="text-muted-foreground">{c}</Badge>)}
          </div>
        </>
      ) : null}
      <span role="status" aria-live="polite" className={cn('text-sm', save.state === 'error' ? 'text-destructive' : save.state === 'saved' ? 'text-success' : 'text-muted-foreground')}>
        {save.state === 'saving' ? 'Saving…' : save.state === 'saved' ? 'Saved ✓' : save.state === 'error' ? `Not saved: ${save.detail || 'try again'}` : ''}
      </span>
      {work ? (
        <div className="ml-auto flex items-center gap-3">
          <TabsList variant="line" aria-label="Workspace" className="h-auto gap-1 p-0">
            {TABS[work.kind].map((t) => (
              <TabsTrigger key={t} value={t}
                className="h-auto flex-none rounded-none px-4 py-2.5 text-[15px] font-semibold after:bottom-[-15px] after:bg-primary">
                {label[t]}
              </TabsTrigger>
            ))}
          </TabsList>
          {canComment ? (
            <Hint label="Comment mode (C)">
              <Button size="sm" variant={commentMode ? 'default' : 'secondary'} aria-pressed={commentMode} aria-keyshortcuts="C" onClick={() => setCommentMode(!commentMode)}>
                <MessageSquare /> Comment <Kbd>C</Kbd>
              </Button>
            </Hint>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
