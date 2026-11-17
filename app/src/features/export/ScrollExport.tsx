import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { getJson, post, type Film } from '@/lib/api';
import { onLive } from '@/lib/live';
import { local, useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { MotionFilmElement, MotionFilmPoint } from '@/motion-film';

/* The film as a web page plays it: <motion-film> (kit/web.js), with the film's module built fresh by the server
 * (/api/web/film.js, which imports the player beside it, render/web.mjs). It runs inline in a shadow root here,
 * exactly as on a site. */
type Drive = 'scroll' | 'buttons';
const BOX = 'min(70vh, 640px)'; // the preview's scrolling box, standing in for a browser window

/** Loads the film's web module, again whenever its code changes. */
function useWebFilm(film: string) {
  const [state, setState] = useState<{ version: number; error: string | null; loaded: boolean }>({ version: 0, error: null, loaded: false });
  useEffect(() => onLive((ev) => {
    if (ev.type === 'code' && (ev.kit || ev.film === film)) setState((s) => ({ ...s, version: s.version + 1 }));
  }), [film]);
  useEffect(() => {
    let live = true;
    const url = `/api/web/film.js?film=${encodeURIComponent(film)}&v=${state.version}-${Date.now()}`;
    import(/* @vite-ignore */ url)
      .then(() => { if (live) setState((s) => ({ ...s, error: null, loaded: true })); })
      .catch(async () => {
        const r = await getJson<{ error?: string }>(url).catch(() => ({ error: 'The web film could not be built' }));
        if (live) setState((s) => ({ ...s, error: r.error || 'The web film could not be built' }));
      });
    return () => { live = false; };
  }, [film, state.version]);
  return state;
}

export const fmtT = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/** A film's name as a JavaScript name: hello-board → helloBoard. */
export const ident = (name: string) => name.replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : '')).replace(/^\d/, '_$&') || 'film';

/** What to paste into a site, for the way the film is driven: the export command, then the markup. */
export function snippets(film: string, drive: Drive, screens: number, smoothing: number, point: string) {
  const scroll = drive === 'scroll', smooth = scroll && smoothing !== 0.12;
  const html = `<!-- motion-director web ${film} --out public/films -->
<script type="module" src="/films/${film}.film.js"></script>

${scroll ? `<section style="height: ${screens * 100}vh">
  <motion-film film="${film}" mode="scroll"${smooth ? ` smoothing="${smoothing}"` : ''} style="position: sticky; top: 0"></motion-film>
</section>` : `<motion-film film="${film}"></motion-film>`}

<!-- anywhere on the page: ${scroll ? 'scroll' : 'animate'} the film to a moment -->
<button onclick="document.querySelector('motion-film').goTo('${point}')">${point}</button>`;
  const v = ident(film), el = `<MotionFilm ref={film} film={${v}}${scroll ? ` mode="scroll"${smooth ? ` smoothing={${smoothing}}` : ''} style={{ position: 'sticky', top: 0 }}` : ''} />`;
  const react = `// motion-director web ${film} --out src/films
import { useRef } from 'react';
import { MotionFilm, type MotionFilmElement } from './films/MotionFilm';
import ${v} from './films/${film}.film.js';

export function Film() {
  const film = useRef<MotionFilmElement>(null);
  return (
    <>
      ${scroll ? `<section style={{ height: '${screens * 100}vh' }}>
        ${el}
      </section>` : el}
      <button onClick={() => film.current?.goTo('${point}')}>${point}</button>
    </>
  );
}`;
  return { html, react };
}

export function ScrollExport({ film }: { film: Film }) {
  const { error, loaded, version } = useWebFilm(film.name);
  const [drive, setDrive] = useState<Drive>(() => (local.get('webDrive') === 'buttons' ? 'buttons' : 'scroll'));
  const [screens, setScreens] = useState(() => Number(local.get('webScreens')) || 4);
  const [smoothing, setSmoothing] = useState(() => { const v = parseFloat(local.get('webSmoothing') ?? ''); return Number.isFinite(v) ? v : 0.12; });
  const [points, setPoints] = useState<MotionFilmPoint[]>([]);
  const [current, setCurrent] = useState(-1);
  const [ratio, setRatio] = useState(16 / 9);
  const el = useRef<MotionFilmElement>(null);
  const clock = useRef<HTMLSpanElement>(null);

  // the element tells us its moments when it starts (again after each rebuild), then where it is
  useEffect(() => {
    const node = el.current;
    if (!node || !loaded) return;
    const ready = () => { setPoints(node.points); setRatio(node.size.w / node.size.h); };
    const time = () => { if (clock.current) clock.current.textContent = `${fmtT(node.time)} / ${fmtT(node.duration)}`; };
    const point = (e: Event) => setCurrent((e as CustomEvent<{ index: number }>).detail.index);
    if (node.duration) { ready(); time(); }
    node.addEventListener('ready', ready); node.addEventListener('timeupdate', time); node.addEventListener('pointchange', point);
    return () => { node.removeEventListener('ready', ready); node.removeEventListener('timeupdate', time); node.removeEventListener('pointchange', point); };
  }, [loaded, drive, version]);

  const choose = (d: Drive) => { setDrive(d); local.set('webDrive', d); };
  const width = `min(100%, calc(${BOX} * ${ratio}))`;
  const filmEl = (
    <motion-film ref={el} film={film.name} mode={drive === 'scroll' ? 'scroll' : undefined} smoothing={smoothing}
      label={`${film.title || film.name} (preview)`} className={cn('mx-auto', drive === 'scroll' && 'sticky top-0')} style={{ width }} />
  );
  const sample = points[Math.min(1, points.length - 1)]?.name || 'Step 2';
  const code = snippets(film.name, drive, screens, smoothing, sample);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>On a web page</CardTitle>
            <CardDescription>The film plays live in the page, from its own code: no video and no iframe.</CardDescription>
          </div>
          <ToggleGroup type="single" variant="outline" value={drive} onValueChange={(v) => v && choose(v as Drive)} aria-label="What moves the film">
            <ToggleGroupItem value="scroll" className="px-4">Scrolling</ToggleGroupItem>
            <ToggleGroupItem value="buttons" className="px-4">Buttons</ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error ? <p className="rounded-lg border-l-4 border-warning bg-background/40 p-3">{error}</p> : null}
          {drive === 'scroll' ? (
            <div className="overflow-y-auto rounded-xl border bg-background" style={{ height: BOX }} tabIndex={0} aria-label="Scroll this box to play the film">
              <p className="grid place-items-center px-6 text-center text-muted-foreground" style={{ height: `calc(${BOX} / 2)` }}>Scroll down: the film follows.</p>
              <div style={{ height: `calc(${screens} * ${BOX})` }}>{loaded ? filmEl : null}</div>
              <p className="grid place-items-center px-6 text-center text-muted-foreground" style={{ height: `calc(${BOX} / 2)` }}>The page carries on.</p>
            </div>
          ) : (
            <div className="rounded-xl border bg-background p-4">{loaded ? filmEl : null}</div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {drive === 'scroll' ? 'Each button scrolls the box to its moment, as goTo does on a site.' : 'Each button cuts to its moment. goTo(name, { speed }) plays there instead, and { duration } makes a set move.'}
            </p>
            <span ref={clock} className="text-sm tabular-nums text-muted-foreground" aria-hidden="true" />
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Moments in the film">
            {points.map((p, i) => (
              <Button key={`${p.name}-${p.t}`} size="sm" variant={i === current ? 'default' : 'outline'} aria-current={i === current ? 'step' : undefined}
                onClick={() => el.current?.goTo(p.name)}>{p.name}</Button>
            ))}
          </nav>
        </CardContent>
      </Card>

      <div className="grid content-start gap-5">
        {drive === 'scroll' ? (
          <Card>
            <CardHeader><CardTitle>Scrolling</CardTitle></CardHeader>
            <CardContent className="grid gap-5">
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-semibold">Scroll length</legend>
                <ToggleGroup type="single" variant="outline" value={String(screens)} aria-label="Scroll length, in screens"
                  onValueChange={(v) => { if (v) { setScreens(+v); local.set('webScreens', v); } }}>
                  {[2, 4, 6, 8].map((n) => <ToggleGroupItem key={n} value={String(n)} className="px-4">{n} screens</ToggleGroupItem>)}
                </ToggleGroup>
              </fieldset>
              <div className="grid gap-3">
                <div className="flex items-baseline justify-between"><Label htmlFor="smoothing">Smoothing</Label><span className="text-sm tabular-nums text-muted-foreground">{smoothing === 0 ? 'Off' : `${smoothing.toFixed(2)} s`}</span></div>
                <Slider id="smoothing" min={0} max={0.5} step={0.02} value={[smoothing]} aria-label="Smoothing, in seconds"
                  onValueChange={([v]) => { setSmoothing(v); local.set('webSmoothing', String(v)); }} />
                <p className="text-sm text-muted-foreground">How long the film takes to catch up with the scroll. Off follows the scrollbar exactly.</p>
              </div>
            </CardContent>
          </Card>
        ) : null}
        <ExportCard film={film.name} />
        <Card>
          <CardHeader><CardTitle>On your site</CardTitle><CardDescription>Import the film, place it, and call goTo from anything on the page.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <Snippet label="HTML" text={code.html} />
            <Snippet label="React" text={code.react} />
            <p className="text-sm text-muted-foreground">Web films are silent for now. With reduced motion asked for, buttons jump and scrolling steps between moments.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ExportCard({ film }: { film: string }) {
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ page: string; module: string } | null>(null);
  async function run() {
    setBusy(true);
    const r = await post<{ files: string[]; notes: string[]; bytes: number; page: string; module: string }>('/api/web/export', { film });
    setBusy(false);
    if (!r.ok) { toast.error(r.data.error || 'Could not export'); return; }
    setMade({ page: r.data.page, module: r.data.module });
    toast.success(`Exported ${r.data.module} (${Math.round(r.data.bytes / 1024)} KB)`, { description: r.data.notes.join(' ') || undefined });
    await useStudio.getState().load(); // the Files list
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Export</CardTitle>
        <CardDescription>Writes the film as <code>{film}.film.js</code>, the player it shares with your other films (<code>motion-film.js</code>) and an example page, to <code>out/</code>.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={run} disabled={busy}>{busy ? 'Exporting…' : 'Export for the web'}</Button>
          {made ? <>
            <Button variant="secondary" onClick={() => post('/api/open', { file: made.page })}>Open example page</Button>
            <Button variant="secondary" onClick={() => post('/api/reveal', { file: made.module })}>Show in folder</Button>
          </> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Into your app, as files you own (no package to install): <code>motion-director web {film} --out src/films</code>.
          In a React project that also writes <code>MotionFilm.tsx</code>, once.
        </p>
      </CardContent>
    </Card>
  );
}

function Snippet({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { toast.error('Could not copy'); }
  }
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <Button size="sm" variant="ghost" onClick={copy} aria-label={`Copy the ${label} snippet`}>{done ? <Check /> : <Copy />}{done ? 'Copied' : 'Copy'}</Button>
      </div>
      <pre className="max-h-72 overflow-auto rounded-lg bg-background p-3 text-xs leading-relaxed"><code>{text}</code></pre>
    </div>
  );
}
