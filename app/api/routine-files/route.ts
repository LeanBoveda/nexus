import { env } from 'cloudflare:workers';
import { getD1 } from '@/db';
import { getSessionFromRequest, isSameOrigin } from '@/lib/auth';

export const runtime = 'edge';
const MAX_BYTES = 10 * 1024 * 1024;
const MIME_TYPES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  tsv: ['text/tab-separated-values', 'text/plain'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
};

export async function GET(request: Request) {
  const user = await getSessionFromRequest(request);
  if (!user?.trainerAccountId)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const db = getD1();
  const params = new URL(request.url).searchParams;
  let routineId = params.get('routineId');
  if (user.role === 'athlete') {
    const instanceId = params.get('instanceId');
    if (!instanceId || !user.athleteId)
      return Response.json({ error: 'Rutina no disponible.' }, { status: 404 });
    const instance = await db
      .prepare(`SELECT r.id FROM athlete_routine_instances ari
      JOIN routine_assignments ra ON ra.id = ari.assignment_id
      JOIN routine_versions rv ON rv.id = ra.routine_version_id
      JOIN routines r ON r.id = rv.routine_id
      WHERE ari.id = ? AND ari.athlete_id = ? AND ari.status != 'cancelled' AND r.trainer_account_id = ?`)
      .bind(instanceId, user.athleteId, user.trainerAccountId)
      .first<{ id: string }>();
    if (!instance)
      return Response.json({ error: 'Rutina no disponible.' }, { status: 404 });
    routineId = instance.id;
  }
  if (!routineId)
    return Response.json({ error: 'Indicá una rutina.' }, { status: 400 });
  const routine = await db
    .prepare('SELECT id FROM routines WHERE id = ? AND trainer_account_id = ?')
    .bind(routineId, user.trainerAccountId)
    .first();
  if (!routine)
    return Response.json({ error: 'Rutina no disponible.' }, { status: 404 });
  const files = await db
    .prepare(`SELECT f.id, f.original_name AS name, f.mime_type AS mimeType,
    f.size_bytes AS sizeBytes, f.created_at AS createdAt FROM routine_files rf
    JOIN files f ON f.id = rf.file_id WHERE rf.routine_id = ? AND f.trainer_account_id = ? ORDER BY f.created_at DESC`)
    .bind(routineId, user.trainerAccountId)
    .all();
  return Response.json(
    { files: files.results },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function POST(request: Request) {
  const user = await getSessionFromRequest(request);
  if (!user?.trainerAccountId || user.role === 'athlete')
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (!isSameOrigin(request))
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  const length = Number(request.headers.get('content-length'));
  if (length > MAX_BYTES + 65536)
    return Response.json(
      { error: 'El archivo supera los 10 MB.' },
      { status: 413 },
    );
  let form: FormData;
  let bytes = 0;
  try {
    if (!request.body) throw new Error('empty');
    const limited = request.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > MAX_BYTES + 65536) throw new Error('too-large');
          controller.enqueue(chunk);
        },
      }),
    );
    form = await new Response(limited, {
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    }).formData();
  } catch {
    return Response.json(
      {
        error:
          bytes > MAX_BYTES + 65536
            ? 'El archivo supera los 10 MB.'
            : 'Archivo inválido.',
      },
      { status: bytes > MAX_BYTES + 65536 ? 413 : 400 },
    );
  }
  const routineId = form.get('routineId');
  const file = form.get('file');
  if (typeof routineId !== 'string' || !(file instanceof File) || !file.size)
    return Response.json(
      { error: 'Seleccioná una rutina y un archivo.' },
      { status: 400 },
    );
  if (file.size > MAX_BYTES)
    return Response.json(
      { error: 'El archivo supera los 10 MB.' },
      { status: 413 },
    );
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!MIME_TYPES[extension]?.includes(file.type.toLowerCase()))
    return Response.json(
      { error: 'Formato no permitido. Usá PDF, XLSX, CSV, TSV, PNG o JPEG.' },
      { status: 400 },
    );
  const db = getD1();
  const routine = await db
    .prepare('SELECT id FROM routines WHERE id = ? AND trainer_account_id = ?')
    .bind(routineId, user.trainerAccountId)
    .first();
  if (!routine)
    return Response.json({ error: 'Rutina no disponible.' }, { status: 404 });
  const id = crypto.randomUUID();
  const storageKey = `routine-files/${user.trainerAccountId}/${id}.${extension}`;
  const name =
    Array.from(file.name)
      .filter(
        (character) =>
          character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      )
      .join('')
      .split(/[\\/]/)
      .pop()
      ?.slice(0, 200) || `archivo.${extension}`;
  let stored = false;
  try {
    await env.FILES.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    stored = true;
    await db.batch([
      db
        .prepare(`INSERT INTO files (id, trainer_account_id, storage_key, original_name, mime_type, size_bytes, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          id,
          user.trainerAccountId,
          storageKey,
          name,
          file.type,
          file.size,
          user.id,
          Date.now(),
        ),
      db
        .prepare(`INSERT INTO routine_files (routine_id, file_id) VALUES (
        CASE WHEN EXISTS (SELECT 1 FROM routines WHERE id = ? AND trainer_account_id = ?) THEN ? ELSE NULL END, ?)`)
        .bind(routineId, user.trainerAccountId, routineId, id),
    ]);
  } catch {
    if (stored) await env.FILES.delete(storageKey).catch(() => {});
    return Response.json(
      { error: 'No pudimos guardar el archivo. Intentá nuevamente.' },
      { status: 500 },
    );
  }
  return Response.json(
    { file: { id, name, mimeType: file.type, sizeBytes: file.size } },
    { status: 201 },
  );
}
