import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** A hover (and focus) hint on a control: shadcn's Tooltip around it. The control keeps its own accessible name;
 * the hint only adds to it. The child must take a ref and pass on its props (a shadcn component or an element). */
export function Hint({ label, side, children }: { label: React.ReactNode; side?: 'top' | 'right' | 'bottom' | 'left'; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs whitespace-pre-line">{label}</TooltipContent>
    </Tooltip>
  );
}
