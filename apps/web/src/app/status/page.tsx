/**
 * Status page pública (propuesta 161.6 ronda 14).
 *
 * No requiere auth — accesible directamente en `/status`. Server component
 * que llama `/api/health/deep` desde el server-side al renderizar. Si la
 * API no responde, mostramos UI degraded.
 *
 * Cuando tengamos un dominio propio, esto vivirá en `status.impacto.uy`
 * via subdomain routing en Caddy.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { AlertTriangle, CheckCircle2, Circle, Info, XCircle } from 'lucide-react';

export const dynamic = 'force-dynamic'; // siempre fresco — sin cache estático

interface ComponentCheck {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  message?: string;
}

interface DeepHealthResponse {
  status: 'ok' | 'unhealthy';
  mode: string;
  version: string;
  components: Record<string, ComponentCheck>;
}

const COMPONENT_LABELS: Record<string, string> = {
  postgres: 'Base de datos',
  redis: 'Cache (Redis)',
  s3: 'Storage (R2)',
  smtp: 'Email (SMTP)',
  mv_tenant_stats: 'Materialized views',
};

const STATUS_TONE: Record<ComponentCheck['status'], string> = {
  ok: 'text-emerald-700 dark:text-emerald-300',
  degraded: 'text-amber-700 dark:text-amber-300',
  down: 'text-rose-700 dark:text-rose-300',
};

const STATUS_ICON: Record<ComponentCheck['status'], typeof CheckCircle2> = {
  ok: CheckCircle2,
  degraded: Circle,
  down: XCircle,
};

const STATUS_LABEL: Record<ComponentCheck['status'], string> = {
  ok: 'Operacional',
  degraded: 'Degradado',
  down: 'Caído',
};

interface AnnouncementItem {
  id: string;
  severity: 'info' | 'warning' | 'urgent' | 'critical';
  message: string;
  href: string | null;
  expiresAt: string | null;
}

interface IncidentUpdate {
  id: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  message: string;
  created_at: string;
}

interface Incident {
  id: string;
  title: string;
  description: string | null;
  severity: 'minor' | 'major' | 'critical';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  started_at: string;
  resolved_at: string | null;
  postmortem: string | null;
  affected_components: string[] | null;
  updates: IncidentUpdate[] | null;
}

async function fetchIncidents(): Promise<Incident[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';
  try {
    const res = await fetch(`${apiUrl}/api/health/incidents`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Incident[] };
    return body.data ?? [];
  } catch {
    return [];
  }
}

async function fetchAnnouncements(): Promise<AnnouncementItem[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';
  try {
    const res = await fetch(`${apiUrl}/api/health/announcements`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: AnnouncementItem[] };
    return body.data ?? [];
  } catch {
    return [];
  }
}

async function fetchHealth(): Promise<DeepHealthResponse | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';
  try {
    const headers: Record<string, string> = {};
    if (process.env.HEALTH_PROBE_SECRET) {
      headers['x-health-secret'] = process.env.HEALTH_PROBE_SECRET;
    }
    const res = await fetch(`${apiUrl}/api/health/deep`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok && res.status !== 503) return null;
    return (await res.json()) as DeepHealthResponse;
  } catch {
    return null;
  }
}

export default async function StatusPage() {
  const [health, announcements, incidents] = await Promise.all([
    fetchHealth(),
    fetchAnnouncements(),
    fetchIncidents(),
  ]);

  // Para el calendar dot grid de 30 días, marcamos qué días tuvieron al
  // menos un incident (propuesta 204.1 ronda 18).
  const incidentDays = new Set<string>();
  for (const inc of incidents) {
    const startDate = new Date(inc.started_at).toISOString().slice(0, 10);
    incidentDays.add(startDate);
  }
  const today = new Date();
  const days30 = Array.from({ length: 30 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Estado de Impacto</h1>
        <p className="text-sm text-muted-foreground">
          Status en tiempo real de los componentes críticos del SaaS.
        </p>
      </header>

      {/* Mantenimientos programados / avisos (propuesta 196.1 ronda 17) */}
      {announcements.length > 0 && (
        <div className="space-y-2">
          {announcements.map((a) => {
            const isUrgent = a.severity === 'urgent' || a.severity === 'critical';
            const Icon = isUrgent ? AlertTriangle : Info;
            const tone = isUrgent
              ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200'
              : a.severity === 'warning'
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                : 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200';
            return (
              <Card key={a.id} className={tone}>
                <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                  <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <div className="flex-1">
                    <CardTitle className="text-base">
                      {a.severity === 'warning'
                        ? 'Aviso programado'
                        : isUrgent
                          ? 'Incidente'
                          : 'Aviso'}
                    </CardTitle>
                    <CardDescription className="text-current/80">
                      {a.message}
                      {a.href && (
                        <>
                          {' · '}
                          <a
                            href={a.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            más info
                          </a>
                        </>
                      )}
                      {a.expiresAt && (
                        <>
                          {' · '}
                          <span className="opacity-75">
                            hasta {new Date(a.expiresAt).toLocaleString('es-AR')}
                          </span>
                        </>
                      )}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      {!health ? (
        <Card className="border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20">
          <CardHeader>
            <CardTitle className="text-rose-900 dark:text-rose-200">
              No pudimos contactar la API
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Si seguís viendo esto unos minutos, probablemente haya un incidente en curso. Probá
              refrescar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Hero status overall */}
          <Card
            className={
              health.status === 'ok'
                ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20'
                : 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20'
            }
          >
            <CardContent className="flex items-center gap-4 p-6">
              {health.status === 'ok' ? (
                <CheckCircle2 className="size-10 text-emerald-600" aria-hidden="true" />
              ) : (
                <XCircle className="size-10 text-rose-600" aria-hidden="true" />
              )}
              <div>
                <p className="text-2xl font-semibold">
                  {health.status === 'ok'
                    ? 'Todos los sistemas operacionales'
                    : 'Operación degradada — equipo notificado'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Modo: {health.mode} · Versión: {health.version}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Components grid */}
          <Card>
            <CardHeader>
              <CardTitle>Componentes</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {Object.entries(health.components).map(([key, check]) => {
                  const Icon = STATUS_ICON[check.status];
                  return (
                    <li key={key} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <Icon
                          className={`size-5 ${STATUS_TONE[check.status]}`}
                          aria-hidden="true"
                        />
                        <div>
                          <p className="font-medium">{COMPONENT_LABELS[key] ?? key}</p>
                          {check.message && (
                            <p className="text-xs text-muted-foreground">{check.message}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <p className={`font-medium ${STATUS_TONE[check.status]}`}>
                          {STATUS_LABEL[check.status]}
                        </p>
                        {check.latencyMs !== undefined && (
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {check.latencyMs}ms
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      {/* Incidents history (propuesta 204.1 ronda 18) */}
      <Card>
        <CardHeader>
          <CardTitle>Últimos 30 días</CardTitle>
          <CardDescription>
            {incidents.length === 0
              ? 'Sin incidentes reportados.'
              : `${incidents.length} incidente${incidents.length > 1 ? 's' : ''} en el período.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Calendar dot grid */}
          <div className="flex flex-wrap gap-1" aria-label="Calendario de últimos 30 días">
            {days30.map((day) => {
              const hasIncident = incidentDays.has(day);
              const isToday = day === today.toISOString().slice(0, 10);
              return (
                <span
                  key={day}
                  title={`${day}${hasIncident ? ' · incidente' : ''}`}
                  className={`size-4 rounded-sm ${
                    hasIncident
                      ? 'bg-rose-500 dark:bg-rose-400'
                      : 'bg-emerald-500/70 dark:bg-emerald-500/50'
                  } ${isToday ? 'ring-2 ring-primary/40' : ''}`}
                />
              );
            })}
          </div>

          {/* Lista detallada de incidents */}
          {incidents.length > 0 && (
            <ul className="space-y-3 border-t pt-4">
              {incidents.map((inc) => {
                const isResolved = inc.status === 'resolved';
                return (
                  <li
                    key={inc.id}
                    id={`incident-${inc.id}`}
                    className="flex items-start gap-3 text-sm"
                  >
                    <span
                      className={`mt-1 size-2 shrink-0 rounded-full ${
                        inc.severity === 'critical'
                          ? 'bg-rose-500'
                          : inc.severity === 'major'
                            ? 'bg-amber-500'
                            : 'bg-yellow-500'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {inc.title}
                        <span
                          className={`ml-2 rounded px-2 py-0.5 text-xs ${
                            isResolved
                              ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                              : 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                          }`}
                        >
                          {inc.status}
                        </span>
                      </p>
                      {inc.affected_components && inc.affected_components.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {inc.affected_components.map((c) => (
                            <span
                              key={c}
                              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                      {inc.description && (
                        <p className="mt-1 text-muted-foreground">{inc.description}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(inc.started_at).toLocaleString('es-AR')}
                        {inc.resolved_at && (
                          <> — resuelto {new Date(inc.resolved_at).toLocaleString('es-AR')}</>
                        )}
                      </p>

                      {/* Updates timeline (propuesta 218.1 ronda 20) */}
                      {inc.updates && inc.updates.length > 0 && (
                        <ol className="mt-2 space-y-1 border-l border-border pl-3 text-xs">
                          {inc.updates.map((u) => (
                            <li key={u.id}>
                              <span className="font-medium uppercase">{u.status}</span>
                              {' — '}
                              <span>{u.message}</span>
                              <span className="ml-1 text-muted-foreground">
                                · {new Date(u.created_at).toLocaleString('es-AR')}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}

                      {/* Postmortem collapse (propuesta 218.2 ronda 20) */}
                      {inc.postmortem && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                            Ver postmortem
                          </summary>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                            {inc.postmortem}
                          </pre>
                        </details>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Última verificación: {new Date().toLocaleString('es-AR')}
      </p>
    </div>
  );
}
