import { useEffect, useState } from 'react';
import { CircleAlert, Clock, ListChecks, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/Hint';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getJson } from '@/lib/api';
import { onLive } from '@/lib/live';
import { cn } from '@/lib/utils';
import { CommentsList, useNow } from './CommentsList';
import { isWorking, useAgentName, useCommentList } from './list';

/** What the agent says it's doing (server/agent-status.mjs): a few words, the film, and what it's changing. */
export interface AgentStatusLine { text: string; film: string | null; about: string | null; by: string | null; at: string }

/** The line to show: the agent's own words, else (while it has this film's comments and hasn't said what it's doing)
 * that it's working on them, else nothing. A status about another film says which. */
export function statusLine(status: AgentStatusLine | null, withAgent: number, film: string | null) {
  if (status) return status.film && film && status.film !== film ? `${status.text} (${status.film})` : status.text;
  if (withAgent) return withAgent === 1 ? 'Working on your comment' : `Working on your ${withAgent} comments`;
  return null;
}

/** Beside the link icon: what the agent is working on, with a spinner, standing out while it works so it's clear
 * the film is about to change and why. It's also the one place to check on the agent: a click opens the comments
 * list. Idle, it is a quiet button, saying when something is queued or was never picked up. Live: the agent's
 * `motion-director status` (or MCP set_status) shows at once. */
export function AgentStatus() {
  const agent = useAgentName();
  const film = useCommentList((s) => s.film);
  const open = useCommentList((s) => s.open);
  const comments = useCommentList((s) => s.comments);
  const now = useNow(30_000);
  const [status, setStatus] = useState<AgentStatusLine | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => getJson<{ status: AgentStatusLine | null }>('/api/agent-status').then((r) => { if (live) setStatus(r.status); }).catch(() => {});
    load();
    const off = onLive((ev) => { if (ev.type === 'status' || ev.type === 'session') load(); });
    const tick = setInterval(load, 60_000); // a status nobody clears goes stale on the server: let it go here too
    return () => { live = false; off(); clearInterval(tick); };
  }, []);

  // a comment with the agent counts as worked on for as long as a status would; older, it was never picked up
  const working = comments.filter((c) => isWorking(c, now)).length;
  const missed = comments.filter((c) => c.status === 'sent').length - working;
  const queued = comments.filter((c) => c.status === 'queued').length;
  const line = statusLine(status, working, film);
  const who = status?.by || agent;
  const idle = missed ? `${missed} not picked up` : queued ? `${queued} queued` : null;

  return (
    <Popover open={open} onOpenChange={(o) => useCommentList.setState({ open: o })}>
      {/* always in the page, so a screen reader hears each new line; empty while the agent is idle */}
      <span role="status" aria-live="polite" className="sr-only">{line ? `${who}: ${line}` : ''}</span>
      <Hint label={line ? `${who}: ${line}. Click for your comments` : `${agent} and your comments: in progress, queued and done`}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" aria-label={`Comments${line ? `: ${who}: ${line}` : idle ? `: ${idle}` : ''}`}
            className={cn('max-w-72 min-w-0 gap-1.5 px-2.5',
              line ? 'border border-primary/45 bg-primary/10 text-foreground hover:bg-primary/15' : 'text-muted-foreground hover:text-foreground',
              open && !line && 'bg-accent text-foreground')}>
            {line ? <Loader2 className="text-primary motion-safe:animate-spin" aria-hidden="true" />
              : missed ? <CircleAlert className="text-warning" aria-hidden="true" />
                : queued ? <Clock className="text-warning" aria-hidden="true" />
                  : <ListChecks aria-hidden="true" />}
            {line || idle ? <span className="truncate">{line || idle}</span> : null}
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="w-[380px] p-0"><CommentsList working={line} /></PopoverContent>
    </Popover>
  );
}
