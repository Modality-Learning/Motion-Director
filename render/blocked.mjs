// When an agent's sandbox stops a command from starting its browser or opening a local port, say so plainly, and
// what to allow. Codex's default sandbox blocks both, and an agent told only "browser closed" may make a stand-in
// image instead of the real storyboard. Imported first by the commands that need a browser or a port.

/** What blocked it, or null for any other error: 'browser', 'port' or 'install'. */
export function blockedBy(err) {
  const msg = String(err?.message || err || '');
  if (err?.code === 'EPERM' && err?.syscall === 'listen') return 'port';
  if (/Executable doesn't exist|npx playwright install/i.test(msg)) return 'install';
  if (/browserType\.launch/.test(msg)) return 'browser';
  return null;
}

/** The explanation for a blocked command, or null. */
export function explainBlocked(err, command) {
  const what = blockedBy(err);
  if (!what) return null;
  if (what === 'install') return "Motion Director needs Playwright's Chromium, which isn't installed: run `npx playwright install chromium` once.";
  const did = what === 'port' ? 'open a local port' : 'start its browser';
  return [
    `Motion Director couldn't ${did} here. This usually means the command is running inside an agent's sandbox (Codex's default sandbox blocks both).`,
    `Run it outside the sandbox: approve it when your agent asks, or run it in your own terminal${command ? `: ${command}` : '.'}`,
    "Agents: tell the user this. Don't make a stand-in image for a storyboard, still or render: only Motion Director draws the film.",
  ].join('\n');
}

/** Turns a blocked command's crash into the explanation; any other error prints as Node would. Exits 1 either way.
 * @param {string} command the command as the user would type it, such as `npx motion-director board launch` */
export function explainOnCrash(command) {
  const handle = (err) => {
    console.error(explainBlocked(err, command) || err?.stack || String(err));
    process.exit(1);
  };
  process.on('uncaughtException', handle);
  process.on('unhandledRejection', handle);
}
