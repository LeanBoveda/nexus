/* eslint-disable next/no-html-link-for-pages -- Native links follow the project's navigation convention. */
import { resolveRoutineSession } from '@/lib/athlete-portal';
import {
  addTrainingDays,
  type TrainingOverview,
} from '@/lib/training-overview';

const fieldClass =
  'rounded-xl border border-[#dce3d7] bg-white px-3 py-2 text-sm';
function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(`${date}T12:00:00Z`));
}
function avg(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length
    ? (numbers.reduce((a, b) => a + b, 0) / numbers.length).toLocaleString(
        'es-AR',
        { maximumFractionDigits: 1 },
      )
    : '—';
}

export function TrainingOverviewView({
  mode,
  from,
  to,
  data,
  athleteId,
}: {
  mode: 'agenda' | 'carga';
  from: string;
  to: string;
  data: TrainingOverview;
  athleteId?: string;
}) {
  const people = [
    ...new Map(data.assignments.map((item) => [item.athleteId, item])).values(),
  ];
  const entries = data.entries
    .filter((entry) => !athleteId || entry.athleteId === athleteId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const dayCount =
    mode === 'agenda'
      ? 7
      : Math.min(
          90,
          Math.floor(
            (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
              86400000,
          ) + 1,
        );
  const calendar = Array.from({ length: dayCount }, (_, index) =>
    addTrainingDays(from, index),
  ).map((date) => ({
    date,
    sessions: data.assignments
      .filter(
        (item) =>
          (!athleteId || item.athleteId === athleteId) &&
          item.startsOn <= date &&
          (!item.endsOn || item.endsOn >= date),
      )
      .flatMap((assignment) => {
        const routine = resolveRoutineSession(assignment, date);
        return routine.scheduledToday
          ? [
              {
                assignment,
                routine,
                log: entries.find(
                  (item) =>
                    item.instanceId === assignment.instanceId &&
                    item.date === date,
                ),
              },
            ]
          : [];
      }),
  }));
  const planned = calendar.reduce(
    (total, day) => total + day.sessions.length,
    0,
  );
  const completed = calendar.reduce(
    (total, day) =>
      total +
      day.sessions.filter((session) => session.log?.completedAt != null).length,
    0,
  );
  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-6 sm:px-7 lg:px-9">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Seguimiento del entrenamiento
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {mode === 'agenda' ? 'Agenda' : 'Carga y cumplimiento'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === 'agenda'
              ? 'Las sesiones previstas para siete días según el calendario de cada plan.'
              : 'Registros por fecha de entrenamiento. Hasta 90 días por consulta.'}
          </p>
        </div>
        <nav aria-label="Seguimiento" className="flex gap-2">
          <a href="/agenda" className={fieldClass}>
            Agenda
          </a>
          <a href="/carga" className={fieldClass}>
            Carga
          </a>
        </nav>
      </header>
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4"
      >
        {mode === 'agenda' ? (
          <label className="grid gap-1 text-sm font-semibold">
            Desde
            <input
              type="date"
              name="date"
              defaultValue={from}
              min="2000-01-01"
              max="2100-01-01"
              className={fieldClass}
              required
            />
          </label>
        ) : (
          <>
            <label className="grid gap-1 text-sm font-semibold">
              Desde
              <input
                type="date"
                name="from"
                defaultValue={from}
                max={to}
                className={fieldClass}
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Hasta
              <input
                type="date"
                name="to"
                defaultValue={to}
                className={fieldClass}
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Alumno
              <select
                name="athlete"
                defaultValue={athleteId ?? ''}
                className={fieldClass}
              >
                <option value="">Todos</option>
                {people.map((person) => (
                  <option key={person.athleteId} value={person.athleteId}>
                    {person.lastName}, {person.firstName}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button
          type="submit"
          className="rounded-xl bg-[#10253d] px-5 py-2 text-sm font-semibold text-white"
        >
          Consultar
        </button>
        <p className="pb-2 text-xs text-muted-foreground">
          {formatDate(from)} al {formatDate(to)}
        </p>
      </form>
      {mode === 'agenda' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {calendar.map((day) => (
            <section key={day.date} className="rounded-2xl border bg-white p-4">
              <h2 className="border-b pb-3 font-bold capitalize">
                {formatDate(day.date)}
              </h2>
              {day.sessions.length ? (
                <div className="divide-y">
                  {day.sessions.map(({ assignment, routine, log }) => (
                    <article
                      key={assignment.instanceId}
                      className="space-y-1 py-3"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <a
                          href={`/deportistas/${assignment.athleteId}`}
                          className="font-semibold underline"
                        >
                          {assignment.lastName}, {assignment.firstName}
                        </a>
                        <span className="rounded-full bg-[#edf5dd] px-2 py-1 text-xs font-semibold">
                          {log
                            ? log.completedAt
                              ? 'Completada'
                              : 'En progreso'
                            : 'Sin registrar'}
                        </span>
                      </div>
                      <p className="text-sm">
                        {assignment.name} · {routine.sessionName} · Semana{' '}
                        {routine.weeks.find((week) => week.status === 'current')
                          ?.number ?? '1'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {assignment.groups || 'Sin grupo'} · PSE previsto{' '}
                        {routine.targetPse}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-sm text-muted-foreground">
                  No hay sesiones programadas.
                </p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ['Registros', String(entries.length)],
              ['Sesiones completadas / previstas', `${completed}/${planned}`],
              ['PSE medio', avg(entries.map((entry) => entry.pse))],
              ['Dolor medio', avg(entries.map((entry) => entry.pain))],
            ].map(([label, value]) => (
              <section
                key={label}
                className="rounded-2xl bg-[#10253d] p-5 text-white"
              >
                <p className="text-sm text-white/60">{label}</p>
                <p className="mt-2 text-3xl font-bold text-[#c8f15a]">
                  {value}
                </p>
              </section>
            ))}
          </div>
          <section className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="p-4 text-left font-semibold">
                Registros del período · atención si PSE ≥ 8 o dolor ≥ 4
              </caption>
              <thead className="bg-[#f3f5ef]">
                <tr>
                  {[
                    'Fecha',
                    'Alumno / plan',
                    'Estado',
                    'PSE',
                    'Dolor',
                    'Comentario',
                  ].map((label) => (
                    <th key={label} className="px-4 py-3 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-t">
                    <td className="px-4 py-3">{formatDate(entry.date)}</td>
                    <td className="px-4 py-3">
                      <a
                        href={`/deportistas/${entry.athleteId}`}
                        className="font-semibold underline"
                      >
                        {entry.assignment.lastName},{' '}
                        {entry.assignment.firstName}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {entry.assignment.name}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {entry.completedAt !== null
                        ? 'Completada'
                        : 'En progreso'}
                    </td>
                    <td
                      className={`px-4 py-3 ${(entry.pse ?? 0) >= 8 ? 'font-bold text-amber-700' : ''}`}
                    >
                      {entry.pse ?? '—'}
                      {(entry.pse ?? 0) >= 8 ? ' · Alto' : ''}
                    </td>
                    <td
                      className={`px-4 py-3 ${(entry.pain ?? 0) >= 4 ? 'font-bold text-red-700' : ''}`}
                    >
                      {entry.pain ?? '—'}
                      {(entry.pain ?? 0) >= 4 ? ' · Revisar' : ''}
                    </td>
                    <td className="max-w-80 whitespace-pre-wrap break-words px-4 py-3">
                      {entry.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!entries.length && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No hay registros para los filtros elegidos.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
