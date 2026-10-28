import { redirect } from 'next/navigation';
import { AppShell } from '@/components/nexo/app-shell';
import { TrainingOverviewView } from '@/components/nexo/training-overview';
import { requireSession } from '@/lib/auth';
import { getTrainingOverview, overviewRange } from '@/lib/training-overview';
import { getD1 } from '@/db';

export const dynamic = 'force-dynamic';
export default async function LoadPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    athlete?: string;
    group?: string;
  }>;
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
  const groups = await getD1()
    .prepare(`SELECT g.id, g.name, o.name AS organizationName FROM groups g
    JOIN organizations o ON o.id = g.organization_id
    WHERE g.active = 1 AND o.trainer_account_id = ? ORDER BY g.name, o.name`)
    .bind(user.trainerAccountId)
    .all<{ id: string; name: string; organizationName: string }>();
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
        groupId={query.group}
        groups={groups.results}
      />
    </AppShell>
  );
}
