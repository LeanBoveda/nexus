import { env } from 'cloudflare:workers';
import { getD1 } from '@/db';
import { getSessionFromRequest } from '@/lib/auth';

export const runtime = 'edge';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionFromRequest(request);
  if (!user?.trainerAccountId)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const { id } = await context.params;
  const file = await getD1()
    .prepare(`SELECT f.storage_key AS storageKey, f.original_name AS name,
    f.mime_type AS mimeType FROM files f JOIN routine_files rf ON rf.file_id = f.id
    JOIN routines r ON r.id = rf.routine_id
    WHERE f.id = ? AND f.trainer_account_id = ? AND r.trainer_account_id = ?
      AND (? != 'athlete' OR EXISTS (
        SELECT 1 FROM athlete_routine_instances ari
        JOIN routine_assignments ra ON ra.id = ari.assignment_id
        JOIN routine_versions rv ON rv.id = ra.routine_version_id
        WHERE rv.routine_id = r.id AND ari.id = ? AND ari.athlete_id = ? AND ari.status != 'cancelled'
      )) LIMIT 1`)
    .bind(
      id,
      user.trainerAccountId,
      user.trainerAccountId,
      user.role,
      new URL(request.url).searchParams.get('instanceId'),
      user.athleteId,
    )
    .first<{ storageKey: string; name: string; mimeType: string }>();
  if (!file)
    return Response.json({ error: 'Archivo no disponible.' }, { status: 404 });
  const object = await env.FILES.get(file.storageKey);
  if (!object)
    return Response.json({ error: 'Archivo no disponible.' }, { status: 404 });
  const filename = Array.from(file.name)
    .filter(
      (character) =>
        character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    )
    .join('');
  return new Response(object.body, {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9._ -]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
