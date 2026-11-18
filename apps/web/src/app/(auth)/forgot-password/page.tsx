import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Recuperar contraseña</CardTitle>
        <CardDescription>
          Esta función estará disponible cuando integremos el envío de emails (M13). Mientras tanto,
          contactá a soporte para que reseteen tu contraseña manualmente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button asChild variant="outline" className="w-full">
          <Link href="/sign-in">Volver al inicio de sesión</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
