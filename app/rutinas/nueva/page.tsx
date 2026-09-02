import { AppShell } from '@/components/nexo/app-shell';
import { RoutineEditor } from '@/components/nexo/routine-editor';

export default function NewRoutinePage() {
  return <AppShell active="rutinas"><RoutineEditor /></AppShell>;
}
