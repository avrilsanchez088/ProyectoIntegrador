'use client';

import { signIn } from '@/lib/auth-client';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { Input } from '@impacto/ui/input';
import { Label } from '@impacto/ui/label';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export default function SignInPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleEmailSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await signIn.email({
      email: String(data.get('email')),
      password: String(data.get('password')),
      callbackURL: '/dashboard',
    });
    setLoading(false);

    if (error) {
      toast.error(error.message ?? 'No pudimos iniciarte sesión');
      return;
    }
    router.push('/dashboard');
  };

  const handleGoogle = async () => {
    setLoading(true);
    await signIn.social({ provider: 'google', callbackURL: '/dashboard' });
  };

  const handleFacebook = async () => {
    setLoading(true);
    await signIn.social({ provider: 'facebook', callbackURL: '/dashboard' });
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Iniciar sesión</CardTitle>
        <CardDescription>Ingresá con tu email o tu cuenta de Google / Facebook.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleEmailSignIn} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Olvidé mi contraseña
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            Ingresar
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <hr className="flex-1" />
          <span>o continuá con</span>
          <hr className="flex-1" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={handleGoogle} disabled={loading}>
            Google
          </Button>
          <Button type="button" variant="outline" onClick={handleFacebook} disabled={loading}>
            Facebook
          </Button>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿No tenés cuenta?{' '}
          <Link href="/sign-up" className="font-medium text-foreground hover:underline">
            Crear una
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
