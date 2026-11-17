// motion-director status "<a few words>" [--film <name>] [--about <selector or cue id>]   say what you're doing
// motion-director status --done                                                       you've finished
// motion-director status                                                              what it says now
// The studio shows it beside its link icon, with a spinner (server/agent-status.mjs). The project is MD_ROOT.
import { join } from 'node:path';
import { clearAgentStatus, readAgentStatus, setAgentStatus } from './agent-status.mjs';
import { projectRoot } from './project.mjs';

const OUT = join(projectRoot(), 'out');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v ?? null; };

if (args.includes('--done') || args.includes('--clear')) {
  clearAgentStatus(OUT);
  console.log('Status cleared.');
} else {
  const film = flag('--film'), about = flag('--about'), text = args.filter((a) => !a.startsWith('--')).join(' ');
  if (!text) {
    const s = readAgentStatus(OUT);
    console.log(s ? `${s.text}${s.film ? ` (${s.film})` : ''}, since ${s.at}` : 'No status.');
  } else {
    try {
      const s = setAgentStatus(OUT, { text, film, about, by: process.env.CLAUDE_CODE_SESSION_ID ? 'Claude' : null });
      console.log(`Status: ${s.text}`);
    } catch (err) { console.error(err.message); process.exit(2); }
  }
}
