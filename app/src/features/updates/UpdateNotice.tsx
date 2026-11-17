import { useEffect, useState } from 'react';
import { ArrowUpCircle, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getJson, post } from '@/lib/api';
import { onLive } from '@/lib/live';
import { copy } from '@/features/comments/comments';
import { useAgentName, useCommentList } from '@/features/comments/list';

/** The studio's update state (server.mjs /api/update, server/updates.mjs). */
export interface UpdateState {
  loaded: string; installed: string; latest?: string | null; available: boolean; restartNeeded: boolean; off?: boolean;
  notes?: { version: string; date: string | null; notes: string }[];
}

/** A release's notes as list items: "- **Bold.** text" lines, continuation lines joined. */
export function noteItems(notes: string) {
  const items: string[] = [];
  for (const line of notes.split('\n')) {
    if (/^\s*-\s+/.test(line)) items.push(line.replace(/^\s*-\s+/, ''));
    else if (line.trim() && items.length) items[items.length - 1] += ` ${line.trim()}`;
  }
  return items.map((t) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'));
}

/** In the top bar, only when there's something to do: a newer release (what's new, and the update request for the
 * agent: sent straight to a linked Claude session, else copied to paste), or a package updated under the running
 * studio, which needs a restart to take effect. */
export function UpdateNotice() {
  const [state, setState] = useState<UpdateState | null>(null);
  const agent = useAgentName();
  const connected = useCommentList((s) => !!s.link?.connected);

  useEffect(() => {
    let live = true;
    const load = () => getJson<UpdateState>('/api/update').then((r) => { if (live) setState(r); }).catch(() => {});
    load();
    const off = onLive((ev) => { if (ev.type === 'update') load(); });
    const tick = setInterval(load, 10 * 60_000);
    return () => { live = false; off(); clearInterval(tick); };
  }, []);

  if (!state) return null;
  if (state.restartNeeded) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="secondary" className="text-warning"><RotateCw /> Restart to finish updating</Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="grid w-80 gap-2">
          <p className="text-sm font-semibold">Motion Director {state.installed} is installed</p>
          <p className="text-sm text-muted-foreground">
            This studio is still running {state.loaded}. Stop it and start it again (<code>npx motion-director studio</code>), or ask
            {' '}{agent} to restart it. This page carries on once it's back.
          </p>
        </PopoverContent>
      </Popover>
    );
  }
  if (!state.available || !state.latest) return null;

  async function send() {
    const r = await post<{ via: 'session' | 'clipboard'; text?: string }>('/api/update/send', {});
    if (!r.ok) { toast.error(r.data.error || 'Could not make the update request'); return; }
    if (r.data.via === 'session') toast.success(`Sent to ${agent}: it will update Motion Director`);
    else if (r.data.text && await copy(r.data.text)) toast.success(`Copied: paste it into ${agent}`);
    else toast.error('Could not copy');
  }

  const releases = state.notes ?? [];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="secondary"><ArrowUpCircle /> Update to {state.latest}</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid max-h-[70vh] w-96 gap-3 overflow-y-auto">
        <div className="grid gap-1">
          <p className="text-sm font-semibold">Motion Director {state.latest} is out</p>
          <p className="text-sm text-muted-foreground">This project has {state.installed}.</p>
        </div>
        {releases.map((r) => (
          <section key={r.version} className="grid gap-1">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{r.version}{r.date ? ` · ${r.date}` : ''}</h3>
            <ul className="grid list-disc gap-1 pl-5 text-sm">
              {noteItems(r.notes).map((t) => <li key={t}>{t}</li>)}
            </ul>
          </section>
        ))}
        <div className="grid gap-2 border-t pt-3">
          <Button size="sm" onClick={send}>{connected ? `Ask ${agent} to update` : `Copy the update request for ${agent}`}</Button>
          <p className="text-xs text-muted-foreground">
            {agent} updates the package, restarts the studio and, in Claude Code, the skill. Or run <code>npx motion-director update</code> yourself.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
