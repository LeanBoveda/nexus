'use client';

import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { checkImportRows, guessColumns, IMPORT_LIMIT, importFields, type CheckedRow, type ImportField, type ImportRow } from '@/lib/athlete-import';

type Sheet = { name: string; rows: string[][] };
type Group = { id: string; name: string; organizationName: string };

export function AthleteImportDialog({ groups, onImported }: { groups: Group[]; onImported: (count: number, skipped: number) => void }) {
  const [open, setOpen] = useState(false);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [columns, setColumns] = useState<Partial<Record<ImportField, number>>>({});
  const [groupId, setGroupId] = useState('');
  const [filename, setFilename] = useState('');
  const [preview, setPreview] = useState<CheckedRow[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [available, setAvailable] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const sheet = sheets[sheetIndex];
  const headers = sheet?.rows[headerRow] ?? [];

  function reset() {
    setSheets([]); setPreview(null); setSelected(new Set()); setError(''); setFilename(''); setGroupId('');
  }
  function chooseHeader(index: number, selectedSheet = sheetIndex) {
    setSheetIndex(selectedSheet); setHeaderRow(index); setColumns(guessColumns(sheets[selectedSheet]?.rows[index] ?? [])); setPreview(null); setError('');
  }
  async function readFile(file?: File) {
    if (!file) return;
    setBusy(true); setError(''); setPreview(null); setSheets([]);
    let worker: Worker | undefined;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('El archivo debe pesar como máximo 2 MB.');
      const { default: FileReaderWorker } = await import('@/lib/athlete-file.worker?worker');
      worker = new FileReaderWorker();
      const reader = worker;
      const result = await new Promise<Sheet[]>((resolve, reject) => {
        const timeout = window.setTimeout(() => { reader.terminate(); reject(new Error('El archivo tardó demasiado. Probá exportarlo como CSV.')); }, 20_000);
        reader.onmessage = (event: MessageEvent<{ sheets?: Sheet[]; error?: string }>) => {
          window.clearTimeout(timeout);
          if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.sheets ?? []);
        };
        reader.onerror = () => { window.clearTimeout(timeout); reject(new Error('No pudimos leer el archivo. Revisá que sea Excel .xlsx o CSV.')); };
        reader.postMessage({ file });
      });
      setSheets(result); setSheetIndex(0); setHeaderRow(0); setColumns(guessColumns(result[0]?.rows[0] ?? [])); setFilename(file.name);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos abrir el archivo.'); }
    finally { worker?.terminate(); setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  }
  function mappedRows(): ImportRow[] {
    for (const [key, label, required] of importFields) if (required && columns[key] === undefined) throw new Error(`Elegí la columna de ${label.toLowerCase()}.`);
    const indexes = Object.values(columns).filter(i => i !== undefined);
    if (new Set(indexes).size !== indexes.length) throw new Error('Cada dato debe usar una columna diferente.');
    const rows = (sheet?.rows.slice(headerRow + 1) ?? []).flatMap((row, index) => {
      if (!row.some(cell => cell.trim())) return [];
      const data = { sourceRow: headerRow + index + 2 } as ImportRow;
      for (const [field] of importFields) data[field] = columns[field] === undefined ? '' : row[columns[field]!] ?? '';
      return [data];
    });
    checkImportRows(rows);
    return rows;
  }
  async function review() {
    setError(''); setBusy(true);
    try {
      const response = await fetch('/api/athletes/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preview', rows: mappedRows(), groupId }) });
      const result = await response.json() as { rows: CheckedRow[]; available: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'No pudimos revisar el archivo.');
      setPreview(result.rows); setAvailable(result.available); setSelected(new Set(result.rows.flatMap((row, index) => row.status === 'valid' ? [index] : [])));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos revisar el archivo.'); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!preview || !selected.size) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/athletes/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'commit', rows: preview.filter((_, index) => selected.has(index)).map(row => row.data), groupId }) });
      const result = await response.json() as { created: number; skipped: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'No pudimos importar los alumnos.');
      onImported(result.created, result.skipped + preview.length - selected.size);
      setOpen(false); reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos importar los alumnos.'); }
    finally { setBusy(false); }
  }
  function template() {
    const blob = new Blob(['\uFEFFNombre;Apellido;Email;Teléfono;Fecha de nacimiento;País;Posición;Contexto\r\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'plantilla-alumnos-nexo.csv'; anchor.click(); URL.revokeObjectURL(url);
  }
  const validCount = preview?.filter(row => row.status === 'valid').length ?? 0;
  return <>
    <Button variant="outline" className="h-9 rounded-xl" onClick={() => { reset(); setOpen(true); }}><Upload /> Importar alumnos</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl" showCloseButton={!busy}>
        <DialogHeader><DialogTitle>Importar alumnos desde una planilla</DialogTitle><DialogDescription>1. Elegí el archivo · 2. Relacioná las columnas · 3. Revisá y confirmá</DialogDescription></DialogHeader>
        <div className="rounded-xl border border-dashed bg-[#f5f7f0] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 font-semibold"><FileSpreadsheet className="size-5 text-[#52751d]" />{filename || 'Tu listado de alumnos'}</p><p className="mt-1 text-xs text-muted-foreground">Excel .xlsx, CSV o TSV · Hasta {IMPORT_LIMIT} alumnos y 2 MB. Nombre, apellido y email son obligatorios.</p></div>
            <Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}><Upload />{filename ? 'Cambiar archivo' : 'Elegir archivo'}</Button></div>
          <input ref={fileInput} type="file" accept=".xlsx,.csv,.tsv" className="sr-only" aria-label="Archivo de alumnos" disabled={busy} onChange={event => void readFile(event.target.files?.[0])} />
          <button onClick={template} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#52751d]"><Download className="size-3" /> Descargar plantilla CSV</button>
        </div>
        {sheet && !preview && <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Hoja"><select value={sheetIndex} disabled={busy} onChange={event => chooseHeader(0, Number(event.target.value))}>{sheets.map((s, index) => <option value={index} key={index}>{s.name}</option>)}</select></Field>
            <Field label="Fila de encabezados"><select value={headerRow} disabled={busy} onChange={event => chooseHeader(Number(event.target.value))}>{sheet.rows.slice(0, 20).map((_, index) => <option value={index} key={index}>Fila {index + 1}</option>)}</select></Field>
            <Field label="Asignar a un grupo (opcional)"><select value={groupId} disabled={busy} onChange={event => setGroupId(event.target.value)}><option value="">Sin grupo</option>{groups.map(g => <option value={g.id} key={g.id}>{g.name} · {g.organizationName}</option>)}</select></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{importFields.map(([field, label, required]) => <Field label={`${label}${required ? ' *' : ''}`} key={field}>
            <select value={columns[field] ?? ''} disabled={busy} onChange={event => setColumns(current => ({ ...current, [field]: event.target.value === '' ? undefined : Number(event.target.value) }))}><option value="">{required ? 'Elegir columna' : 'No importar'}</option>{headers.map((h, index) => <option key={index} value={index}>{index + 1}. {h || '(sin título)'}</option>)}</select>
            {columns[field] !== undefined && <p className="mt-1 truncate text-xs text-muted-foreground">Ej.: {sheet.rows[headerRow + 1]?.[columns[field]!] || '—'}</p>}
          </Field>)}</div>
        </>}
        {preview && <>
          <div className="flex flex-wrap gap-3 rounded-xl bg-[#f5f7f0] p-4 text-sm"><span><strong>{validCount}</strong> disponibles</span><span><strong>{preview.length - validCount}</strong> con errores o duplicados</span><span><strong>{available}</strong> lugares en tu plan</span></div>
          <p className="text-xs text-muted-foreground">Solo se cargarán las filas marcadas. Las fichas existentes conservan sus datos. Grupo: {groups.find(g => g.id === groupId)?.name ?? 'Sin grupo'}.</p>
          <div className="max-h-72 overflow-auto rounded-xl border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[#10253d] text-white"><tr><th className="p-3"><input type="checkbox" aria-label="Seleccionar todos los alumnos válidos" disabled={busy || !validCount} checked={selected.size === validCount && validCount > 0} onChange={event => setSelected(event.target.checked ? new Set(preview.flatMap((row, index) => row.status === 'valid' ? [index] : [])) : new Set())} /></th><th className="p-3">Fila</th><th className="p-3">Alumno</th><th className="p-3">Email</th><th className="p-3">Revisión</th></tr></thead><tbody>{preview.map((row, index) => <tr key={index} className="border-t"><td className="p-3"><input type="checkbox" aria-label={`Importar fila ${row.data.sourceRow}`} disabled={busy || row.status !== 'valid'} checked={selected.has(index)} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(index); else next.delete(index); return next; })} /></td><td className="p-3">{row.data.sourceRow}</td><td className="p-3">{row.data.firstName} {row.data.lastName}</td><td className="p-3">{row.data.email}</td><td className={`min-w-48 p-3 ${row.status === 'valid' ? 'text-[#52751d]' : 'text-amber-800'}`}>{row.message}</td></tr>)}</tbody></table></div>
          {selected.size > available && <p className="text-sm text-amber-800">Seleccioná hasta {available} alumnos para respetar el cupo de tu plan.</p>}
        </>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button variant="outline" disabled={busy} onClick={() => { if (preview) { setPreview(null); setError(''); } else setOpen(false); }}>{preview ? 'Volver a las columnas' : 'Cancelar'}</Button>
          {preview ? <Button disabled={busy || !selected.size || selected.size > available} onClick={() => void commit()}>{busy && <LoaderCircle className="animate-spin" />}Importar {selected.size} alumnos</Button> : <Button disabled={busy || !sheet} onClick={() => void review()}>{busy && <LoaderCircle className="animate-spin" />}{busy ? 'Leyendo…' : 'Revisar alumnos'}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold">{label}<div className="mt-1 [&>select]:h-10 [&>select]:w-full [&>select]:rounded-lg [&>select]:border [&>select]:bg-white [&>select]:px-2 [&>select]:text-xs [&>select]:font-normal">{children}</div></label>;
}
