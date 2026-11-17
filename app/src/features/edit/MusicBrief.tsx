import { useState } from 'react';
import { Check, Copy, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { secs } from '@/lib/format';
import { copy, openMusicBox, type MusicPart } from '@/features/comments/comments';
import { cn } from '@/lib/utils';
import { lineUpMusic, useEdit } from './store';
import type { Brief } from './types';

import { clockOf, promptText } from './kit';

export { promptText };

/** The music lane's Brief button: the tempo, the sections at their times, the prompt to copy into Suno or
 * another generator, and Line up, which fits the music clip to the brief (server/music-lib.mjs). */
export function MusicBrief() {
  const brief = useEdit((s) => s.brief), problem = useEdit((s) => s.briefError);
  const hasMusic = useEdit((s) => s.sheet.cues.some((c) => c.music));
  const [busy, setBusy] = useState(false);
  if (!brief && !problem) return null;

  async function lineUp() {
    setBusy(true);
    const r = await lineUpMusic();
    setBusy(false);
    if ('error' in r && r.error) toast.error(r.error);
    else if ('plan' in r && r.plan) {
      const where = `at ${secs(r.plan.at)}${r.plan.drop ? `, its lift on "${r.plan.drop}"` : ''}`;
      if (r.plan.matched) toast.success(`Lined up ${where}`, { description: r.plan.note });
      else toast.warning(`Placed ${where}, but its tempo doesn't match the brief`, { description: r.plan.note, duration: 10_000 });
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" className="ml-auto h-5 px-1.5 text-[11px]" aria-label="The music brief">Brief</Button>
      </PopoverTrigger>
      {/* beside the lane, as tall as the window allows, scrolling inside: above it there is rarely room */}
      <PopoverContent side="right" align="start" collisionPadding={12} className="grid max-h-(--radix-popover-content-available-height) w-[26rem] gap-3 overflow-y-auto">
        {problem ? <p className="text-sm text-destructive">music.json doesn't check out: {problem}</p> : null}
        {brief ? (
          <>
            <div className="grid gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">The music brief</p>
                <CommentOn part={{ part: 'brief' }} t={0} label="Comment on the whole brief" text="Comment" />
              </div>
              <p className="text-sm text-muted-foreground">
                {brief.bpm} BPM in {brief.beatsPerBar}/4{brief.offset ? `, first downbeat at ${secs(brief.offset)}` : ''}{brief.ending ? `, a ${brief.ending} ending` : ''}{brief.length ? `, ${clockOf(brief.length)} long` : ''}
              </p>
            </div>
            {brief.sections.length ? (
              <ol className="grid gap-1 text-sm">
                {brief.sections.map((s) => (
                  <li key={`${s.name}-${s.at}`} className="group/sec grid grid-cols-[3.5rem_1fr_auto] items-start gap-2">
                    <span className="text-muted-foreground tabular-nums">{secs(s.at)}</span>
                    <span><b className="font-semibold">{s.name}</b>{s.drop ? ' (the drop)' : ''}{s.note ? <span className="text-muted-foreground">: {s.note}</span> : null}</span>
                    <CommentOn part={{ part: 'section', section: s.name }} t={s.at} label={`Comment on ${s.name}`} />
                  </li>
                ))}
              </ol>
            ) : null}
            {brief.prompt?.style || brief.prompt?.structure ? <PromptBlock brief={brief} /> : null}
            <div className="grid gap-1 border-t pt-3">
              <Button size="sm" variant="secondary" onClick={lineUp} disabled={busy || !hasMusic}>{busy ? 'Measuring the track…' : 'Line up the music'}</Button>
              <p className="text-xs text-muted-foreground">
                {hasMusic ? 'Measures the track on the music lane, then sets its start and speed so its beats keep the brief’s time.' : 'Drop the generated track on the music lane, then line it up here.'}
              </p>
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** A comment on part of the brief, for Claude to amend it: opens the studio's comment box there. Always shown for the
 * whole brief and the prompt; a section's shows on hover or focus, so the list stays calm. */
function CommentOn({ part, t, label, text }: { part: MusicPart; t: number; label: string; text?: string }) {
  return (
    <Button size="xs" variant="ghost" aria-label={label} title={label}
      className={cn('text-muted-foreground', !text && 'opacity-0 group-hover/sec:opacity-100 focus-visible:opacity-100')}
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openMusicBox(part, t, r.left, r.bottom + 6); }}>
      <MessageSquare />{text ?? null}
    </Button>
  );
}

function PromptBlock({ brief }: { brief: Brief }) {
  const [done, setDone] = useState(false);
  const text = promptText(brief);
  async function copyIt() {
    if (await copy(text)) { setDone(true); setTimeout(() => setDone(false), 1500); } else toast.error('Could not copy');
  }
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Prompt</span>
        <span className="flex items-center gap-1">
          <CommentOn part={{ part: 'prompt' }} t={0} label="Comment on the prompt" text="Comment" />
          <Button size="xs" variant="ghost" onClick={copyIt} aria-label="Copy the prompt">{done ? <Check /> : <Copy />}{done ? 'Copied' : 'Copy'}</Button>
        </span>
      </div>
      <pre className="max-h-56 overflow-auto rounded-md bg-background p-2 text-xs leading-relaxed whitespace-pre-wrap">{text}</pre>
      {brief.length ? <p className="text-xs text-muted-foreground">Ask for {clockOf(brief.length)}: the prompt says so. Generators often make more; Line up ends the music with the film, faded.</p> : null}
      {brief.prompt?.notes ? <p className="text-xs text-muted-foreground">{brief.prompt.notes}</p> : null}
    </div>
  );
}
