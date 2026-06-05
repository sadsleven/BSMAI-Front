export type FileOwnerType = 'order';

export const ORDER_REPORT_KIND = 'order_report_attachment';

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
