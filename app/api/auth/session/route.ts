import { AuthError, authenticate, createOwner, destroySession, expiredSessionCookie, getAuthStatus, isSameOrigin, sessionCookie } from '@/lib/auth';

export const runtime = 'edge';

export async function GET() {
  return Response.json(await getAuthStatus());
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });

  try {
    const input = await request.json() as {
      action?: 'bootstrap' | 'login';
      name?: string;
      email?: string;
      password?: string;
      activationCode?: string;
    };
    let token: string;

    if (input.action === 'bootstrap') {
      token = await createOwner({
        name: input.name ?? '',
        email: input.email ?? '',
        password: input.password ?? '',
        activationCode: input.activationCode ?? '',
      });
    } else {
      token = await authenticate({
        email: input.email ?? '',
        password: input.password ?? '',
        ip: request.headers.get('cf-connecting-ip') ?? 'local',
      });
    }

    return Response.json({ ok: true }, { headers: { 'set-cookie': sessionCookie(token) } });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: 'No pudimos completar el ingreso. Intentá nuevamente.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  await destroySession(request);
  return Response.json({ ok: true }, { headers: { 'set-cookie': expiredSessionCookie() } });
}
