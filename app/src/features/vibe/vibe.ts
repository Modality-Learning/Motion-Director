// The vibe board's pins as the studio sees them (server/vibe.mjs holds the rules and checks them on save).
export interface Pin {
  id: string;
  kind: 'image' | 'video' | 'link' | 'music' | 'colour' | 'type' | 'note';
  group?: string;
  title?: string;
  take?: string;
  src?: string;
  url?: string;
  at?: string;
  sound?: string;
  colours?: string[];
  font?: string;
  sample?: string;
}

/** A video link's player: YouTube or Vimeo, with its id, else null. Matches server/vibe.mjs videoOf. */
export function videoOf(url: string): { provider: 'youtube' | 'vimeo'; id: string } | null {
  let u: URL; try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return /^[\w-]{6,20}$/.test(u.pathname.slice(1)) ? { provider: 'youtube', id: u.pathname.slice(1) } : null;
  if (host === 'youtube.com') {
    const id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,20})/) || [])[1];
    return id && /^[\w-]{6,20}$/.test(id) ? { provider: 'youtube', id } : null;
  }
  if (host === 'vimeo.com') { const id = (u.pathname.match(/^\/(\d{4,12})/) || [])[1]; return id ? { provider: 'vimeo', id } : null; }
  return null;
}

/** A new pin's id from a word of its own, unique on the board. Matches server/vibe.mjs pinId. */
export function pinIdFor(pins: Pin[], hint = 'pin') {
  const stem = String(hint).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'pin';
  const ids = new Set(pins.map((p) => p.id));
  for (let i = 1; ; i++) { const id = i === 1 ? stem : `${stem}-${i}`; if (!ids.has(id)) return id; }
}
