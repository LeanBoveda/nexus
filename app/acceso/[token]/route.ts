import { AuthError, redeemAthleteAccessToken, sessionCookie } from '@/lib/auth';

export const runtime = 'edge';

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const sessionToken = await redeemAthleteAccessToken(token);
    return new Response(null, {
      status: 303,
      headers: {
        location: new URL('/mi-entrenamiento', request.url).toString(),
        'set-cookie': sessionCookie(sessionToken),
      },
    });
  } catch (error) {
    if (!(error instanceof AuthError)) {
      console.error(
        '[nexo-athlete-access] Could not redeem access link',
        error,
      );
    }
    return Response.redirect(
      new URL('/acceso?error=invalid', request.url),
      303,
    );
  }
}
