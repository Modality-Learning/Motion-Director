// Comments: a comment is a message to an agent. C toggles comment mode; hovering outlines the element with
// parameters under the cursor, or the whole frame. Click, type, Enter: the note is copied to paste into the
// chat (and quietly logged in the project's out/comments). Nothing stays on the film.
// In the Edit tab the timeline's items (a clip, an object, a track, a beat) take comments too.
import { useEffect } from 'react';
import { create } from 'zustand';
import { post } from '@/lib/api';
import { frameFor, onFilmMessage, tell, type FrameTab } from '@/lib/frames';
import { fmtT } from '@/lib/format';
import { commentable, frameOf, useStudio } from '@/lib/store';
import { refForScope } from '@/features/params/params';

/** Something on the Edit tab's timeline a comment is about. */
export interface TimelineItem { kind: 'clip' | 'object' | 'track' | 'beat' | 'timeline'; label: string; detail?: string; [k: string]: unknown }

interface Pending { view: 'storyboard' | 'edit' | 'treatment' | 'vibe'; frame: string | null; t: number; target: Record<string, unknown> | null }
interface CommentState {
  open: boolean;
  title: string;
  at: { x: number; y: number };
  pending: Pending | null;
  hint: string;
  /** the note, when the browser wouldn't copy it and it has to be copied by hand */
  note: string | null;
  /** bumped each time the box opens, so its text starts empty */
  seq: number;
}
export const useComments = create<CommentState>(() => ({ open: false, title: '', at: { x: 0, y: 0 }, pending: null, hint: '', note: null, seq: 0 }));

const HINT = 'Enter copies it for the chat · Shift+Enter new line · Esc cancels';
function showBox(x: number, y: number, title: string, pending: Pending) {
  useComments.setState((s) => ({ open: true, title, at: { x, y }, pending, hint: HINT, note: null, seq: s.seq + 1 }));
}

/** The box closes; the preview's outlines unfreeze. */
export function closeBox() {
  const { open } = useComments.getState();
  if (!open) return;
  const ae = document.activeElement as HTMLElement | null;
  if (ae && document.getElementById('cbox')?.contains(ae)) ae.blur(); // so the next Esc reaches the shortcuts and leaves comment mode
  const { route } = useStudio.getState();
  const f = route.view === 'work' ? frameOf(route.tab) : null;
  if (f) tell(f, { type: 'commentDone' });
  useComments.setState({ open: false, pending: null, note: null });
}

interface CommentAt { t: number; key?: string; scope?: string | null; selector?: string | null; text?: string | null; client: { x: number; y: number } }
/** A click in a preview in comment mode: on an element with parameters, on any element, or on the frame. */
export function openBox(m: CommentAt, tab: FrameTab) {
  const ref = m.scope ? refForScope(m.scope) : undefined;
  const label = !m.scope ? null : m.scope.startsWith('comp:') ? (ref?.comp?.title || m.scope.slice(5)) : (ref?.p.label || m.scope);
  const value = ref && ref.p.type === 'text' ? String(ref.p.value) : null;
  const r = frameFor(tab)!.getBoundingClientRect(), x = r.left + m.client.x, y = r.top + m.client.y;
  if (tab === 'edit') {
    const target = label ? { scope: m.scope, label, value } : m.selector ? { selector: m.selector, text: m.text || null } : null;
    const what = label || (m.text ? `“${m.text.slice(0, 40)}${m.text.length > 40 ? '…' : ''}”` : m.selector ? m.selector.split(' > ').pop() : 'The video');
    showBox(x, y, `${what} · ${fmtT(m.t)}`, { view: 'edit', frame: null, t: m.t, target });
  } else {
    // a frame, an element with parameters on it, or any other element on it (by its selector and text)
    const target = label ? { scope: m.scope, label, value } : m.selector ? { selector: m.selector, text: m.text || null } : null;
    const what = label || (m.text ? `“${m.text.slice(0, 40)}${m.text.length > 40 ? '…' : ''}”` : m.selector ? m.selector.split(' > ').pop() : null);
    showBox(x, y, what ? `${what} · ${m.key}` : String(m.key), { view: 'storyboard', frame: m.key ?? null, t: m.t, target });
  }
}

/** Text in the treatment, in its document (a section) or beside the storyboard's frames (a beat). */
export interface Quote { text: string; section?: string | null; beat?: { time: string; title: string | null } | null }
export function openQuoteBox(quote: Quote, t: number, x: number, y: number) {
  if (!useStudio.getState().commentMode) return;
  const short = quote.text.length > 48 ? `${quote.text.slice(0, 48)}…` : quote.text;
  const where = quote.beat ? quote.beat.time : quote.section || 'Treatment';
  showBox(x, y, `“${short}” · ${where}`, { view: 'treatment', frame: null, t, target: { quote } });
}

/** A comment on a pin on the vibe board. */
export function openPinBox(pin: { id: string; kind: string; label: string }, x: number, y: number) {
  if (!useStudio.getState().commentMode) return;
  const short = pin.label.length > 48 ? `${pin.label.slice(0, 48)}…` : pin.label;
  showBox(x, y, `${short || pin.kind} · Vibe`, { view: 'vibe', frame: null, t: 0, target: { pin: { id: pin.id } } });
}

/** A comment on something on the Edit tab's timeline. */
export function openItemBox(item: TimelineItem, t: number, x: number, y: number) {
  if (!useStudio.getState().commentMode) return;
  const title = `${item.kind === 'timeline' ? 'The timeline' : item.label}${item.detail && item.kind !== 'beat' ? ` · ${item.detail}` : ''} · ${fmtT(t)}`;
  showBox(x, y, title, { view: 'edit', frame: null, t, target: { item } });
}

/** Enter in the box: the server writes the note, and it goes to the clipboard. */
export async function sendComment(text: string) {
  const { pending } = useComments.getState(), { route } = useStudio.getState();
  if (!pending || route.view !== 'work') return;
  if (!text.trim()) { useComments.setState({ hint: 'Write a comment first, or Esc to cancel.' }); return; }
  useComments.setState({ hint: 'Copying…' });
  const r = await post<{ note: string }>('/api/comments', { film: route.name, ...pending, text: text.trim() });
  if (!r.ok) { useComments.setState({ hint: r.data.error || 'Could not make the note' }); return; }
  if (await copy(r.data.note)) { useComments.setState({ hint: 'Copied. Paste it into the chat.' }); setTimeout(closeBox, 900); return; }
  // where the browser won't copy, show the note ready to copy by hand
  useComments.setState({ note: r.data.note, hint: 'Press ⌘C to copy the note, then Esc.' });
}

// the clipboard API first; where a browser refuses it, the older copy command from a hidden text area
async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.setAttribute('aria-hidden', 'true'); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  ta.value = text; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove(); return ok;
}

function onKey(key: string) {
  const s = useStudio.getState();
  if (key === 'Escape') { if (useComments.getState().open) closeBox(); else s.setCommentMode(false); }
  else if (key === 'c') s.setCommentMode(!s.commentMode);
}

/** The shortcuts (C, Esc) from the page and from the previews, and comment mode kept in step with the previews. */
export function useCommentKeys() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      // a select (shadcn's is a button and a list, not a native select) keeps its own keys: typing picks an option
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || el.closest?.('[data-slot^=select-]')) return;
      if (e.key === 'c' || e.key === 'C' || e.key === 'Escape') onKey(e.key === 'Escape' ? 'Escape' : 'c');
    };
    document.addEventListener('keydown', down);
    const off = onFilmMessage((tab, m) => {
      const s = useStudio.getState();
      if (m.type === 'key') onKey(String(m.key));
      else if (m.type === 'commentAt' && s.commentMode && s.route.view === 'work' && frameOf(s.route.tab) === tab) openBox(m as unknown as CommentAt, tab);
      else if (m.type === 'commentQuote' && s.commentMode && s.route.view === 'work' && frameOf(s.route.tab) === tab) {
        // text selected beside the storyboard's frames: the box opens under it, in the studio's coordinates
        const r = frameFor(tab)!.getBoundingClientRect(), c = m.client as { x: number; y: number };
        openQuoteBox({ text: String(m.text), beat: m.beat as Quote['beat'] }, Number(m.t) || 0, r.left + c.x, r.top + c.y);
      }
    });
    // comment mode belongs to one preview at a time: the one on screen hears it, the one it left is told it's off
    let was: FrameTab | null = null;
    const sync = () => {
      const s = useStudio.getState(), on = s.commentMode && s.route.view === 'work' && commentable(s.route.tab);
      const view = on && s.route.view === 'work' ? frameOf(s.route.tab) : null; // the Vibe tab has no preview
      if (was && was !== view) tell(was, { type: 'commentMode', on: false });
      if (view && view !== was) tell(view, { type: 'commentMode', on: true });
      if (!on) closeBox();
      was = view;
      // what takes comments in the studio itself shows comment mode's cursor (index.css)
      document.documentElement.classList.toggle('commenting', on);
    };
    const unsub = useStudio.subscribe((s, p) => { if (s.commentMode !== p.commentMode || s.route !== p.route) sync(); });
    return () => { document.removeEventListener('keydown', down); off(); unsub(); };
  }, []);
}
