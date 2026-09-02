'use client';

import { LogOut } from 'lucide-react';

export function LogoutButton() {
  async function logout() {
    await fetch('/api/auth/session', { method: 'DELETE' });
    window.location.assign('/login');
  }

  return <button onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"><LogOut className="size-3.5" /></button>;
}
