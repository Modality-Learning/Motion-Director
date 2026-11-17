// What the agent is doing now, in a few words, for the studio to show beside the link icon with a spinner:
// "Softening the bounce". The agent sets it when it starts on comments or a change the user is watching
// (`motion-director status "…"`, or the MCP tool set_status) and clears it when done (`--done`).
// One status per project, in out/comments/status.json, beside the comment logs the studio already watches.
// A status not updated for STALE_MS is treated as over: the agent ended, or forgot to clear it.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const STALE_MS = 15 * 60_000;
export const MAX_WORDS = 8, MAX_CHARS = 60;
const fileOf = (outDir) => join(outDir, 'comments', 'status.json');

/** A status as people read it: one line, a few words, no trailing full stop. */
export function tidy(text) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().replace(/[.…]+$/, '').split(' ').filter(Boolean);
  const line = words.slice(0, MAX_WORDS).join(' ');
  return line.length > MAX_CHARS ? `${line.slice(0, MAX_CHARS - 1).trimEnd()}…` : line;
}

/** Sets what the agent is doing. `about` names what it's working on (a selector or cue id) for the studio to mark. */
export function setAgentStatus(outDir, { text, film = null, about = null, by = null }, now = new Date()) {
  const line = tidy(text);
  if (!line) throw new Error('Say what you are doing, in a few words');
  mkdirSync(join(outDir, 'comments'), { recursive: true });
  const status = { text: line, film: film || null, about: about || null, by: by || null, at: now.toISOString() };
  writeFileSync(fileOf(outDir), `${JSON.stringify(status)}\n`);
  return status;
}

/** The agent has finished: the studio's status goes. */
export function clearAgentStatus(outDir) {
  rmSync(fileOf(outDir), { force: true });
}

/** The current status, or null when there is none or it has gone stale. */
export function readAgentStatus(outDir, now = Date.now()) {
  const file = fileOf(outDir);
  if (!existsSync(file)) return null;
  try {
    const s = JSON.parse(readFileSync(file, 'utf8'));
    if (!s?.text || !(now - Date.parse(s.at) < STALE_MS)) return null;
    return s;
  } catch { return null; }
}
