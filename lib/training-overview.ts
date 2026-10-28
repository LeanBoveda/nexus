import { getD1 } from '@/db';
import { resolveRoutineSession } from '@/lib/athlete-portal';
import { scheduleDate, validDateKey } from '@/lib/routine-schedule';

export type AssignedTraining = {
  instanceId: string;
  athleteId: string;
  firstName: string;
  lastName: string;
  groups: string;
  groupIds?: string[];
  groupIdsJson?: string;
  name: string;
  description: string | null;
  content: unknown;
  overrides: unknown;
  startsOn: string;
  endsOn: string | null;
  endedOn?: string | null;
};
export type TrainingLog = {
  id: string;
  instanceId: string;
  athleteId: string;
  sessionKey: string;
  entryKey: string | null;
  trainedOn: string | null;
  completedAt: number | null;
  pse: number | null;
  pain: number | null;
  notes: string | null;
  actualValues: unknown;
  createdAt: number;
  updatedAt: number | null;
};
export function addTrainingDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function overviewRange(from?: string, to?: string) {
  const today = scheduleDate().dateKey;
  const end =
    validDateKey(to) && to >= '2000-01-01' && to <= today ? to : today;
  const requested =
    validDateKey(from) && from <= end ? from : addTrainingDays(end, -29);
  return {
    from:
      requested < addTrainingDays(end, -89)
        ? addTrainingDays(end, -89)
        : requested,
    to: end,
  };
}
function record(value: unknown): Record<string, unknown> {
  try {
    return typeof value === 'string'
      ? JSON.parse(value)
      : value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
  } catch {
    return {};
  }
}

export function canonicalTrainingLogs(rows: TrainingLog[]) {
  const seen = new Set<string>();
  return [...rows]
    .sort(
      (a, b) =>
        Number(Boolean(b.entryKey)) - Number(Boolean(a.entryKey)) ||
        (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
    )
    .filter((row) => {
      const key = `${row.instanceId}:${row.athleteId}:${row.sessionKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      const values = record(row.actualValues);
      const aliases = Array.isArray(values.legacySessionKeys)
        ? values.legacySessionKeys
        : [values.legacySessionKey];
      if (row.entryKey)
        for (const alias of aliases)
          if (typeof alias === 'string')
            seen.add(`${row.instanceId}:${row.athleteId}:${alias}`);
      return true;
    });
}
export function trainingLogDate(
  log: TrainingLog,
  assignment: AssignedTraining,
) {
  if (validDateKey(log.trainedOn)) return log.trainedOn;
  const match = /^week-(\d{4}-\d{2}-\d{2})-cycle-.+-session-(.+)$/.exec(
    log.sessionKey,
  );
  if (match && validDateKey(match[1])) {
    const session = resolveRoutineSession(assignment, match[1]).sessions.find(
      (item) => item.id === match[2],
    );
    if (session) return addTrainingDays(match[1], session.weekday - 1);
  }
  return scheduleDate(new Date(log.completedAt ?? log.createdAt)).dateKey;
}
export async function getTrainingOverview(
  trainerAccountId: string,
  from: string,
  to: string,
  athleteId?: string,
  options: { groupId?: string; skipLogs?: boolean } = {},
) {
  const db = getD1();
  const assignments = await db
    .prepare(`SELECT ari.id AS instanceId, a.id AS athleteId, a.first_name AS firstName, a.last_name AS lastName,
    COALESCE((SELECT GROUP_CONCAT(g.name, ', ') FROM group_memberships gm JOIN groups g ON g.id = gm.group_id
      JOIN organizations o ON o.id = g.organization_id
      WHERE gm.athlete_id = a.id AND gm.ended_at IS NULL AND g.active = 1 AND o.trainer_account_id = a.trainer_account_id), '') AS groups,
    (SELECT json_group_array(g.id) FROM group_memberships gm JOIN groups g ON g.id = gm.group_id
      JOIN organizations o ON o.id = g.organization_id
      WHERE gm.athlete_id = a.id AND gm.ended_at IS NULL AND g.active = 1 AND o.trainer_account_id = a.trainer_account_id) AS groupIdsJson,
    r.name, r.description, rv.content, ari.overrides, ra.starts_on AS startsOn,
    CASE WHEN ari.status = 'cancelled' THEN
      CASE WHEN ra.ends_on IS NULL OR ra.ends_on >= COALESCE(ari.ended_on, ?) THEN date(COALESCE(ari.ended_on, ?), '-1 day') ELSE ra.ends_on END
      ELSE ra.ends_on END AS endsOn,
    CASE WHEN ari.status = 'cancelled' THEN COALESCE(ari.ended_on, ?) ELSE NULL END AS endedOn
    FROM athlete_routine_instances ari JOIN athletes a ON a.id = ari.athlete_id
    JOIN routine_assignments ra ON ra.id = ari.assignment_id JOIN routine_versions rv ON rv.id = ra.routine_version_id
    JOIN routines r ON r.id = rv.routine_id WHERE a.trainer_account_id = ? AND r.trainer_account_id = ?
    AND a.status != 'archived' AND (ari.status IN ('scheduled', 'active', 'completed')
      OR (ari.status = 'cancelled' AND ? < COALESCE(ari.ended_on, ?)))
    AND ra.starts_on <= ? AND (ra.ends_on IS NULL OR ra.ends_on >= ?)
    AND (? = '' OR a.id = ?)
    AND (? = '' OR CASE WHEN ? = '__ungrouped' THEN NOT EXISTS (
      SELECT 1 FROM group_memberships gm JOIN groups g ON g.id=gm.group_id JOIN organizations o ON o.id=g.organization_id
      WHERE gm.athlete_id=a.id AND gm.ended_at IS NULL AND g.active=1 AND o.trainer_account_id=a.trainer_account_id
    ) ELSE EXISTS (
      SELECT 1 FROM group_memberships gm JOIN groups g ON g.id=gm.group_id JOIN organizations o ON o.id=g.organization_id
      WHERE gm.athlete_id=a.id AND gm.ended_at IS NULL AND g.active=1 AND o.trainer_account_id=a.trainer_account_id AND g.id=?
    ) END) ORDER BY a.last_name, a.first_name, ra.starts_on DESC`)
    .bind(
      scheduleDate().dateKey,
      scheduleDate().dateKey,
      scheduleDate().dateKey,
      trainerAccountId,
      trainerAccountId,
      from,
      scheduleDate().dateKey,
      to,
      from,
      athleteId ?? '',
      athleteId ?? '',
      options.groupId ?? '',
      options.groupId ?? '',
      options.groupId ?? '',
    )
    .all<AssignedTraining>();
  const logs = options.skipLogs
    ? { results: [] as TrainingLog[] }
    : await db
        .prepare(`SELECT wl.id, wl.instance_id AS instanceId, wl.athlete_id AS athleteId,
    wl.session_key AS sessionKey, wl.entry_key AS entryKey, wl.trained_on AS trainedOn, wl.completed_at AS completedAt,
    wl.pse, wl.pain, wl.notes, wl.actual_values AS actualValues, wl.created_at AS createdAt, wl.updated_at AS updatedAt
    FROM workout_logs wl JOIN athletes a ON a.id = wl.athlete_id WHERE a.trainer_account_id = ?
    AND (? = '' OR a.id = ?) AND ((wl.trained_on >= ? AND wl.trained_on <= ?) OR wl.trained_on IS NULL)
    ORDER BY wl.created_at DESC`)
        .bind(trainerAccountId, athleteId ?? '', athleteId ?? '', from, to)
        .all<TrainingLog>();
  const normalizedAssignments = assignments.results.map(
    ({ groupIdsJson, ...item }) => ({
      ...item,
      content: record(item.content),
      overrides: record(item.overrides),
      groupIds: JSON.parse(groupIdsJson || '[]') as string[],
    }),
  );
  const mapped = new Map(
    normalizedAssignments.map((item) => [item.instanceId, item]),
  );
  const entries = canonicalTrainingLogs(logs.results).flatMap((log) => {
    const assignment = mapped.get(log.instanceId);
    if (!assignment) return [];
    const date = trainingLogDate(log, assignment);
    return date >= from &&
      date <= to &&
      (!assignment.endedOn || date < assignment.endedOn)
      ? [{ ...log, date, assignment }]
      : [];
  });
  return { assignments: normalizedAssignments, entries };
}
export type TrainingOverview = Awaited<ReturnType<typeof getTrainingOverview>>;

export function trainingPage(value?: string | number) {
  const page = Number(value ?? 1);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000000) : 1;
}

function scheduledCounts(
  assignments: AssignedTraining[],
  from: string,
  to: string,
  completedDates: Set<string>,
) {
  let planned = 0,
    completed = 0;
  for (const assignment of assignments) {
    // Schedule and overrides are constant across the period. Resolve once,
    // instead of building exercise/week arrays for every athlete and date.
    const weekdays = new Set(
      resolveRoutineSession(assignment, from).sessions.map(
        (session) => session.weekday,
      ),
    );
    for (let day = from; day <= to; day = addTrainingDays(day, 1)) {
      if (
        day < assignment.startsOn ||
        (assignment.endsOn && day > assignment.endsOn)
      )
        continue;
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() || 7;
      if (!weekdays.has(weekday)) continue;
      planned++;
      if (completedDates.has(`${assignment.instanceId}:${day}`)) completed++;
    }
  }
  return { planned, completed };
}

export async function getTrainingLoad(
  trainerAccountId: string,
  from: string,
  to: string,
  filters: {
    athleteId?: string;
    groupId?: string;
    page?: string | number;
  } = {},
) {
  const db = getD1();
  const data = await getTrainingOverview(
    trainerAccountId,
    from,
    to,
    filters.athleteId,
    { groupId: filters.groupId, skipLogs: true },
  );
  const people = await db
    .prepare(`SELECT a.id AS athleteId, a.first_name AS firstName, a.last_name AS lastName
    FROM athletes a WHERE a.trainer_account_id=? AND a.status!='archived'
    AND EXISTS (SELECT 1 FROM athlete_routine_instances ari WHERE ari.athlete_id=a.id)
    ORDER BY a.last_name,a.first_name,a.id`)
    .bind(trainerAccountId)
    .all<{ athleteId: string; firstName: string; lastName: string }>();
  const scope = JSON.stringify(
    data.assignments.map((a) => ({
      id: a.instanceId,
      athlete: a.athleteId,
      ended: a.endedOn ?? null,
    })),
  );
  // Instance IDs come exclusively from the tenant-scoped assignment query.
  const source = `FROM workout_logs wl JOIN json_each(?) scope
    ON wl.athlete_id=json_extract(scope.value,'$.athlete') AND wl.instance_id=json_extract(scope.value,'$.id')
    WHERE (json_extract(scope.value,'$.ended') IS NULL OR wl.trained_on IS NULL OR wl.trained_on < json_extract(scope.value,'$.ended'))`;
  const legacy = await db
    .prepare(`SELECT 1 AS present ${source}
    AND (wl.trained_on IS NULL OR wl.entry_key IS NULL) LIMIT 1`)
    .bind(scope)
    .first();
  const size = 50;
  let entries: TrainingOverview['entries'];
  let total = 0,
    pse: number | null = null,
    pain: number | null = null;
  let page = trainingPage(filters.page);
  const completedDates = new Set<string>();
  if (legacy) {
    // Preserve old undated/session-key records and their shadowing semantics.
    // Compatibility is tenant-filtered; new records use the bounded SQL path.
    const old = await getTrainingOverview(
      trainerAccountId,
      from,
      to,
      filters.athleteId,
      { groupId: filters.groupId },
    );
    const all = old.entries.sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt) ||
        b.id.localeCompare(a.id),
    );
    total = all.length;
    const average = (key: 'pse' | 'pain') => {
      const values = all
        .map((e) => e[key])
        .filter((v): v is number => v !== null);
      return values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : null;
    };
    pse = average('pse');
    pain = average('pain');
    const seen = new Set<string>();
    for (const entry of all) {
      const key = `${entry.instanceId}:${entry.date}`;
      if (!seen.has(key) && entry.completedAt !== null) completedDates.add(key);
      seen.add(key);
    }
    page = Math.min(page, Math.max(1, Math.ceil(total / size)));
    entries = all.slice((page - 1) * size, page * size);
  } else {
    const rangeSource = `${source} AND wl.trained_on>=? AND wl.trained_on<=?`;
    const summary = await db
      .prepare(
        `SELECT COUNT(*) AS total, AVG(wl.pse) AS pse, AVG(wl.pain) AS pain ${rangeSource}`,
      )
      .bind(scope, from, to)
      .first<{ total: number; pse: number | null; pain: number | null }>();
    total = summary?.total ?? 0;
    pse = summary?.pse ?? null;
    pain = summary?.pain ?? null;
    page = Math.min(page, Math.max(1, Math.ceil(total / size)));
    const completions = await db
      .prepare(`SELECT instance_id AS instanceId, trained_on AS date, completed_at AS completedAt FROM (
      SELECT wl.instance_id,wl.trained_on,wl.completed_at,
      ROW_NUMBER() OVER(PARTITION BY wl.instance_id,wl.trained_on ORDER BY COALESCE(wl.updated_at,wl.created_at) DESC,wl.id DESC) AS rank
      ${rangeSource}) WHERE rank=1 AND completed_at IS NOT NULL`)
      .bind(scope, from, to)
      .all<{ instanceId: string; date: string; completedAt: number }>();
    for (const entry of completions.results)
      completedDates.add(`${entry.instanceId}:${entry.date}`);
    const rows = await db
      .prepare(`SELECT wl.id,wl.instance_id AS instanceId,wl.athlete_id AS athleteId,
      wl.session_key AS sessionKey,wl.entry_key AS entryKey,wl.trained_on AS trainedOn,wl.completed_at AS completedAt,
      wl.pse,wl.pain,wl.notes,wl.actual_values AS actualValues,wl.created_at AS createdAt,wl.updated_at AS updatedAt
      ${rangeSource} ORDER BY wl.trained_on DESC,COALESCE(wl.updated_at,wl.created_at) DESC,wl.id DESC LIMIT ? OFFSET ?`)
      .bind(scope, from, to, size, (page - 1) * size)
      .all<TrainingLog>();
    const mapped = new Map(data.assignments.map((a) => [a.instanceId, a]));
    entries = rows.results.map((row) => ({
      ...row,
      date: row.trainedOn!,
      assignment: mapped.get(row.instanceId)!,
    }));
  }
  return {
    assignments: data.assignments,
    entries,
    people: people.results,
    pagination: {
      page,
      pageSize: size,
      total,
      pages: Math.max(1, Math.ceil(total / size)),
    },
    summary: {
      total,
      pse,
      pain,
      ...scheduledCounts(data.assignments, from, to, completedDates),
    },
  };
}
export type TrainingLoad = Awaited<ReturnType<typeof getTrainingLoad>>;

export function filterTrainingOverview(
  data: TrainingOverview,
  athleteId?: string,
  groupId?: string,
) {
  const assignments = data.assignments.filter(
    (item) =>
      (!athleteId || item.athleteId === athleteId) &&
      (!groupId ||
        (groupId === '__ungrouped'
          ? !item.groupIds.length
          : item.groupIds.includes(groupId))),
  );
  const instances = new Set(assignments.map((item) => item.instanceId));
  return {
    assignments,
    entries: data.entries.filter((entry) => instances.has(entry.instanceId)),
  };
}
