import {
  AuthError,
  getSessionFromRequest,
  selectAthleteContext,
} from '@/lib/auth';
import { getAthleteContexts } from '@/lib/athlete-identities';

export async function GET(request: Request) {
  const user = await getSessionFromRequest(request);
  if (!user || user.role !== 'athlete')
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  return Response.json(
    {
      contexts: await getAthleteContexts(user.id, user.scopedAthleteId),
      activeAthleteId: user.athleteId,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  try {
    const input = (await request.json()) as { athleteId?: unknown };
    if (typeof input.athleteId !== 'string')
      throw new AuthError('Elegí un profesor.');
    await selectAthleteContext(request, input.athleteId);
    return Response.json({ destination: '/mi-entrenamiento' });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AuthError
            ? error.message
            : 'No pudimos cambiar de espacio.',
      },
      { status: error instanceof AuthError ? error.status : 400 },
    );
  }
}
