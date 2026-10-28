import { env } from 'cloudflare:workers';
import {
  consumeToken,
  emailReady,
  GOOGLE_CALLBACK,
  SITE_ORIGIN,
} from '@/lib/email-login';
import { equalSecret, seal } from '@/lib/email-security';

export async function GET(request: Request) {
  const headers = {
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'set-cookie':
      'nexo_mail_state=; Path=/api/admin/email; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
  };
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get('state') ?? '';
    const cookie =
      request.headers
        .get('cookie')
        ?.split(';')
        .map((x) => x.trim())
        .find((x) => x.startsWith('nexo_mail_state='))
        ?.slice('nexo_mail_state='.length) ?? '';
    if (!state || !cookie || !(await equalSecret(state, cookie)))
      throw new Error('Invalid state');
    const mode = await consumeToken(state, 'oauth');
    const recoverySender = mode.startsWith('recovery:')
      ? mode.slice('recovery:'.length)
      : null;
    if (!['admin', 'bootstrap'].includes(mode) && !recoverySender)
      throw new Error('Invalid mode');
    if (
      recoverySender &&
      recoverySender !== env.GMAIL_SENDER?.trim().toLowerCase()
    )
      throw new Error('Sender changed');
    if (mode === 'bootstrap' && (await emailReady()))
      throw new Error('Already connected');
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.has('error'))
      throw new Error('Consent not granted');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GMAIL_CLIENT_ID!,
        client_secret: env.GMAIL_CLIENT_SECRET!,
        code,
        redirect_uri: GOOGLE_CALLBACK,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('Token exchange failed');
    const tokens = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      scope?: string;
    };
    if (
      !tokens.refresh_token ||
      !tokens.scope
        ?.split(' ')
        .includes('https://www.googleapis.com/auth/gmail.send')
    )
      throw new Error('Missing send authorization');
    const profileResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: { authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!profileResponse.ok) throw new Error('Cannot verify sender');
    const profile = (await profileResponse.json()) as {
      email: string;
      email_verified: boolean;
    };
    if (
      !profile.email_verified ||
      profile.email?.toLowerCase() !== env.GMAIL_SENDER?.toLowerCase()
    )
      throw new Error('Wrong sender');
    const encrypted = await seal(
      tokens.refresh_token,
      env.MAIL_ENCRYPTION_KEY!,
    );
    if (recoverySender) {
      // This is renewal of the existing sender only, never a Nexo login grant.
      const updated = await env.DB.prepare(
        "UPDATE email_integration SET encrypted_refresh_token = ?, updated_at = ? WHERE id = 'gmail' AND lower(sender) = ?",
      )
        .bind(encrypted, Date.now(), recoverySender)
        .run();
      if (!updated.meta.changes)
        throw new Error('Existing sender no longer available');
      return new Response(null, {
        status: 303,
        headers: {
          ...headers,
          location: `${SITE_ORIGIN}/recuperar-correo?connected=1`,
        },
      });
    }
    const sql =
      mode === 'bootstrap'
        ? "INSERT OR IGNORE INTO email_integration (id, sender, encrypted_refresh_token, updated_at) VALUES ('gmail', ?, ?, ?)"
        : "INSERT INTO email_integration (id, sender, encrypted_refresh_token, updated_at) VALUES ('gmail', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET sender = excluded.sender, encrypted_refresh_token = excluded.encrypted_refresh_token, updated_at = excluded.updated_at";
    await env.DB.prepare(sql)
      .bind(profile.email.toLowerCase(), encrypted, Date.now())
      .run();
    return new Response(null, {
      status: 303,
      headers: {
        ...headers,
        location: `${SITE_ORIGIN}/login?emailConnected=1`,
      },
    });
  } catch {
    return new Response(
      'No se pudo conectar Gmail. Autorizá el envío usando nexo.cuenta.oficial@gmail.com e intentá nuevamente desde el enlace de configuración.',
      { status: 400, headers },
    );
  }
}
