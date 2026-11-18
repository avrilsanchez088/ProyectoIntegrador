import { Button } from '@impacto/ui/button';
import Link from 'next/link';

export default function GlobalNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Página no encontrada</h1>
      <p className="max-w-md text-muted-foreground">
        El link puede estar viejo o haberse mudado. Si llegaste desde un email de invitación, abrí
        el último que recibiste.
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/">Ir al inicio</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Mi dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
