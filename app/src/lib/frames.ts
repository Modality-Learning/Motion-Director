// The film previews: each is an iframe running the film's own page (kit/player.js), and they talk by
// postMessage, same origin only. Studio → film messages carry source 'promo-studio'; film → studio
// messages carry source 'promo-film'.
//
//   storyboard  the ?board view: every key moment side by side
//   edit        the ?bare view over the Edit tab's timeline: the timeline is its transport

export type FrameTab = 'storyboard' | 'edit';
// sound-tab's and the comments' older names for the Edit tab's preview
export type FrameName = FrameTab | 'sound' | 'motion';

export interface FilmMessage { source: 'promo-film'; type: string; [k: string]: unknown }

const frames: Partial<Record<FrameTab, HTMLIFrameElement | null>> = {};
const keys: Partial<Record<FrameTab, string>> = {};
const listeners = new Set<(tab: FrameTab, m: FilmMessage) => void>();

const tabOf = (name: FrameName): FrameTab => (name === 'storyboard' ? 'storyboard' : 'edit');

export function registerFrame(tab: FrameTab, el: HTMLIFrameElement | null) {
  frames[tab] = el;
  if (!el) delete keys[tab];
}
export const frameFor = (name: FrameName) => frames[tabOf(name)] ?? null;

/** Sends a message to a preview, if it is loaded. */
export function tell(name: FrameName, msg: Record<string, unknown>) {
  frameFor(name)?.contentWindow?.postMessage({ source: 'promo-studio', ...msg }, location.origin);
}

/** Loads a page into a preview once per piece (key); after that, changes reach it live, unless forced. */
export function loadFrame(tab: FrameTab, key: string, src: string, force = false) {
  const f = frames[tab];
  if (!f) return false;
  if (!force && keys[tab] === key) return false;
  f.src = src;
  keys[tab] = key;
  return true;
}
export const frameKey = (tab: FrameTab) => keys[tab] ?? null;
export function forgetFrames() { delete keys.storyboard; delete keys.edit; }

/** Every message from our own previews, with the preview it came from. */
export function onFilmMessage(fn: (tab: FrameTab, m: FilmMessage) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || (e.data as FilmMessage)?.source !== 'promo-film') return;
    const tab: FrameTab | null = e.source === frames.storyboard?.contentWindow ? 'storyboard' : e.source === frames.edit?.contentWindow ? 'edit' : null;
    if (!tab) return;
    for (const fn of listeners) fn(tab, e.data as FilmMessage);
  });
}
