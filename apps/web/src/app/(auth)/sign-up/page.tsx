'use client';

import { signIn, signUp } from '@/lib/auth-client';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { Input } from '@impacto/ui/input';
import { Label } from '@impacto/ui/label';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export default function SignUpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get('name'));
    const email = String(data.get('email'));
    const password = String(data.get('password'));

    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setLoading(true);
    const { error } = await signUp.email({ name, email, password });
    setLoading(false);

    if (error) {
      toast.error(error.message ?? 'No pudimos crear tu cuenta');
      return;
    }

    toast.success('¡Cuenta creada! Ahora vamos a configurar tu workspace.');
    router.push('/onboarding/workspace');
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Crear cuenta</CardTitle>
        <CardDescription>14 días de plan Pro gratis. Sin tarjeta.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" type="text" autoComplete="name" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            Crear cuenta
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <hr className="flex-1" />
          <span>o continuá con</span>
          <hr className="flex-1" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              signIn.social({ provider: 'google', callbackURL: '/onboarding/workspace' })
            }
          >
            Google
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              signIn.social({ provider: 'facebook', callbackURL: '/onboarding/workspace' })
            }
          >
            Facebook
          </Button>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Ya tenés cuenta?{' '}
          <Link href="/sign-in" className="font-medium text-foreground hover:underline">
            Iniciá sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
