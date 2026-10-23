'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Download,
  LineChartIcon,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  TrendingUp,
} from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { filterEvaluationAthletes } from '@/lib/evaluation-athlete-filters';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type Metric = {
  id: string;
  key: string;
  label: string;
  unit: string;
  betterDirection: 'higher' | 'lower' | 'neutral';
  protocol: string | null;
  sortOrder: number;
  archivedAt?: number | null;
};
type Athlete = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  primaryPosition: string | null;
  groupIds: string[];
};
type Group = { id: string; name: string };
type ResultRow = {
  sessionId: string;
  athleteId: string;
  athleteName: string;
  groupId: string | null;
  groupName: string | null;
  evaluatedAt: number;
  surface: string;
  notes: string | null;
  metricId: string;
  label: string;
  unit: string;
  betterDirection: 'higher' | 'lower' | 'neutral';
  value: number;
  archivedAt?: number | null;
};
type Template = {
  id: string;
  name: string;
  sport: string;
  description: string | null;
  archivedAt: number | null;
};
type EvaluationData = {
  templateId?: string;
  template?: Template;
  templates?: Template[];
  historicalMetrics?: Metric[];
  metrics: Metric[];
  athletes: Athlete[];
  groups: Group[];
  results: ResultRow[];
};

const chartConfig = {
  value: { label: 'Resultado', color: '#9fcf2d' },
} satisfies ChartConfig;

export function EvaluationDashboard({
  athleteName,
  athleteId,
  embedded = false,
}: {
  athleteName?: string;
  athleteId?: string;
  embedded?: boolean;
}) {
  const [data, setData] = useState<EvaluationData>({
    metrics: [],
    athletes: [],
    groups: [],
    results: [],
  });
  const [selectedAthleteId, setSelectedAthleteId] = useState(athleteId ?? '');
  const [athleteFilters, setAthleteFilters] = useState({
    query: '',
    groupId: '',
    position: '',
    evaluated: '',
  });
  const [selectedMetricId, setSelectedMetricId] = useState('');
  const [evaluatedAt, setEvaluatedAt] = useState(today());
  const [surface, setSurface] = useState('indoor');
  const [groupId, setGroupId] = useState('');
  const [notes, setNotes] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [metricDialogOpen, setMetricDialogOpen] = useState(false);
  const [metricSaving, setMetricSaving] = useState(false);
  const [metricForm, setMetricForm] = useState({
    label: '',
    unit: '',
    betterDirection: 'higher',
    protocol: '',
  });
  const [templateId, setTemplateId] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [comparisonSurface, setComparisonSurface] = useState('');
  const [editingMetricId, setEditingMetricId] = useState('');
  const [editingSessionId, setEditingSessionId] = useState('');
  const [message, setMessage] = useState('');
  const [templateDialog, setTemplateDialog] = useState<
    'create' | 'edit' | null
  >(null);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    sport: '',
    description: '',
  });
  const [actionSaving, setActionSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (athleteId) params.set('athleteId', athleteId);
      if (templateId) params.set('templateId', templateId);
      if (includeArchived) params.set('includeArchived', '1');
      const query = `?${params}`;
      const response = await fetch(`/api/evaluations${query}`, {
        cache: 'no-store',
      });
      const result = (await response.json()) as EvaluationData & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          result.error || 'No se pudieron cargar las evaluaciones.',
        );
      setData(result);
      setSelectedAthleteId(
        (current) => current || athleteId || result.athletes[0]?.id || '',
      );
      const historyMetrics = result.historicalMetrics ?? result.metrics;
      setSelectedMetricId((current) =>
        current && historyMetrics.some((metric) => metric.id === current)
          ? current
          : historyMetrics[0]?.id || '',
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron cargar las evaluaciones.',
      );
    } finally {
      setLoading(false);
    }
  }, [athleteId, templateId, includeArchived]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedAthlete = data.athletes.find(
    (athlete) => athlete.id === selectedAthleteId,
  );
  const evaluatedIds = useMemo(
    () =>
      new Set(
        data.results
          .filter((row) => !row.archivedAt)
          .map((row) => row.athleteId),
      ),
    [data.results],
  );
  const filteredAthletes = useMemo(
    () => filterEvaluationAthletes(data.athletes, athleteFilters, evaluatedIds),
    [data.athletes, athleteFilters, evaluatedIds],
  );
  const positions = [
    ...new Set(
      data.athletes
        .map((athlete) => athlete.primaryPosition)
        .filter((position): position is string => Boolean(position)),
    ),
  ].sort((a, b) => a.localeCompare(b, 'es'));
  const selectedOutsideFilter =
    selectedAthlete &&
    !filteredAthletes.some((athlete) => athlete.id === selectedAthleteId);
  const athleteResults = useMemo(
    () => data.results.filter((row) => row.athleteId === selectedAthleteId),
    [data.results, selectedAthleteId],
  );
  const historyMetrics = data.historicalMetrics ?? data.metrics;
  const surfaces = [
    ...new Set(
      athleteResults.filter((row) => !row.archivedAt).map((row) => row.surface),
    ),
  ];
  const effectiveSurface = surfaces.includes(comparisonSurface)
    ? comparisonSurface
    : (surfaces[0] ?? '');
  const summaries = (data.historicalMetrics ?? data.metrics).map((metric) => {
    const points = athleteResults
      .filter(
        (row) =>
          row.metricId === metric.id &&
          row.surface === effectiveSurface &&
          !row.archivedAt,
      )
      .sort((left, right) => left.evaluatedAt - right.evaluatedAt);
    return {
      metric,
      points,
      initial: points[0],
      previous: points.at(-2),
      current: points.at(-1),
    };
  });
  const selectedSummary =
    summaries.find((summary) => summary.metric.id === selectedMetricId) ??
    summaries[0];
  const chartData = (selectedSummary?.points ?? []).map((point) => ({
    date: shortDate(point.evaluatedAt),
    value: point.value,
  }));
  const totalImprovement =
    selectedSummary?.initial && selectedSummary.current
      ? improvement(
          selectedSummary.initial.value,
          selectedSummary.current.value,
          selectedSummary.metric.betterDirection,
        )
      : 0;
  const displayName =
    athleteName ||
    (selectedAthlete
      ? `${selectedAthlete.firstName} ${selectedAthlete.lastName}`
      : 'Sin deportista');

  async function saveEvaluation() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const results = Object.entries(values)
        .filter(([, value]) => value !== '')
        .map(([metricId, value]) => ({ metricId, value }));
      const response = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: editingSessionId ? 'updateSession' : 'save',
          sessionId: editingSessionId || undefined,
          templateId: data.templateId,
          athleteId: selectedAthleteId,
          groupId: groupId || null,
          evaluatedAt,
          surface,
          notes,
          results,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'No se pudo guardar la evaluación.');
      setValues({});
      setNotes('');
      setEditingSessionId('');
      setSaved(true);
      await load();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No se pudo guardar la evaluación.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function createMetric() {
    setMetricSaving(true);
    setError('');
    try {
      const response = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: editingMetricId ? 'updateMetric' : 'createMetric',
          metricId: editingMetricId || undefined,
          templateId: data.templateId,
          ...metricForm,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'No se pudo crear el test.');
      setMessage(result.message ?? 'Test actualizado.');
      if (!editingSessionId) setValues({});
      setEditingMetricId('');
      setMetricForm({
        label: '',
        unit: '',
        betterDirection: 'higher',
        protocol: '',
      });
      setMetricDialogOpen(false);
      await load();
    } catch (metricError) {
      setError(
        metricError instanceof Error
          ? metricError.message
          : 'No se pudo crear el test.',
      );
    } finally {
      setMetricSaving(false);
    }
  }

  async function action(payload: Record<string, unknown>) {
    setActionSaving(true);
    setError('');
    try {
      const response = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId: data.templateId, ...payload }),
      });
      const result = (await response.json()) as {
        error?: string;
        templateId?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'No pudimos guardar los cambios.');
      if (payload.action === 'createTemplate') {
        setTemplateId(result.templateId ?? '');
        setValues({});
        setEditingSessionId('');
      } else if (payload.action === 'archiveTemplate') {
        setTemplateId('');
        setValues({});
        setEditingSessionId('');
      } else {
        if (payload.action === 'archiveMetric')
          setValues((current) => {
            const next = { ...current };
            delete next[String(payload.metricId)];
            return next;
          });
        await load();
      }
      setTemplateDialog(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error al guardar.');
    } finally {
      setActionSaving(false);
    }
  }

  function editSession(row: ResultRow) {
    const entries = athleteResults.filter(
      (item) => item.sessionId === row.sessionId,
    );
    setEditingSessionId(row.sessionId);
    setEvaluatedAt(new Date(row.evaluatedAt).toISOString().slice(0, 10));
    setSurface(row.surface);
    setGroupId(row.groupId ?? '');
    setNotes(row.notes ?? '');
    setValues(
      Object.fromEntries(
        entries.map((item) => [item.metricId, String(item.value)]),
      ),
    );
    setSaved(false);
    document
      .getElementById('evaluation-form')
      ?.scrollIntoView({ behavior: 'smooth' });
  }

  function exportCsv() {
    if (athleteResults.length === 0) return;
    const header = [
      'Deportista',
      'Fecha',
      'Superficie',
      'Test',
      'Valor',
      'Unidad',
      'Grupo',
      'Notas',
      'ID del test',
      'ID de evaluación',
      'Estado',
    ];
    const lines = athleteResults.map((row) => [
      row.athleteName,
      new Date(row.evaluatedAt).toLocaleDateString('es-AR'),
      surfaceLabel(row.surface),
      row.label,
      row.value,
      row.unit,
      row.groupName ?? '',
      row.notes ?? '',
      row.metricId,
      row.sessionId,
      row.archivedAt ? 'Archivada' : 'Vigente',
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map(csvCell).join(','))
      .join('\n');
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `evaluaciones-${slug(displayName)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading)
    return (
      <div className="mt-6 grid min-h-64 place-items-center rounded-[22px] border border-border bg-card">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Cargando
          evaluaciones…
        </span>
      </div>
    );

  return (
    <div className={embedded ? '' : 'mt-6'}>
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4">
        <Field label="Plantilla de evaluaciones">
          <select
            aria-label="Plantilla de evaluaciones"
            className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
            value={data.templateId ?? ''}
            onChange={(event) => {
              setTemplateId(event.target.value);
              setValues({});
              setEditingSessionId('');
            }}
          >
            {(data.templates ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.sport}
                {item.archivedAt ? ' (archivada)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Button
          variant="outline"
          onClick={() => {
            setTemplateForm({ name: '', sport: '', description: '' });
            setTemplateDialog('create');
          }}
        >
          Nueva plantilla
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setTemplateForm({
              name: data.template?.name ?? '',
              sport: data.template?.sport ?? '',
              description: data.template?.description ?? '',
            });
            setTemplateDialog('edit');
          }}
        >
          Editar plantilla
        </Button>
        <Button
          variant="outline"
          disabled={actionSaving || Boolean(data.template?.archivedAt)}
          onClick={() => {
            if (
              window.confirm(
                '¿Archivar esta plantilla? El historial se conserva.',
              )
            )
              void action({ action: 'archiveTemplate' });
          }}
        >
          Archivar plantilla
        </Button>
        <label className="flex h-10 items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />{' '}
          Ver archivo histórico
        </label>
      </div>
      <Dialog
        open={templateDialog !== null}
        onOpenChange={(open) => {
          if (!open) setTemplateDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {templateDialog === 'create'
                ? 'Nueva plantilla'
                : 'Editar plantilla'}
            </DialogTitle>
            <DialogDescription>
              Armá una batería de tests para cualquier deporte.
            </DialogDescription>
          </DialogHeader>
          <Field label="Nombre">
            <Input
              value={templateForm.name}
              onChange={(event) =>
                setTemplateForm((form) => ({
                  ...form,
                  name: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="Deporte">
            <Input
              value={templateForm.sport}
              placeholder="Ej. Atletismo, tenis, rehabilitación"
              onChange={(event) =>
                setTemplateForm((form) => ({
                  ...form,
                  sport: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="Descripción">
            <Textarea
              value={templateForm.description}
              onChange={(event) =>
                setTemplateForm((form) => ({
                  ...form,
                  description: event.target.value,
                }))
              }
            />
          </Field>
          <DialogFooter>
            <Button
              disabled={
                actionSaving ||
                !templateForm.name.trim() ||
                !templateForm.sport.trim()
              }
              onClick={() =>
                void action({
                  action:
                    templateDialog === 'create'
                      ? 'createTemplate'
                      : 'updateTemplate',
                  ...templateForm,
                })
              }
            >
              Guardar plantilla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {message && (
        <output className="mb-4 block rounded-xl bg-[#f1f7e8] p-3 text-sm text-[#3f6110]">
          {message}
        </output>
      )}
      {!athleteId && (
        <section
          aria-label="Buscar y filtrar jugadores"
          className="mb-5 rounded-2xl border bg-card p-4"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Buscar jugador">
              <Input
                aria-label="Buscar jugador"
                placeholder="Nombre, apellido o email…"
                value={athleteFilters.query}
                onChange={(event) =>
                  setAthleteFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Filtrar por grupo">
              <select
                aria-label="Filtrar por grupo"
                className="h-10 w-full rounded-xl border bg-card px-3 text-sm"
                value={athleteFilters.groupId}
                onChange={(event) =>
                  setAthleteFilters((current) => ({
                    ...current,
                    groupId: event.target.value,
                  }))
                }
              >
                <option value="">Todos los grupos</option>
                <option value="__ungrouped">Sin grupo</option>
                {data.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Filtrar por posición">
              <select
                aria-label="Filtrar por posición"
                className="h-10 w-full rounded-xl border bg-card px-3 text-sm"
                value={athleteFilters.position}
                onChange={(event) =>
                  setAthleteFilters((current) => ({
                    ...current,
                    position: event.target.value,
                  }))
                }
              >
                <option value="">Todas las posiciones</option>
                {positions.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Evaluaciones en esta plantilla">
              <select
                aria-label="Evaluaciones en esta plantilla"
                className="h-10 w-full rounded-xl border bg-card px-3 text-sm"
                value={athleteFilters.evaluated}
                onChange={(event) =>
                  setAthleteFilters((current) => ({
                    ...current,
                    evaluated: event.target.value,
                  }))
                }
              >
                <option value="">Todos los jugadores</option>
                <option value="yes">Con evaluaciones</option>
                <option value="no">Sin evaluaciones</option>
              </select>
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p role="status">
              {loading
                ? 'Cargando jugadores…'
                : `${filteredAthletes.length} de ${data.athletes.length} jugadores`}
              {!loading && !filteredAthletes.length
                ? ' · No hay coincidencias.'
                : ''}
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={!Object.values(athleteFilters).some(Boolean)}
              onClick={() =>
                setAthleteFilters({
                  query: '',
                  groupId: '',
                  position: '',
                  evaluated: '',
                })
              }
            >
              Limpiar filtros
            </Button>
          </div>
          {selectedOutsideFilter && (
            <p className="mt-2 text-xs text-muted-foreground">
              La ficha seleccionada se mantiene aunque no coincida con los
              filtros. Elegí otro jugador para cambiarla.
            </p>
          )}
        </section>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-3 sm:grid-cols-2">
          {!athleteId && (
            <Field label="Deportista">
              <select
                value={selectedAthleteId}
                onChange={(event) => {
                  setSelectedAthleteId(event.target.value);
                  setEditingSessionId('');
                  setValues({});
                  setNotes('');
                  setSaved(false);
                }}
                className="h-10 min-w-64 rounded-xl border border-border bg-card px-3 text-sm font-semibold outline-none focus:border-[#8fbc29]"
              >
                <option value="">Elegir deportista</option>
                {selectedOutsideFilter && (
                  <option value={selectedAthlete.id}>
                    {selectedAthlete.firstName} {selectedAthlete.lastName}{' '}
                    (seleccionado · fuera del filtro)
                  </option>
                )}
                {filteredAthletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.firstName} {athlete.lastName}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Test para el gráfico">
            <select
              value={selectedMetricId}
              onChange={(event) => setSelectedMetricId(event.target.value)}
              className="h-10 min-w-52 rounded-xl border border-border bg-card px-3 text-sm font-semibold outline-none focus:border-[#8fbc29]"
            >
              {historyMetrics.map((metric) => (
                <option key={metric.id} value={metric.id}>
                  {metric.label} · {metric.unit}
                  {metric.archivedAt ? ' (histórico)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Superficie para comparar">
            <select
              value={effectiveSurface}
              onChange={(event) => setComparisonSurface(event.target.value)}
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
            >
              {surfaces.map((item) => (
                <option key={item} value={item}>
                  {surfaceLabel(item)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={Boolean(data.template?.archivedAt)}
            onClick={() => {
              setEditingMetricId('');
              setMetricForm({
                label: '',
                unit: '',
                betterDirection: 'higher',
                protocol: '',
              });
              setMetricDialogOpen(true);
            }}
          >
            <Plus /> Agregar test
          </Button>
          <Dialog open={metricDialogOpen} onOpenChange={setMetricDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingMetricId ? 'Editar test' : 'Agregar test'}
                </DialogTitle>
                <DialogDescription>
                  Si cambiás unidad, protocolo o sentido de mejora de un test
                  utilizado, se crea una nueva versión y se conserva el
                  historial anterior.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <Field label="Nombre">
                  <Input
                    value={metricForm.label}
                    onChange={(event) =>
                      setMetricForm((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Unidad">
                  <Input
                    value={metricForm.unit}
                    onChange={(event) =>
                      setMetricForm((current) => ({
                        ...current,
                        unit: event.target.value,
                      }))
                    }
                    placeholder="Ej. m, s, kg"
                  />
                </Field>
                <Field label="¿Qué resultado es mejor?">
                  <select
                    value={metricForm.betterDirection}
                    onChange={(event) =>
                      setMetricForm((current) => ({
                        ...current,
                        betterDirection: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
                  >
                    <option value="higher">Más alto</option>
                    <option value="lower">Más bajo</option>
                    <option value="neutral">Sólo seguimiento</option>
                  </select>
                </Field>
                <Field label="Protocolo">
                  <Textarea
                    value={metricForm.protocol}
                    onChange={(event) =>
                      setMetricForm((current) => ({
                        ...current,
                        protocol: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
              <DialogFooter>
                <Button
                  disabled={
                    metricSaving || !metricForm.label || !metricForm.unit
                  }
                  onClick={() => void createMetric()}
                >
                  {metricSaving ? 'Guardando…' : 'Guardar test'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            disabled={athleteResults.length === 0}
            onClick={exportCsv}
          >
            <Download /> Exportar CSV
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[#f1c5bc] bg-[#fff1ee] px-4 py-3 text-sm font-medium text-[#a23f30]"
        >
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw /> Reintentar
          </Button>
        </div>
      )}
      {saved && (
        <output className="mt-4 flex items-center gap-2 rounded-2xl border border-[#cfe0ac] bg-[#f1f7e8] px-4 py-3 text-sm font-medium text-[#3f6110]">
          <Check className="size-4" /> Evaluación guardada en el historial de{' '}
          {displayName}.
        </output>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(310px,0.6fr)]">
        <Card className="border-none bg-card ring-1 ring-border">
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle className="text-[15px] font-bold">
              Historial de {displayName}
            </CardTitle>
            <CardDescription>
              {athleteResults.length > 0
                ? `${new Set(athleteResults.map((row) => row.sessionId)).size} evaluaciones registradas`
                : 'Todavía no tiene evaluaciones'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {summaries.some((summary) => summary.current) ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/35 hover:bg-muted/35">
                    <TableHead className="pl-4">Test</TableHead>
                    <TableHead>Inicial</TableHead>
                    <TableHead>Anterior</TableHead>
                    <TableHead>Actual</TableHead>
                    <TableHead className="pr-4">Mejora total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries
                    .filter((summary) => summary.current)
                    .map((summary) => {
                      const change =
                        summary.initial && summary.current
                          ? improvement(
                              summary.initial.value,
                              summary.current.value,
                              summary.metric.betterDirection,
                            )
                          : 0;
                      return (
                        <TableRow
                          key={summary.metric.id}
                          className={
                            selectedMetricId === summary.metric.id
                              ? 'bg-[#f5f9ed]'
                              : ''
                          }
                          onClick={() => setSelectedMetricId(summary.metric.id)}
                        >
                          <TableCell className="pl-4">
                            <button className="text-left">
                              <p className="text-[12px] font-semibold">
                                {summary.metric.label}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {summary.metric.unit}
                              </p>
                            </button>
                          </TableCell>
                          <ResultValue row={summary.initial} />
                          <ResultValue row={summary.previous} />
                          <ResultValue row={summary.current} strong />
                          <TableCell className="pr-4">
                            <Trend
                              value={change}
                              neutral={
                                summary.metric.betterDirection === 'neutral'
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            ) : (
              <EmptyHistory />
            )}
          </CardContent>
        </Card>

        <Card className="border-none bg-[#10253d] text-white ring-0">
          <CardHeader>
            <CardDescription className="text-white/50">
              Evolución · {selectedSummary?.metric.label ?? 'Sin test'}
            </CardDescription>
            <CardTitle className="text-2xl font-bold">
              {selectedSummary?.current
                ? `${formatNumber(selectedSummary.current.value)} ${selectedSummary.metric.unit}`
                : 'Sin registros'}
            </CardTitle>
            {selectedSummary?.current && (
              <Badge className="mt-2 w-fit bg-white/10 text-[#c8f15a]">
                <TrendingUp className="size-3" />{' '}
                {totalImprovement >= 0 ? '+' : ''}
                {formatNumber(totalImprovement)}%
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ChartContainer
                config={chartConfig}
                className="h-[230px] w-full aspect-auto text-white/50"
                initialDimension={{ width: 360, height: 230 }}
              >
                <LineChart
                  data={chartData}
                  margin={{ top: 12, right: 8, bottom: 0, left: -22 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="rgba(255,255,255,.10)"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'rgba(255,255,255,.45)', fontSize: 10 }}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'rgba(255,255,255,.35)', fontSize: 10 }}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-value)"
                    strokeWidth={3}
                    dot={{ fill: '#c8f15a', strokeWidth: 0, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="grid h-[230px] place-items-center text-center text-sm text-white/50">
                <div>
                  <LineChartIcon className="mx-auto mb-3 size-7" />
                  <p>
                    El gráfico aparecerá después de guardar el primer resultado.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card
        id="evaluation-form"
        className="mt-4 border-none bg-card ring-1 ring-border"
      >
        <CardHeader className="border-b border-border/70">
          <CardTitle className="text-[15px] font-bold">
            {editingSessionId ? 'Corregir evaluación' : 'Nueva evaluación'}
          </CardTitle>
          <CardDescription>
            Podés completar uno o varios tests; los campos vacíos no se guardan.
            Cada superficie se compara por separado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Fecha">
              <Input
                type="date"
                value={evaluatedAt}
                onChange={(event) => setEvaluatedAt(event.target.value)}
              />
            </Field>
            <Field label="Superficie / contexto">
              <Input
                value={surface}
                onChange={(event) => setSurface(event.target.value)}
                placeholder="Ej. Césped, pista, piscina"
                maxLength={100}
              />
            </Field>
            <Field label="Grupo (opcional)">
              <select
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="">Sin grupo</option>
                {data.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {historyMetrics
              .filter(
                (metric) =>
                  !metric.archivedAt ||
                  (editingSessionId && values[metric.id] !== undefined),
              )
              .map((metric) => (
                <div key={metric.id}>
                  <Field
                    label={`${metric.label} · ${metric.unit}${metric.archivedAt ? ' (histórico)' : ''}`}
                    hint={metric.protocol ?? undefined}
                  >
                    <Input
                      inputMode="decimal"
                      value={values[metric.id] ?? ''}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [metric.id]: event.target.value.replace(',', '.'),
                        }))
                      }
                      placeholder="—"
                    />
                  </Field>
                  {!metric.archivedAt && (
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() => {
                          setEditingMetricId(metric.id);
                          setMetricForm({
                            label: metric.label,
                            unit: metric.unit,
                            betterDirection: metric.betterDirection,
                            protocol: metric.protocol ?? '',
                          });
                          setMetricDialogOpen(true);
                        }}
                      >
                        Editar test
                      </button>
                      <button
                        type="button"
                        className="text-xs text-destructive underline"
                        disabled={actionSaving}
                        onClick={() => {
                          if (
                            window.confirm(
                              '¿Archivar test? Los resultados anteriores se conservan.',
                            )
                          )
                            void action({
                              action: 'archiveMetric',
                              metricId: metric.id,
                            });
                        }}
                      >
                        Archivar
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
          <Field label="Observaciones" className="mt-5">
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Contexto, condiciones o notas del testeo"
            />
          </Field>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Los resultados se comparan con el mismo test y superficie.
            </p>
            {editingSessionId && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingSessionId('');
                  setValues({});
                  setNotes('');
                }}
              >
                Cancelar corrección
              </Button>
            )}
            <Button
              disabled={
                saving ||
                !selectedAthleteId ||
                Boolean(data.template?.archivedAt)
              }
              onClick={() => void saveEvaluation()}
              className="bg-[#10253d] text-white hover:bg-[#183653]"
            >
              {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
              {saving
                ? 'Guardando…'
                : editingSessionId
                  ? 'Guardar corrección'
                  : 'Guardar evaluación'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Evaluaciones registradas</CardTitle>
          <CardDescription>
            Las correcciones conservan la versión anterior en el archivo
            histórico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              ...new Map(
                athleteResults.map((row) => [row.sessionId, row]),
              ).values(),
            ].map((row) => (
              <div
                key={row.sessionId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
              >
                <span className="text-sm">
                  {shortDate(row.evaluatedAt)} · {surfaceLabel(row.surface)}
                  {row.archivedAt ? ' · Archivada' : ''}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {row.notes}
                  </span>
                </span>
                {!row.archivedAt && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={Boolean(data.template?.archivedAt)}
                      onClick={() => editSession(row)}
                    >
                      Corregir
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionSaving}
                      onClick={() => {
                        if (
                          window.confirm(
                            '¿Dar de baja esta evaluación? Se conserva en el archivo histórico.',
                          )
                        )
                          void action({
                            action: 'archiveSession',
                            sessionId: row.sessionId,
                          });
                      }}
                    >
                      Dar de baja
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  hint,
  className = '',
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[10px] text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}
function ResultValue({
  row,
  strong = false,
}: {
  row: ResultRow | undefined;
  strong?: boolean;
}) {
  return (
    <TableCell className={strong ? 'font-bold' : ''}>
      {row ? `${formatNumber(row.value)} ${row.unit}` : '—'}
    </TableCell>
  );
}
function EmptyHistory() {
  return (
    <div className="grid min-h-56 place-items-center text-center">
      <div>
        <LineChartIcon className="mx-auto size-7 text-muted-foreground" />
        <p className="mt-3 font-semibold">Sin evaluaciones registradas</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Completá la planilla de abajo para iniciar el historial.
        </p>
      </div>
    </div>
  );
}
function improvement(initial: number, current: number, direction: string) {
  if (initial === 0 || direction === 'neutral') return 0;
  const raw = ((current - initial) / Math.abs(initial)) * 100;
  const adjusted = direction === 'lower' ? -raw : raw;
  return Math.abs(adjusted) < 0.005 ? 0 : adjusted;
}
function Trend({
  value,
  neutral = false,
}: {
  value: number;
  neutral?: boolean;
}) {
  if (neutral)
    return <span className="text-xs text-muted-foreground">Seguimiento</span>;
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${positive ? 'bg-[#edf4e1] text-[#52751d]' : 'bg-[#fff0ec] text-[#b34231]'}`}
    >
      {positive ? (
        <ArrowUpRight className="size-3" />
      ) : (
        <ArrowDownRight className="size-3" />
      )}
      {positive ? '+' : ''}
      {formatNumber(value)}%
    </span>
  );
}
function formatNumber(value: number) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(
    value,
  );
}
function shortDate(timestamp: number) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(timestamp));
}
function surfaceLabel(value: string) {
  return value === 'sand'
    ? 'Arena'
    : value === 'gym'
      ? 'Gimnasio'
      : value === 'indoor'
        ? 'Indoor'
        : value === 'other'
          ? 'Otra'
          : value;
}
function csvCell(value: unknown) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
function slug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
function today() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}
