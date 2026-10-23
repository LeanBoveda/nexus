/* eslint-disable next/no-html-link-for-pages -- Vinext production navigation uses native links. */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowUpRight,
  CalendarRange,
  Copy,
  Dumbbell,
  LoaderCircle,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants, Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { RoutineQuickAssign } from '@/components/nexo/routine-quick-assign';

type RoutineSummary = {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'published';
  createdAt: number;
  versionNumber: number;
  assignmentCount: number;
  athleteCount: number;
  content: {
    sessionName?: string;
    weeklyGoal?: number;
    weekPlans?: Array<{ number?: string; phase?: string }>;
    rows?: unknown[];
    sessions?: Array<{
      name?: string;
      weekday?: number;
      rows?: unknown[];
    }>;
  };
  targets: Array<{
    targetType: 'group' | 'athlete';
    targetName: string | null;
    startsOn: string;
    endsOn: string | null;
  }>;
};

export function RoutinesManager() {
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [archivingId, setArchivingId] = useState('');
  const [duplicatingId, setDuplicatingId] = useState('');
  const [notice, setNotice] = useState('');

  async function duplicate(routine: RoutineSummary) {
    setDuplicatingId(routine.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/routines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'duplicate', routineId: routine.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'No se pudo duplicar la rutina.');
      await load();
      setNotice(
        `Copia de “${routine.name}” creada, sin asignaciones. Podés abrirla y editarla.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo duplicar la rutina.',
      );
    } finally {
      setDuplicatingId('');
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/routines', { cache: 'no-store' });
      const result = (await response.json()) as {
        routines?: RoutineSummary[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'No se pudieron cargar las rutinas.');
      setRoutines(result.routines ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron cargar las rutinas.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const stats = useMemo(
    () => ({
      active: routines.filter((routine) => routine.status === 'published')
        .length,
      assignments: routines.reduce(
        (total, routine) => total + routine.assignmentCount,
        0,
      ),
      athletes: new Set(
        routines.flatMap((routine) =>
          routine.targets
            .filter((target) => target.targetType === 'athlete')
            .map((target) => target.targetName),
        ),
      ).size,
    }),
    [routines],
  );

  async function archive(routine: RoutineSummary) {
    if (
      !window.confirm(
        `¿Archivar “${routine.name}”? Sus asignaciones activas se cancelarán.`,
      )
    )
      return;
    setArchivingId(routine.id);
    setError('');
    try {
      const response = await fetch('/api/routines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'archive', routineId: routine.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'No se pudo archivar la rutina.');
      setRoutines((current) =>
        current.filter((item) => item.id !== routine.id),
      );
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : 'No se pudo archivar la rutina.',
      );
    } finally {
      setArchivingId('');
    }
  }

  return (
    <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Planificación
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.04em] sm:text-[28px]">
            Rutinas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Creá una planificación, asignala a un grupo o a una persona y seguí
            su ejecución.
          </p>
        </div>
        <a
          href="/rutinas/nueva"
          className={cn(
            buttonVariants({ size: 'lg' }),
            'h-9 rounded-xl bg-[#10253d] px-3.5 text-white hover:bg-[#183653]',
          )}
        >
          <Plus className="size-4" /> Nueva rutina
        </a>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Rutinas activas"
          value={stats.active}
          icon={CalendarRange}
        />
        <Stat
          label="Asignaciones vigentes"
          value={stats.assignments}
          icon={Copy}
        />
        <Stat
          label="Deportistas con asignación directa"
          value={stats.athletes}
          icon={Users}
        />
      </div>

      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-[#f1f7e8] p-3 text-sm text-[#52751d]"
        >
          {notice}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[#f1c5bc] bg-[#fff1ee] px-4 py-3 text-sm font-medium text-[#a23f30]"
        >
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw /> Reintentar
          </Button>
        </div>
      )}

      {loading ? (
        <div className="mt-4 grid min-h-64 place-items-center rounded-[24px] border border-border bg-card">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Cargando rutinas…
          </span>
        </div>
      ) : routines.length === 0 ? (
        <div className="mt-4 grid min-h-72 place-items-center rounded-[24px] border border-dashed border-border bg-card p-8 text-center">
          <div>
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf4e1] text-[#52751d]">
              <Dumbbell className="size-5" />
            </span>
            <h2 className="mt-4 text-lg font-bold">Todavía no hay rutinas</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Armá la primera desde el editor visual. Quedará guardada y lista
              para asignar.
            </p>
            <a
              href="/rutinas/nueva"
              className={cn(
                buttonVariants(),
                'mt-5 bg-[#10253d] text-white hover:bg-[#183653]',
              )}
            >
              <Plus /> Crear primera rutina
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {routines.map((routine) => {
            const weeks = routine.content.weekPlans ?? [];
            const sessions = routine.content.sessions ?? [];
            const exerciseCount = sessions.length
              ? sessions.reduce(
                  (total, session) => total + (session.rows?.length ?? 0),
                  0,
                )
              : (routine.content.rows?.length ?? 0);
            const targetNames = [
              ...new Set(
                routine.targets
                  .map((target) => target.targetName)
                  .filter(Boolean),
              ),
            ];
            return (
              <Card
                key={routine.id}
                className="border-none bg-card ring-1 ring-border shadow-[0_18px_50px_-42px_#10253d] transition hover:-translate-y-0.5 hover:shadow-[0_22px_58px_-38px_#10253d]"
              >
                <CardHeader>
                  <div className="mb-2 h-1.5 w-12 rounded-full bg-[#9fcf2d]" />
                  <CardTitle className="text-[15px] font-bold">
                    {routine.name}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {routine.description ||
                      routine.content.sessionName ||
                      'Sin descripción'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/45 p-3 text-[11px] sm:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground">Ciclo</p>
                      <p className="mt-1 font-semibold">
                        {weeks.length}{' '}
                        {weeks.length === 1 ? 'semana' : 'semanas'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Frecuencia</p>
                      <p className="mt-1 font-semibold">
                        {sessions.length || routine.content.weeklyGoal || 0}{' '}
                        días
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Ejercicios</p>
                      <p className="mt-1 font-semibold">{exerciseCount}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Deportistas</p>
                      <p className="mt-1 font-semibold">
                        {routine.athleteCount}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 min-h-10 text-xs text-muted-foreground">
                    {targetNames.length > 0
                      ? `Asignada a ${targetNames.slice(0, 3).join(', ')}${targetNames.length > 3 ? ` y ${targetNames.length - 3} más` : ''}.`
                      : 'Todavía no tiene asignaciones vigentes.'}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <Badge
                      variant="outline"
                      className="border-[#cfe0ac] bg-[#f1f7e8] text-[#52751d]"
                    >
                      Versión {routine.versionNumber}
                    </Badge>
                    <div className="flex flex-wrap items-center gap-1">
                      <RoutineQuickAssign
                        routineId={routine.id}
                        routineName={routine.name}
                        onAssigned={() => {
                          setNotice(
                            `Rutina “${routine.name}” asignada correctamente.`,
                          );
                          void load();
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={
                          Boolean(duplicatingId) || archivingId === routine.id
                        }
                        onClick={() => void duplicate(routine)}
                      >
                        {duplicatingId === routine.id ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Copy />
                        )}{' '}
                        Duplicar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={archivingId === routine.id}
                        onClick={() => void archive(routine)}
                      >
                        {archivingId === routine.id ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Archive />
                        )}{' '}
                        Archivar
                      </Button>
                      <a
                        href={`/rutinas/nueva?id=${encodeURIComponent(routine.id)}`}
                        className={cn(
                          buttonVariants({ variant: 'ghost', size: 'sm' }),
                          'text-[#29445e]',
                        )}
                      >
                        Abrir planificación <ArrowUpRight />
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof CalendarRange;
}) {
  return (
    <Card className="border-none bg-card ring-1 ring-border">
      <CardContent className="flex items-center gap-4">
        <span className="grid size-10 place-items-center rounded-xl bg-[#eef2f5] text-[#29445e]">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
