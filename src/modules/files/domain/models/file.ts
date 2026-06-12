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
 * Tope global por archivo: 4 MB. Espejado con `MAX_UPLOAD_SIZE_BYTES` del BE.
 * Limitado por el cap ~4.5 MB de Vercel Serverless al recibir multipart.
 */
export const MAX_UPLOAD_SIZE_BYTES = 4 * 1024 * 1024;

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
