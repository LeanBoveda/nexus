/* eslint-disable next/no-html-link-for-pages -- Vinext production navigation uses native links. */
import {
  ArrowUpRight,
  ClipboardCheck,
  ClipboardPlus,
  Dumbbell,
  Gauge,
  TriangleAlert,
  UserRoundCheck,
  Users,
  UsersRound,
} from 'lucide-react';

import { AppShell } from '@/components/nexo/app-shell';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getD1 } from '@/db';
import { requireSession } from '@/lib/auth';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type CountRow = { count: number };

export default async function Home() {
  const user = await requireSession();
  const db = getD1();
  const trainerAccountId = user.trainerAccountId ?? '';
  const monthAgo = 30 * 24 * 60 * 60 * 1000;
  const fortnight = 14 * 24 * 60 * 60 * 1000;
  const [athletes, groups, routines, evaluations, weeklyLogs, attention] =
    await Promise.all([
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM athletes WHERE status = 'active' AND trainer_account_id = ?",
        )
        .bind(trainerAccountId)
        .first<CountRow>(),
      db
        .prepare(`SELECT COUNT(*) AS count FROM groups g JOIN organizations o ON o.id = g.organization_id
      WHERE g.active = 1 AND o.trainer_account_id = ?`)
        .bind(trainerAccountId)
        .first<CountRow>(),
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM routines WHERE status = 'published' AND trainer_account_id = ?",
        )
        .bind(trainerAccountId)
        .first<CountRow>(),
      db
        .prepare(`SELECT COUNT(*) AS count FROM evaluation_sessions es JOIN athletes a ON a.id = es.athlete_id
      WHERE es.evaluated_at >= (unixepoch() * 1000 - ?) AND a.trainer_account_id = ?`)
        .bind(monthAgo, trainerAccountId)
        .first<CountRow>(),
      db
        .prepare(`SELECT COUNT(*) AS count FROM workout_logs wl JOIN athletes a ON a.id = wl.athlete_id
      WHERE wl.completed_at >= (unixepoch() * 1000 - 7 * 24 * 60 * 60 * 1000)
        AND a.trainer_account_id = ?`)
        .bind(trainerAccountId)
        .first<CountRow>(),
      db
        .prepare(`SELECT a.id, a.first_name AS firstName, a.last_name AS lastName,
      wl.pse, wl.pain, wl.notes, wl.completed_at AS completedAt, r.name AS routineName
      FROM workout_logs wl
      JOIN athletes a ON a.id = wl.athlete_id
      JOIN athlete_routine_instances ari ON ari.id = wl.instance_id
      JOIN routine_assignments ra ON ra.id = ari.assignment_id
      JOIN routine_versions rv ON rv.id = ra.routine_version_id
      JOIN routines r ON r.id = rv.routine_id
      WHERE wl.completed_at >= (unixepoch() * 1000 - ?)
        AND a.trainer_account_id = ?
        AND (wl.pain >= 4 OR wl.pse >= 8)
      ORDER BY wl.completed_at DESC LIMIT 8`)
        .bind(fortnight, trainerAccountId)
        .all<{
          id: string;
          firstName: string;
          lastName: string;
          pse: number | null;
          pain: number | null;
          notes: string | null;
          completedAt: number;
          routineName: string;
        }>(),
    ]);

  return (
    <AppShell active="inicio">
      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-7 lg:px-9 lg:py-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              {new Intl.DateTimeFormat('es-AR', {
                dateStyle: 'full',
                timeZone: 'America/Argentina/Buenos_Aires',
              }).format(new Date())}
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.04em] sm:text-[28px]">
              Buen día, {firstName(user.name)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Este es el estado real de tu operación deportiva.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/evaluaciones"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'h-9 rounded-xl bg-card',
              )}
            >
              <ClipboardPlus className="size-4" /> Cargar evaluación
            </a>
            <a
              href="/deportistas"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'h-9 rounded-xl bg-card',
              )}
            >
              <UserRoundCheck className="size-4" /> Nuevo deportista
            </a>
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Users}
            label="Deportistas activos"
            value={Number(athletes?.count ?? 0)}
            detail="Perfiles habilitados"
            accent="navy"
            href="/deportistas"
          />
          <MetricCard
            icon={UsersRound}
            label="Grupos activos"
            value={Number(groups?.count ?? 0)}
            detail="Clubes, selecciones y grupos"
            accent="lime"
            href="/grupos"
          />
          <MetricCard
            icon={Dumbbell}
            label="Rutinas activas"
            value={Number(routines?.count ?? 0)}
            detail="Planificaciones publicadas"
            accent="blue"
            href="/rutinas"
          />
          <MetricCard
            icon={ClipboardCheck}
            label="Evaluaciones · 30 días"
            value={Number(evaluations?.count ?? 0)}
            detail="Sesiones de testeo registradas"
            accent="amber"
            href="/evaluaciones"
          />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
          <Card className="border-none bg-card ring-1 ring-border shadow-[0_18px_50px_-42px_#10253d]">
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="text-[15px] font-bold">
                Señales para revisar
              </CardTitle>
              <CardDescription>
                Dolor igual o mayor a 4, o PSE igual o mayor a 8, en los últimos
                14 días.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border/70 px-0">
              {attention.results.length > 0 ? (
                attention.results.map((item, index) => {
                  const painAlert = Number(item.pain ?? 0) >= 4;
                  return (
                    <a
                      key={`${item.id}-${item.completedAt}-${index}`}
                      href={`/deportistas/${encodeURIComponent(item.id)}`}
                      className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/40"
                    >
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-[#eef2f5] text-[11px] font-bold text-[#29445e]">
                          {initials(item.firstName, item.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold">
                          {item.firstName} {item.lastName}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {item.routineName} · {shortDate(item.completedAt)}
                          {item.notes ? ` · ${item.notes}` : ''}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          painAlert
                            ? 'border-[#f2b9ae] bg-[#fff2ef] text-[#b34231]'
                            : 'border-[#ead4a1] bg-[#fff8e8] text-[#876016]'
                        }
                      >
                        {painAlert ? `Dolor ${item.pain}` : `PSE ${item.pse}`}
                      </Badge>
                      <ArrowUpRight className="size-3.5 text-muted-foreground" />
                    </a>
                  );
                })
              ) : (
                <div className="grid min-h-64 place-items-center p-6 text-center">
                  <div>
                    <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-[#edf4e1] text-[#52751d]">
                      <Gauge className="size-5" />
                    </span>
                    <p className="mt-3 font-semibold">Sin alertas recientes</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Las señales aparecerán cuando los deportistas registren
                      PSE o molestias elevadas.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-none bg-[#10253d] text-white ring-0">
              <CardHeader>
                <CardDescription className="text-white/50">
                  Actividad reciente
                </CardDescription>
                <CardTitle className="text-3xl font-bold">
                  {Number(weeklyLogs?.count ?? 0)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/65">
                  sesiones completadas durante los últimos 7 días.
                </p>
              </CardContent>
            </Card>
            <Card className="border-none bg-card ring-1 ring-border">
              <CardHeader>
                <CardTitle className="text-[15px] font-bold">
                  Acciones rápidas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <QuickLink
                  href="/rutinas/nueva"
                  icon={Dumbbell}
                  label="Crear planificación"
                />
                <QuickLink
                  href="/grupos"
                  icon={UsersRound}
                  label="Organizar planteles"
                />
                <QuickLink
                  href="/evaluaciones"
                  icon={ClipboardCheck}
                  label="Registrar testeo"
                />
                <QuickLink
                  href="/deportistas"
                  icon={Users}
                  label="Administrar clientes"
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="mt-4 border-none bg-[#fff5dc] ring-0">
          <CardContent className="flex items-start gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/60 text-[#9a6b12]">
              <TriangleAlert className="size-4" />
            </span>
            <div>
              <p className="font-semibold">
                Los indicadores dependen de los registros reales
              </p>
              <p className="mt-1 text-sm text-[#755718]">
                Asigná rutinas y compartí el acceso móvil para que los datos de
                cumplimiento, PSE y dolor se actualicen desde cada deportista.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent,
  href,
}: {
  icon: typeof Gauge;
  label: string;
  value: number;
  detail: string;
  accent: 'navy' | 'lime' | 'blue' | 'amber';
  href: string;
}) {
  const styles = {
    navy: 'bg-[#10253d] text-white',
    lime: 'bg-[#edf4e1] text-[#52751d]',
    blue: 'bg-[#eef4f8] text-[#315a78]',
    amber: 'bg-[#fff5dc] text-[#9a6b12]',
  };
  return (
    <a href={href} aria-label={`Ver ${label}`}>
      <Card className="h-full border-none bg-card ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-lg">
        <CardContent className="flex items-center gap-4">
          <span
            className={`grid size-11 shrink-0 place-items-center rounded-2xl ${styles[accent]}`}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-bold tracking-[-0.04em]">{value}</p>
            <p className="text-xs font-semibold">{label}</p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {detail}
            </p>
          </div>
        </CardContent>
      </Card>
    </a>
  );
}
function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Gauge;
  label: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm font-semibold transition hover:border-[#b8d477] hover:bg-[#f5f9ed]"
    >
      <span className="grid size-8 place-items-center rounded-lg bg-muted">
        <Icon className="size-4" />
      </span>
      <span className="flex-1">{label}</span>
      <ArrowUpRight className="size-3.5 text-muted-foreground" />
    </a>
  );
}
function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || 'PF';
}
function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}
function shortDate(timestamp: number) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(timestamp));
}
