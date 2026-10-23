'use client';

/* eslint-disable next/no-html-link-for-pages -- Vinext's Link runtime currently throws during RSC prefetch. */

import { useState } from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  Dumbbell,
  Flame,
  Home,
  LoaderCircle,
  LogOut,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';

import type { AthletePortalData, PortalExercise } from '@/lib/athlete-portal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { RoutineAttachments } from '@/components/nexo/routine-attachments';

type Section = 'today' | 'plan' | 'progress' | 'profile';

export function AthletePortal({
  data,
  preview = false,
}: {
  data: AthletePortalData;
  preview?: boolean;
}) {
  const [section, setSection] = useState<Section>('today');
  const [completedIds, setCompletedIds] = useState(
    () => new Set(data.progress.completedExerciseIds),
  );
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [pse, setPse] = useState(
    data.progress.pse ?? data.routine?.targetPse ?? 5,
  );
  const [pain, setPain] = useState(data.progress.pain ?? 0);
  const [notes, setNotes] = useState(data.progress.notes);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const routine = data.routine;
  const completion = routine?.exercises.length
    ? Math.round((completedIds.size / routine.exercises.length) * 100)
    : 0;
  const initials =
    `${data.athlete.firstName[0] ?? ''}${data.athlete.lastName[0] ?? ''}`.toUpperCase();

  function toggleExercise(id: string) {
    setCompletedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setNotice('');
  }

  async function saveProgress() {
    if (!routine) return;
    setSaving(true);
    setNotice('');
    try {
      if (!preview) {
        const response = await fetch('/api/athlete/progress', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            instanceId: routine.instanceId,
            sessionKey: routine.sessionKey,
            dateKey: data.dateKey,
            completedExerciseIds: [...completedIds],
            pse,
            pain,
            notes,
            completed: completedIds.size === routine.exercises.length,
          }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok)
          throw new Error(result.error ?? 'No pudimos guardar la sesión.');
      }
      setFeedbackOpen(false);
      setNotice(
        preview
          ? 'Así verá el deportista la confirmación de su sesión.'
          : 'Tu progreso quedó guardado.',
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'No pudimos guardar la sesión.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/session', { method: 'DELETE' });
    window.location.assign('/login');
  }

  return (
    <main className="min-h-screen bg-[#f3f5ef] pb-24 text-[#11263d] md:pb-8">
      <div className="mx-auto min-h-screen max-w-[1180px] md:grid md:grid-cols-[240px_minmax(0,1fr)] md:gap-6 md:px-5 md:py-5">
        <PortalSidebar
          section={section}
          onChange={setSection}
          preview={preview}
          athleteName={`${data.athlete.firstName} ${data.athlete.lastName}`}
          initials={initials}
        />

        <div className="min-w-0">
          <header className="flex items-center justify-between px-5 py-4 md:rounded-[22px] md:bg-white md:px-6 md:shadow-[0_18px_60px_-50px_#10253d]">
            <div className="flex items-center gap-3 md:hidden">
              <span className="grid size-9 place-items-center rounded-xl bg-[#c8f15a] text-[#10253d]">
                <Zap className="size-4" fill="currentColor" />
              </span>
              <span className="text-sm font-black tracking-[-0.04em]">
                NEXO
              </span>
            </div>
            <div className="hidden md:block">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#72808c]">
                Mi espacio
              </p>
              <p className="mt-0.5 text-sm font-semibold">
                {formatLongDate(data.dateKey)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {preview && (
                <Badge className="border-0 bg-[#fff3d6] text-[#8b6318]">
                  Vista previa
                </Badge>
              )}
              <button
                onClick={() => setSection('profile')}
                className="grid size-10 place-items-center rounded-full bg-[#10253d] text-xs font-bold text-white"
                aria-label="Abrir mi perfil"
              >
                {initials}
              </button>
            </div>
          </header>

          <div className="px-4 pb-4 md:px-0 md:pt-5">
            {!preview && (
              <form
                action="/mi-entrenamiento"
                className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4"
              >
                <label className="grid gap-1 text-sm font-semibold">
                  Fecha del entrenamiento
                  <input
                    aria-label="Fecha del entrenamiento"
                    type="date"
                    name="date"
                    defaultValue={data.dateKey}
                    max={data.todayKey}
                    className="rounded-lg border p-2"
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Plan asignado
                  <select
                    name="instance"
                    defaultValue={routine?.instanceId}
                    className="max-w-64 rounded-lg border p-2"
                  >
                    {data.availableRoutines?.map((item) => (
                      <option key={item.instanceId} value={item.instanceId}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="outline">
                  Ver fecha
                </Button>
                <a
                  href="/mis-profesores"
                  className="p-2 text-sm font-semibold underline"
                >
                  Mis profesores
                </a>
                {data.dateKey !== data.todayKey && (
                  <p className="w-full text-sm text-muted-foreground">
                    Estás consultando un entrenamiento anterior. Podés registrar
                    o corregir su progreso.
                  </p>
                )}
              </form>
            )}
            {notice && (
              <output className="mb-4 flex items-center gap-2 rounded-2xl border border-[#cfe0ac] bg-[#f1f7e8] px-4 py-3 text-sm font-semibold text-[#426414]">
                <CheckCircle2 className="size-4" />
                {notice}
              </output>
            )}
            {section === 'today' && (
              <TodayView
                data={data}
                completedIds={completedIds}
                completion={completion}
                onToggle={toggleExercise}
                onFeedback={() => setFeedbackOpen(true)}
              />
            )}
            {section === 'plan' && <PlanView data={data} />}
            {section === 'progress' && <ProgressView data={data} />}
            {section === 'profile' && (
              <ProfileView
                data={data}
                preview={preview}
                onLogout={() => void logout()}
              />
            )}
          </div>
        </div>
      </div>

      <PortalBottomNav section={section} onChange={setSection} />

      <Dialog
        open={feedbackOpen}
        onOpenChange={(open) => !saving && setFeedbackOpen(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <span className="mb-1 grid size-11 place-items-center rounded-2xl bg-[#edf4e1] text-[#52751d]">
              <ClipboardCheck className="size-5" />
            </span>
            <DialogTitle>Registrá cómo te fue</DialogTitle>
            <DialogDescription>
              Estos datos ayudan a tu PF a ajustar la próxima carga.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <RangeField
              label="Esfuerzo percibido"
              value={pse}
              onChange={setPse}
              min={0}
              max={10}
              valueLabel={`${pse}/10`}
              hint={pseLabel(pse)}
            />
            <RangeField
              label="Molestia o dolor"
              value={pain}
              onChange={setPain}
              min={0}
              max={10}
              valueLabel={`${pain}/10`}
              hint={
                pain === 0
                  ? 'Sin dolor'
                  : pain <= 3
                    ? 'Leve'
                    : pain <= 6
                      ? 'Moderado'
                      : 'Alto'
              }
              danger={pain >= 4}
            />
            <label htmlFor="athlete-feedback-notes" className="block space-y-2">
              <span className="text-sm font-semibold">
                Comentario para tu PF
              </span>
              <Textarea
                id="athlete-feedback-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ej. Sentí cargado el hombro en el último bloque…"
                className="min-h-24 resize-none rounded-xl"
                maxLength={800}
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setFeedbackOpen(false)}
            >
              Volver
            </Button>
            <Button
              disabled={saving}
              onClick={() => void saveProgress()}
              className="bg-[#10253d] text-white hover:bg-[#183653]"
            >
              {saving ? <LoaderCircle className="animate-spin" /> : <Check />}{' '}
              Guardar sesión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function TodayView({
  data,
  completedIds,
  completion,
  onToggle,
  onFeedback,
}: {
  data: AthletePortalData;
  completedIds: Set<string>;
  completion: number;
  onToggle: (id: string) => void;
  onFeedback: () => void;
}) {
  const routine = data.routine;
  return (
    <div className="space-y-4">
      {routine && <RoutineAttachments instanceId={routine.instanceId} readOnly />}
      <section className="overflow-hidden rounded-[28px] bg-[#10253d] p-5 text-white shadow-[0_24px_70px_-45px_#10253d] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white/55">
              Hola, {data.athlete.firstName}
            </p>
            <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.05em] sm:text-3xl">
              {routine && !routine.scheduledToday
                ? 'Día de recuperación'
                : data.dateKey && data.dateKey !== data.todayKey
                  ? 'Tu entrenamiento de esa fecha'
                  : 'Tu entrenamiento de hoy'}
            </h1>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-[#c8f15a]">
            <Sparkles className="size-5" />
          </span>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2">
          <QuickStat
            icon={Flame}
            value={`${data.progress.streak}`}
            label="semanas"
          />
          <QuickStat
            icon={Target}
            value={`${data.progress.weeklySessions}/${data.progress.weeklyGoal}`}
            label="sesiones"
          />
          <QuickStat
            icon={Activity}
            value={routine?.scheduledToday ? `${routine.targetPse}/10` : '—'}
            label="PSE meta"
          />
        </div>
      </section>

      {!routine ? (
        <EmptyRoutine />
      ) : !routine.scheduledToday ? (
        <RestDayCard routine={routine} />
      ) : (
        <>
          <section className="rounded-[24px] border border-[#dfe5db] bg-white p-5 shadow-[0_18px_60px_-52px_#10253d]">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#edfad1] text-[#4f7019]">
                <Dumbbell className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-[-0.035em]">
                    {routine.sessionName}
                  </h2>
                  <Badge
                    variant="outline"
                    className="border-[#d7e7b6] bg-[#f4fae9] text-[#52751d]"
                  >
                    {routine.name}
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-[#667480]">
                  {routine.warmup}
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between text-sm">
              <span className="font-semibold">Avance de la sesión</span>
              <span className="font-bold tabular-nums">{completion}%</span>
            </div>
            <Progress
              value={completion}
              className="mt-2 h-2.5 [&_[data-slot=progress-track]]:bg-[#e9ede5] [&_[data-slot=progress-indicator]]:bg-[#9ccb2f]"
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-end justify-between px-1">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#75828c]">
                  Sesión
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-[-0.035em]">
                  {routine.exercises.length} ejercicios
                </h2>
              </div>
              <span className="text-sm font-semibold text-[#667480]">
                {completedIds.size} listos
              </span>
            </div>
            {routine.exercises.map((exercise, index) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                index={index}
                completed={completedIds.has(exercise.id)}
                onToggle={() => onToggle(exercise.id)}
              />
            ))}
          </section>

          {routine.instructions && (
            <section className="flex gap-3 rounded-[22px] border border-[#eadfbf] bg-[#fff9e9] p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f6e7b9] text-[#8a651c]">
                <MessageCircleMore className="size-4" />
              </span>
              <div>
                <p className="font-semibold">Indicación de tu PF</p>
                <p className="mt-1 text-sm leading-6 text-[#6e654d]">
                  {routine.instructions}
                </p>
              </div>
            </section>
          )}

          <Button
            onClick={onFeedback}
            className="h-12 w-full rounded-2xl bg-[#10253d] text-base text-white shadow-lg shadow-[#10253d]/10 hover:bg-[#183653]"
          >
            <ClipboardCheck /> Registrar la sesión
          </Button>
        </>
      )}
    </div>
  );
}

function ExerciseCard({
  exercise,
  index,
  completed,
  onToggle,
}: {
  exercise: PortalExercise;
  index: number;
  completed: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      className={cn(
        'flex items-center gap-3 rounded-[22px] border bg-white p-4 transition',
        completed ? 'border-[#cfe0ac] bg-[#f7fbef]' : 'border-[#dfe5db]',
      )}
    >
      <button
        onClick={onToggle}
        aria-label={
          completed
            ? `Marcar ${exercise.name} como pendiente`
            : `Marcar ${exercise.name} como completado`
        }
        aria-pressed={completed}
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-2xl border-2 transition',
          completed
            ? 'border-[#94bf2c] bg-[#a8d33f] text-[#19310a]'
            : 'border-[#d8dfd4] bg-[#f6f8f3] text-[#87918a]',
        )}
      >
        {completed ? (
          <Check className="size-5" strokeWidth={3} />
        ) : (
          <span className="text-sm font-bold">{index + 1}</span>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            className={cn(
              'font-bold leading-snug',
              completed && 'text-[#53604f] line-through decoration-[#9eb57b]',
            )}
          >
            {exercise.name}
          </h3>
          <span className="rounded-full bg-[#eef2f4] px-2 py-0.5 text-[11px] font-bold text-[#587080]">
            {exercise.category}
          </span>
        </div>
        <p className="mt-1 text-sm text-[#6b7881]">Bloque {exercise.block}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums">{exercise.target}</p>
        <p className="mt-1 text-xs text-[#7c8991]">RIR {exercise.rir}</p>
      </div>
    </article>
  );
}

function RestDayCard({
  routine,
}: {
  routine: NonNullable<AthletePortalData['routine']>;
}) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-[#dfe5db] bg-white p-5 shadow-[0_18px_60px_-52px_#10253d] sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#edf4e1] text-[#52751d]">
          <CalendarDays className="size-5" />
        </span>
        <div>
          <Badge className="border-0 bg-[#f1f7e8] text-[#52751d]">
            {routine.todayLabel} · descanso
          </Badge>
          <h2 className="mt-3 text-xl font-bold tracking-[-0.035em]">
            No tenés una sesión programada hoy
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#667480]">
            {routine.nextSession
              ? `La próxima es ${routine.nextSession.name}, el ${routine.nextSession.weekdayLabel.toLowerCase()}${routine.nextSession.daysAway === 1 ? ' (mañana)' : `, dentro de ${routine.nextSession.daysAway} días`}.`
              : 'Tu PF todavía no definió el próximo día de trabajo.'}
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {routine.sessions.map((session) => (
          <div key={session.id} className="rounded-2xl bg-[#f4f6f1] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#6f7f68]">
              {session.weekdayLabel}
            </p>
            <p className="mt-1 truncate text-sm font-semibold">
              {session.name}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlanView({ data }: { data: AthletePortalData }) {
  return (
    <div className="space-y-4">
      <PageTitle
        eyebrow="Mi planificación"
        title="Tu ciclo de trabajo"
        description="Revisá el objetivo de cada semana y lo que viene después."
      />
      {!data.routine ? (
        <EmptyRoutine />
      ) : (
        <>
          <section className="rounded-[26px] bg-[#10253d] p-5 text-white">
            <p className="text-sm text-white/55">Plan activo</p>
            <h2 className="mt-1 text-2xl font-bold tracking-[-0.04em]">
              {data.routine.name}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              {data.routine.description}
            </p>
          </section>
          <section className="rounded-[24px] border border-[#dfe5db] bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#75828c]">
                  Semana tipo
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  {data.routine.sessions.length} días de entrenamiento
                </h2>
              </div>
              <CalendarDays className="size-5 text-[#52751d]" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {data.routine.sessions.map((session) => (
                <article
                  key={session.id}
                  className={cn(
                    'rounded-2xl border p-3',
                    session.isToday
                      ? 'border-[#9fcf2d] bg-[#f3f9e8]'
                      : 'border-[#e2e7df] bg-[#f8f9f6]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#63745b]">
                      {session.weekdayLabel}
                    </p>
                    {session.isToday && (
                      <Badge className="border-0 bg-[#10253d] text-[#c8f15a]">
                        Día elegido
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 font-semibold">{session.name}</p>
                </article>
              ))}
            </div>
          </section>
          <div className="space-y-3">
            {data.routine.weeks.map((week) => (
              <article
                key={week.number}
                className={cn(
                  'rounded-[22px] border p-4',
                  week.status === 'current'
                    ? 'border-[#9fcf2d] bg-[#f3f9e8]'
                    : 'border-[#dfe5db] bg-white',
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'grid size-11 place-items-center rounded-2xl font-bold',
                      week.status === 'completed'
                        ? 'bg-[#e9f4d6] text-[#52751d]'
                        : week.status === 'current'
                          ? 'bg-[#10253d] text-[#c8f15a]'
                          : 'bg-[#eef1ec] text-[#758078]',
                    )}
                  >
                    {week.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">Semana {week.number}</h3>
                      {week.status === 'completed' && (
                        <Badge variant="outline">Transcurrida</Badge>
                      )}
                      <Badge variant="outline" className="bg-white/60">
                        {week.phase}
                      </Badge>
                      {week.status === 'current' && (
                        <Badge className="border-0 bg-[#c8f15a] text-[#26340f]">
                          Actual
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[#667480]">
                      {week.objective} · {week.secondary}
                    </p>
                  </div>
                  <span className="text-sm font-bold">PSE {week.pse}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProgressView({ data }: { data: AthletePortalData }) {
  const weeklyPercent = Math.min(
    100,
    Math.round(
      (data.progress.weeklySessions / Math.max(1, data.progress.weeklyGoal)) *
        100,
    ),
  );
  return (
    <div className="space-y-4">
      <PageTitle
        eyebrow="Mi evolución"
        title="Progreso"
        description="Tus registros más importantes, en un formato fácil de seguir."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-[24px] bg-[#10253d] p-5 text-white">
          <span className="grid size-10 place-items-center rounded-2xl bg-white/10 text-[#c8f15a]">
            <Trophy className="size-5" />
          </span>
          <p className="mt-5 text-sm text-white/55">Cumplimiento semanal</p>
          <p className="mt-1 text-4xl font-bold tracking-[-0.06em]">
            {weeklyPercent}%
          </p>
          <Progress
            value={weeklyPercent}
            className="mt-4 [&_[data-slot=progress-track]]:bg-white/10 [&_[data-slot=progress-indicator]]:bg-[#c8f15a]"
          />
        </section>
        <section className="rounded-[24px] border border-[#dfe5db] bg-white p-5">
          <span className="grid size-10 place-items-center rounded-2xl bg-[#fff3d6] text-[#8b6318]">
            <Flame className="size-5" />
          </span>
          <p className="mt-5 text-sm text-[#71808b]">Racha actual</p>
          <p className="mt-1 text-4xl font-bold tracking-[-0.06em]">
            {data.progress.streak}
          </p>
          <p className="mt-1 text-sm text-[#71808b]">
            semanas con actividad registrada
          </p>
        </section>
      </div>
      <section className="rounded-[24px] border border-[#dfe5db] bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#75828c]">
              Evaluaciones
            </p>
            <h2 className="mt-1 text-xl font-bold">Últimas mejoras</h2>
          </div>
          <span className="grid size-10 place-items-center rounded-2xl bg-[#edf3f7] text-[#315a78]">
            <BarChart3 className="size-5" />
          </span>
        </div>
        <div className="mt-5 divide-y divide-[#e6ebe2]">
          {data.evaluations.length ? (
            data.evaluations.map((evaluation) => (
              <div
                key={evaluation.label}
                className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{evaluation.label}</p>
                  <p className="mt-0.5 text-sm text-[#71808b]">
                    Mejor registro
                  </p>
                </div>
                <p className="font-bold">{evaluation.value}</p>
                <span
                  className={cn(
                    'rounded-full px-2 py-1 text-xs font-bold',
                    evaluation.positive
                      ? 'bg-[#edf6dc] text-[#52751d]'
                      : 'bg-[#fff0ed] text-[#a23f30]',
                  )}
                >
                  {evaluation.change > 0 ? '+' : ''}
                  {evaluation.change.toLocaleString('es-AR')}%
                </span>
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-sm text-[#71808b]">
              Todavía no hay evaluaciones comparables.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileView({
  data,
  preview,
  onLogout,
}: {
  data: AthletePortalData;
  preview: boolean;
  onLogout: () => void;
}) {
  const initials =
    `${data.athlete.firstName[0] ?? ''}${data.athlete.lastName[0] ?? ''}`.toUpperCase();
  return (
    <div className="space-y-4">
      <PageTitle
        eyebrow="Mi cuenta"
        title="Perfil"
        description="Tu información deportiva y los grupos a los que pertenecés."
      />
      <section className="rounded-[26px] bg-[#10253d] p-5 text-white">
        <div className="flex items-center gap-4">
          <span className="grid size-16 place-items-center rounded-[22px] bg-white/10 text-xl font-bold text-[#c8f15a]">
            {initials}
          </span>
          <div>
            <h2 className="text-xl font-bold">
              {data.athlete.firstName} {data.athlete.lastName}
            </h2>
            <p className="mt-1 text-sm text-white/55">
              {data.athlete.position ?? 'Deportista'}
            </p>
          </div>
        </div>
      </section>
      <section className="rounded-[24px] border border-[#dfe5db] bg-white p-5">
        <ProfileRow
          icon={Dumbbell}
          label="Posición / rol"
          value={data.athlete.position ?? 'Sin definir'}
        />
        <ProfileRow
          icon={CircleUserRound}
          label="Email"
          value={data.athlete.email}
        />
        <ProfileRow
          icon={ShieldCheck}
          label="País"
          value={data.athlete.countryCode ?? 'Sin definir'}
        />
        <ProfileRow
          icon={CalendarDays}
          label="Grupos"
          value={
            data.athlete.groups.length
              ? data.athlete.groups.join(', ')
              : 'Sin grupo'
          }
          last
        />
      </section>
      {preview ? (
        <a
          href="/deportistas"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#ccd5c8] bg-white font-semibold transition hover:bg-[#f6f8f3]"
        >
          <ChevronRight className="size-4 rotate-180" /> Volver a clientes
        </a>
      ) : (
        <Button
          variant="outline"
          onClick={onLogout}
          className="h-12 w-full rounded-2xl border-[#e2c9c2] text-[#9e4032] hover:bg-[#fff3f0]"
        >
          <LogOut /> Cerrar sesión
        </Button>
      )}
    </div>
  );
}

function PortalSidebar({
  section,
  onChange,
  preview,
  athleteName,
  initials,
}: {
  section: Section;
  onChange: (section: Section) => void;
  preview: boolean;
  athleteName: string;
  initials: string;
}) {
  return (
    <aside className="hidden min-h-[calc(100vh-40px)] rounded-[26px] bg-[#10253d] p-4 text-white md:flex md:flex-col">
      <div className="flex items-center gap-3 px-2 py-2">
        <span className="grid size-10 place-items-center rounded-xl bg-[#c8f15a] text-[#10253d]">
          <Zap className="size-5" fill="currentColor" />
        </span>
        <div>
          <p className="font-black tracking-[-0.04em]">NEXO</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">
            Deportista
          </p>
        </div>
      </div>
      <nav aria-label="Secciones del portal" className="mt-8 space-y-1.5">
        {portalItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition',
              section === item.id
                ? 'bg-white text-[#10253d]'
                : 'text-white/62 hover:bg-white/8 hover:text-white',
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="mt-auto rounded-2xl bg-white/8 p-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-[#c8f15a] text-xs font-bold text-[#10253d]">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{athleteName}</p>
            <p className="text-xs text-white/40">
              {preview ? 'Vista previa' : 'Mi cuenta'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function PortalBottomNav({
  section,
  onChange,
}: {
  section: Section;
  onChange: (section: Section) => void;
}) {
  return (
    <nav
      aria-label="Secciones del portal"
      className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-[22px] border border-white/50 bg-[#10253d]/95 p-1.5 shadow-2xl backdrop-blur-xl md:hidden"
    >
      {portalItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            'flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-semibold transition',
            section === item.id ? 'bg-white text-[#10253d]' : 'text-white/55',
          )}
        >
          <item.icon className="size-4" />
          {item.label}
        </button>
      ))}
    </nav>
  );
}

const portalItems: Array<{ id: Section; label: string; icon: typeof Home }> = [
  { id: 'today', label: 'Hoy', icon: Home },
  { id: 'plan', label: 'Mi plan', icon: Dumbbell },
  { id: 'progress', label: 'Progreso', icon: BarChart3 },
  { id: 'profile', label: 'Perfil', icon: CircleUserRound },
];

function QuickStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Flame;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl bg-white/7 p-3">
      <Icon className="size-4 text-[#c8f15a]" />
      <p className="mt-3 text-lg font-bold">{value}</p>
      <p className="text-[11px] text-white/45">{label}</p>
    </div>
  );
}

function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="px-1 pb-1 pt-2">
      <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#73818a]">
        {eyebrow}
      </p>
      <h1 className="mt-1 text-[28px] font-bold tracking-[-0.05em]">{title}</h1>
      <p className="mt-1 max-w-xl text-sm leading-6 text-[#6b7881]">
        {description}
      </p>
    </header>
  );
}

function EmptyRoutine() {
  return (
    <section className="rounded-[26px] border border-dashed border-[#cfd8ca] bg-white/65 px-5 py-12 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf3e5] text-[#5c7630]">
        <Dumbbell className="size-5" />
      </span>
      <h2 className="mt-4 text-lg font-bold">No hay una rutina activa</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#6b7881]">
        Cuando tu PF te asigne una planificación, la vas a encontrar acá.
      </p>
    </section>
  );
}

function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  valueLabel,
  hint,
  danger = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  valueLabel: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <div className="block rounded-2xl border border-[#e0e5dc] p-4">
      <span className="flex items-end justify-between gap-3">
        <span>
          <span className="block text-sm font-semibold">{label}</span>
          <span
            className={cn(
              'mt-0.5 block text-xs',
              danger ? 'text-[#aa4434]' : 'text-muted-foreground',
            )}
          >
            {hint}
          </span>
        </span>
        <strong
          className={cn('text-2xl tabular-nums', danger && 'text-[#aa4434]')}
        >
          {valueLabel}
        </strong>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-4 w-full accent-[#8fbc29]"
      />
    </div>
  );
}

function ProfileRow({
  icon: Icon,
  label,
  value,
  last = false,
}: {
  icon: typeof Dumbbell;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 py-3.5',
        !last && 'border-b border-[#e7ebe4]',
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0f3ed] text-[#52636e]">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[#7a878f]">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function pseLabel(value: number) {
  if (value <= 2) return 'Muy fácil';
  if (value <= 4) return 'Moderado';
  if (value <= 6) return 'Duro';
  if (value <= 8) return 'Muy duro';
  return 'Máximo';
}

function formatLongDate(dateKey?: string) {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(dateKey ? new Date(`${dateKey}T12:00:00Z`) : new Date());
}
