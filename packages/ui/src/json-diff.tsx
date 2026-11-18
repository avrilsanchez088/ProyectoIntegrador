'use client';

/**
 * JsonDiff — comparador visual de dos objetos JSON. Implementación a mano
 * sin dependencia externa. Propuesta 106.2 ronda 9.
 *
 * Casos:
 *  - INSERT: solo `next` → todos los campos verdes (added)
 *  - UPDATE: ambos → highlight verde/rojo de campos cambiados
 *  - DELETE: solo `prev` → todos rojos (removed)
 *
 * Modo `mode='paths'` (propuesta 141.3 ronda 12): recorre estructura
 * recursivamente y devuelve diff path-by-path, ej:
 *   `policies.cancellation.fullRefundDays`: 7 → 14
 *   `settings.timezone`: removed
 *   `flags.beta`: added (true)
 */

interface JsonDiffProps {
  prev: unknown;
  next: unknown;
  /** Campos sensibles que no se muestran (PII). */
  redacted?: readonly string[];
  /** Render mode. Default 'table'. */
  mode?: 'table' | 'paths';
}

const DEFAULT_REDACTED = ['guestEmail', 'guestPhone', 'password', 'access_token', 'refresh_token'];

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}

type PathChange =
  | { kind: 'added'; path: string; next: unknown }
  | { kind: 'removed'; path: string; prev: unknown }
  | { kind: 'changed'; path: string; prev: unknown; next: unknown };

/**
 * Recorre prev/next en paralelo y devuelve solo los cambios efectivos.
 * Para arrays simples (primitivos) compara el JSON stringified completo;
 * para objetos baja un nivel.
 */
function collectPathChanges(
  prev: unknown,
  next: unknown,
  path = '',
  out: PathChange[] = [],
): PathChange[] {
  if (prev === undefined && next !== undefined) {
    out.push({ kind: 'added', path, next });
    return out;
  }
  if (next === undefined && prev !== undefined) {
    out.push({ kind: 'removed', path, prev });
    return out;
  }
  if (isObject(prev) && isObject(next)) {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const k of keys) {
      collectPathChanges(prev[k], next[k], path ? `${path}.${k}` : k, out);
    }
    return out;
  }
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      out.push({ kind: 'changed', path, prev, next });
    }
    return out;
  }
  if (prev !== next) {
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      out.push({ kind: 'changed', path, prev, next });
    }
  }
  return out;
}

export function JsonDiff({
  prev,
  next,
  redacted = DEFAULT_REDACTED,
  mode = 'table',
}: JsonDiffProps) {
  const prevObj = isObject(prev) ? prev : {};
  const nextObj = isObject(next) ? next : {};
  const allKeys = Array.from(new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])).sort();

  if (allKeys.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos para mostrar.</p>;
  }

  if (mode === 'paths') {
    const changes = collectPathChanges(prevObj, nextObj);
    if (changes.length === 0) {
      return <p className="text-xs text-muted-foreground">Sin cambios efectivos.</p>;
    }
    return (
      <ul className="space-y-1 font-mono text-xs">
        {changes.map((c, i) => {
          const topKey = c.path.split('.')[0];
          const isPii = topKey ? redacted.includes(topKey) : false;
          return (
            <li key={`${c.kind}-${c.path}-${i}`} className="flex items-start gap-2 break-words">
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase ${
                  c.kind === 'added'
                    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : c.kind === 'removed'
                      ? 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                      : 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                }`}
              >
                {c.kind === 'added' ? '+' : c.kind === 'removed' ? '−' : '~'}
              </span>
              <span className="text-muted-foreground">{c.path}</span>
              <span className="text-foreground">
                {c.kind === 'added' && (
                  <>
                    :{' '}
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {isPii ? '***' : fmt(c.next)}
                    </span>
                  </>
                )}
                {c.kind === 'removed' && (
                  <>
                    :{' '}
                    <span className="text-rose-700 dark:text-rose-300 line-through">
                      {isPii ? '***' : fmt(c.prev)}
                    </span>
                  </>
                )}
                {c.kind === 'changed' && (
                  <>
                    :{' '}
                    <span className="text-rose-700 line-through dark:text-rose-300">
                      {isPii ? '***' : fmt(c.prev)}
                    </span>
                    {' → '}
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {isPii ? '***' : fmt(c.next)}
                    </span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <table className="w-full font-mono text-xs">
      <tbody>
        {allKeys.map((key) => {
          const a = prevObj[key];
          const b = nextObj[key];
          const isPii = redacted.includes(key);
          const aStr = isPii ? '***' : fmt(a);
          const bStr = isPii ? '***' : fmt(b);
          const same = aStr === bStr;
          const onlyA = !(key in nextObj);
          const onlyB = !(key in prevObj);

          return (
            <tr key={key} className="border-b last:border-b-0">
              <td className="w-44 truncate px-2 py-1 align-top text-muted-foreground">{key}</td>
              <td
                className={`w-1/2 break-all px-2 py-1 align-top ${
                  onlyA
                    ? 'bg-rose-50 text-rose-900 line-through dark:bg-rose-950/40 dark:text-rose-200'
                    : same
                      ? 'text-muted-foreground'
                      : 'bg-rose-50/50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-200'
                }`}
              >
                {key in prevObj ? aStr : <span className="opacity-30">—</span>}
              </td>
              <td
                className={`w-1/2 break-all px-2 py-1 align-top ${
                  onlyB
                    ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : same
                      ? 'text-muted-foreground'
                      : 'bg-emerald-50/50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
                }`}
              >
                {key in nextObj ? bStr : <span className="opacity-30">—</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
