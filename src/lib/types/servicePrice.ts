import type { ServiceType } from '@/modules/service-types/domain/models/serviceType';

/**
 * Fila de precio que un actor (Seguro, Doctor, Centro) carga por Tipo de Servicio.
 * Compartido entre los tres formularios. Sólo USD.
 */
export interface ServicePriceRow {
  id?: string;
  serviceTypeId: string;
  /** Eager desde BE; opcional para nuevas filas. */
  serviceType?: Pick<ServiceType, 'id' | 'name'>;
  priceUsd: number | string;
}

export interface ServicePricePayload {
  serviceTypeId: string;
  priceUsd: number;
}
