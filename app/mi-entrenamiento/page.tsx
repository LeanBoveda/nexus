import { redirect } from 'next/navigation';

import { AthletePortal } from '@/components/nexo/athlete-portal';
import { getAthletePortalData } from '@/lib/athlete-portal';
import { requireSession } from '@/lib/auth';
import { scheduleDate, validDateKey } from '@/lib/routine-schedule';

export const dynamic = 'force-dynamic';

export default async function AthletePortalPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; instance?: string }>;
}) {
  const user = await requireSession();
  if (user.role !== 'athlete') {
    redirect('/deportistas');
  }
  if (!user.athleteId) redirect('/mis-profesores');
  const query = await searchParams;
  if (
    query.date !== undefined &&
    (!validDateKey(query.date) || query.date > scheduleDate().dateKey)
  )
    redirect('/mi-entrenamiento');
  const data = await getAthletePortalData(user.athleteId, {
    dateKey: query.date,
    instanceId: query.instance,
  });
  if (!data) redirect('/acceso?error=profile');
  return (
    <AthletePortal
      key={`${data.dateKey}:${data.routine?.instanceId}`}
      data={data}
    />
  );
}
