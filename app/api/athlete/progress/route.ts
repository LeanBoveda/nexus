import { getD1 } from '@/db';
import { getSessionFromRequest, isSameOrigin } from '@/lib/auth';

export const runtime = 'edge';

export async function POST(request: Request) {
  const user = await getSessionFromRequest(request);
  if (!user || user.role !== 'athlete' || !user.athleteId) {
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  }

  const input = await request.json<{
    instanceId?: string;
    sessionKey?: string;
    completedExerciseIds?: string[];
    pse?: number;
    pain?: number;
    notes?: string;
    completed?: boolean;
  }>();
  const instanceId = input.instanceId?.trim();
  const sessionKey = input.sessionKey?.trim();
  const pse = Number(input.pse);
  const pain = Number(input.pain);
  const notes = input.notes?.trim() ?? '';
  const completedExerciseIds = [
    ...new Set((input.completedExerciseIds ?? []).map(String)),
  ].slice(0, 250);

  if (!instanceId || !sessionKey || sessionKey.length > 160) {
    return Response.json({ error: 'La sesión no es válida.' }, { status: 400 });
  }
  if (!Number.isFinite(pse) || pse < 0 || pse > 10) {
    return Response.json(
      { error: 'El PSE debe estar entre 0 y 10.' },
      { status: 400 },
    );
  }
  if (!Number.isFinite(pain) || pain < 0 || pain > 10) {
    return Response.json(
      { error: 'El dolor debe estar entre 0 y 10.' },
      { status: 400 },
    );
  }
  if (notes.length > 800) {
    return Response.json(
      { error: 'El comentario es demasiado largo.' },
      { status: 400 },
    );
  }

  const db = getD1();
  const instance = await db
    .prepare(`SELECT id FROM athlete_routine_instances
    WHERE id = ? AND athlete_id = ? AND status IN ('scheduled', 'active', 'completed')
    LIMIT 1`)
    .bind(instanceId, user.athleteId)
    .first();
  if (!instance) {
    return Response.json(
      { error: 'La rutina ya no está disponible.' },
      { status: 404 },
    );
  }

  const existing = await db
    .prepare(`SELECT id FROM workout_logs
    WHERE instance_id = ? AND athlete_id = ? AND session_key = ? LIMIT 1`)
    .bind(instanceId, user.athleteId, sessionKey)
    .first<{ id: string }>();
  const completedAt = input.completed ? Date.now() : null;
  const actualValues = JSON.stringify({ completedExerciseIds });

  if (existing) {
    await db
      .prepare(`UPDATE workout_logs SET completed_at = ?, pse = ?, pain = ?,
      notes = ?, actual_values = ? WHERE id = ? AND athlete_id = ?`)
      .bind(
        completedAt,
        pse,
        pain,
        notes || null,
        actualValues,
        existing.id,
        user.athleteId,
      )
      .run();
  } else {
    await db
      .prepare(`INSERT INTO workout_logs
      (id, instance_id, athlete_id, session_key, completed_at, pse, pain, notes,
        actual_values, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        instanceId,
        user.athleteId,
        sessionKey,
        completedAt,
        pse,
        pain,
        notes || null,
        actualValues,
        Date.now(),
      )
      .run();
  }

  return Response.json({ ok: true, completedAt });
}
