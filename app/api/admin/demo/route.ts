import { getD1 } from '@/db';
import { getPlatformAdminSessionFromRequest, isSameOrigin } from '@/lib/auth';
import { DEMO_OWNER_EMAIL, prepareAdminDemo } from '@/lib/admin-demo';

export async function POST(request: Request) {
  const admin = await getPlatformAdminSessionFromRequest(request);
  if (!admin || admin.email.trim().toLowerCase() !== DEMO_OWNER_EMAIL)
    return Response.json({ error: 'No autorizado.' }, { status: 403 });
  if (!isSameOrigin(request))
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  try {
    return Response.json(await prepareAdminDemo(getD1(), admin.id), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error('[admin-demo] preparation failed', error);
    return Response.json(
      {
        error:
          error instanceof Error && error.message.includes('cupo')
            ? error.message
            : 'No pudimos preparar la demostración. Reintentá desde el panel.',
      },
      { status: 409 },
    );
  }
}
