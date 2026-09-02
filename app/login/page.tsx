import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/nexo/login-form';
import { getAuthStatus, getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSession()) redirect('/');
  const { setupRequired } = await getAuthStatus();
  return <LoginForm setupRequired={setupRequired} />;
}
