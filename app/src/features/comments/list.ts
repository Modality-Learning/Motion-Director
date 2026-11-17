// The film's comments and where each stands (server/comment-queue.mjs): queued, with Claude, or resolved. The list
// follows the log live: a comment Claude marks resolved moves without a reload.
import { useEffect } from 'react';
import { create } from 'zustand';
import { getJson, post } from '@/lib/api';
import { onLive } from '@/lib/live';
import { useStudio } from '@/lib/store';

export type CommentStatus = 'queued' | 'sent' | 'resolved';
export interface StudioComment {
  id: string; at: string; status: CommentStatus; changed?: string;
  view: 'storyboard' | 'edit' | 'motion' | 'treatment' | 'vibe'; frame: string | null; t: number;
  text: string; about: string | null; target: Record<string, unknown> | null;
  /** the note as Claude gets it, to copy by hand if a sent one is never picked up */
  note?: string;
}
/** The studio's link to the Claude session that started it (server.mjs /api/session). */
export interface SessionLink {
  /** comments reach Claude: the session's inbox answered the last check */
  connected: boolean;
  /** the studio was started from a Claude session at all */
  available: boolean;
  /** failed checks in a row */
  fails: number;
  checkedAt: string | null;
  /** the command that starts this studio again from a Claude session, which takes over its port */
  restart: string;
  /** the agent that last read comments over MCP (Codex, Claude…), or null */
  agent?: string | null;
}
interface ListState {
  film: string | null;
  comments: StudioComment[];
  /** Enter reaches Claude directly: the studio was started from a Claude Code session */
  session: boolean;
  /** the comments sidebar is open */
  open: boolean;
  link: SessionLink | null;
  checking: boolean;
}
export const useCommentList = create<ListState>(() => ({ film: null, comments: [], session: false, open: false, link: null, checking: false }));

export async function loadLink() {
  const r = await getJson<SessionLink>('/api/session').catch(() => null);
  if (r) useCommentList.setState({ link: r, session: r.connected });
}
/** Who the comments are for: Claude when the studio is linked to its session, else the agent that reads them over
 * MCP, else Claude (the studio's usual partner). */
export const agentOf = (link: SessionLink | null) => (link?.connected ? 'Claude' : link?.agent || 'Claude');
export const useAgentName = () => useCommentList((s) => agentOf(s.link));
/** An agent other than a linked Claude session reads comments over MCP: no repair to offer, just ask it. */
export const readsOverMcp = (link: SessionLink | null) => !!link && !link.connected && !!link.agent;

/** Try the link again now (the link icon, clicked). */
export async function checkLink() {
  useCommentList.setState({ checking: true });
  const r = await post<SessionLink>('/api/session/check', {});
  useCommentList.setState({ checking: false, ...(r.ok ? { link: r.data, session: r.data.connected } : {}) });
  return r.ok ? r.data : null;
}
/** A comment sent this long ago and not yet resolved may not have reached Claude: the list offers to copy it. */
export const STALE_MS = 90_000;

export async function loadComments(film = useCommentList.getState().film) {
  if (!film) return;
  const r = await getJson<{ comments: StudioComment[]; session: boolean }>(`/api/comments?film=${encodeURIComponent(film)}`).catch(() => null);
  if (r && useCommentList.getState().film === film) useCommentList.setState({ comments: r.comments, session: r.session });
}

/** Everything queued for the film goes to Claude (or, without a session, to the clipboard). */
export async function sendAll() {
  const { film } = useCommentList.getState();
  if (!film) return null;
  const r = await post<{ sent: number; via: 'session' | 'clipboard'; note?: string; ids?: string[] }>('/api/comments/send', { film });
  await loadComments(film);
  return r.ok ? r.data : null;
}

export async function setStatus(ids: string[], status: 'sent' | 'removed' | 'queued') {
  const { film } = useCommentList.getState();
  if (!film || !ids.length) return;
  await post('/api/comments/status', { film, ids, status });
  await loadComments(film);
}

/** Open (queued or with Claude) comments: the count beside the Comment button. */
export const openCount = (cs: StudioComment[]) => cs.filter((c) => c.status !== 'resolved').length;

/** Keeps the list on the open film, and in step with the log. */
export function useCommentListSync() {
  const route = useStudio((s) => s.route);
  const film = route.view === 'work' && route.kind === 'film' ? route.name : null;
  useEffect(() => {
    useCommentList.setState({ film, comments: [] });
    loadComments(film);
  }, [film]);
  useEffect(() => { loadLink(); }, []);
  useEffect(() => onLive((ev) => {
    if (ev.type === 'comments' && ev.film === useCommentList.getState().film) loadComments();
    if (ev.type === 'session') { loadLink(); loadComments(); }
  }), []);
}
