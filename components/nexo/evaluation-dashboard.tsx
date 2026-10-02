'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, Download, LineChartIcon, LoaderCircle, Plus, RefreshCw, Save, TrendingUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type Metric = { id: string; key: string; label: string; unit: string; betterDirection: 'higher' | 'lower' | 'neutral'; protocol: string | null; sortOrder: number };
type Athlete = { id: string; firstName: string; lastName: string; email: string; primaryPosition: string | null };
type Group = { id: string; name: string };
type ResultRow = { sessionId: string; athleteId: string; athleteName: string; groupId: string | null; groupName: string | null; evaluatedAt: number; surface: string; notes: string | null; metricId: string; label: string; unit: string; betterDirection: 'higher' | 'lower' | 'neutral'; value: number };
type EvaluationData = { metrics: Metric[]; athletes: Athlete[]; groups: Group[]; results: ResultRow[] };

const chartConfig = { value: { label: 'Resultado', color: '#9fcf2d' } } satisfies ChartConfig;

export function EvaluationDashboard({ athleteName, athleteId, embedded = false }: { athleteName?: string; athleteId?: string; embedded?: boolean }) {
  const [data, setData] = useState<EvaluationData>({ metrics: [], athletes: [], groups: [], results: [] });
  const [selectedAthleteId, setSelectedAthleteId] = useState(athleteId ?? '');
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
  const [metricForm, setMetricForm] = useState({ label: '', unit: '', betterDirection: 'higher', protocol: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = athleteId ? `?athleteId=${encodeURIComponent(athleteId)}` : '';
      const response = await fetch(`/api/evaluations${query}`, { cache: 'no-store' });
      const result = (await response.json()) as EvaluationData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las evaluaciones.');
      setData(result);
      setSelectedAthleteId((current) => current || athleteId || result.athletes[0]?.id || '');
      setSelectedMetricId((current) => current && result.metrics.some((metric) => metric.id === current) ? current : result.metrics[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las evaluaciones.');
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedAthlete = data.athletes.find((athlete) => athlete.id === selectedAthleteId);
  const athleteResults = useMemo(() => data.results.filter((row) => row.athleteId === selectedAthleteId), [data.results, selectedAthleteId]);
  const summaries = useMemo(() => data.metrics.map((metric) => {
    const points = athleteResults.filter((row) => row.metricId === metric.id).sort((left, right) => left.evaluatedAt - right.evaluatedAt);
    return { metric, points, initial: points[0], previous: points.at(-2), current: points.at(-1) };
  }), [athleteResults, data.metrics]);
  const selectedSummary = summaries.find((summary) => summary.metric.id === selectedMetricId) ?? summaries[0];
  const chartData = (selectedSummary?.points ?? []).map((point) => ({ date: shortDate(point.evaluatedAt), value: point.value }));
  const totalImprovement = selectedSummary?.initial && selectedSummary.current ? improvement(selectedSummary.initial.value, selectedSummary.current.value, selectedSummary.metric.betterDirection) : 0;
  const displayName = athleteName || (selectedAthlete ? `${selectedAthlete.firstName} ${selectedAthlete.lastName}` : 'Sin deportista');

  async function saveEvaluation() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const results = data.metrics.map((metric) => ({ metricId: metric.id, value: values[metric.id] })).filter((result) => result.value !== '' && result.value !== undefined);
      const response = await fetch('/api/evaluations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', athleteId: selectedAthleteId, groupId: groupId || null, evaluatedAt, surface, notes, results }) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar la evaluación.');
      setValues({}); setNotes(''); setSaved(true); await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la evaluación.'); }
    finally { setSaving(false); }
  }

  async function createMetric() {
    setMetricSaving(true); setError('');
    try {
      const response = await fetch('/api/evaluations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'createMetric', ...metricForm }) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo crear el test.');
      setMetricForm({ label: '', unit: '', betterDirection: 'higher', protocol: '' }); setMetricDialogOpen(false); await load();
    } catch (metricError) { setError(metricError instanceof Error ? metricError.message : 'No se pudo crear el test.'); }
    finally { setMetricSaving(false); }
  }

  function exportCsv() {
    if (athleteResults.length === 0) return;
    const header = ['Deportista', 'Fecha', 'Superficie', 'Test', 'Valor', 'Unidad', 'Grupo', 'Notas'];
    const lines = athleteResults.map((row) => [row.athleteName, new Date(row.evaluatedAt).toLocaleDateString('es-AR'), surfaceLabel(row.surface), row.label, row.value, row.unit, row.groupName ?? '', row.notes ?? '']);
    const csv = [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `evaluaciones-${slug(displayName)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  if (loading) return <div className="mt-6 grid min-h-64 place-items-center rounded-[22px] border border-border bg-card"><span className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Cargando evaluaciones…</span></div>;

  return (
    <div className={embedded ? '' : 'mt-6'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-3 sm:grid-cols-2">
          {!athleteId && <Field label="Deportista"><select value={selectedAthleteId} onChange={(event) => setSelectedAthleteId(event.target.value)} className="h-10 min-w-64 rounded-xl border border-border bg-card px-3 text-sm font-semibold outline-none focus:border-[#8fbc29]"><option value="">Elegir deportista</option>{data.athletes.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.firstName} {athlete.lastName}</option>)}</select></Field>}
          <Field label="Test para el gráfico"><select value={selectedMetricId} onChange={(event) => setSelectedMetricId(event.target.value)} className="h-10 min-w-52 rounded-xl border border-border bg-card px-3 text-sm font-semibold outline-none focus:border-[#8fbc29]">{data.metrics.map((metric) => <option key={metric.id} value={metric.id}>{metric.label}</option>)}</select></Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={metricDialogOpen} onOpenChange={setMetricDialogOpen}><DialogTrigger render={<Button variant="outline" />}><Plus /> Agregar test</DialogTrigger><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Agregar test</DialogTitle><DialogDescription>El nuevo indicador quedará disponible para todos los deportistas.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><Field label="Nombre"><Input value={metricForm.label} onChange={(event) => setMetricForm((current) => ({ ...current, label: event.target.value }))} placeholder="Ej. Yo-Yo test" /></Field><Field label="Unidad"><Input value={metricForm.unit} onChange={(event) => setMetricForm((current) => ({ ...current, unit: event.target.value }))} placeholder="Ej. m, s, kg" /></Field><Field label="¿Qué resultado es mejor?"><select value={metricForm.betterDirection} onChange={(event) => setMetricForm((current) => ({ ...current, betterDirection: event.target.value }))} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"><option value="higher">Más alto</option><option value="lower">Más bajo</option><option value="neutral">Sólo seguimiento</option></select></Field><Field label="Protocolo (opcional)"><Textarea value={metricForm.protocol} onChange={(event) => setMetricForm((current) => ({ ...current, protocol: event.target.value }))} placeholder="Cómo se realiza y se registra" /></Field></div><DialogFooter><Button disabled={metricSaving || !metricForm.label || !metricForm.unit} onClick={() => void createMetric()} className="bg-[#10253d] text-white hover:bg-[#183653]">{metricSaving ? <LoaderCircle className="animate-spin" /> : <Plus />}{metricSaving ? 'Creando…' : 'Crear test'}</Button></DialogFooter></DialogContent></Dialog>
          <Button variant="outline" disabled={athleteResults.length === 0} onClick={exportCsv}><Download /> Exportar CSV</Button>
        </div>
      </div>

      {error && <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[#f1c5bc] bg-[#fff1ee] px-4 py-3 text-sm font-medium text-[#a23f30]"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw /> Reintentar</Button></div>}
      {saved && <output className="mt-4 flex items-center gap-2 rounded-2xl border border-[#cfe0ac] bg-[#f1f7e8] px-4 py-3 text-sm font-medium text-[#3f6110]"><Check className="size-4" /> Evaluación guardada en el historial de {displayName}.</output>}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(310px,0.6fr)]">
        <Card className="border-none bg-card ring-1 ring-border">
          <CardHeader className="border-b border-border/70 pb-4"><CardTitle className="text-[15px] font-bold">Historial de {displayName}</CardTitle><CardDescription>{athleteResults.length > 0 ? `${new Set(athleteResults.map((row) => row.sessionId)).size} evaluaciones registradas` : 'Todavía no tiene evaluaciones'}</CardDescription></CardHeader>
          <CardContent className="px-0">
            {summaries.some((summary) => summary.current) ? <Table><TableHeader><TableRow className="bg-muted/35 hover:bg-muted/35"><TableHead className="pl-4">Test</TableHead><TableHead>Inicial</TableHead><TableHead>Anterior</TableHead><TableHead>Actual</TableHead><TableHead className="pr-4">Mejora total</TableHead></TableRow></TableHeader><TableBody>{summaries.filter((summary) => summary.current).map((summary) => { const change = summary.initial && summary.current ? improvement(summary.initial.value, summary.current.value, summary.metric.betterDirection) : 0; return <TableRow key={summary.metric.id} className={selectedMetricId === summary.metric.id ? 'bg-[#f5f9ed]' : ''} onClick={() => setSelectedMetricId(summary.metric.id)}><TableCell className="pl-4"><button className="text-left"><p className="text-[12px] font-semibold">{summary.metric.label}</p><p className="text-[10px] text-muted-foreground">{summary.metric.unit}</p></button></TableCell><ResultValue row={summary.initial} /><ResultValue row={summary.previous} /><ResultValue row={summary.current} strong /><TableCell className="pr-4"><Trend value={change} neutral={summary.metric.betterDirection === 'neutral'} /></TableCell></TableRow>; })}</TableBody></Table> : <EmptyHistory />}
          </CardContent>
        </Card>

        <Card className="border-none bg-[#10253d] text-white ring-0">
          <CardHeader><CardDescription className="text-white/50">Evolución · {selectedSummary?.metric.label ?? 'Sin test'}</CardDescription><CardTitle className="text-2xl font-bold">{selectedSummary?.current ? `${formatNumber(selectedSummary.current.value)} ${selectedSummary.metric.unit}` : 'Sin registros'}</CardTitle>{selectedSummary?.current && <Badge className="mt-2 w-fit bg-white/10 text-[#c8f15a]"><TrendingUp className="size-3" /> {totalImprovement >= 0 ? '+' : ''}{formatNumber(totalImprovement)}%</Badge>}</CardHeader>
          <CardContent>{chartData.length > 0 ? <ChartContainer config={chartConfig} className="h-[230px] w-full aspect-auto text-white/50" initialDimension={{ width: 360, height: 230 }}><LineChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: -22 }}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.10)" /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: 'rgba(255,255,255,.45)', fontSize: 10 }} /><YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} tick={{ fill: 'rgba(255,255,255,.35)', fontSize: 10 }} /><ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} /><Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={3} dot={{ fill: '#c8f15a', strokeWidth: 0, r: 4 }} activeDot={{ r: 6 }} /></LineChart></ChartContainer> : <div className="grid h-[230px] place-items-center text-center text-sm text-white/50"><div><LineChartIcon className="mx-auto mb-3 size-7" /><p>El gráfico aparecerá después de guardar el primer resultado.</p></div></div>}</CardContent>
        </Card>
      </div>

      <Card className="mt-4 border-none bg-card ring-1 ring-border">
        <CardHeader className="border-b border-border/70"><CardTitle className="text-[15px] font-bold">Nueva evaluación</CardTitle><CardDescription>Podés completar uno o varios tests; los campos vacíos no se guardan.</CardDescription></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3"><Field label="Fecha"><Input type="date" value={evaluatedAt} onChange={(event) => setEvaluatedAt(event.target.value)} /></Field><Field label="Superficie"><select value={surface} onChange={(event) => setSurface(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="indoor">Indoor</option><option value="sand">Arena</option><option value="gym">Gimnasio</option><option value="other">Otra</option></select></Field><Field label="Grupo (opcional)"><select value={groupId} onChange={(event) => setGroupId(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="">Sin grupo</option>{data.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{data.metrics.map((metric) => <Field key={metric.id} label={`${metric.label} · ${metric.unit}`} hint={metric.protocol ?? undefined}><Input inputMode="decimal" value={values[metric.id] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [metric.id]: event.target.value.replace(',', '.') }))} placeholder="—" /></Field>)}</div>
          <Field label="Observaciones" className="mt-5"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contexto, condiciones o notas del testeo" /></Field>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Los resultados se comparan automáticamente con evaluaciones anteriores.</p><Button disabled={saving || !selectedAthleteId} onClick={() => void saveEvaluation()} className="bg-[#10253d] text-white hover:bg-[#183653]">{saving ? <LoaderCircle className="animate-spin" /> : <Save />}{saving ? 'Guardando…' : 'Guardar evaluación'}</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, hint, className = '', children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) { return <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>{children}{hint && <span className="mt-1 block text-[10px] text-muted-foreground">{hint}</span>}</label>; }
function ResultValue({ row, strong = false }: { row: ResultRow | undefined; strong?: boolean }) { return <TableCell className={strong ? 'font-bold' : ''}>{row ? `${formatNumber(row.value)} ${row.unit}` : '—'}</TableCell>; }
function EmptyHistory() { return <div className="grid min-h-56 place-items-center text-center"><div><LineChartIcon className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 font-semibold">Sin evaluaciones registradas</p><p className="mt-1 text-xs text-muted-foreground">Completá la planilla de abajo para iniciar el historial.</p></div></div>; }
function improvement(initial: number, current: number, direction: string) { if (initial === 0 || direction === 'neutral') return 0; const raw = ((current - initial) / Math.abs(initial)) * 100; const adjusted = direction === 'lower' ? -raw : raw; return Math.abs(adjusted) < 0.005 ? 0 : adjusted; }
function Trend({ value, neutral = false }: { value: number; neutral?: boolean }) { if (neutral) return <span className="text-xs text-muted-foreground">Seguimiento</span>; const positive = value >= 0; return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${positive ? 'bg-[#edf4e1] text-[#52751d]' : 'bg-[#fff0ec] text-[#b34231]'}`}>{positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{positive ? '+' : ''}{formatNumber(value)}%</span>; }
function formatNumber(value: number) { return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value); }
function shortDate(timestamp: number) { return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(new Date(timestamp)); }
function surfaceLabel(value: string) { return value === 'sand' ? 'Arena' : value === 'gym' ? 'Gimnasio' : value === 'indoor' ? 'Indoor' : 'Otra'; }
function csvCell(value: unknown) { return `"${String(value).replaceAll('"', '""')}"`; }
function slug(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function today() { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 10); }
