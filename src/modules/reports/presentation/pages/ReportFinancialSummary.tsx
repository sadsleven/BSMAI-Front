import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  PercentCircle,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { accountsReceivableGateway } from '@/modules/accounts-receivable/infrastructure/accountsReceivableGateway';
import { accountsPayableGateway } from '@/modules/accounts-payable/infrastructure/accountsPayableGateway';
import { taxesPayableGateway } from '@/modules/taxes-payable/infrastructure/taxesPayableGateway';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import {
  formatUsd,
  formatMonth,
  formatPercent,
  inDateRange,
  monthBucket,
} from '../../domain/format';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { bsToUsd, useUsdRate } from '../../domain/useUsdRate';
import { getHttpErrorMessage } from '@/lib/api';

type PaymentRow = { date: string; amountInUsd: number };
type Bucket = {
  month: string;
  income: number;
  providerExpense: number;
  taxExpense: number;
};

export function ReportFinancialSummary() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({ from: sp.get('from') ?? '', to: sp.get('to') ?? '' }),
    [sp],
  );
  const [arPayments, setArPayments] = useState<PaymentRow[]>([]);
  const [apPayments, setApPayments] = useState<PaymentRow[]>([]);
  const [taxPayments, setTaxPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(false);
  const usdRate = useUsdRate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      accountsReceivableGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
      accountsPayableGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
      taxesPayableGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
    ])
      .then(([arRes, apRes, taxRes]) => {
        if (cancelled) return;
        setOverCap(
          arRes.metadata.total > REPORT_PAGE_SIZE ||
            apRes.metadata.total > REPORT_PAGE_SIZE ||
            taxRes.metadata.total > REPORT_PAGE_SIZE,
        );
        setArPayments(
          arRes.data.flatMap((a) =>
            (a.payments ?? []).map((p) => ({
              date: p.paymentDate,
              amountInUsd: Number(p.amountInUsd || 0),
            })),
          ),
        );
        setApPayments(
          apRes.data.flatMap((a) =>
            (a.payments ?? []).map((p) => ({
              date: p.paymentDate,
              amountInUsd: Number(p.amountInUsd || 0),
            })),
          ),
        );
        setTaxPayments(
          taxRes.data.flatMap((a) =>
            (a.payments ?? []).map((p) => ({
              date: p.paymentDate,
              amountInUsd: bsToUsd(p.amountInBs, usdRate),
            })),
          ),
        );
      })
      .catch((e) => {
        if (!cancelled) setError(getHttpErrorMessage(e, 'No se pudo cargar el reporte'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [usdRate]);

  const buckets = useMemo<Bucket[]>(() => {
    const map = new Map<string, Bucket>();
    const ensure = (m: string): Bucket => {
      let b = map.get(m);
      if (!b) {
        b = { month: m, income: 0, providerExpense: 0, taxExpense: 0 };
        map.set(m, b);
      }
      return b;
    };
    const within = (d: string) => inDateRange(d, filters.from || undefined, filters.to || undefined);
    arPayments.forEach((p) => {
      if (!within(p.date)) return;
      ensure(monthBucket(p.date)).income += p.amountInUsd;
    });
    apPayments.forEach((p) => {
      if (!within(p.date)) return;
      ensure(monthBucket(p.date)).providerExpense += p.amountInUsd;
    });
    taxPayments.forEach((p) => {
      if (!within(p.date)) return;
      ensure(monthBucket(p.date)).taxExpense += p.amountInUsd;
    });
    return Array.from(map.values()).sort((a, b) => (a.month < b.month ? 1 : -1));
  }, [arPayments, apPayments, taxPayments, filters.from, filters.to]);

  const totals = useMemo(() => {
    let income = 0;
    let providerExpense = 0;
    let taxExpense = 0;
    buckets.forEach((b) => {
      income += b.income;
      providerExpense += b.providerExpense;
      taxExpense += b.taxExpense;
    });
    const expense = providerExpense + taxExpense;
    const net = income - expense;
    const margin = income > 0 ? (net / income) * 100 : 0;
    return { income, providerExpense, taxExpense, expense, net, margin };
  }, [buckets]);

  const updateParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSp(next, { replace: true });
  };

  const hasActiveFilters = !!filters.from || !!filters.to;
  const clearFilters = () => setSp(new URLSearchParams(), { replace: true });

  return (
    <ReportShell
      title="Resumen financiero"
      description="Ingresos vs egresos mensuales — basado en pagos efectivamente registrados"
      kpis={
        <KpiRow
          items={[
            {
              icon: ArrowDownCircle,
              tone: 'success',
              label: 'Ingresos',
              value: formatUsd(totals.income),
              hint: 'Cobros recibidos',
            },
            {
              icon: ArrowUpCircle,
              tone: 'destructive',
              label: 'Egresos',
              value: formatUsd(totals.expense),
              hint: `Proveedores ${formatUsd(totals.providerExpense)} · Impuestos ${formatUsd(totals.taxExpense)}`,
            },
            {
              icon: BarChart3,
              tone: totals.net >= 0 ? 'blue' : 'destructive',
              label: 'Resultado neto',
              value: formatUsd(totals.net),
            },
            {
              icon: PercentCircle,
              tone: 'cyan',
              label: 'Margen',
              value: formatPercent(totals.margin),
              hint: 'Neto sobre ingresos',
            },
          ]}
        />
      }
    >
      {overCap ? (
        <div className="px-4 py-2 text-xs text-warning border border-warning-soft bg-warning-soft rounded-lg">
          Mostrando hasta {REPORT_PAGE_SIZE} registros por tabla. Aplicá filtros para acotar el reporte.
        </div>
      ) : null}

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <DateRangeFilter
              from={filters.from || undefined}
              to={filters.to || undefined}
              onChange={(f, t) => updateParam({ from: f, to: t })}
            />
          }
        />

        {error ? (
          <div className="px-4 py-2 text-sm text-destructive border-b bg-destructive-soft">
            {error}
          </div>
        ) : null}

        <div className="m-4 rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Mes</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Ingresos</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Egresos a proveedores</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Egresos a impuestos</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Total egresos</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Resultado neto</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Margen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={5} columns={7} />
            ) : buckets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={BarChart3}
                    title={hasActiveFilters ? 'Sin movimientos' : 'Sin pagos registrados'}
                    description={
                      hasActiveFilters
                        ? 'No hay pagos registrados en ese rango de fechas.'
                        : 'Aún no se han registrado cobros ni pagos en el sistema.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              buckets.map((b) => {
                const exp = b.providerExpense + b.taxExpense;
                const net = b.income - exp;
                const margin = b.income > 0 ? (net / b.income) * 100 : 0;
                return (
                  <TableRow key={b.month} className="hover:bg-[oklch(0.985_0.003_250)]">
                    <TableCell className="py-3.5 px-4 text-sm font-medium capitalize">
                      {formatMonth(b.month)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                      {formatUsd(b.income)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatUsd(b.providerExpense)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatUsd(b.taxExpense)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-destructive">
                      {formatUsd(exp)}
                    </TableCell>
                    <TableCell
                      className={`py-3.5 px-4 text-sm font-mono text-right ${net >= 0 ? 'text-foreground' : 'text-destructive'}`}
                    >
                      {formatUsd(net)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-muted-foreground">
                      {formatPercent(margin)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </ReportShell>
  );
}
