// Files changed outside the studio show here without a reload: a piece's manifest reloads the catalogue (and,
// unless it was this window's own save, its previews); its code reloads its previews in place, at the playhead.
// The Edit tab takes sound and library changes itself (features/edit).
import { useEffect } from 'react';
import { onLive, type LiveEvent } from './live';
import { useStudio } from './store';
import { reloadPreviews } from '@/features/preview/preview';

function affects(ev: LiveEvent) {
  const { route, catalog } = useStudio.getState();
  if (route.view !== 'work') return false;
  if (ev.kit) return true;
  if (ev.film) return route.kind === 'film' && ev.film === route.name;
  if (ev.comp) return (route.kind === 'comp' && ev.comp === route.name) || (route.kind === 'film' && !!catalog?.films.find((f) => f.name === route.name)?.comps.includes(ev.comp));
  return false;
}

export function useLiveCatalog() {
  useEffect(() => onLive(async (ev) => {
    const s = useStudio.getState();
    if (ev.type === 'piece') {
      await s.load(); // the home tiles redraw from the new catalogue
      if (!affects(ev) || Date.now() - s.ownSaveAt < 2000) return; // our own save: the previews already show it
      reloadPreviews();
    } else if (ev.type === 'code') {
      if (s.route.view === 'home') useStudio.setState((x) => ({ homeRev: x.homeRev + 1 }));
      else if (affects(ev)) reloadPreviews();
    }
  }), []);
}
