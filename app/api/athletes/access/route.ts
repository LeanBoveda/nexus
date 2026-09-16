import {
  AuthError,
  createAthleteAccessToken,
  getStaffSessionFromRequest,
  isSameOrigin,
} from '@/lib/auth';

export const runtime = 'edge';

export async function POST(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  }

  try {
    const input = await request.json<{ athleteId?: string }>();
    const athleteId = input.athleteId?.trim();
    if (!athleteId) {
      return Response.json({ error: 'Deportista inválido.' }, { status: 400 });
    }
    const token = await createAthleteAccessToken(athleteId, user.id);
    return Response.json({
      url: new URL(`/acceso/${token}`, request.url).toString(),
      expiresInDays: 7,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('[nexo-athlete-access] Could not create access link', error);
    return Response.json(
      { error: 'No pudimos generar el acceso. Intentá nuevamente.' },
      { status: 500 },
    );
  }
}
