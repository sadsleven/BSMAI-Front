export type FileOwnerType = 'order';

/** Adjuntos generales del informe (nivel orden). */
export const ORDER_REPORT_KIND = 'order_report_attachment';

/** Prefijo común de todos los `kind` de adjuntos de informe (Paso 3). */
export const ORDER_REPORT_KIND_PREFIX = 'order_report';

/** `kind` de los adjuntos del informe de un proveedor específico (espejado en BE). */
export function orderReportProviderKind(
  providerType: 'doctor' | 'care_center',
  providerId: string,
): string {
  return `${ORDER_REPORT_KIND_PREFIX}:${providerType}:${providerId}`;
}

/**
 * Tope por archivo, en MB, desde `VITE_MAX_UPLOAD_SIZE_MB` (default 4).
 * Debe coincidir con `MAX_UPLOAD_SIZE_MB` del BE — el FE sólo pre-valida para
 * no gastar la subida; la autoridad es el backend. El default 4 viene del cap
 * ~4.5 MB del deploy en Vercel; en el servidor con MinIO se puede subir.
 */
function resolveMaxUploadMb(): number {
  const raw = Number(import.meta.env.VITE_MAX_UPLOAD_SIZE_MB);
  return Number.isFinite(raw) && raw > 0 ? raw : 4;
}

export const MAX_UPLOAD_SIZE_MB = resolveMaxUploadMb();
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

/**
 * Extensiones aceptadas en los adjuntos del informe (Paso 3). Espejo de
 * `ORDER_REPORT_ALLOWED_MIME` del BE: PDF, imágenes, Word y Excel.
 */
export const ORDER_REPORT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.docx,.doc';

export interface UploadedFile {
  id: string;
  storageProvider: string;
  pathname: string;
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: string | number;
  ownerType: FileOwnerType;
  ownerId: string;
  kind: string | null;
  uploadedById: string;
  uploadedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
}

export interface UploadOptions {
  ownerType: FileOwnerType;
  ownerId: string;
  kind?: string;
  onProgress?: (percent: number) => void;
}
