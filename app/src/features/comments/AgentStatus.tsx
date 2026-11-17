import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getJson } from '@/lib/api';
import { onLive } from '@/lib/live';
import { useAgentName, useCommentList } from './list';

/** What the agent says it's doing (server/agent-status.mjs): a few words, the film, and what it's changing. */
export interface AgentStatusLine { text: string; film: string | null; about: string | null; by: string | null; at: string }

/** The line to show: the agent's own words, else (while it has this film's comments and hasn't said) that it has
 * them, else nothing. A status about another film says which. */
export function statusLine(status: AgentStatusLine | null, agent: string, withAgent: number, film: string | null) {
  if (status) return status.film && film && status.film !== film ? `${status.text} (${status.film})` : status.text;
  if (withAgent) return `${agent} has ${withAgent} comment${withAgent === 1 ? '' : 's'}`;
  return null;
}

/** Beside the link icon: a spinner and what the agent is working on, so it's clear the film is about to change and
 * why. Live: the agent's `motion-director status` (or MCP set_status) shows at once. */
export function AgentStatus() {
  const agent = useAgentName();
  const film = useCommentList((s) => s.film);
  const withAgent = useCommentList((s) => s.comments.filter((c) => c.status === 'sent').length);
  const [status, setStatus] = useState<AgentStatusLine | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => getJson<{ status: AgentStatusLine | null }>('/api/agent-status').then((r) => { if (live) setStatus(r.status); }).catch(() => {});
    load();
    const off = onLive((ev) => { if (ev.type === 'status' || ev.type === 'session') load(); });
    const tick = setInterval(load, 60_000); // a status nobody clears goes stale on the server: let it go here too
    return () => { live = false; off(); clearInterval(tick); };
  }, []);

  const line = statusLine(status, agent, withAgent, film);
  const who = status?.by || agent;
  return (
    // always in the page, so a screen reader hears each new line; empty while the agent is idle
    <span role="status" aria-live="polite" className="flex max-w-64 min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      {line ? (
        <>
          <Loader2 className="size-3.5 flex-none motion-safe:animate-spin" aria-hidden="true" />
          <span className="truncate" title={`${who} is working: ${line}`}><span className="sr-only">{who} is working: </span>{line}</span>
        </>
      ) : null}
    </span>
  );
}
