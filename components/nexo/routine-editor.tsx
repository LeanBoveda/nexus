/* eslint-disable next/no-html-link-for-pages -- Vinext production navigation uses native links. */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, Check, ChevronLeft, ChevronRight, ClipboardList, GripVertical, LoaderCircle, Plus, Save, Send, Trash2, Users, Zap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';

type Category = 'Fuerza' | 'Potencia' | 'Velocidad' | 'Control';
type ExerciseRow = { id: number | string; block: string; category: Category; name: string; values: string[]; rir: string[] };
type AssignmentTarget = { id: string; name: string; detail: string; type: 'Grupo' | 'Persona' };
type WeekPlan = { number: string; phase: string; objective: string; secondary: string; pse: string };
type SavedRoutine = {
  id: string;
  name: string;
  description: string | null;
  versionNumber: number;
  content: { sessionName?: string; warmup?: string; instructions?: string; weeklyGoal?: number; activeWeek?: number; weekPlans?: WeekPlan[]; rows?: ExerciseRow[] };
};
type GroupData = {
  groups?: Array<{ id: string; name: string; organizationName: string; memberCount: number }>;
  athletes?: Array<{ id: string; firstName: string; lastName: string; email: string }>;
};

const initialRows: ExerciseRow[] = [
  { id: 1, block: 'A', category: 'Potencia', name: 'Arranque desde cajón', values: ['4 · 4 · 3', '3 · 3 · 3', '3 · 3 · 3', '5 · 4 · 3'], rir: ['4–3', '3', '3', '4–3'] },
  { id: 2, block: 'A', category: 'Control', name: 'Caminata con trineo · tensión unilateral', values: ['10 + 10 m', '12 + 12 m', '12 + 12 m', '10 + 10 m'], rir: ['', '', '', ''] },
  { id: 3, block: 'B', category: 'Fuerza', name: 'Peso muerto', values: ['6 · 5 · 4 · 3', '5 · 4 · 4 · 3', '4 · 4 · 3', '5 · 5 · 5'], rir: ['4–3', '4–3', '3', '5'] },
  { id: 4, block: 'B', category: 'Control', name: 'VBT', values: ['0,62–0,44', '0,62–0,44', '0,50–0,44', '0,62+'], rir: ['', '', '', ''] },
  { id: 5, block: 'B', category: 'Potencia', name: 'KB swing', values: ['6 · 6 · 6 · 6', '6 · 6 · 6 · 6', '6 · 6 · 6', '5 · 5 · 5'], rir: ['', '', '', ''] },
  { id: 6, block: 'B', category: 'Velocidad', name: 'Sprint con chaleco 8 kg', values: ['10 m', '15 m', '15 m', '10 m'], rir: ['', '', '', ''] },
  { id: 7, block: 'C', category: 'Fuerza', name: 'Press banco plano', values: ['6 · 6 · 5 · 5', '5 · 5 · 5', '5 · 5 · 4 · 4', '6 · 6 · 6'], rir: ['4–3', '4–3', '3', '5'] },
  { id: 8, block: 'C', category: 'Potencia', name: 'Empuje de balón medicinal con impulso', values: ['5 · 5 · 5 · 5', '5 · 5 · 5 · 5', '5 · 5 · 5', '5 · 5 · 5'], rir: ['', '', '', ''] },
  { id: 9, block: 'D', category: 'Fuerza', name: 'Remo landmine desde bisagra unipodal', values: ['3 × 8 + 8', '3 × 8 + 8', '3 × 10 + 10', '3 × 6 + 6'], rir: ['3', '3', '3', '5'] },
];
const initialWeeks: WeekPlan[] = [
  { number: '1', phase: 'Ajuste', objective: 'Fuerza estructural', secondary: 'Fuerza potencia', pse: '5' },
  { number: '2', phase: 'Carga', objective: 'Fuerza estructural', secondary: 'Fuerza potencia', pse: '6' },
  { number: '3', phase: 'Carga', objective: 'Fuerza máxima', secondary: 'Fuerza potencia', pse: '6' },
  { number: '4', phase: 'Descarga', objective: 'Fuerza estructural', secondary: 'Fuerza potencia', pse: '4' },
];
const blockDescriptions: Record<string, string> = { A: 'Activación neural y potencia', B: 'Fuerza de tren inferior', C: 'Fuerza de tren superior', D: 'Trabajo unilateral y estabilidad' };

export function RoutineEditor() {
  const [routineId, setRoutineId] = useState('');
  const [versionNumber, setVersionNumber] = useState(0);
  const [routineName, setRoutineName] = useState('Nueva planificación');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState(initialRows);
  const [weekPlans, setWeekPlans] = useState(initialWeeks);
  const [activeWeek, setActiveWeek] = useState(0);
  const [weeklyGoal, setWeeklyGoal] = useState('3');
  const [sessionName, setSessionName] = useState('Día A · Full body');
  const [warmup, setWarmup] = useState('Movilidad, core y preventivos de hombro antes de comenzar.');
  const [instructions, setInstructions] = useState('Priorizar la calidad técnica. Ajustar la carga si aparece molestia.');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targets, setTargets] = useState<AssignmentTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState('');

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get('id');
    Promise.all([
      fetch('/api/groups', { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error('No se pudieron cargar los destinatarios.');
        return (await response.json()) as GroupData;
      }),
      requestedId ? fetch(`/api/routines?id=${encodeURIComponent(requestedId)}`, { cache: 'no-store' }).then(async (response) => {
        const result = (await response.json()) as { routine?: SavedRoutine; error?: string };
        if (!response.ok || !result.routine) throw new Error(result.error || 'No se pudo abrir la rutina.');
        return result.routine;
      }) : Promise.resolve(null),
    ])
      .then(([groupResult, routine]) => {
        setTargets([
          ...(groupResult.groups ?? []).map((group) => ({ id: `group:${group.id}`, name: group.name, detail: `${group.organizationName} · ${Number(group.memberCount)} personas`, type: 'Grupo' as const })),
          ...(groupResult.athletes ?? []).map((athlete) => ({ id: `athlete:${athlete.id}`, name: `${athlete.firstName} ${athlete.lastName}`, detail: athlete.email, type: 'Persona' as const })),
        ]);
        if (routine) {
          setRoutineId(routine.id);
          setVersionNumber(routine.versionNumber);
          setRoutineName(routine.name);
          setDescription(routine.description ?? '');
          setSessionName(routine.content.sessionName || routine.name);
          setWarmup(routine.content.warmup || '');
          setInstructions(routine.content.instructions || '');
          setWeeklyGoal(String(routine.content.weeklyGoal ?? 3));
          if (routine.content.weekPlans?.length) setWeekPlans(routine.content.weekPlans);
          if (routine.content.rows?.length) setRows(routine.content.rows);
          const requestedWeek = Number(routine.content.activeWeek ?? 0);
          setActiveWeek(Number.isFinite(requestedWeek) ? Math.max(0, Math.min(requestedWeek, (routine.content.weekPlans?.length ?? 1) - 1)) : 0);
          setSaved(true);
        }
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la planificación.'))
      .finally(() => setLoading(false));
  }, []);

  const blocks = useMemo(() => Array.from(new Set(rows.map((row) => row.block))), [rows]);
  const currentWeek = weekPlans[activeWeek] ?? weekPlans[0];

  function markDirty() { setSaved(false); setNotice(''); }
  function updateWeek(field: keyof WeekPlan, value: string) {
    setWeekPlans((current) => current.map((week, index) => (index === activeWeek ? { ...week, [field]: value } : week)));
    markDirty();
  }
  function updateExercise(id: number | string, field: 'name' | 'value' | 'rir' | 'category', value: string) {
    setRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      if (field === 'name') return { ...row, name: value };
      if (field === 'category') return { ...row, category: value as Category };
      const key = field === 'value' ? 'values' : 'rir';
      return { ...row, [key]: row[key].map((entry, index) => (index === activeWeek ? value : entry)) };
    }));
    markDirty();
  }
  function addExercise(block: string) {
    setRows((current) => [...current, { id: crypto.randomUUID(), block, category: 'Fuerza', name: 'Nuevo ejercicio', values: Array.from({ length: weekPlans.length }, () => ''), rir: Array.from({ length: weekPlans.length }, () => '') }]);
    markDirty();
  }
  function removeExercise(id: number | string) { setRows((current) => current.filter((row) => row.id !== id)); markDirty(); }
  function addWeek() {
    setWeekPlans((current) => [...current, { number: String(current.length + 1), phase: 'Carga', objective: '', secondary: '', pse: '5' }]);
    setRows((current) => current.map((row) => ({ ...row, values: [...row.values, ''], rir: [...row.rir, ''] })));
    setActiveWeek(weekPlans.length);
    markDirty();
  }
  function removeWeek() {
    if (weekPlans.length <= 1) return;
    setWeekPlans((current) => current.filter((_, index) => index !== activeWeek));
    setRows((current) => current.map((row) => ({ ...row, values: row.values.filter((_, index) => index !== activeWeek), rir: row.rir.filter((_, index) => index !== activeWeek) })));
    setActiveWeek((current) => Math.max(0, current - 1));
    markDirty();
  }

  async function saveRoutine() {
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/routines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', routineId: routineId || undefined, name: routineName, description, content: { sessionName, warmup, instructions, weeklyGoal: Number(weeklyGoal), activeWeek, weekPlans, rows } }) });
      const result = (await response.json()) as { routineId?: string; versionNumber?: number; error?: string };
      if (!response.ok || !result.routineId) throw new Error(result.error || 'No se pudo guardar la rutina.');
      setRoutineId(result.routineId); setVersionNumber(result.versionNumber ?? versionNumber + 1); setSaved(true); setNotice('La planificación quedó guardada.');
      window.history.replaceState(null, '', `/rutinas/nueva?id=${encodeURIComponent(result.routineId)}`);
      return result.routineId;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la rutina.'); return '';
    } finally { setSaving(false); }
  }

  async function assignRoutine() {
    const selectedTarget = targets.find((target) => target.id === selectedTargetId);
    if (!selectedTarget) return;
    setAssigning(true); setError(''); setNotice('');
    try {
      const savedId = saved && routineId ? routineId : await saveRoutine();
      if (!savedId) return;
      const [targetType, targetId] = selectedTarget.id.split(':', 2) as ['group' | 'athlete', string];
      const response = await fetch('/api/routines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'assign', routineId: savedId, targetType, targetId, startsOn, endsOn: endsOn || null }) });
      const result = (await response.json()) as { athleteCount?: number; error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo asignar la rutina.');
      setNotice(`Rutina asignada a ${selectedTarget.name}. ${result.athleteCount ?? 0} ${result.athleteCount === 1 ? 'deportista recibió' : 'deportistas recibieron'} la planificación.`);
      setDialogOpen(false); setSelectedTargetId('');
    } catch (assignError) { setError(assignError instanceof Error ? assignError.message : 'No se pudo asignar la rutina.'); }
    finally { setAssigning(false); }
  }

  if (loading) return <div className="grid min-h-[70vh] place-items-center"><span className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Abriendo planificación…</span></div>;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <header className="flex flex-col gap-5 border-b border-border pb-6 xl:flex-row xl:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <a href="/rutinas" className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card transition hover:bg-muted" aria-label="Volver a rutinas"><ArrowLeft className="size-4" /></a>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><input aria-label="Nombre de la rutina" value={routineName} onChange={(event) => { setRoutineName(event.target.value); markDirty(); }} className="min-w-0 max-w-full bg-transparent text-2xl font-bold tracking-[-0.04em] outline-none focus:text-[#29445e]" /><Badge variant="outline" className={saved ? 'border-[#cfe0ac] bg-[#f1f7e8] text-[#52751d]' : 'bg-muted/50'}>{saved ? `Guardado · v${versionNumber}` : 'Cambios sin guardar'}</Badge></div>
            <input aria-label="Descripción de la rutina" value={description} placeholder="Descripción breve de la planificación" onChange={(event) => { setDescription(event.target.value); markDirty(); }} className="mt-1 w-full max-w-2xl bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/70 focus:text-foreground" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 xl:ml-auto">
          <Button variant="outline" className="h-10 rounded-xl" disabled={saving} onClick={() => void saveRoutine()}>{saving ? <LoaderCircle className="animate-spin" /> : <Save />} {saving ? 'Guardando…' : 'Guardar'}</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger render={<Button className="h-10 rounded-xl bg-[#10253d] px-4 text-white hover:bg-[#183653]" />}><Send /> Asignar rutina</DialogTrigger><AssignmentDialog targets={targets} selectedId={selectedTargetId} onSelect={setSelectedTargetId} startsOn={startsOn} endsOn={endsOn} onStartsOn={setStartsOn} onEndsOn={setEndsOn} assigning={assigning} onAssign={() => void assignRoutine()} /></Dialog>
        </div>
      </header>

      {(error || notice) && <div role={error ? 'alert' : 'status'} className={`mt-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${error ? 'border-[#f1c5bc] bg-[#fff1ee] text-[#a23f30]' : 'border-[#cfe0ac] bg-[#f1f7e8] text-[#3f6110]'}`}>{notice && <Check className="mt-0.5 size-4 shrink-0" />}<span>{error || notice}</span><button className="ml-auto text-xs font-bold hover:underline" onClick={() => { setError(''); setNotice(''); }}>Cerrar</button></div>}

      <section className="mt-5 rounded-[22px] border border-border bg-card p-3 shadow-[0_18px_50px_-42px_#10253d] sm:p-4">
        <div className="mb-3 flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Progresión del ciclo</p><p className="text-sm text-muted-foreground">Cada semana guarda objetivos, PSE y cargas propias.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={removeWeek} disabled={weekPlans.length <= 1}><Trash2 /> Quitar semana</Button><Button size="sm" variant="outline" onClick={addWeek}><Plus /> Agregar semana</Button></div></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {weekPlans.map((week, index) => { const active = activeWeek === index; return <button key={index} onClick={() => setActiveWeek(index)} aria-pressed={active} className={`group rounded-2xl border p-3 text-left transition ${active ? 'border-[#10253d] bg-[#10253d] text-white shadow-lg shadow-[#10253d]/15' : 'border-border bg-background hover:border-[#b7c7d3] hover:bg-muted/35'}`}><span className="flex items-center justify-between gap-2"><span className={`text-sm font-semibold ${active ? 'text-white/65' : 'text-muted-foreground'}`}>Semana {week.number}</span><span className={`rounded-full px-2 py-1 text-xs font-bold ${active ? 'bg-[#c8f15a] text-[#26340f]' : phaseTone(week.phase)}`}>{week.phase || 'Sin período'}</span></span><span className="mt-3 block text-base font-bold">{week.objective || 'Sin objetivo'}</span><span className={`mt-1 block text-sm ${active ? 'text-white/55' : 'text-muted-foreground'}`}>PSE {week.pse || '—'} · {week.secondary || 'Sin complemento'}</span></button>; })}
        </div>
      </section>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <main className="space-y-4">
          <div className="flex flex-col gap-3 rounded-[22px] bg-[#10253d] p-5 text-white sm:flex-row sm:items-center"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-[#c8f15a]"><Zap className="size-5" /></span><div className="min-w-0 flex-1"><input value={sessionName} onChange={(event) => { setSessionName(event.target.value); markDirty(); }} aria-label="Nombre de la sesión" className="w-full bg-transparent text-xl font-bold tracking-[-0.03em] text-white outline-none placeholder:text-white/35 focus:text-[#dff58f]" /><label className="mt-2 block"><span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/45">Entrada en calor</span><input value={warmup} onChange={(event) => { setWarmup(event.target.value); markDirty(); }} aria-label="Entrada en calor" className="mt-0.5 w-full border-b border-transparent bg-transparent pb-1 text-sm text-white/65 outline-none transition placeholder:text-white/35 focus:border-white/25 focus:text-white" /></label></div><Badge className="w-fit bg-white/10 text-white">Semana {currentWeek.number}</Badge></div>

          {blocks.map((block) => { const blockRows = rows.filter((row) => row.block === block); return (
            <section key={block} className="overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_16px_45px_-40px_#10253d]">
              <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-3.5 sm:px-5"><span className="grid size-9 place-items-center rounded-xl bg-[#10253d] font-bold text-white">{block}</span><div className="flex-1"><h2 className="text-base font-bold">Bloque {block}</h2><p className="text-sm text-muted-foreground">{blockDescriptions[block] ?? 'Trabajo específico'}</p></div><Badge variant="outline" className="bg-card">{blockRows.length} ejercicios</Badge></div>
              <div className="divide-y divide-border">{blockRows.map((row, index) => <div key={row.id} className="group grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_180px_110px_36px] lg:items-center"><div className="flex min-w-0 items-start gap-3"><span className="mt-1 flex items-center gap-2 text-muted-foreground"><GripVertical className="size-4 opacity-45" /><span className="grid size-7 place-items-center rounded-lg bg-muted text-sm font-bold">{index + 1}</span></span><div className="min-w-0 flex-1"><input value={row.name} onChange={(event) => updateExercise(row.id, 'name', event.target.value)} aria-label={`Nombre del ejercicio ${index + 1} del bloque ${block}`} className="w-full bg-transparent text-base font-semibold outline-none focus:text-[#29445e]" /><select aria-label={`Categoría de ${row.name}`} value={row.category} onChange={(event) => updateExercise(row.id, 'category', event.target.value)} className={`mt-2 rounded-full border px-2 py-1 text-xs font-semibold outline-none ${categoryTone(row.category)}`}>{(['Fuerza', 'Potencia', 'Velocidad', 'Control'] as Category[]).map((category) => <option key={category}>{category}</option>)}</select></div></div><LabeledInput label="Trabajo" value={row.values[activeWeek] ?? ''} placeholder="Series, repeticiones o distancia" onChange={(value) => updateExercise(row.id, 'value', value)} /><LabeledInput label="RIR" value={row.rir[activeWeek] ?? ''} placeholder="—" onChange={(value) => updateExercise(row.id, 'rir', value)} /><button onClick={() => removeExercise(row.id)} aria-label={`Eliminar ${row.name}`} title="Eliminar ejercicio" className="grid size-9 place-items-center rounded-xl text-muted-foreground opacity-70 transition hover:bg-[#fff0ed] hover:text-[#a23f30] lg:opacity-0 lg:group-hover:opacity-100"><Trash2 className="size-4" /></button></div>)}</div>
              <div className="border-t border-border bg-muted/20 px-4 py-3 sm:px-5"><button onClick={() => addExercise(block)} className="flex items-center gap-2 text-sm font-semibold text-[#52751d] hover:underline"><Plus className="size-4" /> Agregar ejercicio al bloque {block}</button></div>
            </section>
          ); })}
        </main>

        <aside className="space-y-4 xl:sticky xl:top-[88px]">
          <section className="rounded-[22px] border border-border bg-card p-5 shadow-[0_18px_50px_-42px_#10253d]">
            <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-muted-foreground">Configuración semanal</p><h2 className="mt-1 text-xl font-bold">Editá la semana activa</h2></div><span className="grid size-10 place-items-center rounded-xl bg-[#edf4e1] text-[#52751d]"><Activity className="size-5" /></span></div>
            <div className="mt-5 grid grid-cols-2 gap-3"><LabeledInput label="Semana" value={currentWeek.number} placeholder="Ej. 12" onChange={(value) => updateWeek('number', value)} /><LabeledInput label="Período" value={currentWeek.phase} placeholder="Ej. Carga" onChange={(value) => updateWeek('phase', value)} /></div>
            <div className="mt-4 space-y-4"><LabeledInput label="Objetivo principal" value={currentWeek.objective} placeholder="Ej. Fuerza estructural" onChange={(value) => updateWeek('objective', value)} /><LabeledInput label="Objetivo complementario" value={currentWeek.secondary} placeholder="Ej. Fuerza potencia" onChange={(value) => updateWeek('secondary', value)} /><LabeledInput label="Sesiones objetivo por semana" value={weeklyGoal} placeholder="3" type="number" onChange={(value) => { setWeeklyGoal(value); markDirty(); }} /></div>
            <div className="mt-5 rounded-2xl bg-[#10253d] p-4 text-white"><div className="flex items-end justify-between gap-3"><label><span className="block text-sm text-white/55">PSE estimado</span><span className="mt-1 flex items-baseline"><input type="number" min="0" max="10" step="1" value={currentWeek.pse} onChange={(event) => updateWeek('pse', event.target.value)} aria-label="PSE estimado" className="w-12 bg-transparent text-3xl font-bold text-white outline-none focus:text-[#dff58f]" /><span className="text-base font-medium text-white/40">/ 10</span></span></label><span className="text-sm font-semibold text-[#c8f15a]">{pseLabel(Number(currentWeek.pse))}</span></div><Progress value={Math.max(0, Math.min(100, Number(currentWeek.pse) * 10))} className="mt-4 [&_[data-slot=progress-track]]:bg-white/10 [&_[data-slot=progress-indicator]]:bg-[#c8f15a]" /></div>
          </section>
          <section className="rounded-[22px] border border-border bg-card p-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#fff5dc] text-[#9a6b12]"><ClipboardList className="size-4" /></span><div><h2 className="font-bold">Indicaciones de la sesión</h2><p className="text-sm text-muted-foreground">Visibles para el deportista.</p></div></div><Textarea value={instructions} onChange={(event) => { setInstructions(event.target.value); markDirty(); }} className="mt-4 min-h-28 resize-none rounded-xl text-sm" aria-label="Indicaciones de la sesión" /></section>
          <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={activeWeek === 0} onClick={() => setActiveWeek((week) => Math.max(0, week - 1))}><ChevronLeft /> Anterior</Button><span className="text-sm font-medium text-muted-foreground">{activeWeek + 1} de {weekPlans.length}</span><Button variant="outline" disabled={activeWeek === weekPlans.length - 1} onClick={() => setActiveWeek((week) => Math.min(weekPlans.length - 1, week + 1))}>Siguiente <ChevronRight /></Button></div>
        </aside>
      </div>
    </div>
  );
}

function LabeledInput({ label, value, placeholder, type = 'text', onChange }: { label: string; value: string; placeholder: string; type?: 'text' | 'number' | 'date'; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-muted-foreground">{label}</span><input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none transition focus:border-[#8fbc29] focus:ring-3 focus:ring-[#b9dc68]/20" /></label>;
}
function AssignmentDialog({ targets, selectedId, onSelect, startsOn, endsOn, onStartsOn, onEndsOn, assigning, onAssign }: { targets: AssignmentTarget[]; selectedId: string; onSelect: (value: string) => void; startsOn: string; endsOn: string; onStartsOn: (value: string) => void; onEndsOn: (value: string) => void; assigning: boolean; onAssign: () => void }) {
  return <DialogContent className="sm:max-w-lg"><DialogHeader><span className="mb-1 grid size-10 place-items-center rounded-xl bg-[#edf4e1] text-[#52751d]"><Users className="size-5" /></span><DialogTitle>Asignar planificación</DialogTitle><DialogDescription>El grupo recibe una instancia por deportista. La fecha define cuándo aparece en su perfil.</DialogDescription></DialogHeader><div className="max-h-64 space-y-2 overflow-y-auto py-2">{targets.length === 0 ? <div className="rounded-2xl bg-muted/50 p-5 text-center"><p className="font-semibold">Todavía no hay destinatarios</p><p className="mt-1 text-sm text-muted-foreground">Primero cargá deportistas o creá un grupo.</p></div> : targets.map((target) => <button key={target.id} onClick={() => onSelect(target.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selectedId === target.id ? 'border-[#9fcf2d] bg-[#f1f7e8]' : 'border-border hover:bg-muted/50'}`}><Checkbox checked={selectedId === target.id} /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{target.name}</p><p className="mt-0.5 truncate text-sm text-muted-foreground">{target.detail}</p></div><Badge variant="outline" className="bg-card">{target.type}</Badge></button>)}</div><div className="grid gap-3 sm:grid-cols-2"><LabeledInput label="Comienza" value={startsOn} placeholder="" type="date" onChange={onStartsOn} /><LabeledInput label="Finaliza (opcional)" value={endsOn} placeholder="" type="date" onChange={onEndsOn} /></div><DialogFooter><Button disabled={!selectedId || !startsOn || assigning} className="bg-[#10253d] text-white hover:bg-[#183653]" onClick={onAssign}>{assigning ? <LoaderCircle className="animate-spin" /> : <Send />}{assigning ? 'Asignando…' : 'Asignar ahora'}</Button></DialogFooter></DialogContent>;
}
function categoryTone(category: Category) { if (category === 'Potencia') return 'border-[#d9e9b8] bg-[#f1f7e8] text-[#52751d]'; if (category === 'Velocidad') return 'border-[#cbdbe8] bg-[#eef4f8] text-[#315a78]'; if (category === 'Control') return 'border-[#ead4a1] bg-[#fff8e8] text-[#876016]'; return 'border-[#d8e0e6] bg-[#f4f7f8] text-[#344b5c]'; }
function phaseTone(phase: string) { if (phase.toLowerCase() === 'carga') return 'bg-[#fff0ec] text-[#a84735]'; if (phase.toLowerCase() === 'descarga') return 'bg-[#edf4e1] text-[#52751d]'; return 'bg-[#fff5dc] text-[#876016]'; }
function pseLabel(value: number) { if (value <= 2) return 'Fácil'; if (value <= 4) return 'Moderado'; if (value <= 6) return 'Duro'; if (value <= 8) return 'Muy duro'; return 'Máximo'; }
function today() { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 10); }
