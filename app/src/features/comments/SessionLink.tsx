import { useState } from 'react';
import { Link2, Link2Off, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { copy } from './comments';
import { checkLink, readsOverMcp, useCommentList } from './list';

/** After this many failed checks in a row, clicking the broken link offers the repair instead of another try. */
export const REPAIR_AFTER = 3;

/** The repair, pasted into Claude: start the studio again from that session, which takes over this port. */
export const repairRequest = (restart: string) =>
  `The Motion Director studio has lost its link to you, so my comments aren't reaching you. Start it again from this session, as a background command, so they do (it takes over the studio that is running now, on the same port):\n${restart}`;

/** The link to Claude, beside the Comment button. Whole: comments go straight to the session. Broken: they are
 * copied to paste. Click to try the link again; once it has failed a few times (or the studio was never started
 * from a session), the click offers to copy a repair request for Claude instead. */
export function SessionLinkButton() {
  const { link, checking } = useCommentList();
  const [open, setOpen] = useState(false);
  if (!link) return null;
  const ok = link.connected;
  // another agent (Codex…) reads comments over MCP when asked: nothing to repair, and nothing wrong
  if (readsOverMcp(link)) {
    const agent = link.agent!;
    const label = `Comments are for ${agent}: Enter copies one to paste, or ask ${agent} to read the studio's comments.`;
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={label} title={label} className="text-muted-foreground hover:text-foreground"><Link2 /></Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="grid w-80 gap-2">
          <p className="text-sm font-semibold">Comments are for {agent}</p>
          <p className="text-sm text-muted-foreground">
            {agent} reads them through Motion Director's MCP tools when you ask: say "check the studio comments". Enter also
            copies a comment for you to paste. Once {agent} has made a change, it marks the comment resolved here.
          </p>
        </PopoverContent>
      </Popover>
    );
  }
  const needsRepair = !ok && (!link.available || link.fails >= REPAIR_AFTER);
  const label = ok ? 'Connected to Claude: comments go straight to your session. Click to check.'
    : needsRepair ? 'Not connected to Claude: comments are copied to paste. Click to repair.'
      : 'Not connected to Claude: comments are copied to paste. Click to try again.';

  async function onClick() {
    if (needsRepair) { setOpen(true); return; }
    const r = await checkLink();
    if (r?.connected) toast.success('Connected to Claude');
    else if (r && (!r.available || r.fails >= REPAIR_AFTER)) setOpen(true);
    else toast.error('Still not connected. Comments will be copied to paste.');
  }
  async function copyRepair() {
    if (await copy(repairRequest(link!.restart))) { toast.success('Copied: paste it into Claude'); setOpen(false); }
    else toast.error('Could not copy');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={label} title={label} onClick={(e) => { e.preventDefault(); onClick(); }}
          className={cn(ok ? 'text-muted-foreground hover:text-foreground' : 'text-warning hover:text-warning')}>
          {checking ? <Loader2 className="motion-safe:animate-spin" /> : ok ? <Link2 /> : <Link2Off />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-3">
        <p className="text-sm font-semibold">Comments can't reach Claude</p>
        <p className="text-sm text-muted-foreground">
          {link.available
            ? 'The Claude session that started this studio isn\'t answering: it may have ended. Your comments are copied to paste for now.'
            : 'This studio wasn\'t started from a Claude session, so comments are copied to paste.'}
          {' '}To repair it, paste this request into Claude: it starts the studio again from its session, and this page keeps working.
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={copyRepair}>Copy repair request</Button>
          {link.available ? <Button size="sm" variant="secondary" onClick={async () => { const r = await checkLink(); if (r?.connected) { setOpen(false); toast.success('Connected to Claude'); } }}>Try again</Button> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
