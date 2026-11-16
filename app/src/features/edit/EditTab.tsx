// Motion Director: the Edit tab (a film's; a composition's has no sound).
//   library (left)    your sound files (never tracked); play, drag onto the timeline, Edit
//   centre            the preview over the timeline: the ruler (play, the time), the storyboard's beats, the
//                     objects, your tracks
//   inspector (right) what is selected: a clip's exact values, or an element of the film (its sounds, then its
//                     parameters); with nothing selected, the piece's parameters. The mix at its foot.
//   sound editor      Edit swaps the centre for the whole waveform and the sound's defaults
// Click an element in the preview to select it: its motion graph opens on the timeline, where its speed peaks
// and stops suggest where a whoosh or an impact might sit. Nothing snaps. In comment mode (C), the timeline's
// items take comments like the preview's elements.
import { useEffect } from 'react';
import { PreviewFrame } from '@/features/preview/preview';
import { useComments } from '@/features/comments/comments';
import { onFilmMessage } from '@/lib/frames';
import { onLive } from '@/lib/live';
import { useOpenItem, useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';
import { play, stopAudition, currentAudition } from './audio';
import {
  closeEditor, closeFocus, hasSound, leaveSound, redo, say, showSound, soundDefaults, soundLive, soundMessage, tellEdit, undo, useEdit,
} from './store';
import { Library } from './Library';
import { Timeline } from './Timeline';
import { Inspector } from './Inspector';
import { SoundEditor } from './SoundEditor';

export function EditTab() {
  useEditWiring();
  const editing = useEdit((s) => s.editing);
  const sound = useEdit((s) => s.kind === 'film');
  return (
    <div className={cn('grid h-full min-h-0', !sound ? 'grid-cols-[minmax(0,1fr)_340px]' : editing ? 'grid-cols-[280px_minmax(0,1fr)]' : 'grid-cols-[280px_minmax(0,1fr)_320px] max-[1200px]:grid-cols-[240px_minmax(0,1fr)_280px]')}>
      {sound ? <Library /> : null}
      <div data-edit-main="" className={cn('grid min-h-0 min-w-0', editing ? 'grid-rows-[minmax(0,1fr)]' : 'grid-rows-[minmax(220px,1fr)_auto]')}>
        <div hidden={!!editing} className="flex min-h-0"><PreviewFrame tab="edit" title="Preview" className="h-full min-h-0" /></div>
        <Timeline hidden={!!editing} />
        {editing ? <SoundEditor path={editing} /> : null}
      </div>
      <Inspector hidden={!!editing} />
    </div>
  );
}

/** Keeps the Edit tab in step with the open piece, and takes the preview's messages, live changes and keys. */
function useEditWiring() {
  const item = useOpenItem();
  const active = useStudio((s) => s.route.view === 'work' && s.route.tab === 'edit');
  const name = item?.name, kind = item?.kind, duration = item?.duration ?? 0;

  // the tab showing loads the piece (once) and lets the preview know it's in sound mode; leaving stops auditions
  useEffect(() => {
    if (!active || !name || !kind) return;
    showSound(name, kind, duration).catch(() => say('The sounds could not be loaded'));
    return () => leaveSound();
  }, [active, name, kind, duration]);

  useEffect(() => onFilmMessage((tab, m) => { if (tab === 'edit') soundMessage(m); }), []);
  useEffect(() => onLive((ev) => { soundLive(ev); }), []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const s = useStudio.getState(), r = s.route;
      if (r.view !== 'work' || r.tab !== 'edit' || !useEdit.getState().film) return;
      const el = e.target as HTMLElement;
      // ⌘Z, ⇧⌘Z (and ⌘Y): undo and redo; a text field keeps its own
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        if (!hasSound()) return;
        if (/^(INPUT|TEXTAREA)$/.test(el.tagName) && (el as HTMLInputElement).type !== 'range' && (el as HTMLInputElement).type !== 'checkbox') return;
        e.preventDefault();
        if (e.key.toLowerCase() === 'y' || e.shiftKey) redo(); else undo();
        return;
      }
      // an open select's list (shadcn's, not a native select) keeps its own Space and Esc
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) || el.isContentEditable || el.closest('[data-slot=select-content]') || e.metaKey || e.ctrlKey) return;
      const { editing, sel, focus } = useEdit.getState();
      // Space plays the preview, or the sound being edited
      if (e.code === 'Space') {
        if (el.closest('[role=slider],[role=checkbox]')) return;
        e.preventDefault();
        if (!editing) { tellEdit({ type: 'toggle' }); return; }
        if (currentAudition()) { stopAudition(); return; }
        play(editing, soundDefaults(editing), { audioTool: useEdit.getState().audio, onFail: () => say('That sound could not be played') });
      }
      if (e.key === 'Escape' && editing) closeEditor();
      // Esc deselects (comment mode's own Esc closes the box and leaves comment mode, so this waits until that is off)
      else if (e.key === 'Escape' && !s.commentMode && !useComments.getState().open) {
        if (sel) useEdit.setState({ sel: null });
        else if (focus) closeFocus();
      }
    };
    // in the capture phase, so comment mode's own Esc (useCommentKeys) hasn't turned it off yet
    document.addEventListener('keydown', down, true);
    return () => document.removeEventListener('keydown', down, true);
  }, []);
}
