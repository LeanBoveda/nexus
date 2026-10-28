import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/nexo/login-form';
import { getAuthStatus, getSession, getPasswordSetupSession } from '@/lib/auth';
import { emailReady } from '@/lib/email-login';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  if (await getPasswordSetupSession()) redirect('/crear-contrasena');
  const user = await getSession();
  if (user)
    redirect(
      user.isPlatformAdmin
        ? '/admin'
        : user.role === 'athlete'
          ? user.athleteId
            ? '/mi-entrenamiento'
            : '/mis-profesores'
          : '/',
    );
  const { setupRequired } = await getAuthStatus();
  return (
    <LoginForm
      setupRequired={setupRequired}
      emailEnabled={await emailReady()}
      initialFirstAccess={(await searchParams).first === '1'}
    />
  );
}
