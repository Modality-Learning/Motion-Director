// The project Motion Director works on: a folder holding films/, comps/, sounds/ and out/ (and optionally a
// kit/ of its own), marked by a motion-director.config.mjs at its top. The package itself (kit, render, studio)
// lives elsewhere, in node_modules or a checkout of this repo.
//
//   export default {
//     name: 'Modality',                       // shown in the studio's top bar
//     checks: { drift: 'scripts/ui-drift.mjs' } // optional: the project's own "does the film still match the app" check
//   };
//
// The root comes from MD_ROOT (the CLI sets it), else the nearest folder above the working directory with a
// config file, else the working directory.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The Motion Director package: its kit, render scripts and studio. */
export const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG = 'motion-director.config.mjs';

/** The folder above `from` (or `from` itself) that holds a config file, or null. */
export function findRoot(from = process.cwd()) {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, CONFIG))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

/** The project root for this process. */
export function projectRoot() {
  return resolve(process.env.MD_ROOT || findRoot() || process.cwd());
}

/** The project's config, with defaults filled in. Unknown keys are ignored. */
export async function loadConfig(root = projectRoot()) {
  const file = join(root, CONFIG);
  let cfg = {};
  if (existsSync(file)) cfg = (await import(pathToFileURL(file).href)).default || {};
  const drift = typeof cfg.checks?.drift === 'string' ? resolve(root, cfg.checks.drift) : null;
  return { root, name: typeof cfg.name === 'string' ? cfg.name : '', checks: { drift: drift && existsSync(drift) ? drift : null } };
}

/** Where a kit file comes from: the project's own kit/ first (its brand, its additions), then the package's. */
export function kitFile(root, rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\0') || rel.split(/[\\/]/).some((p) => p === '..' || p.startsWith('.'))) return null;
  const own = join(root, 'kit', rel);
  if (existsSync(own)) return own;
  const pkg = join(PKG, 'kit', rel);
  return existsSync(pkg) ? pkg : null;
}
