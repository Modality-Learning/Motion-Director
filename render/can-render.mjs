// Whether this machine can render a film to video, and if not, why and what fixes it. The studio shows it on the
// Render card (and disables the button); `motion-director render` checks it before starting.
// Previewing, storyboards, stills and web export don't need any of this, only the browser for stills.
import { existsSync } from 'node:fs';

const CLT_SWIFTC = '/Library/Developer/CommandLineTools/usr/bin/swiftc';

/** { ok: true } or { ok: false, reason, fix? }. Every check, in the order a person would fix them.
 * @param {{ platform?: string, hasSwiftc?: () => boolean, chromium?: () => Promise<string | null> }} [env] for tests */
export async function videoSupport({ platform = process.platform, hasSwiftc = () => existsSync(CLT_SWIFTC), chromium = chromiumPath } = {}) {
  if (platform !== 'darwin') {
    return { ok: false, reason: "Rendering video needs macOS: the encoder and the sound mixer use Apple's AVFoundation. Everything else works here: previewing, the storyboard, comments, sound placement and the web export." };
  }
  if (!hasSwiftc()) {
    return { ok: false, reason: "Rendering video needs Apple's Command Line Tools, to build the encoder the first time.", fix: 'xcode-select --install' };
  }
  const browser = await chromium();
  if (!browser) {
    return { ok: false, reason: "Rendering video needs Playwright's Chromium, to capture the frames.", fix: 'npx playwright install chromium' };
  }
  return { ok: true };
}

/** Where Playwright's Chromium is, or null when it isn't installed. */
async function chromiumPath() {
  try {
    const { chromium } = await import('playwright');
    const path = chromium.executablePath();
    return path && existsSync(path) ? path : null;
  } catch { return null; }
}

let cached = null;
/** The same for the studio, which asks on every catalog load: a yes is kept, a no is checked again (the person may
 * have just installed what was missing). */
export async function videoSupportCached() {
  if (cached) return cached;
  const r = await videoSupport();
  if (r.ok) cached = r;
  return r;
}

/* the command: prints why not, and exits 1, or exits 0 silently */
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const r = await videoSupport();
  if (!r.ok) { console.error(`${r.reason}${r.fix ? `\nTo fix it: ${r.fix}` : ''}`); process.exit(1); }
}
