import { env } from 'cloudflare:workers';
import { getPlatformAdminSessionFromRequest } from '@/lib/auth';
import { emailReady, GOOGLE_CALLBACK } from '@/lib/email-login';
import { digest, equalSecret, randomSecret } from '@/lib/email-security';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const admin = await getPlatformAdminSessionFromRequest(request);
  const bootstrap = !(await emailReady()) && env.EMAIL_SETUP_TOKEN &&
    await equalSecret(url.searchParams.get('setup') ?? '', env.EMAIL_SETUP_TOKEN);
  if (!admin && !bootstrap) return new Response('No autorizado.', { status: 403 });
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.MAIL_ENCRYPTION_KEY) return new Response('Falta configurar Gmail.', { status: 503 });
  const state = randomSecret();
  await env.DB.prepare('INSERT INTO email_tokens (token_hash, kind, subject, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await digest(state), 'oauth', admin ? 'admin' : 'bootstrap', Date.now() + 10 * 60_000).run();
  const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  google.search = new URLSearchParams({
    client_id: env.GMAIL_CLIENT_ID, redirect_uri: GOOGLE_CALLBACK, response_type: 'code',
    scope: 'openid email https://www.googleapis.com/auth/gmail.send',
    access_type: 'offline', prompt: 'consent', state, login_hint: env.GMAIL_SENDER!,
  }).toString();
  return new Response(null, { status: 302, headers: {
    location: google.toString(), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    'set-cookie': `nexo_mail_state=${state}; Path=/api/admin/email; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  } });
}
