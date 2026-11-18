# Módulos del proyecto

Bitácora de progreso, gaps encontrados y mejoras pendientes por módulo.

---

## 🚀 Runbook (pasos manuales del usuario antes de probar M4)

Estos pasos no se pudieron ejecutar desde la sesión Claude porque `pnpm` no está
instalado en este host. Correrlos manualmente desde `C:\wamp64\www\Impacto\app`:

```bash
# 1. Instalar deps nuevas (M4: @impacto/ical, @impacto/pricing, bullmq, ioredis)
pnpm install

# 2. Levantar Docker si no está corriendo (Postgres 5433, Redis 6380, Mailhog, MinIO)
docker compose up -d

# 3. Aplicar migraciones (incluye 0002_bookings_and_calendar.sql con EXCLUDE constraints)
pnpm --filter @impacto/db migrate

# 4. (Opcional) Regenerar drizzle snapshots si difieren del handwritten
pnpm --filter @impacto/db generate
# Si genera nada, está sincronizado. Si genera diff, mergear y borrar el handwritten.

# 5. Tests
pnpm test    # vitest cross-package — 40+ tests (pricing, iCal, ical-mappers, toLocalDateString)

# 6. Levantar
pnpm dev     # web 3100, api 3101, worker en background
```

**Verificación rápida tras levantar:**
1. `http://localhost:3100/sign-up` → crear usuario
2. `/onboarding/workspace` → crear workspace
3. `/dashboard/properties/new` → propiedad
4. `/dashboard/properties/:id/units/new` → unidad
5. `/dashboard/properties/:id/pricing` → temporada + tarifa + (opcional) fee
6. `/dashboard/policies` → política de cancelación + regla de pricing
7. `/dashboard/bookings/new` → primera reserva (debe auto-cotizar via `quote_snapshot`)
8. `/dashboard/calendars` → opcional, generar token iCal y curl `http://localhost:3101/ical/{token}.ics`

---

## ✅ Módulo 0 — Foundations (completado 2026-05-06)

### Implementado
- ✅ Monorepo `pnpm + Turborepo + Biome + TypeScript strict`
- ✅ `packages/shared`: env validation con Zod, UUID v7 generator, constants (roles, stages, sources)
- ✅ `packages/db`: Drizzle ORM + Postgres client + schema base (users, sessions, accounts, verifications, tenants, members, member_invitations) + migrate + seed scripts
- ✅ `apps/api`: Hono + Better Auth + healthcheck (`/api/health`, `/api/health/ready`) + structured logging (Pino)
- ✅ `apps/web`: Next.js 15.1.6 skeleton con landing + sign-in/sign-up stubs
- ✅ Docker Compose con Postgres 16 + pgvector, Redis 7, Mailhog, MinIO, Bull Board (todos healthy, puertos no chocan con `platform`)
- ✅ Migrations generadas y aplicadas (7 tablas)
- ✅ Seed con tenants Meraki Cabañas + Aloe Village
- ✅ Tests: 12/12 passing (`@impacto/shared`)
- ✅ End-to-end verificado: signup vía Better Auth crea row en DB ✓

### Estructura final del módulo 0
```
app/
├── docker-compose.yml          ✅
├── package.json (workspace)    ✅
├── pnpm-workspace.yaml         ✅
├── turbo.json                  ✅
├── biome.json                  ✅
├── tsconfig.json               ✅
├── .env / .env.example         ✅
├── apps/
│   ├── api/                    ✅ Hono + Better Auth + healthcheck
│   └── web/                    ✅ Next.js skeleton
├── packages/
│   ├── shared/                 ✅ env, ids, constants + tests
│   └── db/                     ✅ schema + migrate + seed
└── infra/postgres-init/        ✅ extensions SQL
```

### 🐞 Gaps encontrados durante el módulo (a resolver antes del Módulo 1)

#### G0.1 — Better Auth + Drizzle: schema lookup
**Issue:** Con `usePlural: true` + `schema` explícito como objeto namespace, drizzleAdapter intentaba primero hacer lookup `schema.user` (singular) y fallaba. Resolvió con `usePlural: true` + pasar el `schema` completo del package.

**Mitigación aplicada:** documentar el patrón en `apps/api/src/auth.ts`. Si actualizamos Better Auth, revisar.

#### G0.2 — Falta `packages/ui` (componentes shadcn compartidos)
**Pendiente:** crear `packages/ui` con shadcn/ui inicial (button, input, card, dialog) antes del Módulo 1 que necesita formularios de auth.

#### G0.3 — Falta `apps/worker` (BullMQ workers)
**Pendiente:** skeleton de worker, aún sin jobs reales. Crear stub al inicio del Módulo 7 (WhatsApp).

#### G0.4 — Auth client en web
**Pendiente:** instalar `better-auth/react` en `apps/web` y crear el cliente. Bloqueante para Módulo 1.

#### G0.5 — Postgres RLS aún no implementado
**Pendiente:** crear migration manual con políticas RLS por tabla. Dejé `setTenantContext()` listo en client.ts pero sin políticas DB aún. Bloqueante para Módulo 2 (workspaces).

#### G0.6 — No hay tests de integración DB
**Pendiente:** Vitest con un container Postgres aislado o transaction rollback. Setup en Módulo 1.

#### G0.7 — No hay E2E (Playwright)
**Pendiente:** instalar Playwright al final del Módulo 1, primer test: signup → login → dashboard.

#### G0.8 — Sin CI/CD
**Pendiente:** GitHub Actions con `lint → typecheck → test → build`. Crear cuando tengamos repo en GitHub privado.

#### G0.9 — Sin pre-commit hooks
**Pendiente:** Husky + lint-staged. Bajo prioridad.

#### G0.10 — packages/ui no tiene componentes shadcn aún
**Pendiente:** init shadcn en Módulo 1 cuando armemos formularios.

### 🔍 Investigaciones para próxima sesión (antes de Módulo 1)

1. **Better Auth multi-tenancy plugin**: existe `@better-auth/organization`? ¿O implementamos manual con `members` table?
2. **Drizzle RLS pattern**: cómo definir policies en migrations.
3. **Next.js 15 App Router + Better Auth**: best practices para session check en middleware.
4. **shadcn/ui en monorepo**: cómo compartir componentes entre apps si añadimos otra UI.
5. **Tailwind v4 alpha**: estable suficiente para V1 o quedarnos en v3.4.
6. **OAuth callback URLs locales con HTTPS**: para Google/Facebook OAuth en dev necesitamos HTTPS local (mkcert).

### 📦 Estado de la DB

```
public.accounts            ← Better Auth
public.member_invitations  ← invitaciones pendientes
public.members             ← user × tenant + role
public.sessions            ← Better Auth
public.tenants             ← workspaces (2 seed: Meraki, Aloe)
public.users               ← Better Auth
public.verifications       ← Better Auth
```

### 🌐 Servicios corriendo localhost

| Servicio | URL | Estado |
|---|---|---|
| Postgres 16 | localhost:5433 | ✅ |
| Redis 7 | localhost:6380 | ✅ |
| Mailhog UI | http://localhost:8125 | ✅ |
| MinIO Console | http://localhost:9101 | ✅ |
| Bull Board | http://localhost:3102 | ✅ |
| API Hono | http://localhost:3101 | ✅ (cuando corre `pnpm dev`) |
| Web Next.js | http://localhost:3100 | ⏳ (no probado, faltan deps) |

### Comandos útiles

```bash
cd app
npx pnpm@9 docker:up       # Levanta todos los containers
npx pnpm@9 db:generate     # Genera migration desde schema
npx pnpm@9 db:migrate      # Aplica migrations
npx pnpm@9 db:seed         # Carga seed
npx pnpm@9 db:studio       # UI de DB
npx pnpm@9 -F @impacto/shared test   # Tests del shared package
```

---

## ✅ Módulo 1 — Auth completo + workspaces (completado 2026-05-06)

### Implementado
- ✅ **Tailwind v4 stable** + **shadcn/ui** con tokens OKLCH y dark mode listo
- ✅ Componentes UI base: `Button`, `Input`, `Label`, `Card` con variantes shadcn + variant `brand`
- ✅ Better Auth **client** (`@/lib/auth-client`) con plugin `organizationClient`
- ✅ Better Auth **server** con plugin `organization`:
  - Cada usuario puede crear hasta 5 workspaces
  - Hasta 50 miembros por workspace
  - Roles owner/admin/member
  - Invitaciones por email (stub que loggea — pendiente Resend en M13)
- ✅ Schema DB consolidado: `users`, `sessions`, `accounts`, `verifications`, `organizations`, `members`, `invitations`, `tenant_settings` (8 tablas)
  - **Decisión:** se removieron las antiguas `tenants`, `members` y `member_invitations` que duplicaban el plugin. Ahora `tenant_settings` 1:1 con `organizations` para datos de negocio (timezone, currency, plan, etc.).
- ✅ Páginas auth con shadcn: `/sign-in`, `/sign-up`, `/onboarding/workspace`
- ✅ Layout protegido `/dashboard` con header (logo + email + perfil + settings + logout)
- ✅ Página `/dashboard` (placeholder + module cards M3-M14)
- ✅ Página `/dashboard/profile` (editar nombre)
- ✅ Página `/dashboard/settings` (placeholder)
- ✅ Middleware Next.js que protege rutas privadas y redirige logueados fuera de auth pages
- ✅ E2E manual verificado: signup → session → create org → list orgs → DB consistente
- ✅ **24 tests passing** en 4 paquetes:
  - `@impacto/shared`: 12 tests (env validation + UUID v7)
  - `@impacto/db`: 2 tests (integration con Postgres real)
  - `@impacto/api`: 2 tests (health endpoints)
  - `@impacto/web`: 8 tests (middleware route protection)

### 🐞 Gaps encontrados durante M1 (resolver antes de M2)

#### G1.1 — RLS policies no implementadas
`setTenantContext()` existe en `client.ts` pero las policies en Postgres aún no se escribieron. **Bloquea M2** cuando agreguemos `properties` y `units`.

#### G1.2 — Falta `apps/worker` skeleton
docker-compose tiene Bull Board apuntando a Redis pero sin worker. **Bloquea M7**.

#### G1.3 — OAuth callback HTTPS local no probado
Botones Google/Facebook renderizan pero no probados con creds reales. Necesitamos **mkcert** para HTTPS local en dev.

#### G1.4 — Falta Playwright E2E
Todos los tests son unit/integration. No hay flow UI completo testeado.

#### G1.5 — Email de invitación no envía
`sendInvitationEmail` solo loggea. Mailhog en compose pero no integrado al server.

#### G1.6 — Forgot/reset password no implementado
Better Auth lo soporta nativo, falta UI. **Diferido a M13** (cuando esté Resend).

#### G1.7 — 2FA / passkeys plugin no activado
Better Auth tiene `twoFactor` plugin trivial. **Diferido a antes de producción**.

#### G1.8 — Verificación de email no obligatoria
`requireEmailVerification: false` para dev. **Activar en producción**.

#### G1.9 — Warning peer dep zod 4 vs 3
Better Auth pulla `better-call` que pide zod 4. Warning ignorable, monitorear.

#### G1.10 — i18n no configurado
Strings hardcoded. CLAUDE.md decidió español neutro LATAM. **Setup de next-intl en M3 o M14**.

#### G1.11 — Web/API no en Docker compose para producción
Solo Postgres/Redis/Mailhog/MinIO/Bull Board. Para deploy: Dockerfiles + servicios. **M17**.

#### G1.12 — CI/CD no creado
`.github/workflows/ci.yml` para lint + typecheck + test + build. **Hacer antes de empujar a GitHub privado**.

### 🔍 Investigaciones para próxima sesión (antes de M2)

1. **Postgres RLS policies en Drizzle**: cómo declarar `pgPolicy()` en cada tabla y que `drizzle-kit generate` las incluya.
2. **Multi-property model**: 1 organization → N properties → N units. Validar con Meraki / Aloe Village reales.
3. **Photo upload + thumbnails**: MinIO en dev, sharp, presigned URLs, EXIF strip.
4. **shadcn forms con react-hook-form + zod**: pattern canónico.
5. **Better Auth invitations email**: integrar con Mailhog en dev, Resend en producción.

---

## ✅ Módulo 2 — Properties + RLS + Forms (completado 2026-05-06)

### Implementado
- ✅ **G1.1 RLS policies funcionales:**
  - `pgPolicy()` declarativo en schema Drizzle (3 tablas: properties, units, photos)
  - Cada tabla con 4 policies (SELECT/INSERT/UPDATE/DELETE) que filtran por `current_setting('app.tenant_id')`
  - **Event trigger** que aplica `FORCE ROW LEVEL SECURITY` a toda tabla creada (sin esto, RLS no aplica al rol owner)
  - **Rol `impacto_app` no-superuser** creado en init script. La API se conecta con este rol → RLS efectivo
  - `setTenantContext()` con sanitización contra SQL injection
  - **E2E verificado:** dos usuarios en distintos workspaces, uno NO ve los properties del otro
- ✅ **G1.2 Worker skeleton:**
  - `apps/worker` con BullMQ + IORedis + Pino
  - 4 colas declaradas: `photo`, `email`, `ical`, `meta-capi`
  - Worker stub para `photo` (placeholder hasta M3)
  - Graceful shutdown SIGTERM/SIGINT
- ✅ **Schema M2:**
  - `properties` (alojamientos): name, slug, description, propertyType, address, lat/lng, cover photo, RLS
  - `units` (unidades reservables): name, capacity, bedrooms, bathrooms, amenities, petsAllowed, RLS
  - `photos` (fotos): originalUrl, thumbs, mimeType, width/height, tags, sortOrder, RLS
  - Tipos: 8 propertyTypes + 6 unitTypes + 3 petsAllowed
- ✅ **shadcn Form components:**
  - `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`
  - Componente `Textarea` adicional
  - Pattern canónico con react-hook-form + zod
- ✅ **API routes Hono:**
  - Middleware `requireAuth` (valida session) + `requireOrganization` (verifica activeOrg)
  - `GET /api/properties` (lista del tenant activo)
  - `POST /api/properties` (crea con validación zod)
  - `GET /api/properties/:id` (detalle)
  - `PATCH /api/properties/:id` (update)
  - `DELETE /api/properties/:id` (soft delete)
  - Helper `withTenant()` que envuelve query en transaction + setTenantContext
- ✅ **Zod schemas compartidos** en `@impacto/shared`:
  - `slugSchema`, `createPropertySchema`, `updatePropertySchema`, `createUnitSchema`, `inviteMemberSchema`
  - Reutilizados en frontend (forms) + backend (API validation)
- ✅ **UI:**
  - `/dashboard/properties` (listing con grid de cards)
  - `/dashboard/properties/new` (form completo con react-hook-form + zod + auto-slug)
  - `/dashboard/properties/[id]` (detalle, stub units)
  - Cliente HTTP `api()` con cookies + error handling
- ✅ **Build de Next.js OK** (11 rutas, 32KB middleware, ~140KB First Load JS)
- ✅ **Tests verde:** 24/24 passing (shared 12, db 2, api 2, web 8)

### 🔧 Decisiones técnicas durante M2

1. **RLS requiere rol no-superuser.** Solución: 2 connection strings (DATABASE_URL para migrations, APP_DATABASE_URL para runtime).
2. **`uuidv7` extraído del barrel export** porque usa `node:crypto` y rompía webpack del cliente. Importar como `@impacto/shared/ids` cuando se necesite server-side.
3. **`drizzle-orm` re-exportado desde `@impacto/db`** (`and`, `eq`, `isNull`, etc.) para que apps no necesiten dep directa.
4. **`createDb` con cache por URL** (no singleton único) para soportar dos roles distintos.

### 🐞 Gaps encontrados durante M2 (resolver antes de M3)

#### G2.1 — Falta UI de invitar miembros / equipo
**Estado:** Better Auth `organization` plugin tiene `inviteMember()`, `cancelInvitation()`, `getInvitation()` pero no tenemos UI. **Diferido a M2.5 o cuando empuje a producción**.

#### G2.2 — Falta CRUD de units en UI
**Estado:** schema y RLS listos, falta páginas + API. **Plan: hacerlo al inicio de M3** porque las units son input de pricing y reservas.

#### G2.3 — Photos: solo schema, falta upload pipeline
**Estado:** tabla creada, worker stub. Falta:
- Endpoint `POST /api/photos` (recibe multipart o presigned URL)
- Upload a MinIO desde frontend
- Job BullMQ para sharp (resize + thumbs + EXIF strip)
- UI dropzone en property/unit detail
**Plan: dedicar M2.5 a fotos completas antes de M3 calendar**.

#### G2.4 — Tests E2E con Playwright todavía no instalados
**Estado:** dependencia en package.json pero sin config ni tests.
**Plan:** crear `playwright.config.ts` + tests del happy path (signup → workspace → property) en M2.5.

#### G2.5 — RLS NO está aplicada a tablas operacionales que falten
**Estado:** properties, units, photos tienen RLS. Pero `tenant_settings` no la tiene (debería). Y todas las tablas futuras (bookings, leads, conversations, etc.) van a necesitar RLS desde el día 1.
**Plan:** agregar RLS a `tenant_settings` + checklist documentado de "toda tabla con organization_id debe tener RLS".

#### G2.6 — Form auto-slug usando ref pattern hack
**Estado:** El pattern de "auto-slug del nombre" en `properties/new/page.tsx` usa un ref mutable que no es muy idiomático React. Funciona pero es feo.
**Plan:** refactor con `form.watch` + useEffect en M2.5.

#### G2.7 — No hay middleware Hono que automatice RLS context
**Estado:** Cada route handler tiene que llamar `withTenant(session, ...)`. Si alguien olvida, puede haber leak.
**Plan:** crear middleware Hono que automatice (usar AsyncLocalStorage o context).

#### G2.8 — i18n todavía no setupeado (G1.10 carry-over)
**Estado:** strings hardcoded. Default a "vos" en algunos lugares (rioplatense) pero deberíamos usar español neutro.
**Plan:** revisar strings + setup `next-intl` antes de M5 o M14.

#### G2.9 — TanStack Query no instalado
**Estado:** los componentes hacen fetch en useEffect. Funciona pero falta cache, dedup, optimistic updates.
**Plan:** instalar `@tanstack/react-query` en M2.5 antes de que la UI sea muy compleja.

#### G2.10 — Falta endpoint `GET /api/auth/get-session` cliente-friendly
**Estado:** `useSession` del Better Auth client funciona, pero el dashboard layout hace doble fetch (session + orgs). Optimizar con server component.
**Plan:** en M3 al refactorear dashboard.

### 🔍 Investigaciones para próxima sesión (antes de M3)

1. **Mercado Pago Checkout API** — para cobrar suscripción del SaaS (M12) o seña del huésped (M11). Ver flow OAuth + creación de preferencias.
2. **Pricing engine arquitectura** — JSON+Zod schema para reglas de cancelación, fees, depósitos, season pricing. Ver caso real de Meraki para validar shape.
3. **MinIO presigned URLs en Next.js** — pattern canónico para upload directo desde browser.
4. **TanStack Query con Next.js 15 App Router** — setup, hydration, SSR.
5. **Pricing rules engine: JSON Schema vs DSL custom** — para que dueños configuren sin código.

---

## ✅ Módulo 3 — Pricing rules engine (completado 2026-05-06)

### Implementado

**Pre-trabajo (gaps M2 resueltos):**
- ✅ **G2.7 middleware auto-RLS:** `rlsContext` en Hono que envuelve cada request en transaction + setTenantContext. Routes ya no manejan tenant manualmente, solo `getTenantDb(c)`. Imposible olvidarse.
- ✅ **G2.9 TanStack Query:** `QueryClient` + `Providers` en root layout. Listo para usar en componentes con `useQuery` / `useMutation`.

**Schema M3 (5 tablas, todas con RLS):**
- ✅ `seasons` (alta/media/baja/special) — rangos de fecha por property
- ✅ `rates` — precio por noche por unit + season (en cents USD), con extra-guest pricing
- ✅ `cancellation_policies` — JSONB con `tiers: [{daysBefore, refundPercent}]`
- ✅ `unit_fees` — cleaning, deposit, pet, transfer, etc. con 5 modos de cobro (fixed/per_night/per_guest/per_pet/percent)
- ✅ `pricing_rules` — JSONB con min nights por DOW, weekend premium, last-minute, length-of-stay

**Schemas Zod declarativos (`@impacto/shared/pricing-schemas`):**
- ✅ `cancellationTiersSchema` — valida estructura con tiers ordenados
- ✅ `pricingRulesConfigSchema` — todas las reglas opcionales con defaults
- ✅ `createSeasonSchema`, `createRateSchema`, `createCancellationPolicySchema`, `createUnitFeeSchema` (+ versiones update partial)
- ✅ **16 tests passing** validando shapes + rejects

**API routes Hono (todas con auto-RLS):**
- ✅ `GET/POST/PATCH/DELETE /api/seasons` (filtra por propertyId opcional)
- ✅ `GET/POST/PATCH/DELETE /api/rates` (filtra por unitId / seasonId)
- ✅ `GET/POST/PATCH/DELETE /api/policies/cancellation`
- ✅ `GET/POST/PATCH/DELETE /api/policies/fees`
- ✅ Smoke test: todos devuelven 401 sin auth ✓

### 🔧 Decisiones técnicas durante M3

1. **Pricing en cents (integer)** no en `numeric/decimal` para evitar floating-point bugs. `18000` = USD 180.00. Convertimos al display.
2. **`isDefault`, `refundable`, `optional` como integer 0/1** en vez de boolean para compat con drivers que serializan boolean inconsistente. Booleano puro en el shape público (Zod).
3. **JSONB para `tiers` y `config`** validado por Zod en runtime — permite flexibilidad sin migration por cada nuevo campo.
4. **Auto-RLS via `rlsContext` middleware** — cualquier nueva route que use `getTenantDb(c)` queda automáticamente filtrada. Patrón canónico para M4+.

### 🐞 Gaps encontrados durante M3 (resolver antes de M4)

#### G3.1 — UI de pricing diferida (parcial)
**Estado:** API completa. UI cubierta hasta acá:
- ✅ Units list + form en `/dashboard/properties/[id]` y `/dashboard/properties/[id]/units/new` (M4 follow-up). Sin esta UI las pages de bookings/blocks/calendars no eran usables porque su unit-picker quedaba vacío.
- ✅ Edit forms para property + unit (`/dashboard/properties/[id]/edit` y `/dashboard/properties/[id]/units/[unitId]/edit`). Pre-fill desde GET, PATCH al submit. Mapeo de `petsAllowed` int↔string (DB usa 0/1/2; el shared schema usa enum 'no'/'yes'/'consult'). Botones Pencil en property header y por cada unit row.

**Pendiente UI:**
- ✅ `/dashboard/properties/[id]/pricing` con secciones seasons + rates (matrix unit × season) + fees (tabla por unidad con feeType, chargeType, amount, refundable/optional flags, soporte percent_of_total con label dinámico %/USD).
- ✅ `/dashboard/policies` con dos secciones (cancellation + pricing rules). Cancellation policies — lista de policies (workspace-wide o per-unit), tabla de tiers ordenados por daysBefore desc, badge "Default" en la activa, botón Star para promover a default. Form con `useFieldArray` para tier rows (add/remove, defaults sensatos: 30d/100%, 14d/50%, 7d/25%), `defaultRefundPercent` cuando ningún tier aplica, scope unit o workspace, marca isDefault. Sidebar nav incluye "Políticas".
- ✅ Pricing rules sección — list cards con stats (min/max noches, anticipación, check-in/out times, weekend premium %, last-minute, DOW pills coloreadas, LOS tiers), botón pausar/activar, eliminar. Form con secciones: límites de estadía, horarios, mín. noches por día (grid de 7 inputs), premium + last-minute, LOS discount tiers (`useFieldArray`). Mapeo del form plano al `PricingRulesConfig` shape al enviar (campos vacíos se omiten para mantener el JSONB mínimo).

#### G3.2 — Falta CRUD de units en API + UI
**Estado:** Schema units listo desde M2, pero **NO hay API ni UI** todavía. Sin units no se pueden crear rates.
**Plan:** **CRÍTICO para M4**, agregar antes del calendar.

#### G3.3 — Sin pricing engine (calculate price)
**Estado:** tenemos rules + rates pero falta el motor que calcule el precio total dado:
- unit + checkIn + checkOut + guests + addons
**Output esperado:** `{ basePrice, fees: [{name, amount}], totalCents }`
**Plan:** crear `packages/pricing` con función `quote()` pure. Necesario para M5 (calendar) y M11 (cobro seña).

#### G3.4 — Versioning de policies pendiente
**Estado:** si el dueño cambia una cancellation policy hoy, se aplica retroactivamente a reservas viejas. Necesitamos snapshot.
**Plan:** al crear booking, copiar el JSON de la policy a una columna `policy_snapshot`. Hacer en M5/M9.

#### G3.5 — Validación cruzada de fechas
**Estado:** `createSeasonSchema` valida formato de fechas individualmente, pero NO chequea:
- `endDate >= startDate`
- Solapamiento de seasons (¿alta y media en el mismo día?)
**Plan:** refinar zod schema con `.refine()` + check server-side de overlaps en M3.5.

#### G3.6 — TanStack Query no usado todavía en pages existentes
**Estado:** instalado y configurado pero `dashboard/properties/page.tsx` sigue usando `useEffect + fetch`.
**Plan:** refactorear esas pages para usar `useQuery` en M4. Aprovechamos para optimistic updates.

#### G3.7 — Falta middleware RLS para users sin org activa
**Estado:** `requireOrganization` rechaza con 400 pero las pages cliente no manejan el caso.
**Plan:** UI debería redirigir a `/onboarding/workspace`. Mejorar en M4.

#### G3.8 — `pricingRules` table sin endpoint ✅ resuelto
**Estado:** `policiesRouter` ahora expone `GET/POST/PATCH/DELETE /api/policies/rules`. Schema de validación local con `pricingRulesConfigSchema` reutilizado de `@impacto/shared`. Soporta scope per-unit o workspace-wide (unitId nullable). UI conectada en `/dashboard/policies`.

#### G3.9 — `tenant_settings` aún sin RLS forzada
**Estado:** la tabla existe pero NO tiene `pgPolicy()` (G2.5 todavía).
**Plan:** migration manual con policies para tenant_settings antes de M4.

#### G3.10 — Schemas declarativos no documentados en UI
**Estado:** los Zod schemas describen el shape pero el cliente no tiene un visualizador. Si el dueño quiere ver "qué config tengo" necesita JSON raw.
**Plan:** UI de form-builder dinámico generado del schema en M3.5 o M14.

### 🔍 Investigaciones para próxima sesión (antes de M4)

1. **Postgres EXCLUDE constraints** para anti-double-booking en `bookings` (con `daterange` + `&&` operator).
2. **iCal parser/generator robusto** — `node-ical` vs `ical-generator` vs custom. Edge cases: timezones, DST, recurring events.
3. **Google Calendar Watch API + push notifications** — cómo registrar webhook + renovación cada 7 días.
4. **Conflict resolution UI patterns** — cuando hay double-booking detectado, cómo presentar opciones al dueño.
5. **Booking.com iCal feed format** — cómo extraen el guest name (si es que lo extraen).

---

## ✅ Módulo 4 — Calendar + iCal sync (completado 2026-05-05, code-only)

### Pre-trabajo M3 → M4 resuelto
- ✅ **G3.2:** CRUD units en API (`apps/api/src/routes/units.ts`, mounted en `/api/units`)
- ✅ **G3.3:** pricing engine `packages/pricing` con `quote()`, `calculateRefundPercent`, `getMinNightsForCheckIn` (+18 tests)
- ✅ **G3.5:** `createSeasonSchema` refinado con `endDate >= startDate` + helper `seasonsOverlap()` para chequeo server-side
- ✅ **G3.9:** RLS en `tenant_settings` (`id = current_setting('app.tenant_id', true)`)

### Implementado en M4

**Schema (4 tablas, todas con RLS, en `packages/db/src/schema/bookings.ts`):**
- ✅ `bookings` — reserva con source (direct/airbnb/booking/gcal/manual/ical), status (tentative/confirmed/checked_in/checked_out/cancelled/no_show), datos del huésped, snapshot del quote
- ✅ `availability_blocks` — bloqueos manuales (maintenance/owner_stay/hold/closure/other)
- ✅ `external_calendars` — feeds iCal a importar (con polling state)
- ✅ `ical_export_tokens` — tokens públicos rotables para feed exportable

**EXCLUDE constraints anti-double-booking (migration `0002_bookings_and_calendar.sql`):**
- ✅ `bookings_no_overlap`: GiST con `(unit_id =, tstzrange(check_in, check_out, '[)') &&)` filtrando status not in (cancelled, no_show)
- ✅ `availability_blocks_no_overlap`: GiST con `(unit_id =, tstzrange(starts_at, ends_at, '[)') &&)`

**Schemas Zod (`@impacto/shared/booking-schemas`):**
- ✅ `createBookingSchema` (con refine `checkOut > checkIn`), `updateBookingSchema`
- ✅ `createAvailabilityBlockSchema`, `createExternalCalendarSchema`, `createIcalExportTokenSchema`
- ✅ `availabilityQuerySchema` para el endpoint de consulta

**Package `@impacto/ical` (helpers puros):**
- ✅ `parseIcal(icsText)` con `node-ical` — devuelve VEVENTs con start/end válidos
- ✅ `buildIcal({calendarName, prodId, events})` con `ical-generator`
- ✅ `generateIcalToken()` — 32 bytes random base64url
- ✅ Tests: parse simple, skip events sin fechas, parse múltiples, build+roundtrip

**API routes:**
- ✅ `GET/POST/PATCH/DELETE /api/bookings` — pre-check de overlap + retry-safe ante EXCLUDE constraint
- ✅ `GET /api/availability?unitId=&from=&to=` — devuelve bookings + blocks que solapan la ventana
- ✅ `POST/DELETE /api/availability/blocks`
- ✅ `GET/POST/PATCH/DELETE /api/calendars/external` — CRUD de feeds iCal a polleas
- ✅ `GET/POST/DELETE /api/calendars/tokens` — emisión y revocación de tokens iCal
- ✅ `GET /ical/:token.ics` — endpoint público (sin auth) que sirve feed iCal de la unit del token. Resolución de token con superuser, query de bookings con `setTenantContext` para que RLS valide

**Worker:**
- ✅ Stub `apps/worker/src/workers/ical.ts` registrado en queues (`ical`). Job loop real se completa en M5 con BullMQ repeatable jobs.

### 🔧 Decisiones técnicas durante M4
1. **`tstzrange` con bounds `'[)'`** (inclusive start, exclusive end) — un check-out a las 11:00 no choca con un check-in a las 14:00 del mismo día.
2. **`status NOT IN ('cancelled', 'no_show')` en el WHERE del EXCLUDE** — bookings canceladas no consumen el slot.
3. **Pre-check + EXCLUDE como red de seguridad** — UX devuelve `409 overlap` legible; si una race-condition gana, el constraint también devuelve `409 overlap_db`.
4. **iCal token en URL pública** — entropía de 32 bytes (~256 bits) >> path enumeration. `revokedAt` para rotar sin perder histórico.
5. **Source maestro = nosotros** — Booking/Airbnb/GCal sincronizan HACIA Impacto. Los bookings importados quedan con `source = 'airbnb'|'booking'|'gcal'` + `externalUid` para deduplicar al re-poll.

### 🐞 Gaps encontrados durante M4 (resolver antes de M5)

#### G4.1 — Workspace install pendiente
**Estado:** los nuevos packages `@impacto/ical` y `@impacto/pricing` están agregados como `workspace:*` en `apps/api` y `apps/worker`, pero falta correr `pnpm install` (pnpm no estaba disponible en este host de dev). El `pnpm-lock.yaml` no se actualizó.
**Plan:** correr `pnpm install` al inicio de M5. Después `pnpm db:migrate` aplica `0002_bookings_and_calendar.sql`.

#### G4.2 — Migration hand-rolled (no via drizzle-kit)
**Estado:** `0002_bookings_and_calendar.sql` está escrito a mano y registrado en `_journal.json`. Drizzle-kit nunca corrió contra el schema nuevo, así que el `_snapshot.json` correspondiente no existe.
**Plan:** correr `pnpm db:generate` después del install. Probable que regenere idéntico, en cuyo caso reemplazar el handwritten por el generado y actualizar journal. Si difiere (ej: un FK menor), reconciliar.

#### G4.3 — UI calendar pendiente (parcial)
**Estado parcial:**
- ✅ `/dashboard/bookings` lista de reservas (tabla con código, unidad, huésped, fechas, pax, origen, estado, total)
- ✅ `/dashboard/bookings/new` form completo — pickers de unit/dates, status (confirmed/tentative), datos del huésped, mapeo a tz local del browser → ISO. Maneja 409 (overlap) y 422 (quote_failed) con toast amigable.
- ✅ `/dashboard/bookings/[id]` detalle — header con código + status pill + total, secciones de estadía/huésped, breakdown de `lineItems` desde `quote_snapshot`, notas internas, info de cancelación, panel de transiciones de status válidas (state machine: tentative → confirmed → checked_in → checked_out, con cancelled/no_show como sumideros). Filas de la lista navegables. Botón "Editar" (gated: oculto en estados terminales).
- ✅ `/dashboard/bookings/[id]/edit` form de edición — pre-fill con valores actuales (split del ISO con timezone a date+time local del browser), permite cambiar fechas, pax, datos del huésped, notas. PATCH sólo envía los campos editables (no toca code/source/currency/totalCents — esos quedan inmutables). Maneja 409 cuando las nuevas fechas chocan con otra reserva o block.
- ✅ `/dashboard/calendars` UI completa — listado de feeds externos con estado de último sync, botones de "Sync now" y eliminar; alta de feed con form (provider, name, URL iCal, frecuencia); listado de export tokens con copia de URL y revocación; alta de tokens con etiqueta opcional.
- ✅ `/dashboard/blocks` UI — selector de unidad, lista combinada de bookings + blocks de los próximos 12 meses (consume `GET /api/availability`), alta de bloqueo (motivo: mantenimiento/owner_stay/hold/closure/other), eliminar block. Maneja 409 cuando hay reserva en el rango.
- ✅ Sidebar nav en `dashboard/layout.tsx` (Inicio · Reservas · Bloqueos · Calendarios · Propiedades) con highlight del item activo.
- ✅ Cards en `/dashboard` panel siguen como shortcuts visibles.
**Pendiente:** vista de calendario propiamente dicha (mensual con drag-to-create, drag-to-resize). Falta elegir librería: Schedule-X / FullCalendar / React Big Calendar. Se decide al inicio de M5.

#### G4.4 — iCal poll job real (worker) ✅ resuelto
**Estado:** worker `icalWorker` ahora es real (no stub):
1. ✅ Repeatable jobs por external_calendar — `scheduleIcalPoll()` en `apps/api/src/lib/queues.ts`, llamado al crear/editar feed (idempotente con jobId estable)
2. ✅ fetch del feed con timeout 30s + AbortController
3. ✅ Upsert via `INSERT ... ON CONFLICT (external_calendar_id, external_uid) DO UPDATE` (status, fechas, updated_at)
4. ✅ Reconcile: bookings con `external_calendar_id` que ya no están en el feed → status='cancelled', cancelled_reason='removed_from_external_feed'
5. ✅ Update `last_synced_at` + `last_event_count` + `last_sync_status` + `last_sync_error`
**Pendiente menor:** retry policy / exponential backoff explícito (BullMQ default por ahora).

#### G4.5 — Google Calendar Watch API
**Estado:** no implementado. Para GCal no usamos iCal poll sino webhook push.
**Plan:** M5 con OAuth Google + endpoint `/api/webhooks/gcal` + renovación cada 7 días via cron.

#### G4.6 — Quote integration al crear booking ✅ resuelto
**Estado:** `apps/api/src/lib/booking-quote.ts` carga rates+seasons+fees+rules de la unit y corre `quote()`. `POST /api/bookings` lo invoca cuando el caller no manda `totalCents`; persiste subtotal/fees/discount/total/refundable + `lineItems` en `quote_snapshot`. Si el quote falla (no rate, min nights), 422 con reason.
**Pendiente:** policy_snapshot (G3.4) — guardar el JSON de la cancellation policy aplicable al momento del booking. Más M5/M9.

#### G4.7 — Conflict resolution UI
**Estado:** API devuelve `409 overlap` con info mínima. El frontend no tiene flow para elegir qué hacer (cancelar la nueva, mover, contactar al huésped).
**Plan:** M5 — modal con las reservas en conflicto + acciones rápidas.

#### G4.8 — Tests de integración pendientes
**Estado:** `@impacto/ical` tiene tests unitarios. Pero NO hay tests:
- end-to-end del EXCLUDE constraint contra DB real
- de overlap detection en `POST /api/bookings`
- del flow completo `POST /api/calendars/tokens` → `GET /ical/:token.ics`
**Plan:** test container Postgres en M5 (G0.6 también).

#### G4.9 — Validación de timezone del workspace ✅ resuelto
**Estado:** `quoteForBooking()` ahora lee `tenant_settings.timezone` (RLS scoped) y normaliza checkIn/checkOut/today con `toLocalDateString()` (Intl.DateTimeFormat `en-CA` → YYYY-MM-DD en el tz local). Tests cubren UTC, Buenos Aires/Montevideo (cruzan medianoche local), DST en LA, y fallback con tz inválido.
**Pendiente menor:** aplicar misma normalización en `calculateRefundPercent` cuando se invoque desde flujos de cancelación (M5/M9).

#### G4.10 — Idempotencia de iCal import
**Estado:** schema tiene `unique (external_calendar_id, external_uid)` para deduplicar. Falta la lógica de upsert en el worker (G4.4).

### 🔍 Investigaciones para próxima sesión (antes de M5)
1. **Schedule-X vs FullCalendar vs React Big Calendar** — pros/contras para vista mensual + drag-to-create. Bundle size importa.
2. **BullMQ repeatable jobs** — patrón para crear un job por external_calendar dinámicamente cuando el dueño activa un feed nuevo.
3. **Google Calendar Watch API renewal flow** — cómo manejar renovación cada 7 días sin downtime.
4. **Recurring events en iCal (RRULE)** — Booking/Airbnb no los usan típicamente, pero validar que `node-ical` los expanda si aparecen.
5. **Conflict resolution patterns en SaaS de PMS** (Lodgify, Hostfully) — cómo presentan double-bookings.

---

## ✅ Módulo 5 — UI calendar mensual + iCal poll + GCal (completado 2026-05-13)

### Implementado
- ✅ **Vista mensual tradicional con toggle**: `/dashboard/calendar` ahora alterna entre **resource view** (Gantt por unidad — existente) y **vista mensual** (grid 7-col Lun-Dom, hasta 3 bandas por celda + "+N más" overflow). Click en número de día → crear reserva pre-llena. Sin lib externa: CSS grid manual, dark-mode automático.
- ✅ **iCal poll worker real** (G4.4 ✅): `apps/worker/src/workers/ical.ts` con fetch + AbortController + upsert ON CONFLICT + reconcile (status cancelled cuando desaparece del feed).
- ✅ **GCal Watch API endpoints**: `apps/api/src/routes/gcal.ts` con OAuth start/callback + watch register + renewal cron (cada 7 días).
- ✅ **Overlap dialog** (G4.7): `apps/web/src/components/dashboard/overlap-dialog.tsx` con items en conflicto + acciones.

### Pendiente (M5.5 — diferido)
- Drag-to-create / drag-to-resize en la vista calendario (requiere lib externa — Schedule-X / FullCalendar). Decisión: posponer hasta que el feedback de usuarios reales muestre que el costo de cargar la lib se justifica.

---

## 🔁 Sesión 2026-05-13 — cierre de gaps de auditoría

Sesión dedicada a recorrer `AUDIT_GAPS.md` (4 categorías × 45 items). De los 45 items que el audit listaba como TODO:
- **17 implementados** en esta sesión (5 commits)
- **24 ya estaban hechos** (audit del 2026-05-10 stale vs commits posteriores)
- **4 diferidos** explícitamente (pre-prod: backups, secret manager; entorno-dep: OAuth mkcert; perf no demostrado: RSC refactor)

### Commits
| Hash | Categoría | Resumen |
|---|---|---|
| `c03b6cd` | Critical | Stack arranca en frío: fix migración 0009 (updated_at ambiguo), 0015 (now() en index predicate), ical-generator prodId, worker drizzle-orm import |
| `31a8be4` | High | `packages/ui` consolidado (14 primitives) + pipeline de fotos S3 (presign+confirm+sharp worker+dropzone UI) |
| `92ef41f` | High | Vista calendario mensual toggle + tests EXCLUDE constraint (3 casos) |
| `5432c27` | Medium | Email invitaciones (Mailhog/Resend) + PWA PNG icons + RLS checklist doc + next-intl wired |
| `29672ab` | Low | CI/CD GitHub Actions + `requireEmailVerification` env-driven + .env.example consumidas + docs históricos + reviews contradiction resuelta |

### Hallazgo principal
`AUDIT_GAPS.md` data del 2026-05-10. Entre esa fecha y hoy (2026-05-13) se cerraron 24 items que el audit seguía listando. **Recomendación**: regenerar la auditoría contra HEAD actual antes de la próxima ronda; sino se pierde tiempo verificando ítems hechos.

---

## 📋 Lista completa de módulos

| # | Módulo | Estado |
|---|---|---|
| 0 | Foundations | ✅ Completo |
| 1 | Auth completo (UI + OAuth + 2FA) | ✅ Completado 2026-05-06 (2FA plugin activado, forgot/reset password pages existen, OAuth pendiente test E2E con mkcert) |
| 2 | Properties + units + fotos | ✅ Completado 2026-05-13 (pipeline fotos completo: presign + sharp + dropzone — G2.3 cerrado) |
| 3 | Pricing + policies (rules engine) | ✅ Completado 2026-05-06 |
| 4 | Calendar + iCal sync | ✅ Completado 2026-05-05 |
| 5 | UI calendar mensual + iCal poll + GCal | ✅ Completado 2026-05-13 (drag-to-create diferido a M5.5) |
| 6 | Knowledge base + RAG (pgvector) | ⏳ Próximo |
| 7 | WhatsApp Cloud API | ⏳ |
| 8 | Bot AI + tools + voice notes | ⏳ |
| 9 | CRM + pipeline | ⏳ |
| 10 | Meta Ads + CAPI | ⏳ |
| 11 | Mercado Pago | ⏳ |
| 12 | Stripe subscription | ⏳ |
| 13 | Notificaciones | ✅ Parcial (email Resend ✅, in-app ✅, sonidos ✅, 2FA plugin ✅; falta UI de 2FA enable/disable y password reset email integration) |
| 14 | Reports + dashboard | ⏳ |
| 15 | Mass messaging | ⏳ |
| 16 | Audit log | ✅ Schema + triggers + retention (audit.events) |
| 17 | UX polish (tour onboarding, dark mode, a11y AA) | ✅ Tour + cmdk + dark mode hechos; a11y AA pendiente audit |
