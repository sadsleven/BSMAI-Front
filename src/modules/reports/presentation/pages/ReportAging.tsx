import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock4, AlertCircle, TrendingDown, Hourglass } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { accountsReceivableGateway } from '@/modules/accounts-receivable/infrastructure/accountsReceivableGateway';
import { accountsPayableGateway } from '@/modules/accounts-payable/infrastructure/accountsPayableGateway';
import {
  collectedUsd as arCollectedUsd,
  targetUsd as arTargetUsd,
} from '@/modules/accounts-receivable/domain/models/accountsReceivable';
import {
  paidUsd as apPaidUsd,
  recipientName,
  amountToReceiveUsd as apTargetUsd,
} from '@/modules/accounts-payable/domain/models/accountsPayable';
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { formatUsd, formatNumber, daysBetween } from '../../domain/format';
import { REPORT_PAGE_SIZE } from '../../infrastructure/fetchAll';
import { getHttpErrorMessage } from '@/lib/api';

type Mode = 'receivable' | 'payable';
type Row = {
  partyId: string;
  name: string;
  b0_30: number;
  b31_60: number;
  b61_90: number;
  b90: number;
  total: number;
  count: number;
};

function bucketize(days: number): 'b0_30' | 'b31_60' | 'b61_90' | 'b90' {
  if (days <= 30) return 'b0_30';
  if (days <= 60) return 'b31_60';
  if (days <= 90) return 'b61_90';
  return 'b90';
}

export function ReportAging() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      mode: (sp.get('mode') ?? 'receivable') as Mode,
      search: sp.get('search') ?? '',
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [arRows, setArRows] = useState<
    Awaited<ReturnType<typeof accountsReceivableGateway.list>>['data']
  >([]);
  const [apRows, setApRows] = useState<
    Awaited<ReturnType<typeof accountsPayableGateway.list>>['data']
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCap, setOverCap] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      accountsReceivableGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
      accountsPayableGateway.list({ limit: REPORT_PAGE_SIZE, page: 1, sortDir: 'DESC' }),
    ])
      .then(([ar, ap]) => {
        if (cancelled) return;
        setArRows(ar.data);
        setApRows(ap.data);
        setOverCap(
          ar.metadata.total > REPORT_PAGE_SIZE || ap.metadata.total > REPORT_PAGE_SIZE,
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
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput === filters.search) return;
      const next = new URLSearchParams(sp);
      if (searchInput) next.set('search', searchInput);
      else next.delete('search');
      setSp(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, filters.search, sp, setSp]);

  const updateParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    setSp(next, { replace: true });
  };

  const aggregated = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    if (filters.mode === 'receivable') {
      arRows.forEach((ar) => {
        const tgt = arTargetUsd(ar) ?? 0;
        const collected = arCollectedUsd(ar);
        const pending = Math.max(0, tgt - collected);
        if (pending <= 0.01) return;
        const days = daysBetween(ar.createdAt ?? new Date().toISOString());
        const b = bucketize(days);
        const id = ar.insuranceId;
        if (!id) return;
        let row = map.get(id);
        if (!row) {
          row = {
            partyId: id,
            name: ar.insurance?.name ?? '—',
            b0_30: 0,
            b31_60: 0,
            b61_90: 0,
            b90: 0,
            total: 0,
            count: 0,
          };
          map.set(id, row);
        }
        row[b] += pending;
        row.total += pending;
        row.count += 1;
      });
    } else {
      apRows.forEach((ap) => {
        const tgt = apTargetUsd(ap) ?? 0;
        const paid = apPaidUsd(ap);
        const pending = Math.max(0, tgt - paid);
        if (pending <= 0.01) return;
        const days = daysBetween(ap.createdAt ?? new Date().toISOString());
        const b = bucketize(days);
        const id = ap.recipientType === 'doctor' ? `doctor:${ap.doctorId}` : `cc:${ap.careCenterId}`;
        let row = map.get(id);
        if (!row) {
          row = {
            partyId: id,
            name: recipientName(ap),
            b0_30: 0,
            b31_60: 0,
            b61_90: 0,
            b90: 0,
            total: 0,
            count: 0,
          };
          map.set(id, row);
        }
        row[b] += pending;
        row.total += pending;
        row.count += 1;
      });
    }
    const result = Array.from(map.values());
    const s = filters.search.toLowerCase().trim();
    const filtered = s ? result.filter((r) => r.name.toLowerCase().includes(s)) : result;
    return filtered.sort((a, b) => b.total - a.total);
  }, [arRows, apRows, filters.mode, filters.search]);

  const totals = useMemo(() => {
    let b0_30 = 0;
    let b31_60 = 0;
    let b61_90 = 0;
    let b90 = 0;
    aggregated.forEach((r) => {
      b0_30 += r.b0_30;
      b31_60 += r.b31_60;
      b61_90 += r.b61_90;
      b90 += r.b90;
    });
    return { b0_30, b31_60, b61_90, b90, total: b0_30 + b31_60 + b61_90 + b90 };
  }, [aggregated]);

  const hasActiveFilters = !!filters.search || filters.mode !== 'receivable';
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  return (
    <ReportShell
      title="Antigüedad de saldos"
      description={`Distribución del saldo pendiente por días — modo ${filters.mode === 'receivable' ? 'cuentas por cobrar' : 'cuentas por pagar'}`}
      kpis={
        <KpiRow
          items={[
            {
              icon: Hourglass,
              tone: 'success',
              label: '0–30 días',
              value: formatUsd(totals.b0_30),
            },
            {
              icon: Clock4,
              tone: 'cyan',
              label: '31–60 días',
              value: formatUsd(totals.b31_60),
            },
            {
              icon: TrendingDown,
              tone: 'warning',
              label: '61–90 días',
              value: formatUsd(totals.b61_90),
            },
            {
              icon: AlertCircle,
              tone: 'destructive',
              label: 'Más de 90 días',
              value: formatUsd(totals.b90),
            },
          ]}
        />
      }
    >
      {overCap ? (
        <div className="px-4 py-2 text-xs text-warning border border-warning-soft bg-warning-soft rounded-lg">
          Mostrando hasta {REPORT_PAGE_SIZE} cuentas por lado. Aplicá filtros para acotar el reporte.
        </div>
      ) : null}

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={
            filters.mode === 'receivable' ? 'Buscar aseguradora…' : 'Buscar proveedor…'
          }
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <Select value={filters.mode} onValueChange={(v) => updateParam({ mode: v })}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="receivable">Cuentas por cobrar</SelectItem>
                <SelectItem value="payable">Cuentas por pagar</SelectItem>
              </SelectContent>
            </Select>
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {filters.mode === 'receivable' ? 'Aseguradora' : 'Proveedor'}
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Cuentas</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">0–30 días</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">31–60</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">61–90</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">+90</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Total pendiente</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={7} />
            ) : aggregated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={Clock4}
                    title="Sin saldos pendientes"
                    description="No hay deudas pendientes en este momento."
                  />
                </TableCell>
              </TableRow>
            ) : (
              aggregated.map((r) => (
                <TableRow key={r.partyId} className="hover:bg-[oklch(0.985_0.003_250)]">
                  <TableCell className="py-3.5 px-4 text-sm font-medium">{r.name}</TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                    {formatNumber(r.count)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                    {formatUsd(r.b0_30)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-brand-blue-strong">
                    {formatUsd(r.b31_60)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-warning">
                    {formatUsd(r.b61_90)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-destructive">
                    {formatUsd(r.b90)}
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-sm font-mono text-right font-semibold">
                    {formatUsd(r.total)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </ReportShell>
  );
}
