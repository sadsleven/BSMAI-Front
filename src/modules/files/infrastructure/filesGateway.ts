import { api } from '@/lib/api';
import type { FileOwnerType, UploadOptions, UploadedFile } from '../domain/models/file';

/**
 * Único punto de entrada FE para subir/listar/borrar archivos.
 *
 * Upload server-side: el binario viaja al backend (multipart) y el backend
 * proxea al storage. Credenciales del proveedor (Vercel Blob token) NUNCA
 * salen del servidor.
 *
 * Swap a MinIO/S3: este archivo NO cambia mientras la API REST se mantenga
 * (`POST /files`, `GET /files`, `DELETE /files/:id`). El único cambio vive
 * en el `StorageProvider` del backend.
 */
export const filesGateway = {
  async upload(file: File, opts: UploadOptions): Promise<UploadedFile> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('ownerType', opts.ownerType);
    form.append('ownerId', opts.ownerId);
    if (opts.kind) form.append('kind', opts.kind);

    const { data } = await api.post<UploadedFile>('/files', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: opts.onProgress
        ? (e) => {
            if (!e.total) return;
            opts.onProgress?.((e.loaded / e.total) * 100);
          }
        : undefined,
    });
    return data;
  },

  async list(ownerType: FileOwnerType, ownerId: string, kind?: string): Promise<UploadedFile[]> {
    const { data } = await api.get<UploadedFile[]>('/files', {
      params: { ownerType, ownerId, ...(kind ? { kind } : {}) },
    });
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/files/${id}`);
  },

  /**
   * Descarga el binario via BE proxy. El blob es privado en el storage; el
   * BE adjunta el token y stremea. Devuelve una object URL que el caller
   * debe `URL.revokeObjectURL()` cuando termine de usar.
   */
  async openInNewTab(id: string): Promise<void> {
    const res = await api.get<Blob>(`/files/${id}/download`, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(res.data);
    const win = window.open(objectUrl, '_blank', 'noopener,noreferrer');
    // Si el browser bloqueó el popup, gatillamos descarga vía link efímero.
    if (!win) {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.rel = 'noopener noreferrer';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  },
};
