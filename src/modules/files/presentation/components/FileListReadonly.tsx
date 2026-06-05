import { useCallback, useEffect, useState } from 'react';
import { FileText, Eye, Loader2 } from 'lucide-react';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { filesGateway } from '../../infrastructure/filesGateway';
import type { FileOwnerType, UploadedFile } from '../../domain/models/file';

/**
 * Lista de archivos de solo lectura: muestra los adjuntos del owner y permite
 * abrir cada uno via BE proxy (sin botones de subir/eliminar).
 */
export function FileListReadonly({
  ownerType,
  ownerId,
  kind,
  emptyLabel = 'Sin archivos adjuntos.',
}: {
  ownerType: FileOwnerType;
  ownerId: string;
  kind?: string;
  emptyLabel?: string;
}) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await filesGateway.list(ownerType, ownerId, kind);
      setFiles(list);
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudieron cargar los archivos'));
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const onOpen = async (id: string) => {
    setOpening((o) => ({ ...o, [id]: true }));
    try {
      await filesGateway.openInNewTab(id);
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo abrir el archivo'));
    } finally {
      setOpening((o) => {
        const { [id]: _, ...rest } = o;
        return rest;
      });
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground italic">Cargando archivos…</p>;
  }
  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground italic">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {files.map((f) => (
        <li
          key={f.id}
          className="flex items-center gap-2 text-sm rounded-md border bg-muted/40 px-3 py-2"
        >
          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="truncate flex-1" title={f.name}>
            {f.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatBytes(Number(f.sizeBytes))}
          </span>
          <button
            type="button"
            onClick={() => void onOpen(f.id)}
            disabled={opening[f.id]}
            className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
            aria-label="Abrir"
            title="Abrir en nueva pestaña"
          >
            {opening[f.id] ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
