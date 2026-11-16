import { TabsContent } from '@/components/ui/tabs';
import { usePreviews } from '@/features/preview/preview';
import { TreatmentTab } from '@/features/treatment/TreatmentTab';
import { VibeTab } from '@/features/vibe/VibeTab';
import { ExportTab } from '@/features/export/ExportTab';
import { EditTab } from '@/features/edit/EditTab';
import { useStudio } from '@/lib/store';

/** One film or composition: Vibe (the references its direction comes from), Treatment (the film in words beside the storyboard), Edit and (for a film) Export. Every panel stays mounted, so the
 * previews load once per piece and keep their place when you switch tabs. */
export function Workspace() {
  usePreviews();
  const kind = useStudio((s) => (s.route.view === 'work' ? s.route.kind : null));
  return (
    <main className="min-h-0">
      <TabsContent value="vibe" forceMount className="h-full data-[state=inactive]:hidden">
        <VibeTab />
      </TabsContent>
      <TabsContent value="treatment" forceMount className="h-full data-[state=inactive]:hidden">
        <TreatmentTab />
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
