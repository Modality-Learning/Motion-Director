// The timeline's rows: a name column on the left that stays put, and the content across the time axis.
import { cn } from '@/lib/utils';

/** What every row needs: pixels a second, and the time under a point on the screen. */
export interface Axis { k: number; tAt: (clientX: number) => number; duration: number }

/** The name column: it stays on the left when the timeline scrolls sideways. */
export function Gut({ className, children, ...rest }: { className?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div data-gut="" {...rest} className={cn('sticky left-0 z-[3] flex h-full w-[148px] flex-none items-center gap-1.5 overflow-hidden border-r bg-card px-2.5 text-xs whitespace-nowrap text-muted-foreground', className)}>{children}</div>;
}
/** A row: its name in the column on the left, its content across the time axis. */
export function Row({ className, height, name, gutClass, children, ...rest }: { className?: string; height: number; name: React.ReactNode; gutClass?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('relative flex items-stretch border-b', className)} style={{ height }} {...rest}><Gut className={gutClass}>{name}</Gut>{children}</div>;
}
