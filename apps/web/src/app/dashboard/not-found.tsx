import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { Home } from 'lucide-react';
import Link from 'next/link';

export default function DashboardNotFound() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <Card>
        <CardHeader>
          <CardTitle>404 · No encontramos esta página</CardTitle>
          <CardDescription>
            Puede que la reserva, propiedad o sección que buscás haya sido eliminada o el link sea
            viejo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard">
              <Home /> Volver al inicio
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
