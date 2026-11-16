// A parameter is edited where it lives: a film's own (kind film) or a composition's (kind comp). The previews
// hear every keystroke live; the value is saved a moment after you stop.
import { post, type Comp, type Kind, type Param } from '@/lib/api';
import { tell } from '@/lib/frames';
import { useStudio } from '@/lib/store';

export interface ParamRef {
  kind: Kind;
  name: string;
  key: string;
  p: Param;
  /** the name the page reads it by: its own key, or "<comp>.<key>" */
  live: string;
  /** the composition it belongs to, when it is shared */
  comp?: Comp;
}

/** Every parameter the open piece shows: its own, then (in a film) its compositions'. */
export function paramRefs(): ParamRef[] {
  const { catalog, route } = useStudio.getState();
  if (!catalog || route.view !== 'work') return [];
  const { kind, name } = route;
  const x = kind === 'film' ? catalog.films.find((f) => f.name === name) : catalog.comps.find((c) => c.name === name);
  if (!x) return [];
  const refs: ParamRef[] = Object.entries(x.params).map(([key, p]) => ({ kind, name, key, p, live: kind === 'comp' ? `${name}.${key}` : key }));
  if (kind === 'film' && 'comps' in x) for (const c of x.comps) {
    const comp = catalog.comps.find((y) => y.name === c);
    if (comp) for (const [key, p] of Object.entries(comp.params)) refs.push({ kind: 'comp', name: c, key, p, live: `${c}.${key}`, comp });
  }
  return refs;
}

/** The scope (the element on screen) a parameter belongs to: param:<key> for a piece's own, comp:<name> for a composition's. */
export const scopeIdOf = (r: ParamRef, openKind: Kind) => (r.kind === openKind ? `param:${r.key}` : `comp:${r.name}`);
export function refForScope(scope: string, refs = paramRefs()): ParamRef | undefined {
  const { route } = useStudio.getState();
  if (route.view !== 'work') return undefined;
  return refs.find((r) => (scope === `param:${r.key}` && r.kind === route.kind) || (scope === `comp:${r.name}` && r.kind === 'comp'));
}

/** The names the preview's picker shows for elements with parameters. */
export function scopeLabels() {
  const { route } = useStudio.getState();
  const out: Record<string, string> = {};
  if (route.view !== 'work') return out;
  for (const r of paramRefs()) {
    if (r.kind === route.kind) out[`param:${r.key}`] = r.p.label || r.key;
    else if (r.comp) out[`comp:${r.name}`] = r.comp.title;
  }
  return out;
}

/** Sends a value into the running previews, so the change shows at once and nothing reloads. */
export function liveValue(r: ParamRef, value: string | number) {
  for (const f of ['storyboard', 'edit'] as const) tell(f, { type: 'params', values: { [r.live]: value } });
}

let noteFade: ReturnType<typeof setTimeout> | undefined;
export async function saveParam(r: ParamRef, value: string | number, say: (m: string) => void) {
  say('Saving…');
  useStudio.setState({ ownSaveAt: Date.now() }); // the previews already show it: the change the server reports back needs no reload
  const res = await post('/api/params', { kind: r.kind, name: r.name, values: { [r.key]: value } });
  if (!res.ok) { say(res.data.error || 'Could not save'); return; }
  await useStudio.getState().load();
  say('Saved');
  clearTimeout(noteFade);
  noteFade = setTimeout(() => say(''), 1500);
}
