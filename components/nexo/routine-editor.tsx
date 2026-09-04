'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  GripVertical,
  Plus,
  Save,
  Send,
  Settings2,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';

type Category = 'Fuerza' | 'Potencia' | 'Velocidad' | 'Control';
type ExerciseRow = {
  id: number;
  block: string;
  category: Category;
  name: string;
  values: string[];
  rir: string[];
};
type AssignmentTarget = { id: string; name: string; detail: string; type: 'Grupo' | 'Persona' };
type WeekPlan = {
  number: string;
  phase: string;
  objective: string;
  secondary: string;
  pse: string;
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
  { number: '12', phase: 'Ajuste', objective: 'Fuerza estructural', secondary: 'Fuerza potencia', pse: '5' },
  { number: '13', phase: 'Carga', objective: 'Fuerza estructural', secondary: 'Fuerza potencia', pse: '6' },
  { number: '14', phase: 'Carga', objective: 'Fuerza máxima', secondary: 'Fuerza potencia', pse: '6' },
  { number: '15', phase: 'Descarga', objective: 'Fuerza estructural', secondary: 'Fuerza potencia', pse: '4' },
];

const blockDescriptions: Record<string, string> = {
  A: 'Activación neural y potencia',
  B: 'Fuerza de tren inferior',
  C: 'Fuerza de tren superior',
  D: 'Trabajo unilateral y estabilidad',
};

export function RoutineEditor() {
  const [rows, setRows] = useState(initialRows);
  const [weekPlans, setWeekPlans] = useState(initialWeeks);
  const [activeWeek, setActiveWeek] = useState(0);
  const [sessionName, setSessionName] = useState('Día A · Full body');
  const [warmup, setWarmup] = useState('Movilidad, core y preventivos de hombro antes de comenzar.');
  const [saved, setSaved] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targets, setTargets] = useState<AssignmentTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [assignedTarget, setAssignedTarget] = useState<AssignmentTarget | null>(null);

  useEffect(() => {
    fetch('/api/groups', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { groups: [], athletes: [] })
      .then((result: {
        groups?: Array<{ id: string; name: string; organizationName: string; memberCount: number }>;
        athletes?: Array<{ id: string; firstName: string; lastName: string; email: string }>;
      }) => {
        setTargets([
          ...(result.groups ?? []).map((group) => ({
            id: `group:${group.id}`,
            name: group.name,
            detail: `${group.organizationName} · ${Number(group.memberCount)} personas`,
            type: 'Grupo' as const,
          })),
          ...(result.athletes ?? []).map((athlete) => ({
            id: `athlete:${athlete.id}`,
            name: `${athlete.firstName} ${athlete.lastName}`,
            detail: athlete.email,
            type: 'Persona' as const,
          })),
        ]);
      })
      .catch(() => setTargets([]));
  }, []);

  const blocks = useMemo(() => Array.from(new Set(rows.map((row) => row.block))), [rows]);
  const currentWeek = weekPlans[activeWeek];
  const selectedTarget = targets.find((target) => target.id === selectedTargetId) ?? null;

  function updateWeek(field: keyof WeekPlan, value: string) {
    setWeekPlans((current) => current.map((week, index) => (
      index === activeWeek ? { ...week, [field]: value } : week
    )));
    setSaved(false);
  }

  function updateExercise(id: number, field: 'name' | 'value' | 'rir', value: string) {
    setRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      if (field === 'name') return { ...row, name: value };
      const key = field === 'value' ? 'values' : 'rir';
      return { ...row, [key]: row[key].map((entry, index) => index === activeWeek ? value : entry) };
    }));
    setSaved(false);
  }

  function addExercise(block: string) {
    setRows((current) => [...current, {
      id: Date.now(),
      block,
      category: 'Fuerza',
      name: 'Nuevo ejercicio',
      values: ['', '', '', ''],
      rir: ['', '', '', ''],
    }]);
    setSaved(false);
  }

  function removeExercise(id: number) {
    setRows((current) => current.filter((row) => row.id !== id));
    setSaved(false);
  }

  function assignRoutine() {
    if (!selectedTarget) return;
    setAssignedTarget(selectedTarget);
    setDialogOpen(false);
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <header className="flex flex-col gap-5 border-b border-border pb-6 xl:flex-row xl:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <a href="/rutinas" className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card transition hover:bg-muted" aria-label="Volver a rutinas"><ArrowLeft className="size-4" /></a>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="Nombre de la rutina" defaultValue="Competitivo 1 · Día A" onChange={() => setSaved(false)} className="min-w-0 max-w-full bg-transparent text-2xl font-bold tracking-[-0.04em] outline-none focus:text-[#29445e]" />
              <Badge variant="outline" className={saved ? 'border-[#cfe0ac] bg-[#f1f7e8] text-[#52751d]' : 'bg-muted/50'}>{saved ? 'Guardado' : 'Borrador'}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Full body · 4 semanas · Día de fuerza</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 xl:ml-auto">
          <Button variant="outline" className="h-10 rounded-xl"><FileSpreadsheet /> Importar desde Excel</Button>
          <Button variant="outline" className="h-10 rounded-xl"><Settings2 /> Configurar ciclo</Button>
          <Button variant="outline" className="h-10 rounded-xl" onClick={() => setSaved(true)}><Save /> Guardar</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button className="h-10 rounded-xl bg-[#10253d] px-4 text-white hover:bg-[#183653]" />}><Send /> Asignar rutina</DialogTrigger>
            <AssignmentDialog targets={targets} selectedId={selectedTargetId} onSelect={setSelectedTargetId} onAssign={assignRoutine} />
          </Dialog>
        </div>
      </header>

      {assignedTarget && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#cfe0ac] bg-[#f1f7e8] px-4 py-3 text-[#3f6110]">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#d9ecae]"><Check className="size-4" /></span>
          <div className="min-w-0 flex-1"><p className="font-semibold">Rutina preparada para {assignedTarget.name}</p><p className="text-sm text-[#587034]">La planificación mantiene una copia individual para futuras adaptaciones.</p></div>
          <button onClick={() => setAssignedTarget(null)} className="text-sm font-semibold hover:underline">Cerrar</button>
        </div>
      )}

      <section className="mt-5 rounded-[22px] border border-border bg-card p-3 shadow-[0_18px_50px_-42px_#10253d] sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div><p className="text-sm font-semibold">Progresión del ciclo</p><p className="text-sm text-muted-foreground">Elegí una semana para editar su sesión.</p></div>
          <span className="hidden text-sm text-muted-foreground sm:block">{rows.length} ejercicios · {blocks.length} bloques</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          {weekPlans.map((week, index) => {
            const active = activeWeek === index;
            return (
              <button key={index} onClick={() => setActiveWeek(index)} aria-pressed={active} className={`group rounded-2xl border p-3 text-left transition ${active ? 'border-[#10253d] bg-[#10253d] text-white shadow-lg shadow-[#10253d]/15' : 'border-border bg-background hover:border-[#b7c7d3] hover:bg-muted/35'}`}>
                <span className="flex items-center justify-between gap-2"><span className={`text-sm font-semibold ${active ? 'text-white/65' : 'text-muted-foreground'}`}>Semana {week.number}</span><span className={`rounded-full px-2 py-1 text-xs font-bold ${active ? 'bg-[#c8f15a] text-[#26340f]' : phaseTone(week.phase)}`}>{week.phase}</span></span>
                <span className="mt-3 block text-base font-bold">{week.objective}</span>
                <span className={`mt-1 block text-sm ${active ? 'text-white/55' : 'text-muted-foreground'}`}>PSE {week.pse} · {week.secondary}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <main className="space-y-4">
          <div className="flex flex-col gap-3 rounded-[22px] bg-[#10253d] p-5 text-white sm:flex-row sm:items-center">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-[#c8f15a]"><Zap className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <input value={sessionName} onChange={(event) => { setSessionName(event.target.value); setSaved(false); }} aria-label="Nombre de la sesión" className="w-full bg-transparent text-xl font-bold tracking-[-0.03em] text-white outline-none placeholder:text-white/35 focus:text-[#dff58f]" />
              <label className="mt-2 block">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/45">Entrada en calor</span>
                <input value={warmup} onChange={(event) => { setWarmup(event.target.value); setSaved(false); }} aria-label="Entrada en calor" className="mt-0.5 w-full border-b border-transparent bg-transparent pb-1 text-sm text-white/65 outline-none transition placeholder:text-white/35 focus:border-white/25 focus:text-white" />
              </label>
            </div>
            <Badge className="w-fit bg-white/10 text-white">Semana {currentWeek.number}</Badge>
          </div>

          {blocks.map((block) => {
            const blockRows = rows.filter((row) => row.block === block);
            return (
              <section key={block} className="overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_16px_45px_-40px_#10253d]">
                <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-3.5 sm:px-5">
                  <span className="grid size-9 place-items-center rounded-xl bg-[#10253d] font-bold text-white">{block}</span>
                  <div className="flex-1"><h2 className="text-base font-bold">Bloque {block}</h2><p className="text-sm text-muted-foreground">{blockDescriptions[block] ?? 'Trabajo específico'}</p></div>
                  <Badge variant="outline" className="bg-card">{blockRows.length} ejercicios</Badge>
                </div>
                <div className="divide-y divide-border">
                  {blockRows.map((row, index) => (
                    <div key={row.id} className="group grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_180px_110px_36px] lg:items-center">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-1 flex items-center gap-2 text-muted-foreground"><GripVertical className="size-4 opacity-45" /><span className="grid size-7 place-items-center rounded-lg bg-muted text-sm font-bold">{index + 1}</span></span>
                        <div className="min-w-0 flex-1">
                          <input value={row.name} onChange={(event) => updateExercise(row.id, 'name', event.target.value)} aria-label={`Nombre del ejercicio ${index + 1} del bloque ${block}`} className="w-full bg-transparent text-base font-semibold outline-none focus:text-[#29445e]" />
                          <Badge variant="outline" className={`mt-2 ${categoryTone(row.category)}`}>{row.category}</Badge>
                        </div>
                      </div>
                      <LabeledInput label="Trabajo" value={row.values[activeWeek]} placeholder="Series, repeticiones o distancia" onChange={(value) => updateExercise(row.id, 'value', value)} />
                      <LabeledInput label="RIR" value={row.rir[activeWeek]} placeholder="—" onChange={(value) => updateExercise(row.id, 'rir', value)} />
                      <button onClick={() => removeExercise(row.id)} aria-label={`Eliminar ${row.name}`} title="Eliminar ejercicio" className="grid size-9 place-items-center rounded-xl text-muted-foreground opacity-70 transition hover:bg-[#fff0ed] hover:text-[#a23f30] lg:opacity-0 lg:group-hover:opacity-100"><Trash2 className="size-4" /></button>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border bg-muted/20 px-4 py-3 sm:px-5"><button onClick={() => addExercise(block)} className="flex items-center gap-2 text-sm font-semibold text-[#52751d] hover:underline"><Plus className="size-4" /> Agregar ejercicio al bloque {block}</button></div>
              </section>
            );
          })}
        </main>

        <aside className="space-y-4 xl:sticky xl:top-[88px]">
          <section className="rounded-[22px] border border-border bg-card p-5 shadow-[0_18px_50px_-42px_#10253d]">
            <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-muted-foreground">Configuración semanal</p><h2 className="mt-1 text-xl font-bold">Editá la semana activa</h2></div><span className="grid size-10 place-items-center rounded-xl bg-[#edf4e1] text-[#52751d]"><Activity className="size-5" /></span></div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <LabeledInput label="Semana" value={currentWeek.number} placeholder="Ej. 12" onChange={(value) => updateWeek('number', value)} />
              <LabeledInput label="Período" value={currentWeek.phase} placeholder="Ej. Carga" onChange={(value) => updateWeek('phase', value)} />
            </div>
            <div className="mt-4 space-y-4">
              <LabeledInput label="Objetivo principal" value={currentWeek.objective} placeholder="Ej. Fuerza estructural" onChange={(value) => updateWeek('objective', value)} />
              <LabeledInput label="Objetivo complementario" value={currentWeek.secondary} placeholder="Ej. Fuerza potencia" onChange={(value) => updateWeek('secondary', value)} />
            </div>
            <div className="mt-5 rounded-2xl bg-[#10253d] p-4 text-white">
              <div className="flex items-end justify-between gap-3">
                <label><span className="block text-sm text-white/55">PSE estimado</span><span className="mt-1 flex items-baseline"><input type="number" min="0" max="10" step="1" value={currentWeek.pse} onChange={(event) => updateWeek('pse', event.target.value)} aria-label="PSE estimado" className="w-12 bg-transparent text-3xl font-bold text-white outline-none focus:text-[#dff58f]" /><span className="text-base font-medium text-white/40">/ 10</span></span></label>
                <span className="text-sm font-semibold text-[#c8f15a]">{pseLabel(Number(currentWeek.pse))}</span>
              </div>
              <Progress value={Math.max(0, Math.min(100, Number(currentWeek.pse) * 10))} className="mt-4 [&_[data-slot=progress-track]]:bg-white/10 [&_[data-slot=progress-indicator]]:bg-[#c8f15a]" />
            </div>
          </section>

          <section className="rounded-[22px] border border-border bg-card p-5">
            <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#fff5dc] text-[#9a6b12]"><ClipboardList className="size-4" /></span><div><h2 className="font-bold">Indicaciones de la sesión</h2><p className="text-sm text-muted-foreground">Visibles para el deportista.</p></div></div>
            <Textarea defaultValue="Priorizar la calidad técnica. Ajustar la carga si aparece molestia de hombro." onChange={() => setSaved(false)} className="mt-4 min-h-28 resize-none rounded-xl text-sm" aria-label="Indicaciones de la sesión" />
          </section>

          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" disabled={activeWeek === 0} onClick={() => setActiveWeek((week) => Math.max(0, week - 1))}><ChevronLeft /> Anterior</Button>
            <span className="text-sm font-medium text-muted-foreground">{activeWeek + 1} de {weekPlans.length}</span>
            <Button variant="outline" disabled={activeWeek === weekPlans.length - 1} onClick={() => setActiveWeek((week) => Math.min(weekPlans.length - 1, week + 1))}>Siguiente <ChevronRight /></Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function LabeledInput({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-muted-foreground">{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none transition focus:border-[#8fbc29] focus:ring-3 focus:ring-[#b9dc68]/20" /></label>;
}

function AssignmentDialog({ targets, selectedId, onSelect, onAssign }: { targets: AssignmentTarget[]; selectedId: string; onSelect: (value: string) => void; onAssign: () => void }) {
  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><span className="mb-1 grid size-10 place-items-center rounded-xl bg-[#edf4e1] text-[#52751d]"><Users className="size-5" /></span><DialogTitle>Asignar planificación</DialogTitle><DialogDescription>Elegí un grupo completo o una persona. Después podrás adaptar su copia individual.</DialogDescription></DialogHeader>
      <div className="max-h-80 space-y-2 overflow-y-auto py-2">
        {targets.length === 0 ? <div className="rounded-2xl bg-muted/50 p-5 text-center"><p className="font-semibold">Todavía no hay destinatarios</p><p className="mt-1 text-sm text-muted-foreground">Primero cargá deportistas o creá un grupo.</p></div> : targets.map((target) => (
          <button key={target.id} onClick={() => onSelect(target.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selectedId === target.id ? 'border-[#9fcf2d] bg-[#f1f7e8]' : 'border-border hover:bg-muted/50'}`}>
            <Checkbox checked={selectedId === target.id} /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{target.name}</p><p className="mt-0.5 truncate text-sm text-muted-foreground">{target.detail}</p></div><Badge variant="outline" className="bg-card">{target.type}</Badge>
          </button>
        ))}
      </div>
      <DialogFooter><Button disabled={!selectedId} className="bg-[#10253d] text-white hover:bg-[#183653]" onClick={onAssign}><Send /> Preparar asignación</Button></DialogFooter>
    </DialogContent>
  );
}

function categoryTone(category: Category) {
  if (category === 'Potencia') return 'border-[#d9e9b8] bg-[#f1f7e8] text-[#52751d]';
  if (category === 'Velocidad') return 'border-[#cbdbe8] bg-[#eef4f8] text-[#315a78]';
  if (category === 'Control') return 'border-[#ead4a1] bg-[#fff8e8] text-[#876016]';
  return 'border-[#d8e0e6] bg-[#f4f7f8] text-[#344b5c]';
}

function phaseTone(phase: string) {
  if (phase === 'Carga') return 'bg-[#fff0ec] text-[#a84735]';
  if (phase === 'Descarga') return 'bg-[#edf4e1] text-[#52751d]';
  return 'bg-[#fff5dc] text-[#876016]';
}

function pseLabel(value: number) {
  if (value <= 2) return 'Fácil';
  if (value <= 4) return 'Moderado';
  if (value <= 6) return 'Duro';
  if (value <= 8) return 'Muy duro';
  return 'Máximo';
}
