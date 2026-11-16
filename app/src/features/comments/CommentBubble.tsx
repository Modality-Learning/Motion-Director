import { useEffect, useRef } from 'react';
import { useStudio } from '@/lib/store';

/** Comment mode's cursor in the studio: the pointer keeps its own shape (an arrow, or a text cursor over words you
 * can select and comment on) and a small speech bubble follows it. Over a preview, the preview draws its own. */
export function CommentBubble() {
  const on = useStudio((s) => s.commentMode);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!on || !el) return;
    const move = (e: PointerEvent) => {
      const overFrame = (e.target as HTMLElement)?.tagName === 'IFRAME';
      el.hidden = overFrame;
      if (!overFrame) el.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 14}px)`;
    };
    const leave = () => { el.hidden = true; };
    window.addEventListener('pointermove', move); document.documentElement.addEventListener('pointerleave', leave);
    return () => { window.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave); el.hidden = true; };
  }, [on]);
  if (!on) return null;
  return (
    <div ref={ref} hidden aria-hidden="true" className="pointer-events-none fixed top-0 left-0 z-[60] size-[22px]">
      <svg viewBox="0 0 28 28" className="size-full fill-foreground stroke-background" strokeWidth={1.5}><path d="M4 4h20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H11l-6 5v-5H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /></svg>
    </div>
  );
}
