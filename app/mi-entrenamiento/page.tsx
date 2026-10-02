import { redirect } from 'next/navigation';

import { AthletePortal } from '@/components/nexo/athlete-portal';
import { getAthletePortalData } from '@/lib/athlete-portal';
import { requireSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AthletePortalPage() {
  const user = await requireSession();
  if (user.role !== 'athlete') {
    redirect('/deportistas');
  }
  if (!user.athleteId) redirect('/acceso?error=profile');
  const data = await getAthletePortalData(user.athleteId);
  if (!data) redirect('/acceso?error=profile');
  return <AthletePortal data={data} />;
}
