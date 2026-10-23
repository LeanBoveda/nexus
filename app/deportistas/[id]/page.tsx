/* eslint-disable next/no-html-link-for-pages -- Vinext production navigation uses native links. */
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Mail,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { notFound } from 'next/navigation';

import { AppShell } from '@/components/nexo/app-shell';
import { EvaluationDashboard } from '@/components/nexo/evaluation-dashboard';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getD1 } from '@/db';
import { requireSession } from '@/lib/auth';
import { getAthletePortalData } from '@/lib/athlete-portal';
import {
  canonicalTrainingLogs,
  trainingLogDate,
  addTrainingDays,
  type TrainingLog,
  type AssignedTraining,
} from '@/lib/training-overview';
import { scheduleDate } from '@/lib/routine-schedule';

export const dynamic = 'force-dynamic';

type AthleteRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  position: string | null;
  context: string | null;
  countryCode: string | null;
  status: 'active' | 'paused';
  groupNames: string;
};

export default async function AthleteProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireSession();
  if (user.role === 'athlete' || !user.trainerAccountId) notFound();
  const db = getD1();
  const athlete = await db
    .prepare(
      `SELECT a.id, a.first_name AS firstName, a.last_name AS lastName,
      a.email, a.phone, a.primary_position AS position,
      a.primary_context AS context, a.country_code AS countryCode, a.status,
      COALESCE(GROUP_CONCAT(CASE WHEN gm.ended_at IS NULL AND g.active = 1
        THEN g.name END, '|||'), '') AS groupNames
      FROM athletes a
      LEFT JOIN group_memberships gm ON gm.athlete_id = a.id
      LEFT JOIN groups g ON g.id = gm.group_id
      WHERE a.id = ? AND a.trainer_account_id = ? AND a.status != 'archived'
      GROUP BY a.id, a.first_name, a.last_name, a.email, a.phone,
        a.primary_position, a.primary_context, a.country_code, a.status LIMIT 1`,
    )
    .bind(id, user.trainerAccountId)
    .first<AthleteRow>();
  if (!athlete) notFound();

  const [portal, logRows, routineRows, latestEvaluation] = await Promise.all([
    athlete.status === 'active'
      ? getAthletePortalData(id)
      : Promise.resolve(null),
    db
      .prepare(
        `SELECT wl.id, wl.instance_id AS instanceId, wl.athlete_id AS athleteId,
        wl.session_key AS sessionKey, wl.entry_key AS entryKey, wl.trained_on AS trainedOn,
        wl.completed_at AS completedAt, wl.pse, wl.pain, wl.notes,
        wl.actual_values AS actualValues, wl.created_at AS createdAt, wl.updated_at AS updatedAt,
        r.name AS routineName, r.description, rv.content, ari.overrides,
        ra.starts_on AS startsOn, ra.ends_on AS endsOn
        FROM workout_logs wl
        JOIN athlete_routine_instances ari ON ari.id = wl.instance_id
        JOIN routine_assignments ra ON ra.id = ari.assignment_id
        JOIN routine_versions rv ON rv.id = ra.routine_version_id
        JOIN routines r ON r.id = rv.routine_id
        WHERE wl.athlete_id = ? AND r.trainer_account_id = ?
        ORDER BY wl.created_at DESC`,
      )
      .bind(id, user.trainerAccountId)
      .all<
        TrainingLog &
          Pick<
            AssignedTraining,
            'content' | 'overrides' | 'startsOn' | 'endsOn' | 'description'
          > & { routineName: string }
      >(),
    db
      .prepare(
        `SELECT DISTINCT r.id, r.name, r.description, ari.status,
        ra.starts_on AS startsOn, ra.ends_on AS endsOn
        FROM athlete_routine_instances ari
        JOIN routine_assignments ra ON ra.id = ari.assignment_id
        JOIN routine_versions rv ON rv.id = ra.routine_version_id
        JOIN routines r ON r.id = rv.routine_id
        WHERE ari.athlete_id = ? AND r.status != 'archived'
        ORDER BY ari.created_at DESC`,
      )
      .bind(id)
      .all<{
        id: string;
        name: string;
        description: string | null;
        status: string;
        startsOn: string;
        endsOn: string | null;
      }>(),
    db
      .prepare(
        `SELECT evaluated_at AS evaluatedAt FROM evaluation_sessions
        WHERE athlete_id = ? AND archived_at IS NULL ORDER BY evaluated_at DESC LIMIT 1`,
      )
      .bind(id)
      .first<{ evaluatedAt: number }>(),
  ]);

  const byId = new Map(logRows.results.map((row) => [row.id, row]));
  const canonical = canonicalTrainingLogs(logRows.results)
    .map((log) => {
      const row = byId.get(log.id)!;
      const date = trainingLogDate(log, {
        ...row,
        name: row.routineName,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        groups: '',
      });
      return { ...row, date };
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
    );
  const history = { results: canonical.slice(0, 30) };
  const today = scheduleDate().dateKey;
  const firstDay = addTrainingDays(today, -27);
  const recentPse = canonical
    .filter(
      (row) =>
        row.completedAt !== null &&
        row.pse !== null &&
        row.date >= firstDay &&
        row.date <= today,
    )
    .map((row) => row.pse!);
  const pseRow = {
    average: recentPse.length
      ? recentPse.reduce((sum, value) => sum + value, 0) / recentPse.length
      : null,
  };

  const name = `${athlete.firstName} ${athlete.lastName}`;
  const groups = athlete.groupNames.split('|||').filter(Boolean);
  const weeklyGoal = portal?.progress.weeklyGoal ?? 0;
  const adherence =
    weeklyGoal > 0
      ? Math.min(
          100,
          Math.round((portal!.progress.weeklySessions / weeklyGoal) * 100),
        )
      : 0;

  return (
    <AppShell active="deportistas">
      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
        <div className="flex flex-col gap-5 border-b border-border pb-6 xl:flex-row xl:items-center">
          <div className="flex items-center gap-4">
            <a
              href="/deportistas"
              className="grid size-9 place-items-center rounded-xl border border-border bg-card hover:bg-muted"
              aria-label="Volver a deportistas"
            >
              <ArrowLeft className="size-4" />
            </a>
            <Avatar className="size-14">
              <AvatarFallback className="bg-[#dce6ee] text-sm font-bold text-[#10253d]">
                {initials(athlete.firstName, athlete.lastName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-[-0.04em]">
                  {name}
                </h1>
                <Badge
                  variant="outline"
                  className={
                    athlete.status === 'active'
                      ? 'border-[#cfe0ac] bg-[#f1f7e8] text-[#52751d]'
                      : 'bg-muted'
                  }
                >
                  {athlete.status === 'active' ? 'Activo' : 'Pausado'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {athlete.position || 'Posición sin definir'} ·{' '}
                {contextLabel(athlete.context)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground xl:ml-auto">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {athlete.countryCode || 'País sin definir'}
            </span>
            <span className="flex items-center gap-1.5">
              <Mail className="size-3.5" />
              {athlete.email}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" />
              Perfil individual
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric
            label="Cumplimiento semanal"
            value={`${adherence}%`}
            detail={
              weeklyGoal
                ? `${portal?.progress.weeklySessions ?? 0} de ${weeklyGoal} sesiones`
                : 'Sin rutina activa'
            }
            tone="lime"
          />
          <MiniMetric
            label="PSE promedio"
            value={pseRow?.average == null ? '—' : formatNumber(pseRow.average)}
            detail="Últimos 28 días"
            tone="amber"
          />
          <MiniMetric
            label="Última evaluación"
            value={
              latestEvaluation ? shortDate(latestEvaluation.evaluatedAt) : '—'
            }
            detail={
              latestEvaluation ? 'Registro más reciente' : 'Sin evaluaciones'
            }
          />
          <MiniMetric
            label="Rutinas asignadas"
            value={String(routineRows.results.length)}
            detail={portal?.routine?.name || 'Sin rutina vigente'}
          />
        </div>

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList variant="line">
            <TabsTrigger value="overview">Resumen</TabsTrigger>
            <TabsTrigger value="evaluations">Evaluaciones</TabsTrigger>
            <TabsTrigger value="routines">Rutinas</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
              <Card className="border-none bg-card ring-1 ring-border">
                <CardHeader>
                  <CardTitle className="text-[15px] font-bold">
                    Planificación actual
                  </CardTitle>
                  <CardDescription>
                    {portal?.routine
                      ? `${portal.routine.name} · ${portal.routine.scheduledToday ? portal.routine.sessionName : 'Hoy: descanso'}`
                      : 'Sin una rutina vigente'}
                  </CardDescription>
                  {portal?.routine?.weeks.find(
                    (week) => week.status === 'current',
                  ) && (
                    <Badge className="mt-2 w-fit bg-[#10253d] text-white">
                      Semana{' '}
                      {
                        portal.routine.weeks.find(
                          (week) => week.status === 'current',
                        )!.number
                      }
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {portal?.routine ? (
                    <>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {portal.routine.sessions.map((session) => (
                          <div
                            key={session.id}
                            className={`rounded-xl border p-3 ${session.isToday ? 'border-[#9fcf2d] bg-[#f3f9e8]' : 'border-border bg-muted/30'}`}
                          >
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                              {session.weekdayLabel}
                            </p>
                            <p className="mt-1 text-[12px] font-semibold">
                              {session.name}
                            </p>
                          </div>
                        ))}
                      </div>
                      {portal.routine.scheduledToday ? (
                        portal.routine.exercises
                          .slice(0, 6)
                          .map((exercise, index) => (
                            <div
                              key={exercise.id}
                              className="flex items-center gap-3 rounded-xl border border-border p-3"
                            >
                              <span className="grid size-8 place-items-center rounded-lg bg-[#eef2f5] text-[11px] font-bold text-[#29445e]">
                                {exercise.block}
                                {index + 1}
                              </span>
                              <div className="flex-1">
                                <p className="text-[12px] font-semibold">
                                  {exercise.name}
                                </p>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  {exercise.category} · RIR {exercise.rir}
                                </p>
                              </div>
                              <span className="text-sm font-bold tabular-nums">
                                {exercise.target}
                              </span>
                            </div>
                          ))
                      ) : (
                        <p className="rounded-xl bg-muted/35 p-3 text-sm text-muted-foreground">
                          No tiene una sesión programada para hoy.
                        </p>
                      )}
                    </>
                  ) : (
                    <EmptyState
                      icon={Dumbbell}
                      title="Sin rutina activa"
                      detail="Asignale una planificación desde la sección Rutinas."
                    />
                  )}
                </CardContent>
              </Card>
              <div className="space-y-4">
                <Card className="border-none bg-[#10253d] text-white ring-0">
                  <CardHeader>
                    <CardTitle className="text-[14px] font-bold">
                      Estado semanal
                    </CardTitle>
                    <CardDescription className="text-white/50">
                      {weeklyGoal
                        ? `${portal?.progress.weeklySessions ?? 0} de ${weeklyGoal} sesiones completadas`
                        : 'Sin objetivo configurado'}
                    </CardDescription>
                    <CheckCircle2 className="size-5 text-[#c8f15a]" />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between">
                      <span className="text-3xl font-bold">{adherence}%</span>
                      <span className="text-[11px] text-white/50">
                        {Math.max(
                          0,
                          weeklyGoal - (portal?.progress.weeklySessions ?? 0),
                        )}{' '}
                        pendientes
                      </span>
                    </div>
                    <Progress
                      value={adherence}
                      className="mt-4 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-white/10 [&_[data-slot=progress-indicator]]:bg-[#c8f15a]"
                    />
                  </CardContent>
                </Card>
                <Card className="border-none bg-card ring-1 ring-border">
                  <CardHeader>
                    <CardTitle className="text-[14px] font-bold">
                      Grupos activos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {groups.length > 0 ? (
                      groups.map((group) => (
                        <div
                          key={group}
                          className="flex items-center gap-3 rounded-xl bg-muted/45 p-3"
                        >
                          <span className="grid size-8 place-items-center rounded-lg bg-card ring-1 ring-border">
                            <CalendarDays className="size-3.5" />
                          </span>
                          <p className="flex-1 text-[12px] font-semibold">
                            {group}
                          </p>
                          <Badge variant="outline" className="bg-card">
                            Activo
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No pertenece a ningún grupo activo.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="evaluations" className="mt-5">
            <EvaluationDashboard athleteId={id} athleteName={name} embedded />
          </TabsContent>
          <TabsContent value="routines" className="mt-5">
            <Card className="border-none bg-card ring-1 ring-border">
              <CardContent className="space-y-3">
                {routineRows.results.length > 0 ? (
                  routineRows.results.map((routine) => (
                    <div
                      key={`${routine.id}-${routine.startsOn}`}
                      className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center"
                    >
                      <span className="grid size-10 place-items-center rounded-xl bg-[#edf4e1] text-[#52751d]">
                        <Dumbbell className="size-4" />
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold">{routine.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {routine.description || 'Sin descripción'} · Desde{' '}
                          {dateLabel(routine.startsOn)}
                          {routine.endsOn
                            ? ` hasta ${dateLabel(routine.endsOn)}`
                            : ''}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {statusLabel(routine.status)}
                      </Badge>
                      <a
                        href={`/rutinas/nueva?id=${encodeURIComponent(routine.id)}`}
                        className="text-sm font-semibold text-[#29445e] hover:underline"
                      >
                        Abrir
                      </a>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    icon={Dumbbell}
                    title="Sin rutinas asignadas"
                    detail="Las asignaciones nuevas aparecerán acá."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="history" className="mt-5">
            <Card className="border-none bg-card ring-1 ring-border">
              <CardContent className="space-y-3">
                {history.results.length > 0 ? (
                  history.results.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 rounded-2xl border border-border p-4"
                    >
                      <span className="grid size-9 place-items-center rounded-xl bg-muted">
                        <Clock3 className="size-4" />
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold">{entry.routineName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {dateLabel(entry.date)} ·{' '}
                          {entry.completedAt !== null
                            ? 'Completada'
                            : 'Sesión guardada'}{' '}
                          · PSE {entry.pse ?? '—'} · Dolor {entry.pain ?? '—'}
                        </p>
                        {entry.notes && (
                          <p className="mt-2 text-sm">{entry.notes}</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    icon={Clock3}
                    title="Sin sesiones registradas"
                    detail="El historial se completa cuando el deportista guarda su progreso."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function MiniMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'lime' | 'amber';
}) {
  return (
    <Card
      className={`border-none ring-0 ${tone === 'lime' ? 'bg-[#edf4e1]' : tone === 'amber' ? 'bg-[#fff5dc]' : 'bg-card ring-1 ring-border'}`}
    >
      <CardContent>
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Dumbbell;
  title: string;
  detail: string;
}) {
  return (
    <div className="grid min-h-44 place-items-center text-center">
      <div>
        <Icon className="mx-auto size-7 text-muted-foreground" />
        <p className="mt-3 font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}
function contextLabel(value: string | null) {
  if (value === 'national_team') return 'Selección';
  if (value === 'club') return 'Club';
  if (value === 'gym') return 'Gimnasio';
  if (value === 'independent') return 'Cliente particular';
  if (value === 'international') return 'Exterior';
  return value || 'Contexto sin definir';
}
function formatNumber(value: number) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(
    value,
  );
}
function shortDate(timestamp: number) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(timestamp));
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat('es-AR').format(
    new Date(`${value}T12:00:00Z`),
  );
}
function statusLabel(value: string) {
  if (value === 'active') return 'Activa';
  if (value === 'completed') return 'Completada';
  if (value === 'cancelled') return 'Cancelada';
  return 'Programada';
}
