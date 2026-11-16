import { Chip } from '@/components/Chip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { pageBase, type Comp, type Film } from '@/lib/api';
import { go, useStudio } from '@/lib/store';
import { cn } from '@/lib/utils';

/** Home: the project's films and its shared compositions, each as its live poster frame. */
export function Home() {
  const catalog = useStudio((s) => s.catalog)!;
  const route = useStudio((s) => s.route);
  const rev = useStudio((s) => s.homeRev);
  const lib = route.view === 'home' ? route.lib : 'films';
  return (
    <Tabs value={lib} onValueChange={(v) => go({ view: 'home', lib: v as 'films' | 'comps' })} className="min-h-0 gap-0 overflow-auto">
      <TabsList variant="line" aria-label="Library" className="h-auto w-full justify-start gap-1 rounded-none border-b px-5 pt-2.5 pb-0">
        {(['films', 'comps'] as const).map((l) => (
          <TabsTrigger key={l} value={l} className="h-auto flex-none rounded-none px-4 py-2.5 text-[15px] font-semibold after:bottom-0 after:bg-primary">
            {l === 'films' ? 'Films' : 'Compositions'}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="films" className="px-5 py-5">
        <p className="mb-4 text-muted-foreground">Each film's live poster frame. Open one to review its storyboard, edit it and export.</p>
        {catalog.films.length ? (
          <Tiles>{catalog.films.map((f) => <Tile key={`${f.name}-${rev}`} kind="film" x={f} films={catalog.films} />)}</Tiles>
        ) : (
          <p className="text-muted-foreground">No films yet. Copy <code>films/_template</code> to <code>films/&lt;name&gt;</code> to start one.</p>
        )}
      </TabsContent>
      <TabsContent value="comps" className="px-5 py-5">
        <p className="mb-4 text-muted-foreground">Pieces shared between films. A change here, in its parameters or its code, reaches every film that uses it.</p>
        {catalog.comps.length ? <Tiles>{catalog.comps.map((c) => <Tile key={`${c.name}-${rev}`} kind="comp" x={c} films={catalog.films} />)}</Tiles> : <p className="text-muted-foreground">No compositions yet.</p>}
      </TabsContent>
    </Tabs>
  );
}

const Tiles = ({ children }: { children: React.ReactNode }) => <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-5">{children}</div>;

function Tile({ kind, x, films }: { kind: 'film' | 'comp'; x: Film | Comp; films: Film[] }) {
  const film = kind === 'film' ? (x as Film) : null, comp = kind === 'comp' ? (x as Comp) : null;
  const vertical = film?.orientation === 'vertical';
  const chips = film
    ? [vertical ? 'Vertical 9:16' : 'Landscape 16:9', `${film.duration} s`, film.derivedFrom ? `Cut of ${films.find((f) => f.name === film.derivedFrom)?.title || film.derivedFrom}` : null]
    : [`${comp!.duration} s`, comp!.usedBy.length ? `Used by ${comp!.usedBy.length} film${comp!.usedBy.length > 1 ? 's' : ''}` : 'Not used yet'];
  return (
    <a href={`#/${kind}/${encodeURIComponent(x.name)}/edit`} className={cn('group block overflow-hidden rounded-xl border bg-card text-foreground no-underline hover:border-primary', vertical && 'row-span-2')}>
      <div className={cn('pointer-events-none relative bg-background', vertical ? 'mx-auto aspect-[9/16] max-h-[520px]' : 'aspect-video')}>
        <iframe src={`${pageBase(kind, x.name)}?still&t=${x.poster}&${x.query}`} title={`${x.title} poster frame`} tabIndex={-1} loading="lazy" aria-hidden="true" className="absolute inset-0 size-full border-0" />
      </div>
      <div className="grid gap-2 p-4">
        <b className="group-hover:text-primary">{x.title}</b>
        {comp?.description ? <p className="text-sm text-muted-foreground">{comp.description}</p> : null}
        <div className="flex flex-wrap gap-2">{chips.filter(Boolean).map((c) => <Chip key={c!}>{c}</Chip>)}</div>
      </div>
    </a>
  );
}
