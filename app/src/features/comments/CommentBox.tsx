import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { closeBox, sendComment, useComments } from './comments';

/** The comment box, placed where you clicked: the storyboard, the preview or the timeline. */
export function CommentBox() {
  const { open, title, at, hint, note, seq } = useComments();
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
      {note == null ? (
        <Textarea ref={text} rows={3} maxLength={2000} aria-label="Comment" placeholder="What should change?" value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); closeBox(); return; }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(value); }
          }} />
      ) : (
        <Textarea ref={noteRef} rows={6} readOnly aria-label="Note to copy" value={note} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeBox(); } }} />
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
