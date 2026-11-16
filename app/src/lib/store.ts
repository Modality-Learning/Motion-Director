// The studio's own state: what is open, the catalogue of films and compositions, the playhead, comment mode,
// the save indicator and the renders. The Edit tab keeps its sound state in features/edit/store.ts.
import { create } from 'zustand';
import { getJson, type Catalog, type Comp, type Film, type Job, type Kind } from './api';

export type Tab = 'vibe' | 'treatment' | 'edit' | 'export';
export const TABS: Record<Kind, Tab[]> = { film: ['vibe', 'treatment', 'edit', 'export'], comp: ['vibe', 'treatment', 'edit'] };
// the tabs Edit replaced, so old links still land in it
const OLD_TABS: Record<string, Tab> = { parameters: 'edit', motion: 'edit', sound: 'edit', storyboard: 'treatment', brief: 'treatment' };
/** The tabs that take comments: the vibe board, the treatment and storyboard, and the edit. */
export const commentable = (tab: Tab | undefined | null) => tab === 'vibe' || tab === 'treatment' || tab === 'edit';
/** The preview a tab shows: Treatment has the storyboard, Edit the film itself; Export has none. */
export const frameOf = (tab: Tab | undefined | null) => (tab === 'treatment' ? 'storyboard' : tab === 'edit' ? 'edit' : null);

export type Route =
  | { view: 'home'; lib: 'films' | 'comps' }
  | { view: 'work'; kind: Kind; name: string; tab: Tab };

export type SaveState = { state: '' | 'saving' | 'saved' | 'error'; detail?: string };

/** What the Edit tab has selected, as the inspector needs it (features/edit reports every change). */
export type Selection =
  | { kind: 'none' }
  | { kind: 'clip'; id: string }
  | { kind: 'element'; scope: string | null; label: string | null };

export interface Scope { id: string; label?: string | null; ranges: [number, number][] }

/** Small values remembered in this browser only (a tab, a size, the playhead); never anything that matters. */
export const local = {
  get: (k: string) => { try { return localStorage.getItem(`studio-${k}`); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(`studio-${k}`, v); } catch { /* private window */ } },
  del: (k: string) => { try { localStorage.removeItem(`studio-${k}`); } catch { /* private window */ } },
};

interface StudioState {
  catalog: Catalog | null;
  route: Route;
  /** where the Edit tab's preview is, for the open piece */
  playhead: number;
  /** the storyboard's and the edit preview's reported time and scopes */
  scopes: Record<'storyboard' | 'edit', Scope[]>;
  times: Record<'storyboard' | 'edit', number | null>;
  boardKey: string | null;
  selection: Selection;
  commentMode: boolean;
  save: SaveState;
  /** when this window last saved a parameter, so its own change coming back needs no reload */
  ownSaveAt: number;
  jobs: Job[];
  /** bumped when the films' code changes, so the home page's live posters reload */
  homeRev: number;
  load: () => Promise<Catalog>;
  setRoute: (r: Route) => void;
  setPlayhead: (t: number) => void;
  setSave: (s: SaveState) => void;
  setCommentMode: (on: boolean) => void;
  setSelection: (s: Selection) => void;
  setJobs: (jobs: Job[]) => void;
}

const phKey = (kind: Kind, name: string) => `t-${kind}-${name}`;
export function savedPlayhead(kind: Kind, name: string) {
  const v = parseFloat(local.get(phKey(kind, name)) ?? '');
  return Number.isFinite(v) && v >= 0 ? v : 0;
}
let phTimer: ReturnType<typeof setTimeout> | undefined;
let savedFade: ReturnType<typeof setTimeout> | undefined;

export const useStudio = create<StudioState>((set, get) => ({
  catalog: null,
  route: parseHash(),
  playhead: 0,
  scopes: { storyboard: [], edit: [] },
  times: { storyboard: null, edit: null },
  boardKey: null,
  selection: { kind: 'none' },
  commentMode: false,
  save: { state: '' },
  ownSaveAt: 0,
  jobs: [],
  homeRev: 0,
  async load() {
    const catalog = await getJson<Catalog>('/api/films');
    set({ catalog });
    return catalog;
  },
  setRoute(route) {
    const was = get().route;
    const changed = route.view !== 'work' || was.view !== 'work' || was.kind !== route.kind || was.name !== route.name;
    if (changed) {
      // a new piece: its own remembered playhead, and nothing carried over from the last one
      const playhead = route.view === 'work' ? savedPlayhead(route.kind, route.name) : 0;
      set({ route, playhead, scopes: { storyboard: [], edit: [] }, times: { storyboard: null, edit: null }, boardKey: null, selection: { kind: 'none' }, commentMode: false });
    } else set({ route, commentMode: false }); // comment mode belongs to one preview at a time
  },
  setPlayhead(t) {
    const r = get().route;
    set({ playhead: t });
    if (r.view !== 'work') return;
    clearTimeout(phTimer);
    phTimer = setTimeout(() => local.set(phKey(r.kind, r.name), t.toFixed(2)), 200);
  },
  setSave(save) {
    clearTimeout(savedFade);
    set({ save });
    if (save.state === 'saved') savedFade = setTimeout(() => set({ save: { state: '' } }), 2500);
  },
  setCommentMode(on) {
    const r = get().route;
    set({ commentMode: on && r.view === 'work' && r.kind === 'film' && commentable(r.tab) });
  },
  setSelection(selection) { set({ selection }); },
  setJobs(jobs) { set({ jobs }); },
}));

/* ── routes: #/ (films), #/comps (compositions), #/film/<name>/<tab>, #/comp/<name>/<tab> ── */
export function parseHash(hash = typeof location === 'undefined' ? '' : location.hash): Route {
  const [, a, name, tab] = hash.replace(/^#/, '').split('/');
  if ((a === 'film' || a === 'comp') && name) {
    const t = (OLD_TABS[tab] || tab) as Tab;
    return { view: 'work', kind: a, name: decodeURIComponent(name), tab: TABS[a].includes(t) ? t : 'edit' };
  }
  return { view: 'home', lib: a === 'comps' ? 'comps' : 'films' };
}
export const hashOf = (r: Route) => (r.view === 'home' ? (r.lib === 'comps' ? '#/comps' : '#/') : `#/${r.kind}/${encodeURIComponent(r.name)}/${r.tab}`);
export const go = (r: Route) => { location.hash = hashOf(r); };

/** The open film or composition, when there is one. */
export function useOpenItem(): (Film | Comp) & { kind: Kind } | null {
  return useStudio((s) => {
    if (s.route.view !== 'work' || !s.catalog) return null;
    const { kind, name } = s.route;
    const x = kind === 'film' ? s.catalog.films.find((f) => f.name === name) : s.catalog.comps.find((c) => c.name === name);
    return x ? Object.assign(x, { kind }) : null;
  });
}
export const isFilm = (x: Film | Comp): x is Film => 'orientation' in x;
