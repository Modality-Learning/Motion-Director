// Live updates (server.mjs /api/events): files changed outside the studio (an agent's edits, an editor,
// another window) reach every open studio page without a reload. Each event is classified by the server
// (server/lib.mjs changeOf):
//   sound    a film's cue sheet               { film, version }
//   treatment  a film's or composition's TREATMENT.md (or an older BRIEF.md)   { film } | { comp }
//   piece    a film's or composition's manifest   { film } | { comp }
//   code     a page, script or style a preview runs   { film } | { comp } | { kit: true }
//   library  the sound library's settings
//   sounds   a sound file added, changed or removed
//   comments a film's comment log (a comment sent, queued or resolved)   { film }

export interface LiveEvent { type: 'sound' | 'treatment' | 'vibe' | 'piece' | 'code' | 'library' | 'sounds' | 'comments'; film?: string; comp?: string; kit?: boolean; version?: number }

const listeners = new Set<(ev: LiveEvent) => void>();
let source: EventSource | null = null;

export function onLive(fn: (ev: LiveEvent) => void) {
  listeners.add(fn);
  if (!source && typeof EventSource !== 'undefined') {
    source = new EventSource('/api/events');
    source.onmessage = (e) => {
      let ev: LiveEvent;
      try { ev = JSON.parse(e.data); } catch { return; }
      for (const l of listeners) l(ev);
    };
  }
  return () => { listeners.delete(fn); };
}
