import { useEffect, useState } from 'react';
import { DollarSign, Euro } from 'lucide-react';
import { exchangeRateGateway } from '@/modules/exchange-rates/infrastructure/exchangeRateGateway';
import type {
  Currency,
  ExchangeRate,
} from '@/modules/exchange-rates/domain/models/exchangeRate';
import { formatBs } from '@/modules/exchange-rates/presentation/utils/format';
import { usePermissions } from '@/modules/auth/presentation/hooks/usePermissions';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { cn } from '@/lib/utils';

type Summary = Record<Currency, ExchangeRate | null>;

/**
 * Compact pills mostrando la última tasa USD y EUR. Hidden en mobile (`hidden md:flex`)
 * y se posiciona a la izquierda del botón de notificaciones en el navbar.
 */
export function ExchangeRatesBadge() {
  const { has } = usePermissions();
  const canSee = has(PERMISSIONS.EXCHANGE_RATES.LIST);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (!canSee) return;
    let cancelled = false;
    exchangeRateGateway
      .getCurrentSummary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canSee]);

  if (!canSee || !summary) return null;
  if (!summary.USD && !summary.EUR) return null;

  return (
    <div className="hidden md:flex items-center gap-1.5 mr-1">
      <RatePill
        currency="USD"
        rate={summary.USD}
        Icon={DollarSign}
        title="Última tasa USD"
      />
      <RatePill
        currency="EUR"
        rate={summary.EUR}
        Icon={Euro}
        title="Última tasa EUR"
      />
    </div>
  );
}

function RatePill({
  currency,
  rate,
  Icon,
  title,
}: {
  currency: Currency;
  rate: ExchangeRate | null;
  Icon: typeof DollarSign;
  title: string;
}) {
  if (!rate) return null;
  const tone =
    currency === 'USD'
      ? 'bg-success-soft text-success'
      : 'bg-brand-blue-soft text-brand-blue-strong';
  return (
    <div
      title={`${title}: ${new Date(rate.effectiveDate).toLocaleString('es-VE')}`}
      className={cn(
        'inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md text-xs font-semibold whitespace-nowrap',
        tone,
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="font-mono">{formatBs(rate.amountBs)}</span>
      <span className="hidden lg:inline text-[10px] opacity-70 font-medium">
        / {currency}
      </span>
    </div>
  );
}
