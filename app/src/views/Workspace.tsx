import { ScrollArea } from '@/components/ui/scroll-area';
import { TabsContent } from '@/components/ui/tabs';
import { ParamsPanel } from '@/features/params/ParamsPanel';
import { PreviewFrame, usePreviews } from '@/features/preview/preview';
import { ExportTab } from '@/features/export/ExportTab';
import { EditTab } from '@/features/edit/EditTab';
import { useStudio } from '@/lib/store';

/** One film or composition: Storyboard, Edit and (for a film) Export. Every panel stays mounted, so the
 * previews load once per piece and keep their place when you switch tabs. */
export function Workspace() {
  usePreviews();
  const kind = useStudio((s) => (s.route.view === 'work' ? s.route.kind : null));
  return (
    <main className="min-h-0">
      <TabsContent value="storyboard" forceMount className="h-full data-[state=inactive]:hidden">
        <div className="grid h-full grid-cols-[minmax(0,1fr)_340px]">
          <PreviewFrame tab="storyboard" title="Storyboard" className="min-h-[480px]" />
          <ScrollArea className="min-h-0 border-l [&_[data-slot=scroll-area-viewport]>div]:block!"><div className="p-4"><ParamsPanel tab="storyboard" /></div></ScrollArea>
        </div>
      </TabsContent>
      <TabsContent value="edit" forceMount className="h-full data-[state=inactive]:hidden">
        <EditTab />
      </TabsContent>
      {kind === 'film' ? (
        <TabsContent value="export" forceMount className="h-full overflow-auto data-[state=inactive]:hidden">
          <ExportTab />
        </TabsContent>
      ) : null}
    </main>
  );
}
