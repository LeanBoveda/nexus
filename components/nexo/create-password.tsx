'use client';
import { useState } from 'react';

export function CreatePassword({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    if (form.get('password') !== form.get('confirmation')) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          password: form.get('password'),
          confirmation: form.get('confirmation'),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        destination?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'No pudimos crear tu contraseña.');
      window.location.assign(result.destination || '/');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No pudimos crear tu contraseña.',
      );
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f3ec] p-5">
      <section className="w-full max-w-md rounded-3xl border bg-white p-8 shadow-sm">
        <p className="font-bold text-[#52751d]">NEXO · CORREO VERIFICADO</p>
        <h1 className="mt-4 text-2xl font-bold text-[#10253d]">
          Creá tu nueva contraseña
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Tu correo es {email}. Este paso se realiza una sola vez. Después
          ingresarás con email y contraseña.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold">
            Nueva contraseña
            <input
              name="password"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
              disabled={busy}
              className="mt-2 h-11 w-full rounded-xl border px-3"
            />
          </label>
          <label className="block text-sm font-semibold">
            Repetir contraseña
            <input
              name="confirmation"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
              disabled={busy}
              className="mt-2 h-11 w-full rounded-xl border px-3"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Entre 10 y 128 caracteres. No uses una contraseña que compartas con
            otras personas.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
            />
            Mostrar contraseñas
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={busy}
            className="h-12 w-full rounded-xl bg-[#10253d] font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Crear contraseña e ingresar'}
          </button>
        </form>
      </section>
    </main>
  );
}
