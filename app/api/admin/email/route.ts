import { getD1 } from '@/db';
import {
  AuthError,
  getPlatformAdminSessionFromRequest,
  isSameOrigin,
} from '@/lib/auth';
import { emailReady, requestEmailLogin } from '@/lib/email-login';

export const runtime = 'edge';

export async function GET(request: Request) {
  if (!(await getPlatformAdminSessionFromRequest(request)))
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const db = getD1();
  const [configured, events, failures] = await Promise.all([
    emailReady(),
    db
      .prepare(`SELECT id, recipient_hash AS recipientHash, status,
      error_code AS errorCode, created_at AS createdAt
      FROM email_delivery_events ORDER BY created_at DESC LIMIT 20`)
      .all(),
    db
      .prepare(`SELECT COUNT(*) AS count, MAX(created_at) AS lastFailureAt
      FROM email_delivery_events WHERE status = 'failed' AND created_at >= ?`)
      .bind(Date.now() - 86_400_000)
      .first(),
  ]);
  return Response.json(
    { configured, events: events.results, failures },
    {
      headers: { 'cache-control': 'no-store' },
    },
  );
}

export async function POST(request: Request) {
  if (!(await getPlatformAdminSessionFromRequest(request)))
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (!isSameOrigin(request))
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  let input: { email?: unknown };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 });
  const email =
    typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return Response.json(
      { error: 'Ingresá un email válido.' },
      { status: 400 },
    );
  const eligible = await getD1()
    .prepare(`SELECT u.id FROM users u
    JOIN trainer_accounts ta ON ta.id = u.trainer_account_id
    WHERE lower(trim(u.email)) = ? AND u.role != 'athlete'
      AND u.status = 'active' AND ta.access_status = 'active' LIMIT 1`)
    .bind(email)
    .first();
  if (!eligible)
    return Response.json(
      { error: 'El PF no tiene una cuenta habilitada para recibir acceso.' },
      { status: 409 },
    );
  try {
    const result = await requestEmailLogin(
      email,
      request.headers.get('cf-connecting-ip') ?? 'admin',
    );
    if (result.delivery !== 'sent')
      return Response.json(
        {
          error:
            'No pudimos entregar el enlace. Revisá la conexión de Gmail e intentá nuevamente.',
        },
        { status: 502 },
      );
    return Response.json({ ok: true, delivery: 'sent' });
  } catch (error) {
    if (error instanceof AuthError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: 'No pudimos enviar el acceso.' },
      { status: 500 },
    );
  }
}
