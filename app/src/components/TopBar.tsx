import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Hint } from '@/components/Hint';
import { Logo } from '@/components/Logo';
import { Kbd } from '@/components/Kbd';
import { TABS, commentable, useOpenItem, useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';
import { SessionLinkButton } from '@/features/comments/SessionLink';
import { AgentStatus } from '@/features/comments/AgentStatus';
import { UpdateNotice } from '@/features/updates/UpdateNotice';

const label = { vibe: 'Vibe', treatment: 'Treatment', edit: 'Edit', export: 'Export' } as const;

/** The bar along the top. Left: the name, and while a piece is open its tabs. Centre: where you are, from the project
 * (its name in motion-director.config.mjs) to the open film or composition. Right: the save indicator; on a film, the agent's status (which opens the comments list), the link to the agent,
 * and comment mode. */
export function TopBar() {
  const project = useStudio((s) => s.catalog?.project);
  const route = useStudio((s) => s.route);
  const item = useOpenItem();
  const save = useStudio((s) => s.save);
  const commentMode = useStudio((s) => s.commentMode);
  const setCommentMode = useStudio((s) => s.setCommentMode);
  const work = route.view === 'work' && item ? route : null;
  const canComment = !!work && work.kind === 'film' && commentable(work.tab);
  const crumb = 'text-muted-foreground no-underline hover:text-foreground hover:underline';

  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6 border-b px-5 py-3.5">
      <div className="flex min-h-9 min-w-0 items-center gap-6">{/* as tall with tabs as without, so the bar never jumps */}
        <a href="#/" className="flex shrink-0 items-center gap-2 text-foreground no-underline hover:text-primary"><Logo className="size-6" /><b className="text-lg tracking-tight">Motion Director</b></a>
        {work ? (
          <TabsList variant="line" aria-label="Workspace" className="h-auto gap-1 p-0">
            {TABS[work.kind].map((t) => (
              <TabsTrigger key={t} value={t}
                className="h-auto flex-none rounded-none px-4 py-2.5 text-[15px] font-semibold after:bottom-[-15px] after:bg-primary">
                {label[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        ) : null}
      </div>
      <nav aria-label="You are here" className="flex min-w-0 items-center gap-2 text-muted-foreground">
        {project?.name ? <a className={crumb} href="#/" title="The project: its name in motion-director.config.mjs">{project.name}</a> : null}
        {work && item ? (
          <>
            {project?.name ? <span aria-hidden="true">/</span> : null}
            <a className={crumb} href={work.kind === 'film' ? '#/' : '#/comps'}>{work.kind === 'film' ? 'Films' : 'Compositions'}</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="truncate font-semibold text-foreground">{item.title}</span>
          </>
        ) : null}
      </nav>
      <div className="flex min-w-0 items-center justify-end gap-4">
        <UpdateNotice />
        <span role="status" aria-live="polite" className={cn('truncate text-sm', save.state === 'error' ? 'text-destructive' : save.state === 'saved' ? 'text-success' : 'text-muted-foreground')}>
          {save.state === 'saving' ? 'Saving…' : save.state === 'saved' ? 'Saved ✓' : save.state === 'error' ? `Not saved: ${save.detail || 'try again'}` : ''}
        </span>
        {work && work.kind === 'film' ? (
          <div className="flex min-w-0 items-center gap-1">
            <AgentStatus />
            <SessionLinkButton />
            {canComment ? (
              <Hint label="Comment mode (C)">
                <Button size="sm" variant={commentMode ? 'default' : 'secondary'} aria-pressed={commentMode} aria-keyshortcuts="C" onClick={() => setCommentMode(!commentMode)}>
                  <MessageSquare /> Comment <Kbd>C</Kbd>
                </Button>
              </Hint>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
