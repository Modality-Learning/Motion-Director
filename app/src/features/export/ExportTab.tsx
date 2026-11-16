import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { getJson, post, type Drift, type Film, type Job } from '@/lib/api';
import { cap, fmtBytes, fmtTime } from '@/lib/format';
import { local, useOpenItem, useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';

/** Export: the project's own check that the film still matches the app, the render, and the files made. */
export function ExportTab() {
  const item = useOpenItem() as (Film & { kind: 'film' }) | null;
  const drift = useStudio((s) => s.catalog?.project.drift);
  useJobs();
  if (!item || item.kind !== 'film') return null;
  return (
    <div className="grid gap-5 p-5 lg:grid-cols-2">
      <div className="grid content-start gap-5">
        {drift ? <DriftCard film={item.name} /> : null}
        <RenderCard film={item} />
      </div>
      <div className="grid content-start gap-5">
        <JobsCard />
        <FilesCard film={item} />
      </div>
    </div>
  );
}

function DriftCard({ film }: { film: string }) {
  const [d, setD] = useState<Drift | null>(null);
  const check = useCallback(async () => {
    setD(null);
    const r = await getJson<Drift>(`/api/drift?film=${encodeURIComponent(film)}`).catch(() => ({ error: 'Check failed' }) as Drift);
    setD(r);
  }, [film]);
  useEffect(() => { check(); }, [check]);
  let body: React.ReactNode;
  if (!d) body = <p className="text-muted-foreground">Checking…</p>;
  else if (d.error) body = <p className="text-muted-foreground">{d.error}</p>;
  else if (!d.sources) body = <Note ok>This film lists no app screens to check.</Note>;
  else if (!d.changed.length && !d.missing.length) body = <Note ok>The app screens this film copies are unchanged since {d.syncedAt?.slice(0, 8)}.</Note>;
  else body = (
    <Note ok={!d.substantial}>
      <p>{d.substantial
        ? `The app has changed since this film's screens were built (${d.lines} lines). Ask for the screens to be updated before a final render.`
        : `Small changes in the app since ${d.syncedAt?.slice(0, 8)}; the film can be rendered as it is.`}</p>
      <ul className="mt-2 grid gap-1 text-sm">
        {d.changed.map((c) => <li key={c.path}><code>{c.path}</code> +{c.added} −{c.removed}</li>)}
        {d.missing.map((m) => <li key={m}><code>{m}</code> (missing)</li>)}
      </ul>
    </Note>
  );
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between"><CardTitle>App UI check</CardTitle><Button variant="ghost" size="sm" onClick={check}>Check again</Button></CardHeader>
      <CardContent aria-live="polite">{body}</CardContent>
    </Card>
  );
}
const Note = ({ ok, children }: { ok?: boolean; children: React.ReactNode }) => (
  <div className={cn('rounded-lg border-l-4 bg-background/40 p-3', ok ? 'border-success' : 'border-warning')}>{children}</div>
);

function RenderCard({ film }: { film: Film }) {
  const presets = useStudio((s) => s.catalog!.presets), sizes = useStudio((s) => s.catalog!.sizes);
  const running = useStudio((s) => s.jobs.some((j) => j.status === 'running'));
  const [preset, setPreset] = useState(() => local.get('preset') || 'share');
  const [size, setSize] = useState(() => local.get('size') || '1440p');
  const [status, setStatus] = useState('');
  const [sound, setSound] = useState({ cues: 0, audio: false });
  const [withSound, setWithSound] = useState(true);
  const [withWav, setWithWav] = useState(() => local.get('wav') === '1');
  const bg = film.params?.background?.value;

  // whether to mix the film's sound in: offered once the film has cues
  useEffect(() => {
    let live = true;
    Promise.all([getJson<{ sheet?: { cues?: unknown[] } }>(`/api/sound?film=${encodeURIComponent(film.name)}`).catch(() => ({}) as { sheet?: { cues?: unknown[] } }), getJson<{ audio?: boolean }>('/api/sounds').catch(() => ({}) as { audio?: boolean })])
      .then(([r, tools]) => { if (live) setSound({ cues: r.sheet?.cues?.length || 0, audio: !!tools.audio }); });
    return () => { live = false; };
  }, [film.name]);

  async function render(e: React.FormEvent) {
    e.preventDefault();
    const req = { film: film.name, preset, size, sound: withSound, wav: withSound && withWav };
    local.set('wav', req.wav ? '1' : '0'); local.set('preset', preset); local.set('size', size);
    setStatus('Starting…');
    const r = await post('/api/render', req);
    setStatus(r.ok ? '' : r.data.error || 'Could not start the render');
    refreshJobs();
  }

  return (
    <Card>
      <form onSubmit={render} aria-labelledby="renderTitle" className="contents">
        <CardHeader><CardTitle id="renderTitle">Render</CardTitle></CardHeader>
        <CardContent className="grid gap-5">
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">Format</legend>
            <RadioGroup value={preset} onValueChange={setPreset} className="grid gap-2">
              {Object.entries(presets).map(([k, p]) => (
                <Label key={k} htmlFor={`preset-${k}`} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal', preset === k && 'border-primary')}>
                  <RadioGroupItem id={`preset-${k}`} value={k} className="mt-0.5" />
                  <span className="grid gap-0.5"><b className="font-semibold">{p.label}</b><span className="text-sm text-muted-foreground">{p.detail}</span></span>
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">Size</legend>
            <ToggleGroup type="single" variant="outline" value={size} onValueChange={(v) => v && setSize(v)} aria-label="Size">
              {Object.entries(sizes).map(([k, s]) => <ToggleGroupItem key={k} value={k} className="px-4">{s.label}</ToggleGroupItem>)}
            </ToggleGroup>
          </fieldset>
          {bg ? <p className="text-sm text-muted-foreground">Renders with this film's parameters: <b className="text-foreground">{cap(String(bg))} background</b>. <a href={`#/film/${encodeURIComponent(film.name)}/edit`}>Change</a></p> : null}
          {sound.cues ? (
            <div className="grid gap-2">
              <Label className="flex items-start gap-2 font-normal">
                <Checkbox checked={withSound && sound.audio} disabled={!sound.audio} onCheckedChange={(v) => setWithSound(!!v)} className="mt-0.5" />
                <span>{sound.audio
                  ? `Sound: include this film's ${sound.cues} sound${sound.cues === 1 ? '' : 's'} in the video (untick for a silent render)`
                  : 'Sound: the audio tool could not be built (it needs the Command Line Tools), so this render will be silent'}</span>
              </Label>
              <Label className="ml-6 flex items-start gap-2 font-normal">
                <Checkbox checked={withWav} disabled={!sound.audio || !withSound} onCheckedChange={(v) => setWithWav(!!v)} className="mt-0.5" />
                <span>Also save the sound on its own, as a WAV beside the video (for an editor)</span>
              </Label>
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={running}>Render</Button>
            <span className="text-sm text-muted-foreground" aria-live="polite">{status}</span>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

/* ── renders: polled once a second while one runs ── */
let polling: ReturnType<typeof setTimeout> | undefined;
async function refreshJobs() {
  const s = useStudio.getState();
  const d = await getJson<{ jobs: Job[] }>('/api/jobs').catch(() => ({ jobs: s.jobs }));
  const wasRunning = s.jobs.some((j) => j.status === 'running'), running = d.jobs.some((j) => j.status === 'running');
  s.setJobs(d.jobs);
  if (wasRunning && !running) await s.load(); // the new files
  clearTimeout(polling);
  if (running) polling = setTimeout(refreshJobs, 1000);
}
function useJobs() {
  const started = useRef(false);
  useEffect(() => { if (!started.current) { started.current = true; refreshJobs(); } }, []);
}

const revealBtn = (file: string) => <Button key="reveal" size="sm" variant="secondary" onClick={() => post('/api/reveal', { file })}>Show in folder</Button>;
const openBtn = (file: string) => <Button key="open" size="sm" variant="secondary" onClick={() => post('/api/open', { file })}>Open</Button>;

function JobsCard() {
  const jobs = useStudio((s) => s.jobs);
  return (
    <Card>
      <CardHeader><CardTitle>Renders</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        {!jobs.length ? <p className="text-muted-foreground">Nothing rendered in this session yet.</p> : [...jobs].reverse().map((j) => (
          <div key={j.id} className="grid gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <b className="truncate font-semibold">{j.file}</b>
              <span className={cn('shrink-0 text-sm', j.status === 'failed' ? 'text-destructive' : j.status === 'done' ? 'text-success' : 'text-muted-foreground')}>
                {j.status === 'running' ? `${j.phase} · ${j.progress || 0}%` : j.status === 'done' ? 'Done' : j.status === 'failed' ? 'Failed' : 'Cancelled'}
              </span>
            </div>
            <Progress value={j.progress || 0} aria-label={`Render of ${j.file}`} />
            <div className="flex gap-2">
              {j.status === 'running' ? <Button size="sm" variant="secondary" onClick={async () => { await post(`/api/jobs/${j.id}/cancel`, {}); refreshJobs(); }}>Cancel</Button> : null}
              {j.status === 'done' ? [revealBtn(j.file), openBtn(j.file)] : null}
            </div>
            {j.status === 'failed' ? <details open><summary className="cursor-pointer text-sm">Output</summary><pre className="mt-2 max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">{j.log.slice(-30).join('\n')}</pre></details> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FilesCard({ film }: { film: Film }) {
  return (
    <Card>
      <CardHeader><CardTitle>Files</CardTitle></CardHeader>
      <CardContent>
        {!film.outputs?.length ? <p className="text-muted-foreground">No files for this film yet. Renders and storyboard images appear here.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Kind</TableHead><TableHead>Size</TableHead><TableHead>Made</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {film.outputs.map((o) => (
                <TableRow key={o.file}>
                  <TableCell className="max-w-56 truncate font-medium">{o.file}</TableCell>
                  <TableCell className="text-muted-foreground">{o.kind}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{fmtBytes(o.bytes)}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{fmtTime(o.modified)}</TableCell>
                  <TableCell className="flex justify-end gap-2">{revealBtn(o.file)}{openBtn(o.file)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
