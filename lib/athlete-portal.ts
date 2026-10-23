import { getD1 } from '@/db';
import {
  DEFAULT_TRAINING_DAYS,
  daysUntilWeekday,
  scheduleDate,
  weekdayLabel,
  calendarWeek,
  validDateKey,
} from '@/lib/routine-schedule';

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
  dateKey?: string;
  todayKey?: string;
  availableRoutines?: Array<{ instanceId: string; name: string }>;
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
    sessionId: string;
    legacySessionKey: string;
    legacySessionKeys: string[];
    startsOn: string;
    scheduledToday: boolean;
    todayLabel: string;
    targetPse: number;
    weeklyGoal: number;
    exercises: PortalExercise[];
    weeks: PortalWeek[];
    sessions: Array<{
      id: string;
      name: string;
      weekday: number;
      weekdayLabel: string;
      isToday: boolean;
    }>;
    nextSession: {
      name: string;
      weekdayLabel: string;
      daysAway: number;
    } | null;
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
  options: { dateKey?: string; instanceId?: string } = {},
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

  const todayKey = scheduleDate().dateKey;
  const today =
    validDateKey(options.dateKey) && options.dateKey <= todayKey
      ? options.dateKey
      : todayKey;
  const available = await db
    .prepare(`SELECT ari.id AS instanceId, r.name FROM athlete_routine_instances ari
    JOIN routine_assignments ra ON ra.id = ari.assignment_id
    JOIN routine_versions rv ON rv.id = ra.routine_version_id JOIN routines r ON r.id = rv.routine_id
    WHERE ari.athlete_id = ? AND (ari.status IN ('scheduled', 'active', 'completed')
      OR (ari.status = 'cancelled' AND ? < COALESCE(ari.ended_on, ?)))
    AND ra.starts_on <= ? AND (ra.ends_on IS NULL OR ra.ends_on >= ?)
    ORDER BY ra.starts_on DESC, ari.created_at DESC`)
    .bind(athleteId, today, todayKey, today, today)
    .all<{ instanceId: string; name: string }>();
  const selectedId =
    available.results.find((item) => item.instanceId === options.instanceId)
      ?.instanceId ??
    available.results[0]?.instanceId ??
    '';
  const instance = await db
    .prepare(
      `SELECT ari.id AS instanceId, ari.overrides, ari.status,
      r.name, r.description, rv.content, ra.starts_on AS startsOn
      FROM athlete_routine_instances ari
      JOIN routine_assignments ra ON ra.id = ari.assignment_id
      JOIN routine_versions rv ON rv.id = ra.routine_version_id
      JOIN routines r ON r.id = rv.routine_id
      WHERE ari.athlete_id = ?
        AND ari.id = ? AND (ari.status IN ('scheduled', 'active', 'completed')
          OR (ari.status = 'cancelled' AND ? < COALESCE(ari.ended_on, ?)))
        AND ra.starts_on <= ? AND (ra.ends_on IS NULL OR ra.ends_on >= ?)
      ORDER BY CASE ari.status WHEN 'active' THEN 0 ELSE 1 END,
        ra.starts_on DESC, ari.created_at DESC LIMIT 1`,
    )
    .bind(athleteId, selectedId, today, todayKey, today, today)
    .first<{
      instanceId: string;
      overrides: unknown;
      status: string;
      name: string;
      description: string | null;
      content: unknown;
      startsOn: string;
    }>();

  const routine = instance ? resolveRoutineSession(instance, today) : null;
  const [currentLog, completedLogs, evaluationRows] = await Promise.all([
    routine?.scheduledToday
      ? db
          .prepare(
            `SELECT completed_at AS completedAt, pse, pain, notes, actual_values AS actualValues
            FROM workout_logs WHERE instance_id = ? AND athlete_id = ? AND (session_key = ? OR (entry_key IS NULL AND session_key IN (?, ?)))
            ORDER BY (entry_key IS NOT NULL) DESC, created_at DESC LIMIT 1`,
          )
          .bind(
            routine.instanceId,
            athleteId,
            routine.sessionKey,
            routine.legacySessionKey,
            routine.legacySessionKeys[1] ?? routine.legacySessionKey,
          )
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
        `SELECT completed_at AS completedAt, trained_on AS trainedOn, instance_id AS instanceId, session_key AS sessionKey, entry_key AS entryKey, actual_values AS actualValues FROM workout_logs
        WHERE athlete_id = ? ORDER BY (entry_key IS NOT NULL) DESC, created_at DESC`,
      )
      .bind(athleteId)
      .all<{
        completedAt: number | null;
        trainedOn: string | null;
        instanceId: string;
        sessionKey: string;
        entryKey: string | null;
        actualValues: unknown;
      }>(),
    db
      .prepare(
        `SELECT em.id AS metricId, em.label, em.unit,
        em.better_direction AS betterDirection, er.value,
        es.evaluated_at AS evaluatedAt, es.surface
        FROM evaluation_results er
        JOIN evaluation_sessions es ON es.id = er.session_id
        JOIN evaluation_metrics em ON em.id = er.metric_id
        WHERE es.athlete_id = ? AND es.archived_at IS NULL
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
        surface: string;
      }>(),
  ]);

  const actualValues = asRecord(currentLog?.actualValues);
  const completedExerciseIds = Array.isArray(actualValues.completedExerciseIds)
    ? [...new Set(actualValues.completedExerciseIds.map(String))].filter((id) =>
        routine?.exercises.some((exercise) => exercise.id === id),
      )
    : [];
  const seen = new Set<string>();
  const completedDates = completedLogs.results
    .filter((row) => {
      // New records shadow their original legacy key, including when completion was undone.
      const key = `${row.instanceId}:${row.sessionKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      const values = asRecord(row.actualValues);
      const legacyKeys = Array.isArray(values.legacySessionKeys)
        ? values.legacySessionKeys
        : [values.legacySessionKey];
      if (row.entryKey)
        for (const legacyKey of legacyKeys)
          if (typeof legacyKey === 'string')
            seen.add(`${row.instanceId}:${legacyKey}`);
      return row.completedAt !== null;
    })
    .map((row) =>
      row.trainedOn
        ? Date.parse(`${row.trainedOn}T12:00:00-03:00`)
        : row.completedAt!,
    );
  const weekStart = Date.parse(
    `${scheduleDate(new Date(`${today}T12:00:00Z`)).weekKey}T00:00:00-03:00`,
  );
  const weeklySessions = completedDates.filter(
    (timestamp) =>
      timestamp >= weekStart && timestamp < weekStart + 7 * 86400000,
  ).length;

  return {
    dateKey: today,
    todayKey,
    availableRoutines: available.results,
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

export function resolveRoutineSession(
  instance: {
    instanceId: string;
    name: string;
    description: string | null;
    content: unknown;
    overrides: unknown;
    startsOn: string;
  },
  dateKey = scheduleDate().dateKey,
) {
  const content = {
    ...asRecord(instance.content),
    ...asRecord(instance.overrides),
  };
  const weekPlans = Array.isArray(content.weekPlans)
    ? content.weekPlans.map(asRecord)
    : [];
  const activeWeek = calendarWeek(instance.startsOn, dateKey, weekPlans.length);
  const activePlan = weekPlans[activeWeek] ?? {};
  const schedule = scheduleDate(new Date(`${dateKey}T12:00:00Z`));
  const sessions = routineSessions(content);
  const selectedSession = sessions.find(
    (session) => session.weekday === schedule.weekday,
  );
  const nextSession = sessions
    .map((session) => ({
      session,
      daysAway: daysUntilWeekday(schedule.weekday, session.weekday),
    }))
    .sort((left, right) => left.daysAway - right.daysAway)[0];
  const legacySessionKey = selectedSession
    ? `week-${schedule.weekKey}-cycle-${textValue(activePlan.number) || activeWeek + 1}-session-${selectedSession.id}`
    : '';
  const oldWeek = clampInteger(
    content.activeWeek,
    0,
    Math.max(0, weekPlans.length - 1),
  );
  const oldLegacySessionKey = selectedSession
    ? `week-${schedule.weekKey}-cycle-${textValue(weekPlans[oldWeek]?.number) || oldWeek + 1}-session-${selectedSession.id}`
    : '';
  const targetPse = clampInteger(activePlan.pse ?? content.targetPse, 0, 10, 5);
  const rows = selectedSession?.rows ?? [];

  return {
    startsOn: instance.startsOn,
    sessionId: selectedSession?.id ?? '',
    legacySessionKey,
    legacySessionKeys: [legacySessionKey, oldLegacySessionKey],
    instanceId: instance.instanceId,
    name: instance.name,
    description: instance.description ?? '',
    sessionName:
      selectedSession?.name || nextSession?.session.name || instance.name,
    warmup: selectedSession
      ? selectedSession.warmup ||
        'Realizá la entrada en calor indicada por tu preparador físico.'
      : '',
    instructions: selectedSession?.instructions ?? '',
    sessionKey: selectedSession
      ? `date-${dateKey}-session-${selectedSession.id}`
      : '',
    scheduledToday: Boolean(selectedSession),
    todayLabel: weekdayLabel(schedule.weekday),
    targetPse,
    weeklyGoal: sessions.length,
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
    sessions: sessions.map((session) => ({
      id: session.id,
      name: session.name,
      weekday: session.weekday,
      weekdayLabel: weekdayLabel(session.weekday),
      isToday: session.weekday === schedule.weekday,
    })),
    nextSession: nextSession
      ? {
          name: nextSession.session.name,
          weekdayLabel: weekdayLabel(nextSession.session.weekday),
          daysAway: nextSession.daysAway,
        }
      : null,
  };
}

function routineSessions(content: Record<string, unknown>) {
  const rawSessions = Array.isArray(content.sessions)
    ? content.sessions.map(asRecord).slice(0, 4)
    : [];
  if (rawSessions.length >= 2) {
    return rawSessions.map((session, index) => ({
      id: textValue(session.id) || `day-${index + 1}`,
      weekday: clampInteger(
        session.weekday,
        1,
        7,
        DEFAULT_TRAINING_DAYS[index] ?? index + 1,
      ),
      name: textValue(session.name) || `Día ${String.fromCharCode(65 + index)}`,
      warmup: textValue(session.warmup),
      instructions: textValue(session.instructions),
      rows: Array.isArray(session.rows) ? session.rows.map(asRecord) : [],
    }));
  }

  const legacyRows = Array.isArray(content.rows)
    ? content.rows.map(asRecord)
    : [];
  const count = clampInteger(content.weeklyGoal, 2, 4, 3);
  const baseName = textValue(content.sessionName);
  return Array.from({ length: count }, (_, index) => ({
    id: `legacy-day-${index + 1}`,
    weekday: DEFAULT_TRAINING_DAYS[index] ?? index + 1,
    name:
      index === 0 && baseName
        ? baseName
        : `Día ${String.fromCharCode(65 + index)}`,
    warmup: textValue(content.warmup),
    instructions: textValue(content.instructions),
    rows: legacyRows,
  }));
}

function evaluationSummary(
  rows: Array<{
    metricId: string;
    label: string;
    unit: string;
    betterDirection: 'higher' | 'lower' | 'neutral';
    value: number;
    evaluatedAt: number;
    surface: string;
  }>,
): PortalEvaluation[] {
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const comparisonKey = `${row.metricId}:${row.surface}`;
    const values = grouped.get(comparisonKey) ?? [];
    values.push(row);
    grouped.set(comparisonKey, values);
  }
  return [...grouped.values()].slice(0, 4).map(([latest, previous]) => {
    let change = 0;
    if (previous && previous.value !== 0) {
      const raw =
        ((latest.value - previous.value) / Math.abs(previous.value)) * 100;
      change = latest.betterDirection === 'lower' ? -raw : raw;
    }
    return {
      label: `${latest.label}${latest.surface ? ` · ${latest.surface}` : ''}`,
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
  return Date.parse(
    `${scheduleDate(new Date(timestamp)).weekKey}T00:00:00-03:00`,
  );
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
