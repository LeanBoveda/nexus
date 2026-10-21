import { env } from 'cloudflare:workers';
import { AuthError, createSession } from '@/lib/auth';
import { digest, randomSecret, unseal } from '@/lib/email-security';

export const SITE_ORIGIN = 'https://nexo-rendimiento.cuentagpt050.chatgpt.site';
export const ADMIN_EMAIL = 'leandroboveda@gmail.com';
export const GOOGLE_CALLBACK = `${SITE_ORIGIN}/api/admin/email/callback`;

export async function emailReady() {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.MAIL_ENCRYPTION_KEY) return false;
  return Boolean(await env.DB.prepare("SELECT id FROM email_integration WHERE id = 'gmail'").first());
}

export async function consumeToken(token: string, kind: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AuthError('El enlace no es válido.', 401);
  const now = Date.now();
  const row = await env.DB.prepare(`UPDATE email_tokens SET used_at = ?
    WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ? RETURNING subject`)
    .bind(now, await digest(token), kind, now).first<{ subject: string }>();
  if (!row) throw new AuthError('El enlace venció o ya fue utilizado. Solicitá uno nuevo.', 401);
  return row.subject;
}

export async function limitEmailRequest(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const row = await env.DB.prepare(`INSERT INTO email_rate_limits (key, count, reset_at)
    VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET
    count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
    reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END RETURNING count`)
    .bind(await digest(key), now + windowMs, now, now).first<{ count: number }>();
  if (!row || row.count > max) throw new AuthError('Esperá unos minutos antes de solicitar otro enlace.', 429);
}

async function eligibleUser(email: string) {
  let user = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(email).first<{ id: string }>();
  // Only the explicitly designated platform owner can bootstrap an admin identity.
  if (!user && email === ADMIN_EMAIL) {
    await env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, name, role, status, is_platform_admin, created_at)
      VALUES (?, ?, 'Administrador Nexo', 'coach', 'active', 1, ?)`).bind(crypto.randomUUID(), email, Date.now()).run();
    user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  }
  if (!user) {
    const athletes = await env.DB.prepare(`SELECT a.id, a.trainer_account_id AS accountId, a.first_name AS name
      FROM athletes a JOIN trainer_accounts ta ON ta.id = a.trainer_account_id
      WHERE lower(trim(a.email)) = ? AND a.status = 'active' AND ta.access_status = 'active' LIMIT 2`)
      .bind(email).all<{ id: string; accountId: string; name: string }>();
    if (athletes.results.length !== 1) return null;
    const athlete = athletes.results[0];
    // Do not silently rebind an existing athlete's identity to a changed email.
    if (await env.DB.prepare('SELECT id FROM users WHERE athlete_id = ?').bind(athlete.id).first()) return null;
    await env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, name, role, status, athlete_id, trainer_account_id, created_at)
      VALUES (?, ?, ?, 'athlete', 'active', ?, ?, ?)`).bind(crypto.randomUUID(), email, athlete.name, athlete.id, athlete.accountId, Date.now()).run();
    user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  }
  return user ? activeIdentity(user.id, email) : null;
}

async function activeIdentity(id: string, email: string) {
  return env.DB.prepare(`SELECT u.id, u.role, u.email FROM users u
    LEFT JOIN trainer_accounts ta ON ta.id = u.trainer_account_id
    LEFT JOIN athletes a ON a.id = u.athlete_id
    WHERE u.id = ? AND lower(u.email) = ? AND u.status = 'active'
      AND ((u.trainer_account_id IS NOT NULL AND ta.access_status = 'active') OR (u.email = ? AND u.role != 'athlete'))
      AND (u.role != 'athlete' OR (a.status = 'active' AND a.trainer_account_id = u.trainer_account_id AND lower(trim(a.email)) = lower(u.email)))`)
    .bind(id, email, ADMIN_EMAIL).first<{ id: string; role: string; email: string }>();
}

export async function requestEmailLogin(emailInput: unknown, ip: string) {
  if (!(await emailReady())) throw new AuthError('El acceso por email todavía no está habilitado.', 503);
  if (typeof emailInput !== 'string' || emailInput.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim())) throw new AuthError('Ingresá un email válido.');
  const email = emailInput.trim().toLowerCase();
  await limitEmailRequest(`ip:${ip}`, 15, 15 * 60_000);
  await limitEmailRequest(`email:${email}`, 3, 15 * 60_000);
  const user = await eligibleUser(email);
  if (!user) return;
  const token = randomSecret();
  const hash = await digest(token);
  await env.DB.prepare('INSERT INTO email_tokens (token_hash, kind, subject, expires_at) VALUES (?, ?, ?, ?)')
    .bind(hash, 'login', JSON.stringify({ id: user.id, email }), Date.now() + 15 * 60_000).run();
  try {
    await sendLoginEmail(email, `${SITE_ORIGIN}/acceso-email#token=${token}`);
  } catch {
    await env.DB.prepare('DELETE FROM email_tokens WHERE token_hash = ?').bind(hash).run();
    // Keep the public response identical for existing and unknown identities.
    console.error('[email-login] Delivery failed; check Gmail authorization');
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM email_tokens WHERE expires_at < ?').bind(Date.now() - 86_400_000),
    env.DB.prepare('DELETE FROM email_rate_limits WHERE reset_at < ?').bind(Date.now() - 86_400_000),
  ]);
}

export async function redeemEmailLogin(token: string) {
  const subject = JSON.parse(await consumeToken(token, 'login')) as { id: string; email: string };
  const user = await activeIdentity(subject.id, subject.email);
  if (!user) throw new AuthError('Tu cuenta no está habilitada. Contactá a tu PF o al administrador.', 403);
  return { token: await createSession(user.id), destination: user.email === ADMIN_EMAIL && user.role !== 'athlete' ? '/admin' : user.role === 'athlete' ? '/mi-entrenamiento' : '/' };
}

async function sendLoginEmail(to: string, url: string) {
  const integration = await env.DB.prepare("SELECT encrypted_refresh_token AS token, sender FROM email_integration WHERE id = 'gmail'")
    .first<{ token: string; sender: string }>();
  if (!integration) throw new Error('Email not configured');
  const auth = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID!, client_secret: env.GMAIL_CLIENT_SECRET!, refresh_token: await unseal(integration.token, env.MAIL_ENCRYPTION_KEY!), grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!auth.ok) throw new Error('Gmail authorization failed');
  const data = await auth.json() as { access_token: string };
  const body = `Entrá a Nexo usando este enlace:\r\n\r\n${url}\r\n\r\nVence en 15 minutos y se puede usar una sola vez.\r\nSi no solicitaste este correo, ignoralo. No compartas el enlace.`;
  const mime = [`From: Nexo <${integration.sender}>`, `To: ${to}`, 'Subject: Tu enlace de acceso a Nexo', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', btoa(String.fromCharCode(...new TextEncoder().encode(body)))].join('\r\n');
  const raw = btoa(mime).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const sent = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { authorization: `Bearer ${data.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw }), signal: AbortSignal.timeout(15_000),
  });
  if (!sent.ok) throw new Error('Gmail delivery failed');
}
