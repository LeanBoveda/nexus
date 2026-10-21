import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/nexo/login-form';
import { getAuthStatus, getSession } from '@/lib/auth';
import { emailReady } from '@/lib/email-login';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getSession();
  if (user) redirect(user.isPlatformAdmin ? '/admin' : user.role === 'athlete' ? '/mi-entrenamiento' : '/');
  const { setupRequired } = await getAuthStatus();
  return <LoginForm setupRequired={setupRequired} emailEnabled={await emailReady()} />;
}
