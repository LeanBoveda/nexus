import { getD1 } from '@/db';
import { getStaffSessionFromRequest, isSameOrigin } from '@/lib/auth';

export const runtime = 'edge';

type EvaluationAction = {
  action?: 'save' | 'createMetric';
  athleteId?: string;
  groupId?: string | null;
  evaluatedAt?: string;
  surface?: 'indoor' | 'sand' | 'gym' | 'other';
  notes?: string;
  results?: Array<{ metricId?: string; value?: number | string }>;
  label?: string;
  unit?: string;
  betterDirection?: 'higher' | 'lower' | 'neutral';
  protocol?: string;
};

const defaultMetrics = [
  {
    key: 'cmj',
    label: 'CMJ',
    unit: 'cm',
    direction: 'higher',
    protocol: 'Salto con contramovimiento',
  },
  {
    key: 'sprint_15m',
    label: 'Sprint 15 m',
    unit: 's',
    direction: 'lower',
    protocol: 'Salida detenida',
  },
  {
    key: 'lanzamiento',
    label: 'Lanzamiento',
    unit: 'km/h',
    direction: 'higher',
    protocol: 'Mejor intento',
  },
  {
    key: 'agarre_derecho',
    label: 'Agarre derecho',
    unit: 'kg',
    direction: 'higher',
    protocol: 'Dinamometría',
  },
  {
    key: 'agarre_izquierdo',
    label: 'Agarre izquierdo',
    unit: 'kg',
    direction: 'higher',
    protocol: 'Dinamometría',
  },
] as const;

export async function GET(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user?.trainerAccountId)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });

  const db = getD1();
  const athleteId = new URL(request.url).searchParams.get('athleteId');
  try {
    const templateId = await ensureTemplate(db, user.id, user.trainerAccountId);
    const [metrics, athletes, groups, resultRows] = await Promise.all([
      db
        .prepare(
          `SELECT id, key, label, unit, better_direction AS betterDirection,
          protocol, sort_order AS sortOrder
          FROM evaluation_metrics WHERE template_id = ? ORDER BY sort_order, label`,
        )
        .bind(templateId)
        .all(),
      db
        .prepare(
          `SELECT id, first_name AS firstName, last_name AS lastName, email,
          primary_position AS primaryPosition
          FROM athletes WHERE status = 'active' AND trainer_account_id = ?
          ORDER BY last_name, first_name`,
        )
        .bind(user.trainerAccountId)
        .all(),
      db
        .prepare(
          `SELECT g.id, g.name FROM groups g
          JOIN organizations o ON o.id = g.organization_id
          WHERE g.active = 1 AND o.trainer_account_id = ? ORDER BY g.name`,
        )
        .bind(user.trainerAccountId)
        .all(),
      athleteId
        ? db
            .prepare(
              `SELECT es.id AS sessionId, es.athlete_id AS athleteId,
              trim(a.first_name || ' ' || a.last_name) AS athleteName,
              es.group_id AS groupId, g.name AS groupName,
              es.evaluated_at AS evaluatedAt, es.surface, es.notes,
              em.id AS metricId, em.label, em.unit,
              em.better_direction AS betterDirection, er.value
              FROM evaluation_sessions es
              JOIN athletes a ON a.id = es.athlete_id
              LEFT JOIN groups g ON g.id = es.group_id
              JOIN evaluation_results er ON er.session_id = es.id
              JOIN evaluation_metrics em ON em.id = er.metric_id
              WHERE es.template_id = ? AND es.athlete_id = ?
              ORDER BY es.evaluated_at DESC, em.sort_order, em.label`,
            )
            .bind(templateId, athleteId)
            .all()
        : db
            .prepare(
              `SELECT es.id AS sessionId, es.athlete_id AS athleteId,
              trim(a.first_name || ' ' || a.last_name) AS athleteName,
              es.group_id AS groupId, g.name AS groupName,
              es.evaluated_at AS evaluatedAt, es.surface, es.notes,
              em.id AS metricId, em.label, em.unit,
              em.better_direction AS betterDirection, er.value
              FROM evaluation_sessions es
              JOIN athletes a ON a.id = es.athlete_id
              LEFT JOIN groups g ON g.id = es.group_id
              JOIN evaluation_results er ON er.session_id = es.id
              JOIN evaluation_metrics em ON em.id = er.metric_id
              WHERE es.template_id = ?
              ORDER BY es.evaluated_at DESC, em.sort_order, em.label LIMIT 1500`,
            )
            .bind(templateId)
            .all(),
    ]);

    return Response.json({
      templateId,
      metrics: metrics.results,
      athletes: athletes.results,
      groups: groups.results,
      results: resultRows.results,
    });
  } catch (error) {
    console.error('[nexo-evaluations] Read failed', { athleteId, error });
    return Response.json(
      { error: 'No pudimos cargar las evaluaciones.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user?.trainerAccountId)
    return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Solicitud no permitida.' }, { status: 403 });
  }

  const input = (await request.json()) as EvaluationAction;
  const db = getD1();

  try {
    const templateId = await ensureTemplate(db, user.id, user.trainerAccountId);
    if (input.action === 'createMetric') {
      const label = input.label?.trim();
      const unit = input.unit?.trim();
      const direction = input.betterDirection;
      if (
        !label ||
        !unit ||
        !['higher', 'lower', 'neutral'].includes(direction ?? '')
      ) {
        return Response.json(
          { error: 'Completá el nombre, la unidad y el sentido de mejora.' },
          { status: 400 },
        );
      }
      const count = await db
        .prepare(
          'SELECT COUNT(*) AS count FROM evaluation_metrics WHERE template_id = ?',
        )
        .bind(templateId)
        .first<{ count: number }>();
      const metricId = crypto.randomUUID();
      const key = `${slug(label)}_${metricId.slice(0, 6)}`;
      await db
        .prepare(
          `INSERT INTO evaluation_metrics
          (id, template_id, key, label, unit, better_direction, protocol, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          metricId,
          templateId,
          key,
          label.slice(0, 100),
          unit.slice(0, 24),
          direction,
          input.protocol?.trim().slice(0, 500) || null,
          Number(count?.count ?? 0),
        )
        .run();
      return Response.json({ ok: true, metricId }, { status: 201 });
    }

    if (input.action === 'save') {
      if (
        !input.athleteId ||
        !validDate(input.evaluatedAt) ||
        !['indoor', 'sand', 'gym', 'other'].includes(input.surface ?? '')
      ) {
        return Response.json(
          { error: 'Elegí un deportista, una fecha y una superficie.' },
          { status: 400 },
        );
      }
      const athlete = await db
        .prepare(
          "SELECT id FROM athletes WHERE id = ? AND trainer_account_id = ? AND status = 'active'",
        )
        .bind(input.athleteId, user.trainerAccountId)
        .first();
      if (!athlete) {
        return Response.json(
          { error: 'El deportista no está disponible.' },
          { status: 404 },
        );
      }

      const allowedMetrics = await db
        .prepare('SELECT id FROM evaluation_metrics WHERE template_id = ?')
        .bind(templateId)
        .all<{ id: string }>();
      const allowed = new Set(
        allowedMetrics.results.map((metric) => metric.id),
      );
      const results = (input.results ?? [])
        .map((result) => ({
          metricId: result.metricId ?? '',
          value: Number(result.value),
        }))
        .filter(
          (result) =>
            allowed.has(result.metricId) && Number.isFinite(result.value),
        );
      if (results.length === 0) {
        return Response.json(
          { error: 'Ingresá al menos un resultado numérico.' },
          { status: 400 },
        );
      }

      const groupId = input.groupId
        ? await db
            .prepare(`SELECT g.id FROM groups g JOIN organizations o ON o.id = g.organization_id
              WHERE g.id = ? AND g.active = 1 AND o.trainer_account_id = ?`)
            .bind(input.groupId, user.trainerAccountId)
            .first<{ id: string }>()
        : null;
      const sessionId = crypto.randomUUID();
      const evaluatedAt = parseLocalDate(input.evaluatedAt);
      await db.batch([
        db
          .prepare(
            `INSERT INTO evaluation_sessions
            (id, template_id, athlete_id, group_id, evaluated_at, surface, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            sessionId,
            templateId,
            input.athleteId,
            groupId?.id ?? null,
            evaluatedAt,
            input.surface,
            input.notes?.trim().slice(0, 2000) || null,
            Date.now(),
          ),
        ...results.map((result) =>
          db
            .prepare(
              `INSERT INTO evaluation_results (session_id, metric_id, value)
              VALUES (?, ?, ?)`,
            )
            .bind(sessionId, result.metricId, result.value),
        ),
      ]);
      return Response.json({ ok: true, sessionId }, { status: 201 });
    }

    return Response.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch (error) {
    console.error('[nexo-evaluations] Operation failed', {
      action: input.action,
      userId: user.id,
      error,
    });
    return Response.json(
      { error: 'No pudimos guardar la evaluación.' },
      { status: 500 },
    );
  }
}

async function ensureTemplate(
  db: D1Database,
  userId: string,
  trainerAccountId: string,
) {
  const existing = await db
    .prepare(
      "SELECT id FROM evaluation_templates WHERE name IN ('Rendimiento deportivo', 'Rendimiento handball') AND trainer_account_id = ? ORDER BY created_at LIMIT 1",
    )
    .bind(trainerAccountId)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const templateId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO evaluation_templates
        (id, trainer_account_id, name, sport, description, created_by, created_at)
        VALUES (?, ?, 'Rendimiento deportivo', 'general',
          'Batería editable de evaluaciones de rendimiento', ?, ?)`,
      )
      .bind(templateId, trainerAccountId, userId, Date.now()),
    ...defaultMetrics.map((metric, index) =>
      db
        .prepare(
          `INSERT INTO evaluation_metrics
          (id, template_id, key, label, unit, better_direction, protocol, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          templateId,
          metric.key,
          metric.label,
          metric.unit,
          metric.direction,
          metric.protocol,
          index,
        ),
    ),
  ]);
  return templateId;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseLocalDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`).getTime();
}

function slug(value: string) {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'test'
  );
}
