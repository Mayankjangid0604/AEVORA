'use client';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

/** Name/role come from GET /auth/me (server-rendered); display only. */
export function UserMenu({ name, role }: { name: string; role: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null);
    queryClient.clear();
    window.location.replace('/login'); // full navigation: no authenticated client state survives
  }

  return (
    <Menu.Root>
      <Menu.Trigger className="max-w-[12rem] truncate whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-sm text-text sm:max-w-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
        {name} <span className="hidden text-muted sm:inline">· {role}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="min-w-40 rounded-md border border-border bg-surface p-1 shadow-lg">
          <Menu.Item disabled={busy} onSelect={logout} className="cursor-pointer rounded px-2 py-1.5 text-sm text-text outline-none data-[highlighted]:bg-surface-2">
            {busy ? 'Signing out...' : 'Sign out'}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
