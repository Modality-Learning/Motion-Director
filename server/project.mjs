// The project Motion Director works on: a folder holding films/, comps/, sounds/ and out/ (and optionally a
// kit/ of its own), marked by a motion-director.config.mjs at its top. The package itself (kit, render, studio)
// lives elsewhere, in node_modules or a checkout of this repo.
//
//   export default {
//     name: 'Modality',                       // shown in the studio's top bar
//     checks: { drift: 'scripts/ui-drift.mjs' }, // optional: the project's own "does the film still match the app" check
//     sounds: '~/Sounds/sfx',                  // optional: the sound library's audio, if not the project's sounds/
//   };                                         // (its settings, sounds/library.json, stay in the project either way)
//
// The root comes from MD_ROOT (the CLI sets it), else the nearest folder above the working directory with a
// config file, else the working directory.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
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
  // a shared library folder: '~/…' is your home, a relative path is from the project. Every command and the studio
  // read it from MD_SOUNDS, which is set here (the CLI loads the config before it starts anything), unless set already.
  const sounds = typeof cfg.sounds === 'string' && cfg.sounds.trim() ? resolve(root, cfg.sounds.trim().replace(/^~(?=$|\/)/, homedir())) : null;
  if (sounds && !process.env.MD_SOUNDS) process.env.MD_SOUNDS = sounds;
  // updates: false stops the studio and --version asking GitHub for newer releases (server/updates.mjs)
  return { root, name: typeof cfg.name === 'string' ? cfg.name : '', sounds, updates: cfg.updates !== false, checks: { drift: drift && existsSync(drift) ? drift : null } };
}

/** Where a kit file comes from: the project's own kit/ first (its brand, its additions), then the package's. */
export function kitFile(root, rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\0') || rel.split(/[\\/]/).some((p) => p === '..' || p.startsWith('.'))) return null;
  const own = join(root, 'kit', rel);
  if (existsSync(own)) return own;
  const pkg = join(PKG, 'kit', rel);
  return existsSync(pkg) ? pkg : null;
}
