import { cn } from '@/lib/utils';

/** A quiet label: a film's orientation, its length, how many films use a composition. */
export function Chip({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('rounded-full border px-2.5 py-0.5 text-sm text-muted-foreground', className)} {...props} />;
}
