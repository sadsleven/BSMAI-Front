import { useEffect, useState } from 'react';
import { taxUnitGateway } from '@/modules/tax-units/infrastructure/taxUnitGateway';
import type { TaxUnit } from '@/modules/tax-units/domain/models/taxUnit';

let cached: TaxUnit | null | undefined = undefined;
let pending: Promise<TaxUnit | null> | null = null;

async function loadCurrent(): Promise<TaxUnit | null> {
  if (cached !== undefined) return cached ?? null;
  if (!pending) {
    pending = taxUnitGateway
      .getCurrent()
      .then((ut) => {
        cached = ut ?? null;
        return cached;
      })
      .catch(() => {
        cached = null;
        return null;
      });
  }
  return pending;
}

/** Invalida el caché — útil tras crear/editar/borrar UT en el módulo CRUD. */
export function invalidateTaxUnitCache(): void {
  cached = undefined;
  pending = null;
}

/** Hook: UT vigente al día de hoy. `null` si no hay UT configurada. */
export function useTaxUnit(): { taxUnit: TaxUnit | null; isLoading: boolean } {
  const [taxUnit, setTaxUnit] = useState<TaxUnit | null>(cached ?? null);
  const [isLoading, setIsLoading] = useState(cached === undefined);

  useEffect(() => {
    let cancelled = false;
    if (cached !== undefined) {
      setTaxUnit(cached);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void loadCurrent().then((ut) => {
      if (cancelled) return;
      setTaxUnit(ut);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { taxUnit, isLoading };
}
