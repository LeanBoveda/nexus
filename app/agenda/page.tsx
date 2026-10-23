import { redirect } from 'next/navigation';
import { AppShell } from '@/components/nexo/app-shell';
import { TrainingOverviewView } from '@/components/nexo/training-overview';
import { requireSession } from '@/lib/auth';
import { getTrainingOverview, addTrainingDays } from '@/lib/training-overview';
import { scheduleDate, validDateKey } from '@/lib/routine-schedule';

export const dynamic = 'force-dynamic';
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireSession();
  if (user.role === 'athlete') redirect('/mi-entrenamiento');
  if (!user.trainerAccountId) redirect('/admin');
  const query = await searchParams;
  const from =
    validDateKey(query.date) &&
    query.date >= '2000-01-01' &&
    query.date <= '2100-01-01'
      ? query.date
      : scheduleDate().dateKey;
  const to = addTrainingDays(from, 6);
  const data = await getTrainingOverview(user.trainerAccountId, from, to);
  return (
    <AppShell active="agenda">
      <TrainingOverviewView mode="agenda" from={from} to={to} data={data} />
    </AppShell>
  );
}
