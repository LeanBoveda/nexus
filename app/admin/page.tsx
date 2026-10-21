import { BusinessAdmin } from '@/components/nexo/business-admin';
import { requirePlatformAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await requirePlatformAdmin();
  return <BusinessAdmin userName={user.name} />;
}
