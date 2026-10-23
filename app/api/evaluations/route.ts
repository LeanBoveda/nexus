import { getD1 } from '@/db';
import { getStaffSessionFromRequest, isSameOrigin } from '@/lib/auth';
import {
  evaluationDate,
  evaluationResults,
  semanticMetricChange,
} from '@/lib/evaluations-validation';

export const runtime = 'edge';
type Input = {
  action?: string;
  templateId?: string;
  metricId?: string;
  sessionId?: string;
  name?: string;
  sport?: string;
  description?: string;
  athleteId?: string;
  groupId?: string | null;
  evaluatedAt?: string;
  surface?: string;
  notes?: string;
  results?: unknown;
  label?: string;
  unit?: string;
  betterDirection?: string;
  protocol?: string;
};
const text = (value: unknown, limit: number) =>
  typeof value === 'string' ? value.trim().slice(0, limit) : '';
const fail = (error: string, status = 400) =>
  Response.json({ error }, { status });
async function defaultTemplate(db: D1Database, tenant: string, user: string) {
  const row = await db
    .prepare(
      'SELECT id FROM evaluation_templates WHERE trainer_account_id = ? AND archived_at IS NULL ORDER BY created_at, id LIMIT 1',
    )
    .bind(tenant)
    .first<{ id: string }>();
  if (row) return row.id;
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO evaluation_templates (id, trainer_account_id, name, sport, description, created_by, created_at) VALUES (?, ?, 'Rendimiento deportivo', 'General', 'Evaluaciones personalizadas', ?, ?)",
    )
    .bind(id, tenant, user, Date.now())
    .run();
  return id;
}
export async function GET(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user?.trainerAccountId) return fail('No autorizado.', 401);
  try {
    const db = getD1();
    const params = new URL(request.url).searchParams;
    const includeArchived = params.get('includeArchived') === '1';
    const templateId =
      params.get('templateId') ||
      (await defaultTemplate(db, user.trainerAccountId, user.id));
    const template = await db
      .prepare(
        'SELECT id, name, sport, description, archived_at AS archivedAt FROM evaluation_templates WHERE id = ? AND trainer_account_id = ?',
      )
      .bind(templateId, user.trainerAccountId)
      .first();
    if (!template) return fail('Plantilla no disponible.', 404);
    const athleteId = params.get('athleteId');
    const [templates, metrics, athletes, groups, results] = await Promise.all([
      db
        .prepare(
          `SELECT id, name, sport, description, archived_at AS archivedAt FROM evaluation_templates WHERE trainer_account_id = ? ${includeArchived ? '' : 'AND archived_at IS NULL'} ORDER BY name`,
        )
        .bind(user.trainerAccountId)
        .all(),
      db
        .prepare(
          'SELECT id, key, label, unit, better_direction AS betterDirection, protocol, sort_order AS sortOrder, archived_at AS archivedAt FROM evaluation_metrics WHERE template_id = ? ORDER BY sort_order, label',
        )
        .bind(templateId)
        .all(),
      db
        .prepare(
          `SELECT a.id, a.first_name AS firstName, a.last_name AS lastName, a.email, a.primary_position AS primaryPosition,
            (SELECT json_group_array(gm.group_id) FROM group_memberships gm
              JOIN groups g ON g.id = gm.group_id JOIN organizations o ON o.id = g.organization_id
              WHERE gm.athlete_id = a.id AND gm.ended_at IS NULL AND g.active = 1
                AND o.trainer_account_id = a.trainer_account_id) AS groupIdsJson
            FROM athletes a WHERE a.trainer_account_id = ? AND a.status = 'active' ORDER BY a.last_name, a.first_name`,
        )
        .bind(user.trainerAccountId)
        .all(),
      db
        .prepare(
          'SELECT g.id, g.name FROM groups g JOIN organizations o ON o.id = g.organization_id WHERE g.active = 1 AND o.trainer_account_id = ? ORDER BY g.name',
        )
        .bind(user.trainerAccountId)
        .all(),
      db
        .prepare(
          `SELECT es.id AS sessionId, es.athlete_id AS athleteId, trim(a.first_name || ' ' || a.last_name) AS athleteName, es.group_id AS groupId, g.name AS groupName, es.evaluated_at AS evaluatedAt, es.surface, es.notes, es.archived_at AS archivedAt, em.id AS metricId, em.label, em.unit, em.better_direction AS betterDirection, er.value FROM evaluation_sessions es JOIN athletes a ON a.id = es.athlete_id LEFT JOIN groups g ON g.id = es.group_id JOIN evaluation_results er ON er.session_id = es.id JOIN evaluation_metrics em ON em.id = er.metric_id WHERE es.template_id = ? AND a.trainer_account_id = ? ${athleteId ? 'AND es.athlete_id = ?' : ''} ${includeArchived ? '' : 'AND es.archived_at IS NULL'} ORDER BY es.evaluated_at DESC, es.id, em.sort_order LIMIT 10000`,
        )
        .bind(
          templateId,
          user.trainerAccountId,
          ...(athleteId ? [athleteId] : []),
        )
        .all(),
    ]);
    return Response.json({
      templateId,
      template,
      templates: templates.results,
      metrics: metrics.results.filter((m) => m.archivedAt == null),
      historicalMetrics: metrics.results,
      athletes: athletes.results.map(({ groupIdsJson, ...athlete }) => ({
        ...athlete,
        groupIds: JSON.parse(String(groupIdsJson || '[]')),
      })),
      groups: groups.results,
      results: results.results,
    });
  } catch (error) {
    console.error('[evaluations] read', error);
    return fail('No pudimos cargar las evaluaciones.', 500);
  }
}
export async function POST(request: Request) {
  const user = await getStaffSessionFromRequest(request);
  if (!user?.trainerAccountId) return fail('No autorizado.', 401);
  if (!isSameOrigin(request)) return fail('Solicitud no permitida.', 403);
  let input: Input;
  try {
    input = (await request.json()) as Input;
  } catch {
    return fail('Solicitud inválida.');
  }
  if (!input || typeof input !== 'object') return fail('Solicitud inválida.');
  const db = getD1();
  const tenant = user.trainerAccountId;
  try {
    if (input.action === 'createTemplate') {
      const name = text(input.name, 100);
      const sport = text(input.sport, 100);
      if (!name || !sport) return fail('Completá nombre y deporte.');
      const templateId = crypto.randomUUID();
      await db
        .prepare(
          'INSERT INTO evaluation_templates (id, trainer_account_id, name, sport, description, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          templateId,
          tenant,
          name,
          sport,
          text(input.description, 1000) || null,
          user.id,
          Date.now(),
        )
        .run();
      return Response.json({ ok: true, templateId }, { status: 201 });
    }
    const templateId =
      input.templateId || (await defaultTemplate(db, tenant, user.id));
    const template = await db
      .prepare(
        'SELECT id, archived_at FROM evaluation_templates WHERE id = ? AND trainer_account_id = ?',
      )
      .bind(templateId, tenant)
      .first<{ id: string; archived_at: number | null }>();
    if (!template) return fail('Plantilla no disponible.', 404);
    if (input.action === 'archiveTemplate') {
      await db
        .prepare('UPDATE evaluation_templates SET archived_at = ? WHERE id = ?')
        .bind(Date.now(), templateId)
        .run();
      return Response.json({ ok: true });
    }
    if (input.action === 'updateTemplate') {
      if (!text(input.name, 100) || !text(input.sport, 100))
        return fail('Completá nombre y deporte.');
      await db
        .prepare(
          'UPDATE evaluation_templates SET name = ?, sport = ?, description = ? WHERE id = ?',
        )
        .bind(
          text(input.name, 100),
          text(input.sport, 100),
          text(input.description, 1000) || null,
          templateId,
        )
        .run();
      return Response.json({ ok: true });
    }
    if (
      ['createMetric', 'updateMetric', 'archiveMetric'].includes(
        input.action ?? '',
      )
    ) {
      if (template.archived_at) return fail('La plantilla está archivada.');
      const old = input.metricId
        ? await db
            .prepare(
              'SELECT * FROM evaluation_metrics WHERE id = ? AND template_id = ? AND archived_at IS NULL',
            )
            .bind(input.metricId, templateId)
            .first<{
              id: string;
              unit: string;
              better_direction: string;
              protocol: string | null;
              sort_order: number;
            }>()
        : null;
      if (input.action !== 'createMetric' && !old)
        return fail('Test no disponible.', 404);
      if (input.action === 'archiveMetric') {
        await db
          .prepare('UPDATE evaluation_metrics SET archived_at = ? WHERE id = ?')
          .bind(Date.now(), old!.id)
          .run();
        return Response.json({ ok: true });
      }
      const label = text(input.label, 100);
      const unit = text(input.unit, 24);
      const direction = input.betterDirection ?? '';
      const protocol = text(input.protocol, 500) || null;
      if (
        !label ||
        !unit ||
        !['higher', 'lower', 'neutral'].includes(direction)
      )
        return fail('Completá nombre, unidad y sentido de mejora.');
      const used = old
        ? await db
            .prepare(
              'SELECT 1 AS found FROM evaluation_results WHERE metric_id = ? LIMIT 1',
            )
            .bind(old.id)
            .first()
        : null;
      const versioned = Boolean(
        old &&
        used &&
        semanticMetricChange(old, {
          unit,
          betterDirection: direction,
          protocol,
        }),
      );
      if (old && !versioned) {
        await db
          .prepare(
            'UPDATE evaluation_metrics SET label = ?, unit = ?, better_direction = ?, protocol = ? WHERE id = ?',
          )
          .bind(label, unit, direction, protocol, old.id)
          .run();
        return Response.json({ ok: true, metricId: old.id });
      }
      const metricId = crypto.randomUUID();
      const statements = [
        db
          .prepare(
            'INSERT INTO evaluation_metrics (id, template_id, key, label, unit, better_direction, protocol, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(
            metricId,
            templateId,
            `metric_${metricId}`,
            label,
            unit,
            direction,
            protocol,
            old?.sort_order ?? Date.now(),
          ),
      ];
      if (versioned)
        statements.push(
          db
            .prepare(
              'UPDATE evaluation_metrics SET archived_at = ? WHERE id = ?',
            )
            .bind(Date.now(), old!.id),
        );
      await db.batch(statements);
      return Response.json(
        {
          ok: true,
          metricId,
          versioned,
          message: versioned
            ? 'Se creó una nueva versión del test. Los resultados anteriores conservan su unidad y protocolo.'
            : 'Test creado.',
        },
        { status: 201 },
      );
    }
    const session = input.sessionId
      ? await db
          .prepare(
            'SELECT es.id, es.athlete_id FROM evaluation_sessions es JOIN athletes a ON a.id = es.athlete_id WHERE es.id = ? AND es.template_id = ? AND a.trainer_account_id = ? AND es.archived_at IS NULL',
          )
          .bind(input.sessionId, templateId, tenant)
          .first<{ id: string; athlete_id: string }>()
      : null;
    if (
      ['updateSession', 'archiveSession'].includes(input.action ?? '') &&
      !session
    )
      return fail('Evaluación no disponible.', 404);
    if (input.action === 'archiveSession') {
      await db
        .prepare('UPDATE evaluation_sessions SET archived_at = ? WHERE id = ?')
        .bind(Date.now(), session!.id)
        .run();
      return Response.json({ ok: true });
    }
    if (input.action === 'save' || input.action === 'updateSession') {
      if (template.archived_at) return fail('La plantilla está archivada.');
      const athleteId = session?.athlete_id || input.athleteId;
      const evaluatedAt = evaluationDate(input.evaluatedAt);
      const surface = text(input.surface, 100);
      if (!athleteId || evaluatedAt === null || !surface)
        return fail('Elegí un deportista, una fecha válida y una superficie.');
      const athlete = await db
        .prepare(
          "SELECT id FROM athletes WHERE id = ? AND trainer_account_id = ? AND status = 'active'",
        )
        .bind(athleteId, tenant)
        .first();
      if (!athlete) return fail('Deportista no disponible.', 404);
      const metricRows = await db
        .prepare(
          `SELECT id FROM evaluation_metrics WHERE template_id = ? AND (archived_at IS NULL ${session ? 'OR id IN (SELECT metric_id FROM evaluation_results WHERE session_id = ?)' : ''})`,
        )
        .bind(templateId, ...(session ? [session.id] : []))
        .all<{ id: string }>();
      let results;
      try {
        results = evaluationResults(
          input.results,
          new Set(metricRows.results.map((m) => m.id)),
        );
      } catch (error) {
        return fail((error as Error).message);
      }
      if (!results.length) return fail('Ingresá al menos un resultado.');
      if (
        input.groupId &&
        !(await db
          .prepare(
            'SELECT g.id FROM groups g JOIN organizations o ON o.id = g.organization_id WHERE g.id = ? AND g.active = 1 AND o.trainer_account_id = ?',
          )
          .bind(input.groupId, tenant)
          .first())
      )
        return fail('Grupo no disponible.', 404);
      const sessionId = crypto.randomUUID();
      const statements = [
        db
          .prepare(
            'INSERT INTO evaluation_sessions (id, template_id, athlete_id, group_id, evaluated_at, surface, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(
            sessionId,
            templateId,
            athleteId,
            input.groupId || null,
            evaluatedAt,
            surface,
            text(input.notes, 2000) || null,
            Date.now(),
          ),
        ...results.map((r) =>
          db
            .prepare(
              'INSERT INTO evaluation_results (session_id, metric_id, value) VALUES (?, ?, ?)',
            )
            .bind(sessionId, r.metricId, r.value),
        ),
      ];
      if (session)
        statements.push(
          db
            .prepare(
              'UPDATE evaluation_sessions SET archived_at = ? WHERE id = ?',
            )
            .bind(Date.now(), session.id),
        );
      await db.batch(statements);
      return Response.json(
        {
          ok: true,
          sessionId,
          message: session
            ? 'Evaluación corregida; la versión anterior se conserva archivada.'
            : 'Evaluación guardada.',
        },
        { status: 201 },
      );
    }
    return fail('Acción no reconocida.');
  } catch (error) {
    console.error('[evaluations] operation', { action: input.action, error });
    return fail('No pudimos guardar los cambios.', 500);
  }
}
