import { AuthError, sessionCookie } from '@/lib/auth';
import { redeemEmailLogin, requestEmailLogin } from '@/lib/email-login';

export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Solicitud no permitida.' }, { status: 403, headers });
  try {
    if (Number(request.headers.get('content-length')) > 4096) throw new AuthError('Solicitud demasiado grande.', 413);
    const input = await request.json() as { action?: string; email?: unknown; token?: unknown };
    if (input.action === 'redeem') {
      if (typeof input.token !== 'string') throw new AuthError('Enlace inválido.');
      const session = await redeemEmailLogin(input.token);
      return Response.json({ destination: session.destination }, { headers: { ...headers, 'set-cookie': sessionCookie(session.token) } });
    }
    await requestEmailLogin(input.email, request.headers.get('cf-connecting-ip') ?? 'unknown');
    return Response.json({ message: 'Si tu correo tiene una cuenta habilitada, recibirás un enlace para ingresar. Revisá también spam.' }, { headers });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status, headers });
    return Response.json({ error: 'No pudimos procesar la solicitud. Intentá nuevamente.' }, { status: 503, headers });
  }
}
