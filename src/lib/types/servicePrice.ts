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
  /**
   * Clave estable de fila para React (sólo cliente). Las filas nuevas (sin `id`
   * del BE) la reciben al crearse para evitar remontajes al editar/paginar. Zod la
   * descarta al validar y `servicePricesToPayload` la ignora; nunca llega al BE.
   */
  _rk?: string;
}

export interface ServicePricePayload {
  serviceTypeId: string;
  priceUsd: number;
}
