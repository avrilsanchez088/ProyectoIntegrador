'use client';

import { authClient, useSession } from '@/lib/auth-client';
import { Button } from '@impacto/ui/button';
import { Input } from '@impacto/ui/input';
import { Label } from '@impacto/ui/label';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Form interactivo del profile (§7.5 del audit). El shell de la página
 * (heading + Card chrome) ahora vive en `page.tsx` — esto reduce el client
 * bundle a solo este componente cuando el resto de la página se renderiza
 * server-side.
 */
export function ProfileForm() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(session?.user.name ?? '');

  if (!session) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.updateUser({ name });
    setLoading(false);

    if (error) {
      toast.error(error.message ?? 'No pudimos guardar');
      return;
    }
    toast.success('Perfil actualizado');
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={session.user.email} disabled className="bg-muted/30" />
        <p className="text-xs text-muted-foreground">
          Para cambiar el email, contactá a soporte (V1).
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <Button type="submit" disabled={loading || name === session.user.name}>
        {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
        Guardar
      </Button>
    </form>
  );
}
