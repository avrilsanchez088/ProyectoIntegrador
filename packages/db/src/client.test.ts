/**
 * Tests de integración del cliente DB.
 * Requiere Postgres corriendo (docker compose up).
 *
 * El test crea/elimina un usuario de prueba para validar que las queries
 * y migrations están sanas.
 */
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb, pingDatabase } from './client';
import { users } from './schema/auth';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://impacto:impacto_dev_password_change_me@localhost:5433/impacto';

describe('db client', () => {
  it('pingDatabase returns ok against running Postgres', async () => {
    await expect(pingDatabase(databaseUrl)).resolves.not.toThrow();
  });

  it('can insert + select + delete a user', async () => {
    const db = createDb(databaseUrl);
    const testEmail = `vitest-${Date.now()}@test.local`;
    const testId = `test-user-${Date.now()}`;

    // INSERT
    await db.insert(users).values({
      id: testId,
      name: 'Vitest User',
      email: testEmail,
    });

    // SELECT
    const found = await db.select().from(users).where(eq(users.email, testEmail));
    expect(found.length).toBe(1);
    expect(found[0]?.name).toBe('Vitest User');

    // DELETE (cleanup)
    await db.delete(users).where(eq(users.email, testEmail));
    const afterDelete = await db.select().from(users).where(eq(users.email, testEmail));
    expect(afterDelete.length).toBe(0);
  });
});
