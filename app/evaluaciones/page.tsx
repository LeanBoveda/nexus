import { AppShell } from '@/components/nexo/app-shell';
import { EvaluationDashboard } from '@/components/nexo/evaluation-dashboard';

export default function EvaluationsPage() {
  return <AppShell active="evaluaciones"><div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-7 lg:px-9 lg:py-8"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Rendimiento</p><h1 className="mt-1 text-2xl font-bold tracking-[-0.04em] sm:text-[28px]">Evaluaciones</h1><p className="mt-1 text-sm text-muted-foreground">Medí la evolución individual y cargá una jornada completa desde una sola grilla.</p></div><EvaluationDashboard /></div></AppShell>;
}
