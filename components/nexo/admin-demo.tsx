'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function AdminDemo() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [error, setError] = useState('');
  async function prepare() {
    setStatus('loading');
    try {
      const response = await fetch('/api/admin/demo', { method: 'POST' });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'No pudimos preparar la demo.');
      setStatus('ready');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No pudimos preparar la demo.',
      );
      setStatus('error');
    }
  }
  useEffect(() => {
    void prepare();
  }, []);
  return (
    <section
      aria-label="Espacio de demostración"
      className="mt-5 rounded-2xl border border-[#c9dd9c] bg-[#f3f9e8] p-5"
    >
      <h2 className="font-bold text-[#10253d]">
        Tu espacio de PF · Demostración
      </h2>
      <p className="mt-1 text-sm text-[#526444]">
        8 personas, 3 grupos, 3 rutinas de 2 a 4 días, agenda, sesiones
        registradas y 24 evaluaciones. Todo identificado como DEMO. No se envían
        correos ni se reemplazan tus datos.
      </p>
      <p role="status" className="mt-2 text-sm">
        {status === 'loading'
          ? 'Preparando tu espacio…'
          : status === 'ready'
            ? 'Demostración disponible. Podés editar los ejemplos y volver al panel de negocio en cualquier momento.'
            : error}
      </p>
      {status === 'ready' && (
        <nav
          aria-label="Recorrer demostración"
          className="mt-4 flex flex-wrap gap-2"
        >
          {[
            ['Inicio', '/'],
            ['Personas', '/deportistas'],
            ['Grupos', '/grupos'],
            ['Agenda', '/agenda'],
            ['Rutinas', '/rutinas'],
            ['Evaluaciones', '/evaluaciones'],
            ['Carga', '/carga'],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-[#10253d] hover:bg-[#e7efda]"
            >
              {label}
            </a>
          ))}
        </nav>
      )}
      {status === 'error' && (
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => void prepare()}
        >
          Reintentar carga
        </Button>
      )}
    </section>
  );
}
