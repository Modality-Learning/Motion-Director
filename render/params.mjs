// Parameters: the settings a film or composition exposes, kept as data in its film.json / comp.json.
//
//   "params": { "background": { "label": "Background", "type": "choice", "options": ["white", "textured"], "value": "white" } }
// Types: choice (options), number (min, max), text (maxLength; pages must insert it as text, never markup).
//
// The value is the source of truth. The renderer, storyboard, studio and bundles pass every value to the
// page in its URL (compositions' as "<comp>.<name>"), and pages read them with Motion.param(name, fallback).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const NAME = /^[a-z0-9][a-z0-9-]*$/; // film and composition folder names

export function readManifest(promoDir, kind, name) {
  if (!NAME.test(name)) return null;
  const file = join(promoDir, kind === 'comp' ? 'comps' : 'films', name, kind === 'comp' ? 'comp.json' : 'film.json');
  return existsSync(file) ? { file, data: JSON.parse(readFileSync(file, 'utf8')) } : null;
}

/** Current values of a manifest's parameters. */
export const valuesOf = (manifest) => Object.fromEntries(Object.entries(manifest?.params || {}).map(([k, p]) => [k, p.value]));

/** Every composition's values, keyed "<comp>.<name>". */
export function compValues(promoDir) {
  const dir = join(promoDir, 'comps');
  if (!existsSync(dir)) return {};
  const out = {};
  for (const name of readdirSync(dir).filter((n) => NAME.test(n))) {
    const m = readManifest(promoDir, 'comp', name);
    if (m) for (const [k, v] of Object.entries(valuesOf(m.data))) out[`${name}.${k}`] = v;
  }
  return out;
}

/** The URL query a page needs: its own values, plus every composition's (which a page may use). */
export function paramsQuery(promoDir, kind, name, overrides = {}) {
  const m = readManifest(promoDir, kind, name);
  const values = { ...compValues(promoDir), ...valuesOf(m?.data), ...overrides };
  return new URLSearchParams(Object.entries(values).map(([k, v]) => [k, String(v)])).toString();
}

/** Checks new values against a manifest's declared parameters. Returns { values } or { error }. */
export function validateValues(manifest, values) {
  const params = manifest?.params || {};
  if (!values || typeof values !== 'object' || Array.isArray(values)) return { error: 'No values' };
  const clean = {};
  for (const [k, v] of Object.entries(values)) {
    const p = params[k];
    if (!p) return { error: `Unknown parameter ${k}` };
    if (p.type === 'choice' && !p.options.includes(v)) return { error: `${p.label || k} must be one of ${p.options.join(', ')}` };
    if (p.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v) || (p.min != null && v < p.min) || (p.max != null && v > p.max))) return { error: `${p.label || k} is out of range` };
    // text may span lines (\n, or \r\n which is normalised); no other control characters
    if (p.type === 'text' && (typeof v !== 'string' || !v.trim() || v.length > (p.maxLength || 120) || /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(v))) return { error: `${p.label || k} must be text up to ${p.maxLength || 120} characters` };
    if (!['choice', 'number', 'text'].includes(p.type)) return { error: `${k} cannot be edited` };
    clean[k] = p.type === 'text' ? v.replace(/\r\n?/g, '\n') : v;
  }
  return { values: clean };
}

/** Writes validated values back into the manifest file, keeping everything else as it was. */
export function saveValues(promoDir, kind, name, values) {
  const m = readManifest(promoDir, kind, name);
  if (!m) return { error: 'Unknown film or composition' };
  const v = validateValues(m.data, values);
  if (v.error) return v;
  for (const [k, val] of Object.entries(v.values)) m.data.params[k].value = val;
  writeFileSync(m.file, JSON.stringify(m.data, null, 2) + '\n');
  return { values: valuesOf(m.data) };
}

/** For pages opened by path (renderer, storyboard): which film or composition a page belongs to. */
export function pageOwner(htmlPath) {
  const m = htmlPath.match(/[\\/](films|comps)[\\/]([^\\/]+)[\\/]index\.html$/);
  return m ? { kind: m[1] === 'comps' ? 'comp' : 'film', name: m[2] } : null;
}
