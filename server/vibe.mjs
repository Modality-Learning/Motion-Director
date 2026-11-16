// The vibe board: the references a film's direction comes from, beside the film as vibe.json, with its images in
// vibe/ (kept out of git by default: they are usually other people's work). Claude writes it in the direction
// step and the user adds to it in the studio's Vibe tab. Every pin says what to take from it ("take"): that is
// what makes it direction rather than a mood dump. The rules live here, free of I/O.
//
//   { "pins": [
//     { "id": "grid-paper", "kind": "image", "src": "vibe/grid.png", "group": "Look", "take": "Faint grid paper behind everything." },
//     { "id": "launch", "kind": "video", "url": "https://www.youtube.com/watch?v=…", "at": "0:42", "take": "The slow push into the card." },
//     { "id": "palette", "kind": "colour", "colours": ["#FFFFEB", "#1A1A1A"], "take": "Cream and ink, nothing louder." },
//     { "id": "serif", "kind": "type", "font": "EB Garamond", "sample": "Don't type, just speak.", "take": "Italic for the second half." },
//     { "id": "bed", "kind": "music", "sound": "Curious Groove.m4a", "take": "Light and curious, under everything." },
//     { "id": "ref-site", "kind": "link", "url": "https://…", "title": "Their site", "take": "The pill and its waveform." },
//     { "id": "calm", "kind": "note", "take": "One idea per screen; nothing hurries." } ] }
import { soundPathOk } from '../kit/sound.mjs';

export const KINDS = ['image', 'video', 'link', 'music', 'colour', 'type', 'note'];
export const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
const LIMIT = 200, ID = /^[a-z0-9][a-z0-9-]{0,39}$/, HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i, CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const text = (v, max) => (v == null ? undefined : typeof v === 'string' && v.length <= max && !CTRL.test(v) ? v.trim() : null);
const webUrl = (v) => { if (v == null) return undefined; if (typeof v !== 'string' || v.length > 600) return null; try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };
/** A board image's path: vibe/<file>, an image, nothing hidden and no climbing out. */
export const vibeSrcOk = (p) => typeof p === 'string' && p.length <= 200 && /^vibe\/[^/\\]+$/.test(p) && !p.slice(5).startsWith('.') && IMAGE_EXT.test(p);

/** Checks a board. Returns { vibe } with every pin cleaned, or { error } naming the pin that is wrong. */
export function validateVibe(doc) {
  const pins = doc?.pins;
  if (!Array.isArray(pins)) return { error: 'A vibe board is { "pins": [...] }' };
  if (pins.length > LIMIT) return { error: `At most ${LIMIT} pins` };
  const out = [], ids = new Set();
  for (const [i, p] of pins.entries()) {
    const at = `Pin ${typeof p?.id === 'string' ? `"${p.id}"` : i + 1}`;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { error: `${at}: not an object` };
    if (!ID.test(p.id || '') || ids.has(p.id)) return { error: `${at}: needs its own id (lower case, numbers, hyphens)` };
    if (!KINDS.includes(p.kind)) return { error: `${at}: kind is one of ${KINDS.join(', ')}` };
    const pin = { id: p.id, kind: p.kind };
    const fields = { group: text(p.group, 40), title: text(p.title, 120), take: text(p.take, 400), at: text(p.at, 12), font: text(p.font, 80), sample: text(p.sample, 120), url: webUrl(p.url) };
    for (const [k, v] of Object.entries(fields)) { if (v === null) return { error: `${at}: ${k} is too long or not plain text${k === 'url' ? ' (a web address, http or https)' : ''}` }; if (v) pin[k] = v; }
    if (p.src != null) { if (!vibeSrcOk(p.src)) return { error: `${at}: src is an image in vibe/ (vibe/<file>)` }; pin.src = p.src; }
    if (p.sound != null) { if (!soundPathOk(p.sound)) return { error: `${at}: sound is a path in the sound library` }; pin.sound = p.sound; }
    if (p.colours != null) {
      if (!Array.isArray(p.colours) || !p.colours.length || p.colours.length > 12 || p.colours.some((c) => !HEX.test(c))) return { error: `${at}: colours are 1 to 12 hex values (#1A1A1A)` };
      pin.colours = p.colours.map((c) => c.toUpperCase());
    }
    const need = { image: pin.src || pin.url, video: pin.url, link: pin.url, music: pin.url || pin.sound, colour: pin.colours, type: pin.font, note: pin.take || pin.title }[pin.kind];
    if (!need) return { error: `${at}: ${{ image: 'an image needs src (vibe/<file>) or url', video: 'a video needs its url', link: 'a link needs its url', music: 'music needs a url or a sound from the library', colour: 'a colour pin needs colours', type: 'a type pin needs its font', note: 'a note needs its words (take)' }[pin.kind]}` };
    ids.add(pin.id); out.push(pin);
  }
  return { vibe: { pins: out } };
}

/** A video link's player: YouTube or Vimeo, with its id, else null (shown as a plain link). */
export function videoOf(url) {
  let u; try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return /^[\w-]{6,20}$/.test(u.pathname.slice(1)) ? { provider: 'youtube', id: u.pathname.slice(1) } : null;
  if (host === 'youtube.com') {
    const id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,20})/) || [])[1];
    return id && /^[\w-]{6,20}$/.test(id) ? { provider: 'youtube', id } : null;
  }
  if (host === 'vimeo.com') { const id = (u.pathname.match(/^\/(\d{4,12})/) || [])[1]; return id ? { provider: 'vimeo', id } : null; }
  return null;
}

/** A safe file name for an image added to the board: its own name made plain, an image extension, numbered
 * rather than replacing a file already there (taken: the names in vibe/). Null when it isn't an image. */
export function imageName(name, taken = new Set()) {
  if (typeof name !== 'string') return null;
  const base = name.split(/[\\/]/).pop().normalize('NFC').replace(/[^\p{L}\p{N} ._()+-]/gu, '-').replace(/^[.\s-]+/, '').trim().slice(-100);
  if (!base || !IMAGE_EXT.test(base)) return null;
  const dot = base.lastIndexOf('.');
  for (let i = 1; i < 1000; i++) { const n = i === 1 ? base : `${base.slice(0, dot)} ${i}${base.slice(dot)}`; if (!taken.has(n)) return n; }
  return null;
}

/** A new pin's id: from a word of its own (a file name, a host), unique on the board. */
export function pinId(pins, hint = 'pin') {
  const stem = (String(hint).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)) || 'pin';
  const ids = new Set(pins.map((p) => p.id));
  for (let i = 1; ; i++) { const id = i === 1 ? stem : `${stem}-${i}`; if (!ids.has(id)) return id; }
}
