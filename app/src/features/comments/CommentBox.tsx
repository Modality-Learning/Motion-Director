import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Check, ClipboardPaste, Clock } from 'lucide-react';
import { Kbd } from '@/components/Kbd';
import { COPIED_MS, DONE_MS, closeBox, sendComment, useComments } from './comments';
import { useAgentName } from './list';

/** The comment box, placed where you clicked: the storyboard, the preview or the timeline. */
export function CommentBox() {
  const { open, title, at, hint, note, seq, done, count } = useComments();
  const box = useRef<HTMLDivElement>(null), text = useRef<HTMLTextAreaElement>(null), noteRef = useRef<HTMLTextAreaElement>(null);
  const [pos, setPos] = useState(at);
  const [value, setValue] = useState('');

  useEffect(() => { setValue(''); }, [seq]);
  // kept on screen beside the click
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const w = box.current.offsetWidth, h = box.current.offsetHeight;
    setPos({ x: Math.min(Math.max(8, at.x + 12), innerWidth - w - 8), y: Math.min(Math.max(8, at.y + 12), innerHeight - h - 8) });
    text.current?.focus();
  }, [open, at, seq]);
  useEffect(() => { if (note) { noteRef.current?.focus(); noteRef.current?.select(); } }, [note]);

  if (!open) return null;
  return (
    <div id="cbox" ref={box} role="dialog" aria-labelledby="cboxTitle" style={{ left: pos.x, top: pos.y }}
      className="fixed z-50 grid w-[340px] gap-2 rounded-xl border bg-popover p-3 shadow-xl">
      <p id="cboxTitle" className="text-sm font-semibold">{title}</p>
      {done === 'copied' ? <Copied onDone={closeBox} /> : done ? <Outcome done={done} count={count} onDone={closeBox} /> : note == null ? (
        <Textarea ref={text} rows={3} maxLength={2000} aria-label="Comment" placeholder="What should change?" value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); closeBox(); return; }
            // Enter sends (with anything queued); ⌘Enter queues it; Shift+Enter is a new line
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(value, e.metaKey || e.ctrlKey); }
          }} />
      ) : (
        <Textarea ref={noteRef} rows={6} readOnly aria-label="Note to copy" value={note} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeBox(); } }} />
      )}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* The note is on the clipboard: a green badge pops in with a tick that draws itself, then an amber one slides in
 * under it with the next step (paste it into Claude), and a thin bar runs down until the box closes. A click or
 * Esc closes it sooner. Motion is skipped for anyone who has asked for less of it. */
function Copied({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const agent = useAgentName();
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className="grid gap-2 outline-none" onClick={onDone}
      onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); onDone(); } }}>
      <span className="copied-pop flex w-fit items-center gap-2 rounded-full bg-success px-3 py-1.5 text-sm font-semibold text-[#08210f]">
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true"><path className="copied-tick" d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
        Copied to clipboard
      </span>
      <span className="copied-next flex w-fit items-center gap-2 rounded-full bg-warning px-3 py-1.5 text-sm font-semibold text-[#2a1600]">
        <ClipboardPaste className="size-4" aria-hidden="true" />
        Now paste it into {agent} <Kbd className="border-[#2a1600]/40">⌘V</Kbd>
      </span>
      <span className="sr-only"><Check /> Copied. Paste it into {agent}.</span>
      <span aria-hidden="true" className="h-0.5 overflow-hidden rounded-full bg-border"><span className="copied-bar block h-full bg-foreground/50" style={{ animationDuration: `${COPIED_MS}ms` }} /></span>
    </div>
  );
}

/* Sent straight to Claude (green), or queued (amber): one badge that pops in, a line on what happens next, and
 * the bar running down until the box closes. A click or Esc closes it sooner. */
function Outcome({ done, count, onDone }: { done: 'sent' | 'queued'; count: number; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const sent = done === 'sent';
  return (
    <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className="grid gap-2 outline-none" onClick={onDone}
      onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); onDone(); } }}>
      <span className={`copied-pop flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${sent ? 'bg-success text-[#08210f]' : 'bg-warning text-[#2a1600]'}`}>
        {sent
          ? <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true"><path className="copied-tick" d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
          : <Clock className="size-4" aria-hidden="true" />}
        {sent ? (count > 1 ? `Sent ${count} comments to Claude` : 'Sent to Claude') : `Queued${count > 1 ? ` · ${count} waiting` : ''}`}
      </span>
      <p className="copied-next text-xs text-muted-foreground">
        {sent ? 'The change shows here once Claude has made it.' : <>Enter on your next comment sends them all, or <b className="font-semibold text-foreground">Send all</b> in the comments list.</>}
      </p>
      <span aria-hidden="true" className="h-0.5 overflow-hidden rounded-full bg-border"><span className="copied-bar block h-full bg-foreground/50" style={{ animationDuration: `${DONE_MS[done]}ms` }} /></span>
    </div>
  );
}
