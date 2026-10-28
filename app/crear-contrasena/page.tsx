import { redirect } from 'next/navigation';
import {
  getPasswordSetupSession,
  getSession,
  loginDestination,
} from '@/lib/auth';
import { CreatePassword } from '@/components/nexo/create-password';

export const dynamic = 'force-dynamic';
export default async function Page() {
  const setup = await getPasswordSetupSession();
  if (!setup) {
    const user = await getSession();
    redirect(user ? loginDestination(user) : '/login');
  }
  return <CreatePassword email={setup.email} />;
}
