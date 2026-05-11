import { useEffect, useState } from 'react';
import { CurrencyAmountInput } from '@/components/ui/currency-amount-input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { insuranceGateway } from '@/modules/insurances/infrastructure/insuranceGateway';
import type { Insurance } from '@/modules/insurances/domain/models/insurance';
import { notify } from '@/lib/notifications/toast';
import { Shield, UserCircle } from 'lucide-react';
import type { ServiceTypePricePayload } from '../../domain/models/serviceType';

export type ServiceTypePricesValue = {
  /** insuranceId === '' representa "Particular" */
  rows: Array<{ insuranceId: string; priceUsd?: number; priceEur?: number }>;
};

export type ServiceTypePricesInputProps = {
  /** Lista normalizada (1 fila Particular + 1 fila por seguro). Manejada externamente. */
  value: ServiceTypePricesValue['rows'];
  onChange: (next: ServiceTypePricesValue['rows']) => void;
};

const PARTICULAR_KEY = '';

/** Convierte el array que viene del BE/form al shape interno (1 fila por seguro + Particular). */
export function buildPriceRows(
  existing: Array<{ insuranceId?: string | null; priceUsd?: string | number | null; priceEur?: string | number | null }>,
  insurances: Insurance[],
): ServiceTypePricesValue['rows'] {
  const byKey = new Map<string, { priceUsd?: number; priceEur?: number }>();
  for (const p of existing) {
    const key = p.insuranceId ?? PARTICULAR_KEY;
    byKey.set(key, {
      priceUsd: p.priceUsd === null || p.priceUsd === undefined ? undefined : Number(p.priceUsd),
      priceEur: p.priceEur === null || p.priceEur === undefined ? undefined : Number(p.priceEur),
    });
  }
  const out: ServiceTypePricesValue['rows'] = [];
  out.push({ insuranceId: PARTICULAR_KEY, ...(byKey.get(PARTICULAR_KEY) ?? {}) });
  for (const ins of insurances) {
    out.push({ insuranceId: ins.id, ...(byKey.get(ins.id) ?? {}) });
  }
  return out;
}

/** Convierte el shape interno al payload del BE: filtra filas sin USD ni EUR. */
export function pricesToPayload(rows: ServiceTypePricesValue['rows']): ServiceTypePricePayload[] {
  return rows
    .filter((r) => r.priceUsd !== undefined || r.priceEur !== undefined)
    .map((r) => ({
      insuranceId: r.insuranceId === PARTICULAR_KEY ? undefined : r.insuranceId,
      priceUsd: r.priceUsd,
      priceEur: r.priceEur,
    }));
}

export function ServiceTypePricesInput({ value, onChange }: ServiceTypePricesInputProps) {
  const [insurances, setInsurances] = useState<Insurance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    insuranceGateway
      .listAssignable()
      .then((list) => {
        if (cancelled) return;
        setInsurances(list);
      })
      .catch((e) => notify.fromError(e, 'No se pudieron cargar los seguros.'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Si la lista interna no está sincronizada con la lista de seguros, normaliza una vez al cargar.
  useEffect(() => {
    if (loading) return;
    const present = new Set(value.map((r) => r.insuranceId));
    const expected = new Set([PARTICULAR_KEY, ...insurances.map((i) => i.id)]);
    const sameKeys =
      present.size === expected.size && [...present].every((k) => expected.has(k));
    if (sameKeys) return;
    const next: ServiceTypePricesValue['rows'] = [];
    const particular = value.find((r) => r.insuranceId === PARTICULAR_KEY);
    next.push(particular ?? { insuranceId: PARTICULAR_KEY });
    for (const ins of insurances) {
      const existing = value.find((r) => r.insuranceId === ins.id);
      next.push(existing ?? { insuranceId: ins.id });
    }
    onChange(next);
  }, [loading, insurances, value, onChange]);

  const update = (
    insuranceId: string,
    field: 'priceUsd' | 'priceEur',
    next: number | undefined,
  ) => {
    onChange(
      value.map((r) =>
        r.insuranceId === insuranceId ? { ...r, [field]: next } : r,
      ),
    );
  };

  if (loading) {
    return <Skeleton className="h-24 w-full" />;
  }

  const rowFor = (key: string) => value.find((r) => r.insuranceId === key);

  const renderRow = (
    key: string,
    label: string,
    sub: string | undefined,
    icon: React.ReactNode,
  ) => {
    const row = rowFor(key);
    return (
      <div
        key={key || 'particular'}
        className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px_180px] gap-3 items-center px-3 py-3 border-b last:border-b-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{label}</div>
            {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            USD
          </Label>
          <CurrencyAmountInput
            value={row?.priceUsd}
            onChange={(v) => update(key, 'priceUsd', v)}
            currencyPrefix="USD"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            EUR
          </Label>
          <CurrencyAmountInput
            value={row?.priceEur}
            onChange={(v) => update(key, 'priceEur', v)}
            currencyPrefix="EUR"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-lg border bg-card">
      {renderRow(
        PARTICULAR_KEY,
        'Particular',
        'Precio sin seguro',
        <UserCircle className="w-4 h-4 text-muted-foreground" />,
      )}
      {insurances.length === 0 ? (
        <div className="px-3 py-4 text-sm text-muted-foreground italic">
          No hay seguros activos. Creá un seguro para asignarle precio.
        </div>
      ) : (
        insurances.map((ins) =>
          renderRow(
            ins.id,
            ins.name,
            ins.description ?? undefined,
            <Shield className="w-4 h-4 text-muted-foreground" />,
          ),
        )
      )}
    </div>
  );
}
