import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { ProfileForm } from './profile-form';

/**
 * Profile page — server component shell + client form (§7.5 del audit).
 *
 * El chrome (heading, Card, descripciones) renderiza server-side: el browser
 * recibe HTML estático para esa parte y solo el `<ProfileForm>` se hidrata.
 * Reduce el JS enviado al cliente para esta page.
 *
 * Este patrón se replicará a otras pages de configuración en próximas
 * iteraciones (settings shell, team shell).
 */
export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Mi perfil</h1>

      <Card>
        <CardHeader>
          <CardTitle>Datos personales</CardTitle>
          <CardDescription>Cambia tu nombre o foto de perfil.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm />
        </CardContent>
      </Card>
    </div>
  );
}
