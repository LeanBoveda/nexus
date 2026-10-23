'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Paperclip, Upload } from 'lucide-react';

type Attachment = { id: string; name: string; sizeBytes: number };

export function RoutineAttachments({
  routineId,
  instanceId,
  readOnly = false,
}: {
  routineId?: string;
  instanceId?: string;
  readOnly?: boolean;
}) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!routineId && !instanceId) return;
    const controller = new AbortController();
    const query = new URLSearchParams(
      instanceId ? { instanceId } : { routineId: routineId! },
    );
    fetch(`/api/routine-files?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as {
          files?: Attachment[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error || 'No pudimos cargar los adjuntos.');
        setFiles(body.files ?? []);
        setError('');
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [routineId, instanceId, revision]);
  async function upload(file?: File) {
    if (!file || !routineId) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo supera los 10 MB.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.set('routineId', routineId);
      form.set('file', file);
      const response = await fetch('/api/routine-files', {
        method: 'POST',
        body: form,
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || 'No pudimos subir el archivo.');
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No pudimos subir el archivo.',
      );
    } finally {
      setLoading(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <section
      className="rounded-2xl border border-border bg-card p-5 space-y-3"
      aria-label="Archivos de la rutina"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <Paperclip size={16} /> Archivos de la rutina
        </h3>
        {!readOnly && routineId && (
          <>
            <input
              ref={input}
              type="file"
              className="sr-only"
              aria-label="Seleccionar archivo de la rutina"
              accept=".pdf,.xlsx,.csv,.tsv,.png,.jpg,.jpeg"
              onChange={(event) => void upload(event.target.files?.[0])}
              disabled={loading}
            />
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
              disabled={loading}
              onClick={() => input.current?.click()}
            >
              <Upload size={14} />
              {loading ? 'Subiendo…' : 'Subir archivo'}
            </button>
          </>
        )}
      </div>
      {!routineId && !instanceId ? (
        <p className="text-sm text-muted-foreground">
          Guardá la rutina para adjuntar archivos.
        </p>
      ) : (
        <>
          {!readOnly && (
            <p className="text-xs text-muted-foreground">
              PDF, Excel (.xlsx), CSV, TSV o imágenes. Hasta 10 MB por archivo.
            </p>
          )}
          {files.length ? (
            <ul className="space-y-2">
              {files.map((file) => (
                <li key={file.id}>
                  <a
                    className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2 text-sm hover:bg-muted"
                    href={`/api/routine-files/${encodeURIComponent(file.id)}${instanceId ? `?instanceId=${encodeURIComponent(instanceId)}` : ''}`}
                  >
                    <span className="min-w-0 break-words">
                      {file.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {Math.max(1, Math.round(file.sizeBytes / 1024))} KB
                      </span>
                    </span>
                    <Download
                      size={16}
                      className="shrink-0"
                      aria-label="Descargar"
                    />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no hay archivos adjuntos.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
