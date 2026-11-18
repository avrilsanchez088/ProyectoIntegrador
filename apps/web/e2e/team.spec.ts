import { expect, test } from './fixtures/auth';

/**
 * Team invitation flow (propuesta 104.1 ronda 8).
 *
 * Owner invita a un email → expect aparece como pendiente → cancela → expect
 * desaparece. El email no se envía realmente (Resend pendiente M13) — solo
 * verifica el flow de creación + listado + cancelación de invitations.
 */

test('owner invita y cancela una invitation', async ({ workspace, page }) => {
  await page.goto('/dashboard/team');
  await expect(page.getByRole('heading', { name: /Equipo/i })).toBeVisible();

  const guestEmail = `invitee-${Date.now()}@test.local`;

  await page.locator('input[type="email"]').fill(guestEmail);
  // El select de rol está visible pero el default 'member' es OK.
  await page.getByRole('button', { name: /^Invitar$/i }).click();

  // Toast success.
  await expect(page.getByText(`Invitación enviada a ${guestEmail}`)).toBeVisible({
    timeout: 5_000,
  });

  // El email aparece en la lista de invitations.
  await expect(page.getByText(guestEmail).first()).toBeVisible();

  // Cancelar.
  const row = page.locator('li', { hasText: guestEmail });
  await row.getByRole('button', { name: /Cancelar/i }).click();

  // Confirm dialog.
  await page.getByRole('button', { name: /Cancelar invitación/i }).click();

  // Desaparece.
  await expect(page.getByText('Invitación cancelada')).toBeVisible({ timeout: 5_000 });
});

test('miembro role badge se muestra', async ({ workspace, page }) => {
  await page.goto('/dashboard/team');
  // Owner debe verse a sí mismo en la lista de members con badge "Owner".
  await expect(page.getByText(/Owner/i).first()).toBeVisible();
});
