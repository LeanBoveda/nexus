import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getAthleteContexts } from '@/lib/athlete-identities';
import { AthleteContexts } from '@/components/nexo/athlete-contexts';

export const dynamic = 'force-dynamic';
export default async function Page() {
  const user = await requireSession();
  if (user.role !== 'athlete') redirect('/');
  return (
    <AthleteContexts
      contexts={await getAthleteContexts(user.id, user.scopedAthleteId)}
      activeAthleteId={user.athleteId}
      scoped={Boolean(user.scopedAthleteId)}
    />
  );
}
