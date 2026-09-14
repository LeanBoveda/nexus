import { AppShell } from '@/components/nexo/app-shell';
import { AthletesManager } from '@/components/nexo/athletes-manager';

export default function AthletesPage() {
  return (
    <AppShell active="deportistas">
      <AthletesManager />
    </AppShell>
  );
}
