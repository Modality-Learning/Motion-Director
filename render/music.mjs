// Music for a film (kit/music.mjs, skill/MUSIC.md).
// usage: motion-director music <film> [--keys | --at 0,8.5,16] [--json]
//          the film's sections (its scenes), the tempos that put their starts on bar lines, how far each is off,
//          and the brief (films/<film>/music.json) if there is one. --keys uses every key moment instead (rarely all
//          on bars), --at the times you give
//        motion-director music fit <film> [cue] [--dry]  line the music clip up with the brief: measure the
//                                                     track, then set its start, trim and speed
import { chromium } from 'playwright';
import { explainOnCrash } from './blocked.mjs';
import { clockOf, structureLines, tempoCandidates } from '../kit/music.mjs';
import { projectRoot } from '../server/project.mjs';
import { pageUrl, startProjectServer } from '../server/static.mjs';
import { fitMusic, readBrief } from '../server/music-lib.mjs';
import { NAME } from './params.mjs';

const root = projectRoot();
const args = process.argv.slice(2);
const json = args.includes('--json'), dry = args.includes('--dry'), useKeys = args.includes('--keys');
const atIdx = args.indexOf('--at'), atList = atIdx >= 0 ? (args.splice(atIdx, 2)[1] || '').split(',').map(Number).filter((t) => Number.isFinite(t) && t >= 0) : null;
const words = args.filter((a) => !a.startsWith('--'));
const fit = words[0] === 'fit', film = fit ? words[1] : words[0];
if (!film || !NAME.test(film)) { console.error('usage: motion-director music <film> [--json] | music fit <film> [cue] [--dry]'); process.exit(2); }
const fmt = (t) => `${t.toFixed(2)} s`;

if (fit) {
  const r = await fitMusic(root, film, words[2] || null, { dry });
  if (r.error) { console.error(r.error); process.exit(1); }
  if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  console.log(`Measured ${r.cue}: ${r.track.bpm} BPM, first beat at ${fmt(r.track.phase)}, biggest lift at ${r.track.lift == null ? 'none found' : fmt(r.track.lift)} (of ${r.track.seconds} s).`);
  console.log(`${dry ? 'Would place' : 'Placed'} it at ${fmt(r.plan.at)}${r.plan.from ? `, starting ${fmt(r.plan.from)} into the track` : ''}${r.plan.drop ? `, its lift on "${r.plan.drop}"` : ', its beats on the film\'s beats'}. ${r.plan.note}`);
  process.exit(0);
}

// the film's key moments, from the film itself (KEYS are often expressions, so the page works them out)
explainOnCrash(`npx motion-director music ${film}`);
const site = await startProjectServer(root);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pageUrl(site.origin, 'film', film, 'still&t=0'), { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1' && window.__film, null, { timeout: 15000 });
const { duration, keys, scenes } = await page.evaluate(() => ({
  duration: window.__film.duration,
  keys: (window.__film.keys || []).map((k) => ({ name: k.name, t: k.t, note: k.note })),
  scenes: (window.__film.scenes || []).map(([name, t]) => ({ name, t })),
}));
await browser.close(); await site.close();

// what the music's structure follows: the film's sections by default (its scenes; the keys when it has none)
const marks = atList ? atList.map((t, i) => ({ name: `Mark ${i + 1}`, t })) : useKeys || !scenes.length ? keys : scenes;
const what = atList ? 'the times given' : useKeys || !scenes.length ? 'the key moments' : 'the section starts';
// the film's very start isn't a musical event (the music can open on a pickup), so it doesn't count against a tempo
const tempos = tempoCandidates(marks.map((m) => m.t).filter((t) => t > 0.05));
const best = tempos[0];
const bar = best ? (60 / best.bpm) * 4 : 0;
const nearest = best ? marks.map((m) => { const n = Math.round((m.t - best.offset) / bar), line = best.offset + n * bar; return { ...m, bar: n + 1, line: Math.round(line * 1000) / 1000, off: Math.round((m.t - line) * 1000) / 1000 }; }) : [];
const b = readBrief(root, film);
if (json) { console.log(JSON.stringify({ film, duration, using: what, marks: nearest.length ? nearest : marks, keys, scenes, tempos, brief: b.brief ?? null, briefError: b.error ?? null }, null, 2)); process.exit(0); }
console.log(`${film}: ${duration} s, ${scenes.length} sections, ${keys.length} key moments`);
console.log(`\nTempos that put ${what} on bar lines (4/4), best first:`);
for (const c of tempos) console.log(`  ${String(c.bpm).padStart(3)} BPM, first downbeat at ${fmt(c.offset)}: off a bar line by ${Math.round(c.barError * 1000)} ms on average (${Math.round(c.worst * 1000)} ms at most), off a beat by ${Math.round(c.beatError * 1000)} ms`);
if (best) {
  console.log(`\nAt ${best.bpm} BPM, ${what} against their nearest bar line (moving one onto it is a change to the film):`);
  for (const m of nearest) console.log(`  ${fmt(m.t).padStart(8)}  ${m.name.padEnd(28)} bar ${String(m.bar).padStart(3)} at ${fmt(m.line)}  ${Math.abs(m.off) < 0.04 ? 'on it' : `${Math.abs(m.off).toFixed(2)} s ${m.off > 0 ? 'late' : 'early'}`}`);
  // the skeleton of the brief at that tempo: sections on their bar lines, bars that add up to the film's length
  const sections = nearest.map((m) => ({ name: m.name, at: Math.max(0, m.line) }));
  console.log(`\nFor the brief at ${best.bpm} BPM: "length": ${duration} (ask for ${clockOf(duration)}), "offset": ${best.offset}, sections on those bar lines, and a structure whose bars add up to the film:`);
  for (const line of structureLines({ bpm: best.bpm, beatsPerBar: 4, sections }, duration, () => '')) console.log(`  ${line}`);
}
console.log(b.brief ? `\nThe brief: ${b.brief.bpm} BPM, ${b.brief.sections.length} sections${b.brief.prompt?.style ? `, prompt: "${b.brief.prompt.style.slice(0, 80)}${b.brief.prompt.style.length > 80 ? '…' : ''}"` : ''}.`
  : b.error ? `\nThe brief doesn't check out: ${b.error}` : `\nNo brief yet: write films/${film}/music.json with the user (skill/MUSIC.md).`);
