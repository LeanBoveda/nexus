import { getD1 } from '@/db';
import { getSessionFromRequest, isSameOrigin } from '@/lib/auth';
import { resolveRoutineSession } from '@/lib/athlete-portal';
import { scheduleDate, validDateKey } from '@/lib/routine-schedule';

export const runtime = 'edge';

export async function POST(request: Request) {
  const user = await getSessionFromRequest(request);
  if (!user || user.role !== 'athlete' || !user.athleteId) {
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  }

  let input: {
    instanceId?: string;
    sessionKey?: string;
    completedExerciseIds?: string[];
    pse?: number;
    pain?: number;
    notes?: string;
    completed?: boolean;
    dateKey?: string;
  };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: 'Datos no válidos.' }, { status: 400 });
  }
  if (
    !input ||
    typeof input !== 'object' ||
    (input.completedExerciseIds !== undefined &&
      (!Array.isArray(input.completedExerciseIds) ||
        input.completedExerciseIds.some((id) => typeof id !== 'string')))
  )
    return Response.json({ error: 'Datos no válidos.' }, { status: 400 });
  if (
    (input.completed !== undefined && typeof input.completed !== 'boolean') ||
    (input.completedExerciseIds?.length ?? 0) > 250
  )
    return Response.json(
      { error: 'Datos de progreso no válidos.' },
      { status: 400 },
    );
  const instanceId =
    typeof input.instanceId === 'string' ? input.instanceId.trim() : '';
  const sessionKey =
    typeof input.sessionKey === 'string' ? input.sessionKey.trim() : '';
  const dateKey = input.dateKey ?? scheduleDate().dateKey;
  if (!validDateKey(dateKey) || dateKey > scheduleDate().dateKey)
    return Response.json(
      { error: 'Elegí una fecha válida que no sea futura.' },
      { status: 400 },
    );
  const pse = Number(input.pse);
  const pain = Number(input.pain);
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
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
    .prepare(`SELECT ari.id AS instanceId, ari.overrides, r.name, r.description, rv.content, ra.starts_on AS startsOn
    FROM athlete_routine_instances ari JOIN routine_assignments ra ON ra.id = ari.assignment_id
    JOIN routine_versions rv ON rv.id = ra.routine_version_id JOIN routines r ON r.id = rv.routine_id
    WHERE ari.id = ? AND ari.athlete_id = ? AND (ari.status IN ('scheduled', 'active', 'completed')
      OR (ari.status = 'cancelled' AND ? < COALESCE(ari.ended_on, ?)))
    AND ra.starts_on <= ? AND (ra.ends_on IS NULL OR ra.ends_on >= ?)
    LIMIT 1`)
    .bind(
      instanceId,
      user.athleteId,
      dateKey,
      scheduleDate().dateKey,
      dateKey,
      dateKey,
    )
    .first<{
      instanceId: string;
      overrides: unknown;
      name: string;
      description: string | null;
      content: unknown;
      startsOn: string;
    }>();
  if (!instance) {
    return Response.json(
      { error: 'La rutina ya no está disponible.' },
      { status: 404 },
    );
  }

  const routine = resolveRoutineSession(instance, dateKey);
  if (
    !routine.scheduledToday ||
    sessionKey !== routine.sessionKey ||
    completedExerciseIds.some(
      (id) => !routine.exercises.some((exercise) => exercise.id === id),
    )
  ) {
    return Response.json(
      {
        error:
          'La sesión o sus ejercicios no corresponden al plan asignado para esa fecha.',
      },
      { status: 400 },
    );
  }
  if (
    input.completed &&
    (!routine.exercises.length ||
      completedExerciseIds.length !== routine.exercises.length)
  )
    return Response.json(
      { error: 'Completá todos los ejercicios antes de finalizar.' },
      { status: 400 },
    );
  const completedAt = input.completed
    ? Date.parse(`${dateKey}T12:00:00-03:00`)
    : null;
  const actualValues = JSON.stringify({
    completedExerciseIds,
    legacySessionKey: routine.legacySessionKey,
    legacySessionKeys: routine.legacySessionKeys,
  });

  await db
    .prepare(`INSERT INTO workout_logs
      (id, instance_id, athlete_id, session_key, completed_at, pse, pain, notes,
        actual_values, created_at, entry_key, trained_on, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entry_key) DO UPDATE SET completed_at = excluded.completed_at,
        pse = excluded.pse, pain = excluded.pain, notes = excluded.notes,
        actual_values = excluded.actual_values, updated_at = excluded.updated_at`)
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
      `${instanceId}:${user.athleteId}:${dateKey}:${routine.sessionId}`,
      dateKey,
      Date.now(),
    )
    .run();

  return Response.json({ ok: true, completedAt });
}
