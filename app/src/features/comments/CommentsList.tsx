import { useEffect, useState } from 'react';
import { Check, ChevronRight, Clock, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fmtT } from '@/lib/format';
import { tell } from '@/lib/frames';
import { go, useStudio, type Tab } from '@/lib/store';
import { cn } from '@/lib/utils';
import { copy } from './comments';
import { STALE_MS, sendAll, setStatus, useAgentName, useCommentList, type StudioComment } from './list';

const TAB_OF: Record<StudioComment['view'], Tab> = { storyboard: 'treatment', treatment: 'treatment', edit: 'edit', motion: 'edit', vibe: 'vibe' };
const WHERE: Record<Tab, string> = { vibe: 'Vibe', treatment: 'Treatment', edit: 'Edit', export: 'Export' };
/** What the comment is about, short: the note's About line without the scope id, the time (shown already) or the
 * current value. "Opening line (param:title-0) at 0:00.0, currently “…”" reads "Opening line". */
export const shortAbout = (about: string | null) => (about || '')
  .replace(/ \((?:param|comp):[^)]*\)/g, '').replace(/, currently .*$/, '').replace(/ at \d+:\d{2}(?:\.\d)?$/, '')
  .replace(/ \(storyboard, [^)]*\)$/, '').trim();

/** The time now, ticking every `ms`: for what has sat with the agent a while. */
export function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

/** One place to check on the agent, opened from its status beside the link icon: what it's working on now, the
 * comments it has, the ones queued for it, and the ones it has done. A comment opens where it was made; one that
 * was never picked up (a held message, a session that ended) can be copied, or cleared. */
export function CommentsList({ working }: { working: string | null }) {
  const { comments, session } = useCommentList();
  const [showDone, setShowDone] = useState(false);
  const now = useNow(15_000);
  const agent = useAgentName();
  const by = (s: StudioComment['status']) => comments.filter((c) => c.status === s);
  const queued = by('queued'), sent = by('sent'), done = by('resolved').reverse();

  async function send() {
    const r = await sendAll();
    if (!r) { toast.error('Could not send the comments'); return; }
    if (r.via === 'session') toast.success(`Sent ${r.sent} to ${agent}`);
    else if (r.note && await copy(r.note)) { await setStatus(r.ids || [], 'sent'); toast.success(`Copied: paste them into ${agent}`); }
  }
  const clear = (cs: StudioComment[]) => setStatus(cs.map((c) => c.id), 'removed');

  return (
    <div className="grid max-h-[min(72vh,640px)] grid-rows-[auto_minmax(0,1fr)_auto]">
      <div className="grid gap-1 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{agent}</h2>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {working ? <><Loader2 className="size-3.5 flex-none text-primary motion-safe:animate-spin" aria-hidden="true" /><span className="text-foreground">{working}</span></> : 'Not working on anything now.'}
        </p>
      </div>
      <div className="grid content-start gap-5 overflow-y-auto p-4">
        <Group title={`With ${agent}`} count={sent.length} action={sent.length > 1 ? (
          <Button size="xs" variant="ghost" onClick={() => clear(sent)}>Clear all</Button>
        ) : null}>
          {sent.length ? sent.map((c) => (
            <Item key={c.id} c={c} icon={<Loader2 className="text-muted-foreground motion-safe:animate-spin" />}
              stale={now - Date.parse(c.changed || c.at) > STALE_MS} onRemove={() => clear([c])} removeLabel={`Clear “${c.text.slice(0, 40)}”`} />
          )) : <p className="text-sm text-muted-foreground">Nothing in progress.</p>}
        </Group>
        <Group title="Queued" count={queued.length} action={queued.length ? (
          <Button size="xs" onClick={send}><Send /> {session ? 'Send all' : 'Copy all'}</Button>
        ) : null}>
          {queued.length ? queued.map((c) => (
            <Item key={c.id} c={c} icon={<Clock className="text-warning" />} onRemove={() => clear([c])} removeLabel={`Remove “${c.text.slice(0, 40)}” from the queue`} />
          )) : <p className="text-sm text-muted-foreground">⌘Enter in a comment queues it here.</p>}
        </Group>
        <section className="grid gap-2">
          <button type="button" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}
            className="flex items-center gap-1.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground">
            <ChevronRight className={cn('size-3.5 transition-transform', showDone && 'rotate-90')} /> Done ({done.length})
          </button>
          {showDone ? done.map((c) => <Item key={c.id} c={c} icon={<Check className="text-success" />} />) : null}
        </section>
      </div>
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">
        {session ? `Enter sends a comment to ${agent}; ⌘Enter queues it.` : `Enter copies a comment to paste into ${agent}; ⌘Enter queues it.${agent !== 'Claude' ? ` Or ask ${agent} to read the studio's comments.` : ''}`}
      </p>
    </div>
  );
}

function Group({ title, count, action, children }: { title: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title} ({count})</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Item({ c, icon, onRemove, removeLabel, stale }: { c: StudioComment; icon: React.ReactNode; onRemove?: () => void; removeLabel?: string; stale?: boolean }) {
  const tab = TAB_OF[c.view] ?? 'edit';
  const agent = useAgentName();
  // opens where the comment was made: its tab, and in Edit the moment it was about
  function open() {
    const { route } = useStudio.getState();
    if (route.view !== 'work') return;
    useCommentList.setState({ open: false });
    go({ ...route, tab });
    if (tab === 'edit') setTimeout(() => tell('edit', { type: 'seek', t: c.t }), 250);
  }
  return (
    <div className={cn('group relative rounded-lg border p-3 hover:bg-accent', c.status === 'resolved' && 'opacity-80', onRemove && 'pr-9')}>
      <button type="button" onClick={open} className="grid w-full gap-1 text-left [&_svg]:size-4">
        <span className="flex items-start gap-2">
          <span className="mt-0.5 flex-none" aria-hidden="true">{icon}</span>
          <span className={cn('text-sm', c.status === 'resolved' && 'text-muted-foreground line-through decoration-muted-foreground/60')}>{c.text}</span>
        </span>
        <span className="line-clamp-2 pl-6 text-xs text-muted-foreground">{WHERE[tab]}{c.view === 'vibe' ? '' : ` · ${fmtT(c.t)}`}{shortAbout(c.about) ? ` · ${shortAbout(c.about)}` : ''}</span>
        <span className="sr-only">{c.status === 'queued' ? 'Queued' : c.status === 'sent' ? `With ${agent}` : 'Done'}. Open where it was made.</span>
      </button>
      {/* sent a while ago and still open: the agent may never have had it (a held message, a session that ended) */}
      {stale && c.note ? (
        <button type="button" className="mt-1 ml-6 text-xs font-semibold text-warning underline-offset-2 hover:underline"
          onClick={async () => { if (await copy(c.note!)) toast.success(`Copied: paste it into ${agent}`); }}>
          Not picked up? Copy it to paste
        </button>
      ) : null}
      {onRemove ? (
        <Button size="icon-sm" variant="ghost" aria-label={removeLabel} title={removeLabel} onClick={onRemove}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"><X /></Button>
      ) : null}
    </div>
  );
}
