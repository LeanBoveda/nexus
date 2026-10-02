import { getD1 } from '@/db';

export type PortalExercise = {
  id: string;
  block: string;
  category: string;
  name: string;
  target: string;
  rir: string;
};

export type PortalWeek = {
  number: string;
  phase: string;
  objective: string;
  secondary: string;
  pse: string;
  status: 'completed' | 'current' | 'upcoming';
};

export type PortalEvaluation = {
  label: string;
  value: string;
  change: number;
  positive: boolean;
};

export type AthletePortalData = {
  athlete: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    position: string | null;
    countryCode: string | null;
    groups: string[];
  };
  routine: {
    instanceId: string;
    name: string;
    description: string;
    sessionName: string;
    warmup: string;
    instructions: string;
    sessionKey: string;
    targetPse: number;
    weeklyGoal: number;
    exercises: PortalExercise[];
    weeks: PortalWeek[];
  } | null;
  progress: {
    completedExerciseIds: string[];
    weeklySessions: number;
    weeklyGoal: number;
    streak: number;
    pse: number | null;
    pain: number | null;
    notes: string;
    completedAt: number | null;
  };
  evaluations: PortalEvaluation[];
};

export async function getAthletePortalData(
  athleteId: string,
): Promise<AthletePortalData | null> {
  const db = getD1();
  const athlete = await db
    .prepare(
      `SELECT a.id, a.first_name AS firstName, a.last_name AS lastName, a.email,
      a.primary_position AS position, a.country_code AS countryCode,
      COALESCE(GROUP_CONCAT(CASE WHEN gm.ended_at IS NULL AND g.active = 1
        THEN g.name END, '|||'), '') AS groupNames
      FROM athletes a
      LEFT JOIN group_memberships gm ON gm.athlete_id = a.id
      LEFT JOIN groups g ON g.id = gm.group_id
      WHERE a.id = ? AND a.status = 'active'
      GROUP BY a.id, a.first_name, a.last_name, a.email,
        a.primary_position, a.country_code LIMIT 1`,
    )
    .bind(athleteId)
    .first<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      position: string | null;
      countryCode: string | null;
      groupNames: string;
    }>();
  if (!athlete) return null;

  const today = new Date().toISOString().slice(0, 10);
  const instance = await db
    .prepare(
      `SELECT ari.id AS instanceId, ari.overrides, ari.status,
      r.name, r.description, rv.content
      FROM athlete_routine_instances ari
      JOIN routine_assignments ra ON ra.id = ari.assignment_id
      JOIN routine_versions rv ON rv.id = ra.routine_version_id
      JOIN routines r ON r.id = rv.routine_id
      WHERE ari.athlete_id = ?
        AND ari.status IN ('scheduled', 'active')
        AND ra.starts_on <= ? AND (ra.ends_on IS NULL OR ra.ends_on >= ?)
      ORDER BY CASE ari.status WHEN 'active' THEN 0 ELSE 1 END,
        ra.starts_on DESC, ari.created_at DESC LIMIT 1`,
    )
    .bind(athleteId, today, today)
    .first<{
      instanceId: string;
      overrides: unknown;
      status: string;
      name: string;
      description: string | null;
      content: unknown;
    }>();

  const routine = instance ? parseRoutine(instance) : null;
  const [currentLog, completedLogs, evaluationRows] = await Promise.all([
    routine
      ? db
          .prepare(
            `SELECT completed_at AS completedAt, pse, pain, notes, actual_values AS actualValues
            FROM workout_logs WHERE instance_id = ? AND athlete_id = ? AND session_key = ?
            ORDER BY created_at DESC LIMIT 1`,
          )
          .bind(routine.instanceId, athleteId, routine.sessionKey)
          .first<{
            completedAt: number | null;
            pse: number | null;
            pain: number | null;
            notes: string | null;
            actualValues: unknown;
          }>()
      : Promise.resolve(null),
    db
      .prepare(
        `SELECT completed_at AS completedAt FROM workout_logs
        WHERE athlete_id = ? AND completed_at IS NOT NULL
        ORDER BY completed_at DESC LIMIT 200`,
      )
      .bind(athleteId)
      .all<{ completedAt: number }>(),
    db
      .prepare(
        `SELECT em.id AS metricId, em.label, em.unit,
        em.better_direction AS betterDirection, er.value,
        es.evaluated_at AS evaluatedAt
        FROM evaluation_results er
        JOIN evaluation_sessions es ON es.id = er.session_id
        JOIN evaluation_metrics em ON em.id = er.metric_id
        WHERE es.athlete_id = ?
        ORDER BY es.evaluated_at DESC LIMIT 100`,
      )
      .bind(athleteId)
      .all<{
        metricId: string;
        label: string;
        unit: string;
        betterDirection: 'higher' | 'lower' | 'neutral';
        value: number;
        evaluatedAt: number;
      }>(),
  ]);

  const actualValues = asRecord(currentLog?.actualValues);
  const completedExerciseIds = Array.isArray(actualValues.completedExerciseIds)
    ? actualValues.completedExerciseIds.map(String)
    : [];
  const completedDates = completedLogs.results.map((row) => row.completedAt);
  const weekStart = startOfWeek(Date.now());
  const weeklySessions = completedDates.filter(
    (timestamp) => timestamp >= weekStart,
  ).length;

  return {
    athlete: {
      id: athlete.id,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      email: athlete.email,
      position: athlete.position,
      countryCode: athlete.countryCode,
      groups: athlete.groupNames.split('|||').filter(Boolean),
    },
    routine,
    progress: {
      completedExerciseIds,
      weeklySessions,
      weeklyGoal: routine?.weeklyGoal ?? 3,
      streak: weeklyStreak(completedDates),
      pse: currentLog?.pse ?? null,
      pain: currentLog?.pain ?? null,
      notes: currentLog?.notes ?? '',
      completedAt: currentLog?.completedAt ?? null,
    },
    evaluations: evaluationSummary(evaluationRows.results),
  };
}

function parseRoutine(instance: {
  instanceId: string;
  name: string;
  description: string | null;
  content: unknown;
  overrides: unknown;
}) {
  const content = {
    ...asRecord(instance.content),
    ...asRecord(instance.overrides),
  };
  const rows = Array.isArray(content.rows) ? content.rows.map(asRecord) : [];
  const weekPlans = Array.isArray(content.weekPlans)
    ? content.weekPlans.map(asRecord)
    : [];
  const activeWeek = clampInteger(
    content.activeWeek,
    0,
    Math.max(0, weekPlans.length - 1),
  );
  const activePlan = weekPlans[activeWeek] ?? {};
  const sessionKey =
    textValue(content.sessionKey) ||
    `week-${textValue(activePlan.number) || activeWeek + 1}-session-1`;
  const targetPse = clampInteger(activePlan.pse ?? content.targetPse, 0, 10, 5);

  return {
    instanceId: instance.instanceId,
    name: instance.name,
    description: instance.description ?? '',
    sessionName: textValue(content.sessionName) || instance.name,
    warmup:
      textValue(content.warmup) ||
      'Realizá la entrada en calor indicada por tu preparador físico.',
    instructions: textValue(content.instructions),
    sessionKey,
    targetPse,
    weeklyGoal: clampInteger(content.weeklyGoal, 1, 14, 3),
    exercises: rows
      .filter((row) => textValue(row.name))
      .map((row, index) => {
        const values = Array.isArray(row.values) ? row.values.map(String) : [];
        const rir = Array.isArray(row.rir) ? row.rir.map(String) : [];
        return {
          id: scalarId(row.id, index + 1),
          block: textValue(row.block) || 'A',
          category: textValue(row.category) || 'Trabajo',
          name: textValue(row.name),
          target:
            values[activeWeek] || textValue(row.target) || 'Según indicación',
          rir: rir[activeWeek] || textValue(row.rir) || '—',
        };
      }),
    weeks: weekPlans.map((week, index) => ({
      number: textValue(week.number) || String(index + 1),
      phase: textValue(week.phase) || 'Plan',
      objective: textValue(week.objective) || 'Trabajo general',
      secondary: textValue(week.secondary),
      pse: textValue(week.pse) || '—',
      status:
        index < activeWeek
          ? ('completed' as const)
          : index === activeWeek
            ? ('current' as const)
            : ('upcoming' as const),
    })),
  };
}

function evaluationSummary(
  rows: Array<{
    metricId: string;
    label: string;
    unit: string;
    betterDirection: 'higher' | 'lower' | 'neutral';
    value: number;
    evaluatedAt: number;
  }>,
): PortalEvaluation[] {
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const values = grouped.get(row.metricId) ?? [];
    values.push(row);
    grouped.set(row.metricId, values);
  }
  return [...grouped.values()].slice(0, 4).map(([latest, previous]) => {
    let change = 0;
    if (previous && previous.value !== 0) {
      const raw =
        ((latest.value - previous.value) / Math.abs(previous.value)) * 100;
      change = latest.betterDirection === 'lower' ? -raw : raw;
    }
    return {
      label: latest.label,
      value: `${formatNumber(latest.value)}${latest.unit ? ` ${latest.unit}` : ''}`,
      change: Math.round(change * 10) / 10,
      positive: change >= 0,
    };
  });
}

function weeklyStreak(timestamps: number[]) {
  const weeks = new Set(timestamps.map(startOfWeek));
  let cursor = startOfWeek(Date.now());
  let streak = 0;
  while (weeks.has(cursor) && streak < 52) {
    streak += 1;
    cursor -= 7 * 24 * 60 * 60 * 1000;
  }
  return streak;
}

function startOfWeek(timestamp: number) {
  const date = new Date(timestamp);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - day);
  return date.getTime();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function scalarId(value: unknown, fallback: number) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : String(fallback);
}

function clampInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback = 0,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
    : fallback;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(
    value,
  );
}
