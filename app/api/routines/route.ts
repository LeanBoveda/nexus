import { getD1 } from '@/db';
import { getStaffSessionFromRequest, isSameOrigin } from '@/lib/auth';

export const runtime = 'edge';

type RoutineContent = {
  sessionName?: unknown;
  warmup?: unknown;
  instructions?: unknown;
  weeklyGoal?: unknown;
  activeWeek?: unknown;
  weekPlans?: unknown;
  rows?: unknown;
};

type RoutineAction = {
  action?: 'save' | 'assign' | 'archive';
  routineId?: string;
  name?: string;
  description?: string;
  content?: RoutineContent;
  targetType?: 'group' | 'athlete';
  targetId?: string;
  startsOn?: string;
  endsOn?: string | null;
};

export async function GET(request: Request) {
  if (!(await getStaffSessionFromRequest(request))) {
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const db = getD1();
  const routineId = new URL(request.url).searchParams.get('id');

  try {
    if (routineId) {
      const routine = await db
        .prepare(
          `SELECT r.id, r.name, r.description, r.status, r.created_at AS createdAt,
          rv.id AS versionId, rv.version_number AS versionNumber, rv.content
          FROM routines r
          JOIN routine_versions rv ON rv.id = (
            SELECT latest.id FROM routine_versions latest
            WHERE latest.routine_id = r.id
            ORDER BY latest.version_number DESC LIMIT 1
          )
          WHERE r.id = ? AND r.status != 'archived' LIMIT 1`,
        )
        .bind(routineId)
        .first();
      if (!routine) {
        return Response.json({ error: 'La rutina no existe.' }, { status: 404 });
      }
      return Response.json({ routine: normalizeRoutine(routine) });
    }

    const result = await db
      .prepare(
        `SELECT r.id, r.name, r.description, r.status, r.created_at AS createdAt,
        rv.id AS versionId, rv.version_number AS versionNumber, rv.content,
        (SELECT COUNT(*) FROM routine_assignments ra
          WHERE ra.routine_version_id IN (
            SELECT id FROM routine_versions WHERE routine_id = r.id
          )
          AND (ra.ends_on IS NULL OR ra.ends_on >= date('now'))) AS assignmentCount,
        (SELECT COUNT(DISTINCT ari.athlete_id)
          FROM athlete_routine_instances ari
          JOIN routine_assignments ra ON ra.id = ari.assignment_id
          WHERE ra.routine_version_id IN (
            SELECT id FROM routine_versions WHERE routine_id = r.id
          ) AND ari.status IN ('scheduled', 'active')) AS athleteCount
        FROM routines r
        JOIN routine_versions rv ON rv.id = (
          SELECT latest.id FROM routine_versions latest
          WHERE latest.routine_id = r.id
          ORDER BY latest.version_number DESC LIMIT 1
        )
        WHERE r.status != 'archived'
        ORDER BY r.created_at DESC`,
      )
      .all();

    const assignments = await db
      .prepare(
        `SELECT r.id AS routineId, ra.target_type AS targetType, ra.target_id AS targetId,
        ra.starts_on AS startsOn, ra.ends_on AS endsOn,
        CASE WHEN ra.target_type = 'group' THEN g.name
          ELSE trim(a.first_name || ' ' || a.last_name) END AS targetName
        FROM routine_assignments ra
        JOIN routine_versions rv ON rv.id = ra.routine_version_id
        JOIN routines r ON r.id = rv.routine_id
        LEFT JOIN groups g ON ra.target_type = 'group' AND g.id = ra.target_id
        LEFT JOIN athletes a ON ra.target_type = 'athlete' AND a.id = ra.target_id
        WHERE r.status != 'archived'
          AND (ra.ends_on IS NULL OR ra.ends_on >= date('now'))
        ORDER BY ra.created_at DESC`,
      )
      .all<{
        routineId: string;
        targetType: 'group' | 'athlete';
        targetId: string;
        targetName: string | null;
        startsOn: string;
        endsOn: string | null;
      }>();

    const targetsByRoutine = new Map<string, typeof assignments.results>();
    for (const assignment of assignments.results) {
      const current = targetsByRoutine.get(assignment.routineId) ?? [];
      current.push(assignment);
      targetsByRoutine.set(assignment.routineId, current);
    }

    return Response.json({
      routines: result.results.map((row) => ({
        ...normalizeRoutine(row),
        targets: targetsByRoutine.get(String(row.id)) ?? [],
      })),
    });
  } catch (error) {
    console.error('[nexo-routines] Read failed', { routineId, error });
    return Response.json(
      { error: 'No pudimos cargar las rutinas.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  }

  const input = (await request.json()) as RoutineAction;
  const db = getD1();

  try {
    if (input.action === 'save') {
      const name = input.name?.trim();
      const content = validateContent(input.content);
      if (!name || !content) {
        return Response.json(
          { error: 'Completá el nombre, las semanas y al menos un ejercicio.' },
          { status: 400 },
        );
      }

      const routineId = input.routineId || crypto.randomUUID();
      let nextVersion = 1;
      const statements: D1PreparedStatement[] = [];

      if (input.routineId) {
        const existing = await db
          .prepare(
            `SELECT r.id, COALESCE(MAX(rv.version_number), 0) AS versionNumber
            FROM routines r LEFT JOIN routine_versions rv ON rv.routine_id = r.id
            WHERE r.id = ? AND r.status != 'archived' GROUP BY r.id`,
          )
          .bind(input.routineId)
          .first<{ id: string; versionNumber: number }>();
        if (!existing) {
          return Response.json({ error: 'La rutina no existe.' }, { status: 404 });
        }
        nextVersion = Number(existing.versionNumber) + 1;
        statements.push(
          db
            .prepare(
              `UPDATE routines SET name = ?, description = ?, status = 'published'
              WHERE id = ?`,
            )
            .bind(name, input.description?.trim() || null, routineId),
        );
      } else {
        statements.push(
          db
            .prepare(
              `INSERT INTO routines
              (id, organization_id, name, description, status, created_by, created_at)
              VALUES (?, NULL, ?, ?, 'published', ?, ?)`,
            )
            .bind(
              routineId,
              name,
              input.description?.trim() || null,
              user.id,
              Date.now(),
            ),
        );
      }

      const versionId = crypto.randomUUID();
      statements.push(
        db
          .prepare(
            `INSERT INTO routine_versions
            (id, routine_id, version_number, content, source_file_id, created_at)
            VALUES (?, ?, ?, ?, NULL, ?)`,
          )
          .bind(
            versionId,
            routineId,
            nextVersion,
            JSON.stringify(content),
            Date.now(),
          ),
      );
      if (input.routineId) {
        statements.push(
          db
            .prepare(
              `UPDATE routine_assignments SET routine_version_id = ?
              WHERE id IN (
                SELECT ra.id FROM routine_assignments ra
                JOIN routine_versions previous ON previous.id = ra.routine_version_id
                WHERE previous.routine_id = ?
                  AND (ra.ends_on IS NULL OR ra.ends_on >= date('now'))
              )`,
            )
            .bind(versionId, routineId),
        );
      }
      await db.batch(statements);

      return Response.json(
        { ok: true, routineId, versionId, versionNumber: nextVersion },
        { status: input.routineId ? 200 : 201 },
      );
    }

    if (input.action === 'assign') {
      if (
        !input.routineId ||
        !input.targetId ||
        !['group', 'athlete'].includes(input.targetType ?? '') ||
        !validDate(input.startsOn) ||
        (input.endsOn && !validDate(input.endsOn))
      ) {
        return Response.json(
          { error: 'Completá el destinatario y las fechas de la asignación.' },
          { status: 400 },
        );
      }
      if (input.endsOn && input.endsOn < input.startsOn!) {
        return Response.json(
          { error: 'La fecha de finalización debe ser posterior al inicio.' },
          { status: 400 },
        );
      }

      const version = await db
        .prepare(
          `SELECT rv.id FROM routine_versions rv JOIN routines r ON r.id = rv.routine_id
          WHERE r.id = ? AND r.status != 'archived'
          ORDER BY rv.version_number DESC LIMIT 1`,
        )
        .bind(input.routineId)
        .first<{ id: string }>();
      if (!version) {
        return Response.json({ error: 'Primero guardá la rutina.' }, { status: 404 });
      }

      const athleteIds = await resolveAthletes(
        db,
        input.targetType!,
        input.targetId,
      );
      if (athleteIds.length === 0) {
        return Response.json(
          {
            error:
              input.targetType === 'group'
                ? 'El grupo no tiene deportistas activos.'
                : 'El deportista no está disponible.',
          },
          { status: 400 },
        );
      }

      const assignmentId = crypto.randomUUID();
      const now = Date.now();
      await db.batch([
        db
          .prepare(
            `INSERT INTO routine_assignments
            (id, routine_version_id, target_type, target_id, starts_on, ends_on, assigned_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            assignmentId,
            version.id,
            input.targetType,
            input.targetId,
            input.startsOn,
            input.endsOn || null,
            user.id,
            now,
          ),
        ...athleteIds.map((athleteId) =>
          db
            .prepare(
              `INSERT INTO athlete_routine_instances
              (id, assignment_id, athlete_id, overrides, status, created_at)
              VALUES (?, ?, ?, NULL, 'active', ?)`,
            )
            .bind(crypto.randomUUID(), assignmentId, athleteId, now),
        ),
      ]);

      return Response.json({ ok: true, assignmentId, athleteCount: athleteIds.length });
    }

    if (input.action === 'archive') {
      if (!input.routineId) {
        return Response.json({ error: 'Rutina inválida.' }, { status: 400 });
      }
      await db.batch([
        db
          .prepare("UPDATE routines SET status = 'archived' WHERE id = ?")
          .bind(input.routineId),
        db
          .prepare(
            `UPDATE athlete_routine_instances SET status = 'cancelled'
            WHERE assignment_id IN (
              SELECT ra.id FROM routine_assignments ra
              JOIN routine_versions rv ON rv.id = ra.routine_version_id
              WHERE rv.routine_id = ?
            ) AND status IN ('scheduled', 'active')`,
          )
          .bind(input.routineId),
      ]);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch (error) {
    console.error('[nexo-routines] Operation failed', {
      action: input.action,
      userId: user.id,
      error,
    });
    return Response.json(
      { error: 'No pudimos completar la operación con la rutina.' },
      { status: 500 },
    );
  }
}

async function resolveAthletes(
  db: D1Database,
  targetType: 'group' | 'athlete',
  targetId: string,
) {
  if (targetType === 'athlete') {
    const athlete = await db
      .prepare("SELECT id FROM athletes WHERE id = ? AND status = 'active'")
      .bind(targetId)
      .first<{ id: string }>();
    return athlete ? [athlete.id] : [];
  }
  const result = await db
    .prepare(
      `SELECT a.id FROM group_memberships gm
      JOIN groups g ON g.id = gm.group_id
      JOIN athletes a ON a.id = gm.athlete_id
      WHERE gm.group_id = ? AND gm.ended_at IS NULL
        AND g.active = 1 AND a.status = 'active'`,
    )
    .bind(targetId)
    .all<{ id: string }>();
  return result.results.map((row) => row.id);
}

function validateContent(input: RoutineContent | undefined) {
  if (!input || !Array.isArray(input.weekPlans) || !Array.isArray(input.rows)) {
    return null;
  }
  const weekPlans = input.weekPlans
    .slice(0, 24)
    .filter((week) => week && typeof week === 'object')
    .map((week) => {
      const value = week as Record<string, unknown>;
      return {
        number: cleanText(value.number, 30),
        phase: cleanText(value.phase, 60),
        objective: cleanText(value.objective, 120),
        secondary: cleanText(value.secondary, 120),
        pse: cleanNumber(value.pse, 0, 10, 5).toString(),
      };
    });
  if (weekPlans.length === 0) return null;

  const rows = input.rows
    .slice(0, 150)
    .filter((row) => row && typeof row === 'object')
    .map((row, index) => {
      const value = row as Record<string, unknown>;
      return {
        id:
          typeof value.id === 'string' || typeof value.id === 'number'
            ? value.id
            : index + 1,
        block: cleanText(value.block, 12) || 'A',
        category: cleanText(value.category, 40) || 'Trabajo',
        name: cleanText(value.name, 180),
        values: normalizeWeekValues(value.values, weekPlans.length),
        rir: normalizeWeekValues(value.rir, weekPlans.length),
      };
    })
    .filter((row) => row.name);
  if (rows.length === 0) return null;

  return {
    sessionName: cleanText(input.sessionName, 140),
    warmup: cleanText(input.warmup, 500),
    instructions: cleanText(input.instructions, 2000),
    weeklyGoal: cleanNumber(input.weeklyGoal, 1, 14, 3),
    activeWeek: cleanNumber(input.activeWeek, 0, weekPlans.length - 1, 0),
    sessionKey: `week-${cleanText(weekPlans[cleanNumber(input.activeWeek, 0, weekPlans.length - 1, 0)]?.number, 30) || 1}-session-1`,
    weekPlans,
    rows,
  };
}

function normalizeWeekValues(value: unknown, length: number) {
  const values = Array.isArray(value) ? value : [];
  return Array.from({ length }, (_, index) => cleanText(values[index], 140));
}

function normalizeRoutine(row: Record<string, unknown>) {
  return {
    ...row,
    content: parseJson(row.content),
    assignmentCount: Number(row.assignmentCount ?? 0),
    athleteCount: Number(row.athleteCount ?? 0),
    versionNumber: Number(row.versionNumber ?? 1),
  };
}

function parseJson(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
    : fallback;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
