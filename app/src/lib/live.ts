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
//   session  the link to the Claude session came up or went down
//   status   what the agent says it's doing changed (out/comments/status.json)
//   music    a film's music brief (music.json)   { film }
//   update   a newer release was found, or the package was updated under the running studio

export interface LiveEvent { type: 'sound' | 'treatment' | 'vibe' | 'piece' | 'code' | 'library' | 'sounds' | 'comments' | 'session' | 'status' | 'update' | 'music'; film?: string; comp?: string; kit?: boolean; version?: number }

const listeners = new Set<(ev: LiveEvent) => void>();
let source: EventSource | null = null;

export function onLive(fn: (ev: LiveEvent) => void) {
  listeners.add(fn);
  if (!source && typeof EventSource !== 'undefined') {
    source = new EventSource('/api/events');
    // (re)connected, as after the studio restarts: anything may have changed, the link to Claude above all
    source.onopen = () => { for (const l of listeners) l({ type: 'session' }); };
    source.onmessage = (e) => {
      let ev: LiveEvent;
      try { ev = JSON.parse(e.data); } catch { return; }
      for (const l of listeners) l(ev);
    };
  }
  return () => { listeners.delete(fn); };
}
