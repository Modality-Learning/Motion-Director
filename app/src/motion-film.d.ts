// <motion-film>, the element a web film defines (kit/web.js), as the studio's Scroll preview uses it.
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

export interface MotionFilmPoint { name: string; t: number; note?: string }
export interface MotionFilmElement extends HTMLElement {
  readonly ready: Promise<MotionFilmElement>;
  readonly time: number;
  readonly duration: number;
  readonly points: MotionFilmPoint[];
  readonly size: { w: number; h: number };
  readonly paused: boolean;
  progress: number;
  seek(target: number | string): void;
  /** Cut to a moment; with a speed, play there at that speed; with a duration, move there in that time, eased. */
  goTo(target: number | string, opts?: { speed?: number; duration?: number }): Promise<boolean>;
  /** How far through each section the film is, 0 to 1 each. A section runs from its moment to the next in the list. */
  sectionProgress(sections: (string | number)[]): number[];
  play(opts?: { from?: number | string; to?: number | string; speed?: number }): void;
  pause(): void;
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'motion-film': DetailedHTMLProps<HTMLAttributes<MotionFilmElement>, MotionFilmElement> & { film?: string; mode?: 'scroll'; track?: string; smoothing?: number | string; start?: string; label?: string };
    }
  }
}
