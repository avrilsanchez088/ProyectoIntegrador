'use client';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@impacto/ui/command';
import { useEffect, useId, useRef, useState } from 'react';

/**
 * UserPicker — combobox typeahead que filtra por nombre/email
 * (propuesta 141.2 ronda 12). Reemplazo del `<select>` plano del audit page.
 *
 * Acepta:
 *   - `users`: lista de members del workspace
 *   - `value`: string | null (userId, "" = todos, "system" = sin user)
 *   - `onChange`: callback con el nuevo value
 *
 * Atajo `u` enfoca el input (cuando no hay otro input focused).
 */

export interface UserPickerOption {
  userId: string;
  user?: { name?: string; email?: string };
}

interface Props {
  users: UserPickerOption[];
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Si true, registra hotkey "u" para focusear el input. */
  hotkey?: boolean;
}

export function UserPicker({
  users,
  value,
  onChange,
  placeholder = 'Todos los usuarios',
  hotkey = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const selected =
    value === ''
      ? null
      : value === 'system'
        ? { userId: 'system', label: 'Sistema (sin user)' }
        : (() => {
            const u = users.find((x) => x.userId === value);
            return u
              ? {
                  userId: u.userId,
                  label: u.user?.name ?? u.user?.email ?? u.userId.slice(0, 8),
                }
              : null;
          })();

  useEffect(() => {
    if (!hotkey) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if ((target as HTMLElement).isContentEditable) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'u') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [hotkey]);

  // Click outside cierra.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = search
    ? users.filter((u) => {
        const name = u.user?.name?.toLowerCase() ?? '';
        const email = u.user?.email?.toLowerCase() ?? '';
        const q = search.toLowerCase();
        return name.includes(q) || email.includes(q);
      })
    : users;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 text-sm hover:bg-muted/40"
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <span className="ml-2 shrink-0 text-xs text-muted-foreground">{hotkey ? 'u' : '▾'}</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <Command shouldFilter={false}>
            <CommandInput
              ref={inputRef}
              placeholder="Buscar por nombre o email…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>Sin resultados</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onChange('');
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <span className={value === '' ? 'font-medium' : ''}>Todos los usuarios</span>
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    onChange('system');
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <span className={value === 'system' ? 'font-medium' : ''}>
                    Sistema (sin user)
                  </span>
                </CommandItem>
                {filtered.map((u) => (
                  <CommandItem
                    key={u.userId}
                    value={`${u.user?.name ?? ''} ${u.user?.email ?? ''} ${u.userId}`}
                    onSelect={() => {
                      onChange(u.userId);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <div className={`flex flex-col ${value === u.userId ? 'font-medium' : ''}`}>
                      <span>{u.user?.name ?? u.user?.email ?? u.userId.slice(0, 8)}</span>
                      {u.user?.email && u.user?.name && (
                        <span className="text-xs text-muted-foreground">{u.user.email}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
