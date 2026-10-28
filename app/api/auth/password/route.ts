import { AuthError, configureFirstPassword, sessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  const headers = { 'cache-control': 'no-store' };
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json(
      { error: 'Solicitud no permitida.' },
      { status: 403, headers },
    );
  try {
    if (Number(request.headers.get('content-length')) > 4096)
      return Response.json(
        { error: 'Solicitud demasiado grande.' },
        { status: 413, headers },
      );
    const input = (await request.json()) as {
      password?: unknown;
      confirmation?: unknown;
    };
    const result = await configureFirstPassword(
      request,
      input.password,
      input.confirmation,
    );
    return Response.json(
      { destination: result.destination },
      { headers: { ...headers, 'set-cookie': sessionCookie(result.token) } },
    );
  } catch (error) {
    if (error instanceof AuthError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      );
    return Response.json(
      { error: 'No pudimos guardar la contraseña. Reintentá.' },
      { status: 500, headers },
    );
  }
}
