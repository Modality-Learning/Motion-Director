import { TabsContent } from '@/components/ui/tabs';
import { usePreviews } from '@/features/preview/preview';
import { BriefTab } from '@/features/brief/BriefTab';
import { ExportTab } from '@/features/export/ExportTab';
import { EditTab } from '@/features/edit/EditTab';
import { useStudio } from '@/lib/store';

/** One film or composition: Brief (the brief and the storyboard), Edit and (for a film) Export. Every panel stays mounted, so the
 * previews load once per piece and keep their place when you switch tabs. */
export function Workspace() {
  usePreviews();
  const kind = useStudio((s) => (s.route.view === 'work' ? s.route.kind : null));
  return (
    <main className="min-h-0">
      <TabsContent value="brief" forceMount className="h-full data-[state=inactive]:hidden">
        <BriefTab />
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
