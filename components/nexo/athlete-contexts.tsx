'use client';
import { useState } from 'react';
import type { AthleteContext } from '@/lib/athlete-identities';

export function AthleteContexts({
  contexts,
  activeAthleteId,
  scoped,
}: {
  contexts: AthleteContext[];
  activeAthleteId: string | null;
  scoped: boolean;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function select(id: string) {
    setBusy(id);
    setError('');
    try {
      const response = await fetch('/api/athlete/context', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ athleteId: id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? 'No pudimos abrir la ficha.');
      window.location.assign('/mi-entrenamiento');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'No pudimos abrir la ficha.',
      );
      setBusy('');
    }
  }
  return (
    <main className="min-h-screen bg-[#f3f5ef] p-6 text-[#10253d]">
      <section className="mx-auto max-w-xl py-10">
        <p className="text-sm font-bold text-[#52751d]">NEXO</p>
        <h1 className="mt-3 text-3xl font-bold">Mis profesores</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Elegí con quién querés entrenar. Cada espacio conserva sus rutinas,
          evaluaciones y registros.
        </p>
        {scoped && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">
            Este enlace personal habilita solamente la ficha de ese profesor.
            Para ver todos tus profesores, ingresá con un enlace recibido en tu
            email.
          </p>
        )}
        <div className="mt-6 space-y-3">
          {contexts.map((context) => (
            <button
              key={context.athleteId}
              disabled={Boolean(busy)}
              onClick={() => void select(context.athleteId)}
              className="w-full rounded-2xl border bg-white p-5 text-left shadow-sm hover:border-[#9fcf2d] disabled:opacity-50"
            >
              <span className="block font-bold">{context.businessName}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {context.firstName} {context.lastName}
                {activeAthleteId === context.athleteId
                  ? ' · Espacio actual'
                  : ''}
              </span>
              {busy === context.athleteId && (
                <span className="text-sm">Abriendo…</span>
              )}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <a href="/login" className="mt-6 inline-block text-sm underline">
          Volver al acceso
        </a>
      </section>
    </main>
  );
}
