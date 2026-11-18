/**
 * `@impacto/ical` — helpers para parsear y generar feeds iCal.
 *
 * Decisión: Booking/Airbnb/GCal sincronizan HACIA nosotros. Importamos eventos
 * via `parseIcal()` (node-ical bajo el hood) y exportamos nuestro feed via
 * `buildIcal()` (ical-generator).
 *
 * Funciones puras — no tocan DB ni red. La obtención del feed (HTTP) y la
 * persistencia las hace el worker / la API.
 */
import ical, { type ICalCalendar, ICalEventStatus } from 'ical-generator';
import nodeIcal from 'node-ical';

// ─── parseIcal ──────────────────────────────────────
export interface ParsedEvent {
  /** UID del evento iCal (único por feed). */
  uid: string;
  /** Inicio de la ocupación (UTC). */
  start: Date;
  /** Fin de la ocupación (UTC, exclusive en iCal "DTEND"). */
  end: Date;
  /** Título / SUMMARY. Útil para extraer nombre del huésped/canal. */
  summary?: string;
  /** Descripción del evento. */
  description?: string;
  /** Status iCal: CONFIRMED / TENTATIVE / CANCELLED. */
  status?: string;
  /** Última modificación reportada por el feed. */
  lastModified?: Date;
}

/**
 * Parsea un texto iCal y devuelve solo los VEVENT con start/end válidos.
 * Ignora todo evento sin DTSTART/DTEND porque no aporta para bloqueo.
 */
export function parseIcal(icsText: string): ParsedEvent[] {
  const parsed = nodeIcal.sync.parseICS(icsText);
  const events: ParsedEvent[] = [];

  for (const key of Object.keys(parsed)) {
    const item = parsed[key] as nodeIcal.VEvent | undefined;
    if (!item || item.type !== 'VEVENT') continue;

    const start = item.start instanceof Date ? item.start : null;
    const end = item.end instanceof Date ? item.end : null;
    if (!start || !end) continue;

    events.push({
      uid: typeof item.uid === 'string' ? item.uid : key,
      start,
      end,
      summary: typeof item.summary === 'string' ? item.summary : undefined,
      description: typeof item.description === 'string' ? item.description : undefined,
      status: typeof item.status === 'string' ? item.status : undefined,
      lastModified: item.lastmodified instanceof Date ? item.lastmodified : undefined,
    });
  }

  return events;
}

// ─── buildIcal ──────────────────────────────────────
export interface BuildIcalEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  /** 'CONFIRMED' por default. */
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
}

export interface BuildIcalInput {
  /** Nombre que aparece como X-WR-CALNAME en clientes (Google, etc.). */
  calendarName: string;
  /** ProdID requerido por iCal. Ej: "-//Impacto//Reservas//ES". */
  prodId: string;
  events: BuildIcalEvent[];
}

/**
 * Genera el cuerpo .ics que sirvimos a canales externos. Solo eventos
 * confirmados o tentativos — los cancelados no se exportan (rationale: el
 * canal externo no debe ver bloqueos espurios cuando una reserva se cae).
 */
export function buildIcal(input: BuildIcalInput): string {
  // ical-generator antepone `-` al prodId que reciba. Si el caller ya pasó
  // el prefijo `-//company//...` (formato canónico iCal), lo strippeamos
  // para evitar `--//...` en la salida.
  const normalizedProdId = input.prodId.startsWith('-//') ? input.prodId.slice(1) : input.prodId;

  const cal: ICalCalendar = ical({
    name: input.calendarName,
    prodId: normalizedProdId,
  });

  const STATUS_MAP: Record<NonNullable<BuildIcalEvent['status']>, ICalEventStatus> = {
    CONFIRMED: ICalEventStatus.CONFIRMED,
    TENTATIVE: ICalEventStatus.TENTATIVE,
    CANCELLED: ICalEventStatus.CANCELLED,
  };

  for (const ev of input.events) {
    cal.createEvent({
      id: ev.uid,
      start: ev.start,
      end: ev.end,
      summary: ev.summary,
      description: ev.description,
      status: STATUS_MAP[ev.status ?? 'CONFIRMED'],
    });
  }

  return cal.toString();
}

// ─── token utils ────────────────────────────────────
/**
 * Genera un token URL-safe de alta entropía para URLs públicas de iCal.
 * 32 bytes random → ~43 chars base64url.
 */
export async function generateIcalToken(): Promise<string> {
  const { randomBytes } = await import('node:crypto');
  return randomBytes(32).toString('base64url');
}
