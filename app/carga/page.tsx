import { redirect } from 'next/navigation';
import { AppShell } from '@/components/nexo/app-shell';
import { TrainingOverviewView } from '@/components/nexo/training-overview';
import { requireSession } from '@/lib/auth';
import { getTrainingOverview, overviewRange } from '@/lib/training-overview';

export const dynamic = 'force-dynamic';
export default async function LoadPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; athlete?: string }>;
}) {
  const user = await requireSession();
  if (user.role === 'athlete') redirect('/mi-entrenamiento');
  if (!user.trainerAccountId) redirect('/admin');
  const query = await searchParams;
  const range = overviewRange(query.from, query.to);
  const data = await getTrainingOverview(
    user.trainerAccountId,
    range.from,
    range.to,
  );
  const athlete = data.assignments.some(
    (item) => item.athleteId === query.athlete,
  )
    ? query.athlete
    : undefined;
  return (
    <AppShell active="carga">
      <TrainingOverviewView
        mode="carga"
        from={range.from}
        to={range.to}
        data={data}
        athleteId={athlete}
      />
    </AppShell>
  );
}
