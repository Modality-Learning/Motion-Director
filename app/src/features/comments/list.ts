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
}
interface ListState {
  film: string | null;
  comments: StudioComment[];
  /** Enter reaches Claude directly: the studio was started from a Claude Code session */
  session: boolean;
  /** the comments sidebar is open */
  open: boolean;
}
export const useCommentList = create<ListState>(() => ({ film: null, comments: [], session: false, open: false }));

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
  useEffect(() => onLive((ev) => { if (ev.type === 'comments' && ev.film === useCommentList.getState().film) loadComments(); }), []);
}
