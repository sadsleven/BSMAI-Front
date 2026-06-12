import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, X, FileText, Loader2, Eye } from 'lucide-react';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { filesGateway } from '../../infrastructure/filesGateway';
import { MAX_UPLOAD_SIZE_BYTES, type FileOwnerType, type UploadedFile } from '../../domain/models/file';

type PendingUpload = {
  key: string;
  name: string;
  size: number;
  progress: number;
  error?: string;
};

/**
 * Reusable dropzone con upload directo a Vercel Blob via `filesGateway`.
 * Lista archivos existentes (vía `GET /files`), permite subir nuevos y borrar.
 */
export function FileDropzone({
  ownerType,
  ownerId,
  kind,
  accept,
  multiple = true,
  disabled = false,
  readOnly = false,
  maxSizeBytes = MAX_UPLOAD_SIZE_BYTES,
  onChange,
}: {
  ownerType: FileOwnerType;
  ownerId: string;
  kind?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Vista de sólo lectura: oculta el dropzone y el botón de eliminar; sólo abrir. */
  readOnly?: boolean;
  maxSizeBytes?: number;
  onChange?: (files: UploadedFile[]) => void;
}) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<Record<string, boolean>>({});
  const [opening, setOpening] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await filesGateway.list(ownerType, ownerId, kind);
      setFiles(list);
      onChange?.(list);
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudieron cargar los archivos'));
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId, kind, onChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFiles = async (list: FileList | null) => {
    if (!list || disabled) return;
    const incoming = Array.from(list);
    if (inputRef.current) inputRef.current.value = '';

    for (const file of incoming) {
      if (file.size > maxSizeBytes) {
        notify.error(`"${file.name}" supera el tamaño máximo (${formatBytes(maxSizeBytes)})`);
        continue;
      }
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      setPending((p) => [...p, { key, name: file.name, size: file.size, progress: 0 }]);
      try {
        await filesGateway.upload(file, {
          ownerType,
          ownerId,
          kind,
          onProgress: (pct) =>
            setPending((p) => p.map((u) => (u.key === key ? { ...u, progress: pct } : u))),
        });
        setPending((p) => p.filter((u) => u.key !== key));
      } catch (err) {
        const msg = getHttpErrorMessage(err, 'No se pudo subir el archivo');
        notify.error(`${file.name}: ${msg}`);
        setPending((p) => p.map((u) => (u.key === key ? { ...u, error: msg } : u)));
      }
    }
    await refresh();
  };

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

  const onRemove = async (id: string) => {
    setRemoving((r) => ({ ...r, [id]: true }));
    try {
      await filesGateway.remove(id);
      notify.success('Archivo eliminado');
      await refresh();
    } catch (err) {
      notify.error(getHttpErrorMessage(err, 'No se pudo eliminar el archivo'));
    } finally {
      setRemoving((r) => {
        const { [id]: _, ...rest } = r;
        return rest;
      });
    }
  };

  const dismissPending = (key: string) =>
    setPending((p) => p.filter((u) => u.key !== key));

  return (
    <div className="space-y-2">
      {!readOnly && (
        <label
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 transition-colors ${
            disabled
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer hover:bg-muted/40'
          }`}
          onDragOver={(e) => {
            if (!disabled) e.preventDefault();
          }}
          onDrop={(e) => {
            if (disabled) return;
            e.preventDefault();
            void handleFiles(e.dataTransfer.files);
          }}
        >
          <Upload className="w-6 h-6 text-muted-foreground" />
          <span className="text-sm">Arrastrá o haz click para subir</span>
          <span className="text-xs text-muted-foreground">
            Máximo {formatBytes(maxSizeBytes)} por archivo
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple={multiple}
            accept={accept}
            disabled={disabled}
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>
      )}

      {readOnly && !loading && files.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Sin archivos adjuntos.
        </p>
      )}

      {(loading || files.length > 0 || pending.length > 0) && (
        <ul className="space-y-1.5 mt-2">
          {pending.map((u) => (
            <li
              key={u.key}
              className="flex items-center gap-2 text-sm rounded-md border bg-muted/40 px-3 py-2"
            >
              <Loader2 className="w-4 h-4 text-muted-foreground shrink-0 animate-spin" />
              <span className="truncate flex-1">{u.name}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(u.size)}</span>
              {u.error ? (
                <span className="text-xs text-destructive">{u.error}</span>
              ) : (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(u.progress)}%
                </span>
              )}
              {u.error && (
                <button
                  type="button"
                  onClick={() => dismissPending(u.key)}
                  className="p-1 rounded hover:bg-destructive-soft hover:text-destructive transition-colors"
                  aria-label="Descartar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}

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
              {!disabled && !readOnly && (
                <button
                  type="button"
                  onClick={() => void onRemove(f.id)}
                  disabled={removing[f.id]}
                  className="p-1 rounded hover:bg-destructive-soft hover:text-destructive transition-colors disabled:opacity-50"
                  aria-label="Eliminar"
                >
                  {removing[f.id] ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </li>
          ))}

          {loading && files.length === 0 && pending.length === 0 && (
            <li className="text-xs text-muted-foreground py-2">Cargando archivos…</li>
          )}
        </ul>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
