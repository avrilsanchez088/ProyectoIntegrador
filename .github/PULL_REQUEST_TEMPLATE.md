<!--
  Plantilla de PR · usá Conventional Commits en el title:
  feat(M5): ...   |   fix(bookings): ...   |   docs(adr): ...
-->

## Resumen

<!-- 1-3 bullets sobre qué hace este PR. Por qué, no solo qué. -->

-
-

## Test plan

<!-- Steps para probar localmente. Useful para reviewers que no pueden levantar el stack. -->

- [ ]
- [ ]

## Definition of Done

<!-- Marcá lo que aplique. Ver CONTRIBUTING.md §"Definition of Done por módulo". -->

- [ ] Schema con RLS pgPolicy si aplica
- [ ] Migration aplicada (`pnpm db:migrate`) y reversible
- [ ] DTO en `packages/shared/src/api-types.ts` si la API expone shape nuevo
- [ ] Route Hono con `getTenantDb` + `getActiveOrgId`
- [ ] Page con `<RequireWorkspace>` + `useApiList` + `<AsyncList>` (si es page nueva)
- [ ] Form con `react-hook-form` + zod resolver
- [ ] `aria-label` en buttons icon-only
- [ ] Lint pasa (`pnpm lint`)
- [ ] Typecheck pasa (`pnpm typecheck`)
- [ ] Tests unitarios + integración (`pnpm test`)
- [ ] E2E smoke si tocás UI crítica (`pnpm test:e2e`)
- [ ] Modo demo funcional (sin credenciales externas)
- [ ] Entrada en `MODULES.md` con gaps encontrados

## Screenshots / videos

<!-- UI changes: pegá screenshots o un GIF corto. -->

## Notas para el reviewer

<!--
  Cualquier decisión no obvia, edge case considerado, o siguiente paso
  no incluido en este PR (referenciar issue si corresponde).
-->
