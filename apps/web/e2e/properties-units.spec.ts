import { expect, test } from './fixtures/auth';

async function createProperty(page: import('@playwright/test').Page) {
  const name = `Alojamiento E2E ${Date.now()}`;

  await page.goto('/dashboard/properties/new');
  await expect(page.getByText('Nueva propiedad', { exact: true })).toBeVisible();

  await page.getByLabel('Nombre del alojamiento').fill(name);
  await page.getByLabel('Ciudad').fill('Montevideo');
  await page.getByRole('button', { name: 'Crear propiedad' }).click();

  await expect(page).toHaveURL('http://localhost:3100/dashboard/properties', {
    timeout: 15000,
  });
  await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15000 });
  return name;
}

test.describe('HU01 - Propiedades', () => {
  test('crear una propiedad', async ({ page, workspace }) => {
    const name = `Alojamiento E2E ${Date.now()}`;

    await page.goto('/dashboard/properties/new');
    await expect(page.getByText('Nueva propiedad', { exact: true })).toBeVisible();

    await page.getByLabel('Nombre del alojamiento').fill(name);
    await page.getByLabel('Ciudad').fill('Montevideo');
    await page.getByRole('button', { name: 'Crear propiedad' }).click();

    await expect(page).toHaveURL('http://localhost:3100/dashboard/properties', {
      timeout: 15000,
    });
    await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15000 });
  });

  test('editar una propiedad', async ({ page, workspace }) => {
    const originalName = await createProperty(page);
    const updatedName = `${originalName} Editada`;

    await page
      .getByRole('link', {
        name: new RegExp(originalName),
      })
      .click();

    await expect(page.getByRole('heading', { name: originalName })).toBeVisible({ timeout: 15000 });

    await page.getByRole('link', { name: 'Editar' }).click();

    await page.getByLabel('Nombre', { exact: true }).fill(updatedName);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page.getByRole('heading', { name: updatedName })).toBeVisible({ timeout: 15000 });
  });
});

test.describe('HU02 - Unidades', () => {
  test('crear una unidad', async ({ page, workspace }) => {
    const propertyName = await createProperty(page);
    const unitName = `Unidad E2E ${Date.now()}`;

    await page.getByText(propertyName, { exact: true }).click();
    await page.getByText('Nueva unidad', { exact: true }).click();

    await page.getByLabel('Nombre').fill(unitName);
    await page.getByRole('button', { name: 'Crear unidad' }).click();

    await expect(page.getByText(unitName, { exact: true })).toBeVisible();
  });

  test('editar una unidad', async ({ page, workspace }) => {
    const propertyName = await createProperty(page);
    const originalUnitName = `Unidad E2E ${Date.now()}`;
    const updatedUnitName = `${originalUnitName} Editada`;

    await page.getByText(propertyName, { exact: true }).click();
    await page.getByText('Nueva unidad', { exact: true }).click();

    await page.getByLabel('Nombre').fill(originalUnitName);
    await page.getByRole('button', { name: 'Crear unidad' }).click();

    await expect(page.getByText(originalUnitName, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Editar unidad' }).click();
    await page.getByLabel('Nombre').fill(updatedUnitName);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(page.getByText(updatedUnitName, { exact: true })).toBeVisible();
  });
});
