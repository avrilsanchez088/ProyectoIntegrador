'use client';

import { organization } from '@/lib/auth-client';
import { Button } from '@impacto/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@impacto/ui/card';
import { Input } from '@impacto/ui/input';
import { Label } from '@impacto/ui/label';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: stripping combining diacritics \u2014 idiom est\u00e1ndar tras NFD normalize
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

export default function OnboardingWorkspacePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(slugify(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setLoading(true);
    const { error } = await organization.create({ name: name.trim(), slug: slug.trim() });
    setLoading(false);

    if (error) {
      toast.error(error.message ?? 'No pudimos crear tu workspace');
      return;
    }

    toast.success('¡Workspace creado!');
    router.push('/dashboard');
  };

  return (
    <div className="mx-auto max-w-md px-6 py-24">
      <Card>
        <CardHeader>
          <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            Paso 1 de 7
          </div>
          <CardTitle>Tu workspace</CardTitle>
          <CardDescription>
            Cómo se llama tu negocio. Después agregás propiedades y unidades adentro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name">Nombre del negocio</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Meraki Cabañas"
                autoFocus
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="slug">URL pública</Label>
              <div className="flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-sm">
                <span className="text-muted-foreground">impacto.app/</span>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  className="border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                  placeholder="meraki-cabanas"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Solo minúsculas, números y guiones. La podés cambiar después.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !name || !slug}>
              {loading && <Loader2 className="animate-spin" />}
              Crear workspace
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
