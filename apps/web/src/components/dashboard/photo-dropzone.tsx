'use client';

import { api } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, Loader2, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { toast } from 'sonner';

/**
 * PhotoDropzone — sube fotos al property/unit usando el pipeline presigned:
 *
 *   1. POST /api/photos/presign   → recibe { uploadUrl, photoId, originalUrl }
 *   2. PUT al uploadUrl           → upload directo al bucket (sin pasar por API)
 *   3. POST /api/photos/confirm   → encola job sharp para thumbs
 *   4. El listado refresca y el worker pinta thumbSmallUrl cuando termina.
 *
 * Mantenemos el dropzone simple: drag-and-drop + click-to-select + lista de
 * fotos existentes con delete. Sin reordenar (drag) en V1.
 */

interface PhotoDropzoneProps {
  scope: { propertyId: string } | { unitId: string };
  /** Acepta `image/jpeg`, `image/png`, `image/webp`, `image/avif`. */
  acceptedMimes?: string[];
  /** Máximo de bytes por archivo. Default 20MB. */
  maxBytes?: number;
}

interface Photo {
  id: string;
  originalUrl: string;
  thumbSmallUrl: string | null;
  thumbLargeUrl: string | null;
  caption: string | null;
  status: 'uploading' | 'pending' | 'processing' | 'ready' | 'failed';
  sortOrder: number;
}

const DEFAULT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

export function PhotoDropzone({
  scope,
  acceptedMimes = DEFAULT_MIMES,
  maxBytes = DEFAULT_MAX_BYTES,
}: PhotoDropzoneProps) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const queryKey = ['photos', scope] as const;
  const queryParams =
    'propertyId' in scope ? `propertyId=${scope.propertyId}` : `unitId=${scope.unitId}`;

  const photosQuery = useQuery({
    queryKey,
    queryFn: () => api<{ data: Photo[] }>(`/api/photos?${queryParams}`).then((r) => r.data),
    refetchInterval: (q) => {
      // Si hay fotos en pipeline, refresh cada 3s para ver thumbs aparecer.
      const data = q.state.data as Photo[] | undefined;
      const inPipeline = data?.some((p) => p.status === 'uploading' || p.status === 'processing');
      return inPipeline ? 3_000 : false;
    },
  });

  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/photos/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Foto eliminada');
    },
    onError: () => toast.error('No se pudo eliminar la foto'),
  });

  const uploadFile = useCallback(
    async (file: File) => {
      if (!acceptedMimes.includes(file.type)) {
        toast.error(`Formato no soportado: ${file.type || 'desconocido'}`);
        return;
      }
      if (file.size > maxBytes) {
        toast.error(`${file.name}: supera el máximo de ${Math.round(maxBytes / 1024 / 1024)}MB`);
        return;
      }

      setUploading((u) => [...u, { name: file.name, progress: 0 }]);
      const advance = (progress: number) =>
        setUploading((u) => u.map((p) => (p.name === file.name ? { ...p, progress } : p)));

      try {
        // 1. Presign.
        const presigned = await api<{
          data: {
            photoId: string;
            uploadUrl: string;
            requiredHeaders: Record<string, string>;
          };
        }>('/api/photos/presign', {
          method: 'POST',
          body: JSON.stringify({
            ...scope,
            mimeType: file.type,
            sizeBytes: file.size,
            fileName: file.name,
          }),
        });
        advance(20);

        // 2. PUT al bucket.
        const putRes = await fetch(presigned.data.uploadUrl, {
          method: 'PUT',
          headers: presigned.data.requiredHeaders,
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(`upload failed: ${putRes.status}`);
        }
        advance(70);

        // 3. Confirm — lee dimensiones del file en cliente para metadata.
        const dims = await readImageDimensions(file);
        await api('/api/photos/confirm', {
          method: 'POST',
          body: JSON.stringify({
            photoId: presigned.data.photoId,
            width: dims?.width,
            height: dims?.height,
          }),
        });
        advance(100);
        toast.success(`${file.name} subida`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error inesperado';
        toast.error(`${file.name}: ${msg}`);
      } finally {
        setUploading((u) => u.filter((p) => p.name !== file.name));
        queryClient.invalidateQueries({ queryKey });
      }
    },
    [acceptedMimes, maxBytes, scope, queryClient, queryKey],
  );

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      // Uploads en serie para no saturar el navegador.
      for (const file of Array.from(files)) {
        await uploadFile(file);
      }
    },
    [uploadFile],
  );

  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="space-y-4">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void onFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/30 hover:border-muted-foreground/50'
        }`}
      >
        <Upload className="mb-2 size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Arrastrá fotos acá o hacé click para elegir</p>
        <p className="mt-1 text-xs text-muted-foreground">
          JPEG / PNG / WebP / AVIF · hasta {Math.round(maxBytes / 1024 / 1024)}MB cada una
        </p>
        <input
          id={inputId}
          type="file"
          accept={acceptedMimes.join(',')}
          multiple
          className="sr-only"
          onChange={(e) => {
            void onFiles(e.currentTarget.files);
            e.currentTarget.value = '';
          }}
        />
      </label>

      {uploading.length > 0 && (
        <div className="space-y-2 rounded-md border bg-card p-3 text-sm">
          {uploading.map((u) => (
            <div key={u.name} className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <span className="flex-1 truncate">{u.name}</span>
              <span className="text-xs text-muted-foreground">{u.progress}%</span>
            </div>
          ))}
        </div>
      )}

      {photosQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando fotos…</p>
      ) : photosQuery.data && photosQuery.data.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photosQuery.data
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((photo) => (
              <li
                key={photo.id}
                className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                {photo.thumbSmallUrl ? (
                  // El dominio del bucket es dinámico (MinIO/R2). next/image
                  // requiere registrarlo en next.config — usamos <img> mientras.
                  <img
                    src={photo.thumbSmallUrl}
                    alt={photo.caption ?? 'Foto'}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    {photo.status === 'failed' ? (
                      <X className="size-6" aria-hidden />
                    ) : (
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                    )}
                    <span className="text-[11px] uppercase tracking-wide">{photo.status}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('¿Eliminar esta foto?')) deleteMutation.mutate(photo.id);
                  }}
                  className="absolute right-1 top-1 rounded-md bg-background/80 p-1 opacity-0 transition group-hover:opacity-100"
                  aria-label="Eliminar foto"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <ImageIcon className="size-4" aria-hidden /> Aún no hay fotos cargadas.
        </p>
      )}
    </div>
  );
}

/**
 * Lee el width/height de una imagen sin cargarla completa en memoria.
 * Si falla (decoder no soportado), devuelve null y el server lo deduce con sharp.
 */
async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      URL.revokeObjectURL(url);
      resolve(w > 0 && h > 0 ? { width: w, height: h } : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
