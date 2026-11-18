import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import Link from 'next/link';

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Restablecer contraseña</CardTitle>
        <CardDescription>
          Esta función estará disponible junto con el envío de emails (M13). El link de reset que
          recibiste no es válido aún en esta versión.
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
