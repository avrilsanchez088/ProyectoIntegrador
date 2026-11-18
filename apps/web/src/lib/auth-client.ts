import { organizationClient, twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth client.
 *
 * Apunta al endpoint de la API (no a /api/auth en este mismo origen) porque
 * `apps/web` y `apps/api` viven en orígenes distintos en dev.
 *
 * Plugins:
 * - organization: workspaces multi-tenant + members + invitations
 * - twoFactor: TOTP + códigos de respaldo (§2.3 del audit). UI pendiente M13.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101',
  plugins: [organizationClient(), twoFactorClient()],
});

export const { useSession, signIn, signUp, signOut, organization, twoFactor } = authClient;
