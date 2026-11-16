import { cn } from '@/lib/utils';

/** A key, as in a shortcut: C, Space, ⌘Z. */
export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return <kbd className={cn('rounded border border-current/30 px-1 font-sans text-[11px] font-semibold leading-4 opacity-80', className)} {...props} />;
}
