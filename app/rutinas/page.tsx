import { AppShell } from '@/components/nexo/app-shell';
import { RoutinesManager } from '@/components/nexo/routines-manager';

export default function RoutinesPage() {
  return (
    <AppShell active="rutinas">
      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
        <RoutinesManager />
      </div>
    </AppShell>
  );
}
