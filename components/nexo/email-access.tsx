'use client';

import { useEffect, useState } from 'react';

export function EmailAccess() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get(
      'token',
    );
    if (value) setToken(value);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  async function enter() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'redeem', token }),
      });
      const result = (await response.json()) as {
        destination?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? 'No pudimos ingresar.');
      window.location.assign(result.destination ?? '/');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'No pudimos ingresar.',
      );
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f3ec] p-5">
      <section className="w-full max-w-md rounded-3xl border bg-white p-8 shadow-sm">
        <p className="font-bold text-[#52751d]">NEXO · ACCESO SEGURO</p>
        <h1 className="mt-5 text-2xl font-bold text-[#10253d]">
          Tu entrenamiento te espera
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Confirmá tu correo para crear tu contraseña. Este enlace vence a los
          15 minutos y se usa una sola vez.
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          onClick={enter}
          disabled={!token || busy}
          className="mt-6 h-12 w-full rounded-xl bg-[#10253d] font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Ingresando…' : 'Entrar a Nexo'}
        </button>
        <a
          href="/login"
          className="mt-5 block text-center text-sm text-[#52751d]"
        >
          Solicitar otro enlace
        </a>
      </section>
    </main>
  );
}
