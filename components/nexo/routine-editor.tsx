'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, FileSpreadsheet, GripVertical, Plus, Save, Send, Settings2, Trash2, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type ExerciseRow = { id: number; block: string; name: string; values: string[]; rir: string[]; tone: 'dark' | 'lime' | 'yellow' | 'plain' };

const initialRows: ExerciseRow[] = [
  { id: 1, block: 'A', name: 'Arranque desde cajón', values: ['4 4 3', '3 3 3', '3 3 3', '5 4 3'], rir: ['4-3', '3', '3', '4-3'], tone: 'dark' },
  { id: 2, block: 'A', name: 'Caminata con trineo · tensión unilateral', values: ['10+10', '12+12', '12+12', '10+10'], rir: ['', '', '', ''], tone: 'yellow' },
  { id: 3, block: 'B', name: 'Peso muerto', values: ['6 5 4 3', '5 4 4 3', '4 4 3', '5 5 5'], rir: ['4-3', '4-3', '3', '5'], tone: 'dark' },
  { id: 4, block: 'B', name: 'VBT', values: ['0,62–0,44', '0,62–0,44', '0,50–0,44', '0,62+'], rir: ['', '', '', ''], tone: 'lime' },
  { id: 5, block: 'B', name: 'KB swing', values: ['6 6 6 6', '6 6 6 6', '6 6 6', '5 5 5'], rir: ['', '', '', ''], tone: 'yellow' },
  { id: 6, block: 'B', name: 'Sprint con chaleco 8 kg', values: ['10 m', '15 m', '15 m', '10 m'], rir: ['', '', '', ''], tone: 'yellow' },
  { id: 7, block: 'C', name: 'Press banco plano', values: ['6 6 5 5', '5 5 5', '5 5 4 4', '6 6 6'], rir: ['4-3', '4-3', '3', '5'], tone: 'dark' },
  { id: 8, block: 'C', name: 'Empuje balón medicinal con impulso', values: ['5 5 5 5', '5 5 5 5', '5 5 5', '5 5 5'], rir: ['', '', '', ''], tone: 'yellow' },
  { id: 9, block: 'D', name: 'Remo landmine desde bisagra unipodal', values: ['3 × 8+8', '3 × 8+8', '3 × 10+10', '3 × 6+6'], rir: ['3', '3', '3', '5'], tone: 'dark' },
];

const weeks = [
  { number: '12', phase: 'AJUSTE', objective: 'F. ESTRUCTURAL', secondary: 'F. POTENCIA', pse: '5' },
  { number: '13', phase: 'CARGA', objective: 'F. ESTRUCTURAL', secondary: 'F. POTENCIA', pse: '6' },
  { number: '14', phase: 'CARGA', objective: 'F. MÁXIMA', secondary: 'F. POTENCIA', pse: '6' },
  { number: '15', phase: 'DESCARGA', objective: 'F. ESTRUCTURAL', secondary: 'F. POTENCIA', pse: '4' },
];

export function RoutineEditor() {
  const [rows, setRows] = useState(initialRows);
  const [saved, setSaved] = useState(false);
  const [assigned, setAssigned] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState('Selección Argentina · Beach');
  const groupedRows = useMemo(() => rows, [rows]);

  function updateValue(id: number, weekIndex: number, value: string, field: 'values' | 'rir') {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: row[field].map((entry, index) => index === weekIndex ? value : entry) } : row));
    setSaved(false);
  }

  function updateName(id: number, name: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, name } : row));
    setSaved(false);
  }

  function addExercise() {
    setRows((current) => [...current, { id: Date.now(), block: 'D', name: 'Nuevo ejercicio', values: ['', '', '', ''], rir: ['', '', '', ''], tone: 'plain' }]);
  }

  return (
    <div className="mx-auto max-w-[1560px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-border pb-5 xl:flex-row xl:items-center">
        <div className="flex items-center gap-3"><a href="/rutinas" className="grid size-9 place-items-center rounded-xl border border-border bg-card hover:bg-muted" aria-label="Volver a rutinas"><ArrowLeft className="size-4" /></a><div><div className="flex items-center gap-2"><h1 className="text-xl font-bold tracking-[-0.04em]">Competitivo 1 · Día A</h1><Badge variant="outline" className={saved ? 'border-[#cfe0ac] bg-[#f1f7e8] text-[#52751d]' : 'bg-muted/50'}>{saved ? 'Guardado' : 'Cambios sin guardar'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Full body · 4 semanas · Versión 3</p></div></div>
        <div className="flex flex-wrap gap-2 xl:ml-auto"><Button variant="outline" className="h-9 rounded-xl"><FileSpreadsheet /> Importar Excel</Button><Button variant="outline" className="h-9 rounded-xl"><Settings2 /> Configurar ciclo</Button><Button variant="outline" className="h-9 rounded-xl" onClick={() => setSaved(true)}><Save /> Guardar</Button><Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger render={<Button className="h-9 rounded-xl bg-[#10253d] px-3.5 text-white hover:bg-[#183653]" />}><Send /> Asignar rutina</DialogTrigger><AssignmentDialog selected={selectedGroup} onSelect={setSelectedGroup} assigned={assigned} onAssign={() => setAssigned(true)} /></Dialog></div>
      </div>

      {assigned && <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#cfe0ac] bg-[#f1f7e8] px-4 py-3 text-sm text-[#3f6110]"><span className="grid size-7 place-items-center rounded-lg bg-[#d9ecae]"><Check className="size-3.5" /></span><div className="flex-1"><p className="font-semibold">Rutina asignada a {selectedGroup}</p><p className="text-[11px] text-[#587034]">Se crearon 18 asignaciones individuales conservando esta versión.</p></div><Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>Listo</Button></div>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_50px_-42px_#10253d]">
        <div className="flex items-center justify-between border-b border-border bg-[#10253d] px-4 py-3 text-white"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Profesor Manuel Abalsamo</p><p className="mt-1 text-sm font-semibold">Día A · Full Body</p></div><Badge className="bg-white/10 text-white">Competitivo 1</Badge></div>
        <div className="overflow-x-auto">
          <table className="min-w-[1020px] w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-[#eef1ec]"><th className="w-10 border-r border-border px-2 py-2" /><th className="min-w-[300px] border-r border-border px-3 text-left font-bold uppercase tracking-wide text-muted-foreground">Período</th>{weeks.map((week) => <th key={week.number} className="w-[155px] border-r border-border px-2 py-2 text-center"><span className="text-sm font-bold">{week.number}</span><span className={`mt-1 block text-[9px] font-bold ${week.phase === 'DESCARGA' ? 'text-[#5b7f2d]' : week.phase === 'CARGA' ? 'text-[#c14d38]' : 'text-[#d27d24]'}`}>{week.phase}</span></th>)}</tr>
              <tr className="border-b border-border"><th className="border-r border-border" /><th className="border-r border-border px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide">Objetivo</th>{weeks.map((week) => <th key={week.number} className="border-r border-border px-2 py-1.5 text-[10px]"><span className="block font-bold">{week.objective}</span><span className="mt-1 block text-muted-foreground">{week.secondary}</span></th>)}</tr>
              <tr className="border-b border-border bg-[#fff9e8]"><th className="border-r border-border" /><th className="border-r border-border px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide">PSE estimado sesión</th>{weeks.map((week) => <th key={week.number} className="border-r border-border text-center text-sm font-bold">{week.pse}</th>)}</tr>
              <tr className="border-b border-border bg-[#f3f5f6]"><th className="border-r border-border" /><th className="border-r border-border px-3 py-2 text-left font-medium">Activación · movilidad + core + preventivos</th><th colSpan={4} className="px-3 text-center text-[10px] font-medium">Hombros principalmente · Entrada en calor</th></tr>
            </thead>
            <tbody>
              {groupedRows.map((row, rowIndex) => (
                <RoutineRows key={row.id} row={row} previousBlock={rowIndex === 0 ? null : groupedRows[rowIndex - 1].block} onUpdate={updateValue} onNameChange={updateName} onDelete={() => setRows((current) => current.filter((item) => item.id !== row.id))} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border bg-muted/35 px-4 py-3"><Button variant="outline" size="sm" onClick={addExercise}><Plus /> Agregar ejercicio</Button><p className="text-[11px] text-muted-foreground">Tip: podés pegar valores directamente desde Excel</p></div>
      </div>
    </div>
  );
}

function RoutineRows({ row, previousBlock, onUpdate, onNameChange, onDelete }: { row: ExerciseRow; previousBlock: string | null; onUpdate: (id: number, index: number, value: string, field: 'values' | 'rir') => void; onNameChange: (id: number, name: string) => void; onDelete: () => void }) {
  const nameTone = row.tone === 'dark' ? 'bg-[#3d454c] text-white' : row.tone === 'lime' ? 'bg-[#b8df63] text-[#26340f]' : row.tone === 'yellow' ? 'bg-[#fff036] text-[#3d3a00]' : 'bg-white';
  const showBlock = previousBlock !== row.block;
  return (
    <>
      <tr className="group border-b border-border/80">
        <td rowSpan={row.rir.some(Boolean) ? 2 : 1} className="w-10 border-r border-border bg-[#f6f4ef] text-center align-middle font-bold text-[#c14d38]">{showBlock ? row.block : ''}</td>
        <td className={`border-r border-border px-2 py-0 ${nameTone}`}><div className="flex items-center gap-2"><GripVertical className="size-3.5 shrink-0 opacity-35" /><input aria-label="Nombre del ejercicio" value={row.name} onChange={(event) => onNameChange(row.id, event.target.value)} className="h-8 min-w-0 flex-1 bg-transparent font-semibold outline-none" /><button onClick={onDelete} aria-label={`Eliminar ${row.name}`} className="opacity-0 transition group-hover:opacity-70 hover:opacity-100"><Trash2 className="size-3.5" /></button></div></td>
        {row.values.map((value, index) => <td key={index} className="border-r border-border p-0"><input aria-label={`${row.name}, semana ${weeks[index].number}`} value={value} onChange={(event) => onUpdate(row.id, index, event.target.value, 'values')} className="h-9 w-full bg-transparent px-2 text-center font-semibold outline-none focus:bg-[#f1f7e8]" /></td>)}
      </tr>
      {row.rir.some(Boolean) && <tr className="border-b border-border/80 bg-[#f6f7f8]"><td className="border-r border-border px-3 py-1 text-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground">RIR</td>{row.rir.map((value, index) => <td key={index} className="border-r border-border p-0"><input aria-label={`RIR ${row.name}, semana ${weeks[index].number}`} value={value} onChange={(event) => onUpdate(row.id, index, event.target.value, 'rir')} className="h-7 w-full bg-transparent text-center font-semibold outline-none focus:bg-[#fff9e8]" /></td>)}</tr>}
    </>
  );
}

function AssignmentDialog({ selected, onSelect, assigned, onAssign }: { selected: string; onSelect: (value: string) => void; assigned: boolean; onAssign: () => void }) {
  const targets = [
    { name: 'Selección Argentina · Beach', detail: '18 deportistas', type: 'Grupo' },
    { name: 'Club · Plantel superior', detail: '22 deportistas', type: 'Grupo' },
    { name: 'Gimnasio · Turno tarde', detail: '8 deportistas', type: 'Grupo' },
    { name: 'Lucía Méndez', detail: 'Asignación individual', type: 'Persona' },
  ];
  return <DialogContent className="sm:max-w-lg"><DialogHeader><span className="mb-1 grid size-9 place-items-center rounded-xl bg-[#edf4e1] text-[#52751d]"><Users className="size-4" /></span><DialogTitle>Asignar planificación</DialogTitle><DialogDescription>Cada integrante recibirá una instancia individual que después podrás adaptar.</DialogDescription></DialogHeader><div className="space-y-2 py-2">{targets.map((target) => <button key={target.name} onClick={() => onSelect(target.name)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selected === target.name ? 'border-[#9fcf2d] bg-[#f1f7e8]' : 'border-border hover:bg-muted/50'}`}><Checkbox checked={selected === target.name} /><div className="flex-1"><p className="text-sm font-semibold">{target.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{target.detail}</p></div><Badge variant="outline" className="bg-card">{target.type}</Badge></button>)}</div><DialogFooter><Button className="bg-[#10253d] text-white hover:bg-[#183653]" onClick={onAssign}>{assigned ? <Check /> : <Send />}{assigned ? 'Asignación creada' : 'Crear asignaciones'}</Button></DialogFooter></DialogContent>;
}
