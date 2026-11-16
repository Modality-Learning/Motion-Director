// The studio server's API (server/server.mjs). Reads are plain GETs; every action is a POST with the studio's
// own header, which the server requires so other sites can't act on it.

export type ParamType = 'choice' | 'number' | 'text';
export interface Param {
  label?: string;
  type: ParamType;
  value: string | number;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
}
export type Params = Record<string, Param>;

export interface Output { file: string; kind: string; bytes: number; modified: string }
export interface Film {
  name: string;
  title: string;
  duration: number;
  poster: number;
  orientation: 'vertical' | 'landscape';
  derivedFrom: string | null;
  notes: string | null;
  params: Params;
  comps: string[];
  query: string;
  outputs: Output[];
}
export interface Comp {
  name: string;
  title: string;
  description: string;
  duration: number;
  poster: number;
  params: Params;
  usedBy: string[];
  query: string;
}
export interface Preset { label: string; detail: string; codec: string; ext: string }
export interface Size { label: string; dsf: string }
export interface Project { name: string; drift: boolean }
export interface Catalog {
  project: Project;
  films: Film[];
  comps: Comp[];
  presets: Record<string, Preset>;
  sizes: Record<string, Size>;
}

export interface Job {
  id: number;
  film: string;
  file: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  phase: string;
  progress: number;
  log: string[];
}

export interface Drift {
  none?: boolean;
  error?: string;
  sources?: number;
  syncedAt?: string;
  changed: { path: string; added: number; removed: number }[];
  missing: string[];
  substantial?: boolean;
  lines?: number;
}

export interface Posted<T = Record<string, unknown>> { ok: boolean; status: number; data: T & { error?: string } }

export async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: 'no-store' });
  return r.json() as Promise<T>;
}

export async function post<T = Record<string, unknown>>(path: string, body: unknown): Promise<Posted<T>> {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-promo-studio': '1' }, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as T & { error?: string } };
}

export const pageBase = (kind: Kind, name: string) => `/${kind === 'film' ? 'films' : 'comps'}/${encodeURIComponent(name)}/index.html`;
export type Kind = 'film' | 'comp';
