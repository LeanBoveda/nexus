export const runtime = 'edge';

// Legacy PF invitations must not bypass first-mail verification or passwords.
export async function GET(request: Request) {
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL('/login?first=1', request.url).toString(),
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });
}
