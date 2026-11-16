import { useState } from 'react';
import { Check, ChevronRight, Clock, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fmtT } from '@/lib/format';
import { tell } from '@/lib/frames';
import { go, useStudio, type Tab } from '@/lib/store';
import { cn } from '@/lib/utils';
import { copy } from './comments';
import { sendAll, setStatus, useCommentList, type StudioComment } from './list';

const TAB_OF: Record<StudioComment['view'], Tab> = { storyboard: 'treatment', treatment: 'treatment', edit: 'edit', motion: 'edit', vibe: 'vibe' };
const WHERE: Record<Tab, string> = { vibe: 'Vibe', treatment: 'Treatment', edit: 'Edit', export: 'Export' };
/** What the comment is about, short: the note's About line without the scope id, the time (shown already) or the
 * current value. "Opening line (param:title-0) at 0:00.0, currently “…”" reads "Opening line". */
export const shortAbout = (about: string | null) => (about || '')
  .replace(/ \((?:param|comp):[^)]*\)/g, '').replace(/, currently .*$/, '').replace(/ at \d+:\d{2}(?:\.\d)?$/, '')
  .replace(/ \(storyboard, [^)]*\)$/, '').trim();

/** The comments sidebar, from the chevron beside the Comment button: what is queued, what Claude has, what is done.
 * A comment opens where it was made. It sits over the right-hand column, so the preview stays put. */
export function CommentsPanel() {
  const { open, comments, session } = useCommentList();
  const [showDone, setShowDone] = useState(false);
  if (!open) return null;
  const by = (s: StudioComment['status']) => comments.filter((c) => c.status === s);
  const queued = by('queued'), sent = by('sent'), done = by('resolved').reverse();

  async function send() {
    const r = await sendAll();
    if (!r) { toast.error('Could not send the comments'); return; }
    if (r.via === 'session') toast.success(`Sent ${r.sent} to Claude`);
    else if (r.note && await copy(r.note)) { await setStatus(r.ids || [], 'sent'); toast.success('Copied: paste them into Claude'); }
  }

  return (
    <aside aria-label="Comments" className="fixed top-[65px] right-0 bottom-0 z-40 flex w-[360px] flex-col border-l bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-base font-semibold">Comments</h2>
        <Button size="icon-sm" variant="ghost" aria-label="Close comments" onClick={() => useCommentList.setState({ open: false })}><X /></Button>
      </div>
      <div className="grid flex-1 content-start gap-5 overflow-y-auto p-4">
        <Group title="Queued" count={queued.length} action={queued.length ? (
          <Button size="sm" onClick={send}><Send /> {session ? 'Send all' : 'Copy all'}</Button>
        ) : null}>
          {queued.length ? queued.map((c) => <Item key={c.id} c={c} icon={<Clock className="text-warning" />} onRemove={() => setStatus([c.id], 'removed')} />)
            : <p className="text-sm text-muted-foreground">⌘Enter in a comment queues it here.</p>}
        </Group>
        <Group title="With Claude" count={sent.length}>
          {sent.length ? sent.map((c) => <Item key={c.id} c={c} icon={<Loader2 className="text-muted-foreground motion-safe:animate-spin" />} />)
            : <p className="text-sm text-muted-foreground">Nothing in progress.</p>}
        </Group>
        <section className="grid gap-2">
          <button type="button" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}
            className="flex items-center gap-1.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground">
            <ChevronRight className={cn('size-3.5 transition-transform', showDone && 'rotate-90')} /> Resolved ({done.length})
          </button>
          {showDone ? done.map((c) => <Item key={c.id} c={c} icon={<Check className="text-success" />} />) : null}
        </section>
      </div>
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">
        {session ? 'Enter sends a comment to Claude; ⌘Enter queues it.' : 'Enter copies a comment to paste into Claude; ⌘Enter queues it.'}
      </p>
    </aside>
  );
}

function Group({ title, count, action, children }: { title: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title} ({count})</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Item({ c, icon, onRemove }: { c: StudioComment; icon: React.ReactNode; onRemove?: () => void }) {
  const tab = TAB_OF[c.view] ?? 'edit';
  // opens where the comment was made: its tab, and in Edit the moment it was about
  function open() {
    const { route } = useStudio.getState();
    if (route.view !== 'work') return;
    go({ ...route, tab });
    if (tab === 'edit') setTimeout(() => tell('edit', { type: 'seek', t: c.t }), 250);
  }
  return (
    <div className={cn('group relative rounded-lg border p-3 hover:bg-accent', c.status === 'resolved' && 'opacity-80')}>
      <button type="button" onClick={open} className="grid w-full gap-1 text-left [&_svg]:size-4">
        <span className="flex items-start gap-2">
          <span className="mt-0.5 flex-none" aria-hidden="true">{icon}</span>
          <span className={cn('text-sm', c.status === 'resolved' && 'text-muted-foreground line-through decoration-muted-foreground/60')}>{c.text}</span>
        </span>
        <span className="line-clamp-2 pl-6 text-xs text-muted-foreground">{WHERE[tab]}{c.view === 'vibe' ? '' : ` · ${fmtT(c.t)}`}{shortAbout(c.about) ? ` · ${shortAbout(c.about)}` : ''}</span>
        <span className="sr-only">{c.status === 'queued' ? 'Queued' : c.status === 'sent' ? 'With Claude' : 'Resolved'}. Open where it was made.</span>
      </button>
      {onRemove ? (
        <Button size="icon-sm" variant="ghost" aria-label={`Remove “${c.text.slice(0, 40)}” from the queue`} onClick={onRemove}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"><X /></Button>
      ) : null}
    </div>
  );
}
