import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, TrendingUp, Crown, Wallet } from 'lucide-react';
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
import { ReportShell } from '../components/ReportShell';
import { KpiRow } from '../components/KpiCard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { formatUsd, formatBs, formatNumber, formatPercent } from '../../domain/format';
import {
  reportsGateway,
  type ReportReceivableDebtorRow,
} from '../../infrastructure/reportsGateway';
import { getHttpErrorMessage } from '@/lib/api';

export function ReportInsuranceProduction() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(
    () => ({
      from: sp.get('from') ?? '',
      to: sp.get('to') ?? '',
      search: sp.get('search') ?? '',
    }),
    [sp],
  );
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<ReportReceivableDebtorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await reportsGateway.receivablesByDebtor({
          groupBy: 'insurance',
          from: filters.from || undefined,
          to: filters.to || undefined,
        });
        if (cancelled) return;
        setRows(res.rows);
      } catch (e) {
        if (!cancelled) setError(getHttpErrorMessage(e, 'No se pudo cargar el reporte'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.from, filters.to]);

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

  const filtered = useMemo(() => {
    const s = filters.search.toLowerCase().trim();
    return rows
      .filter((r) => !s || r.debtorName.toLowerCase().includes(s))
      .sort((a, b) => b.targetUsd - a.targetUsd);
  }, [rows, filters.search]);

  const totals = useMemo(() => {
    let billed = 0;
    let collected = 0;
    let pending = 0;
    let orders = 0;
    filtered.forEach((r) => {
      billed += r.targetUsd;
      collected += r.collectedUsd;
      pending += r.pendingUsd;
      orders += r.ordersCount;
    });
    return { billed, collected, pending, orders };
  }, [filtered]);

  const top = filtered[0];
  const hasActiveFilters = !!filters.search || !!filters.from || !!filters.to;
  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  return (
    <ReportShell
      title="Producción por aseguradora"
      description="Volumen y recaudo por cada compañía de seguros"
      kpis={
        <KpiRow
          items={[
            {
              icon: ShieldCheck,
              tone: 'blue',
              label: 'Aseguradoras activas',
              value: formatNumber(filtered.length),
              hint: `${formatNumber(totals.orders)} órdenes`,
            },
            {
              icon: Wallet,
              tone: 'cyan',
              label: 'Total facturado',
              value: formatUsd(totals.billed),
            },
            {
              icon: TrendingUp,
              tone: 'success',
              label: 'Cobrado',
              value: formatUsd(totals.collected),
              hint: `${totals.billed > 0 ? formatPercent((totals.collected / totals.billed) * 100) : '—'}`,
            },
            {
              icon: Crown,
              tone: 'warning',
              label: 'Top aseguradora',
              value: top ? top.debtorName : '—',
              hint: top ? formatUsd(top.targetUsd) : undefined,
            },
          ]}
        />
      }
    >
      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar aseguradora…"
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
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">#</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Aseguradora</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Órdenes</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Lotes</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Facturado USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Facturado Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Cobrado USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Cobrado Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Pendiente USD</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Pendiente Bs.</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">% Cobranza</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={6} columns={11} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="p-0">
                  <EmptyState
                    icon={ShieldCheck}
                    title={hasActiveFilters ? 'Sin resultados' : 'Sin actividad de aseguradoras'}
                    description={
                      hasActiveFilters
                        ? 'Ajusta los filtros para ver más resultados.'
                        : 'Aún no hay órdenes de aseguradoras por cobrar.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r, idx) => {
                const pct = r.targetUsd > 0 ? (r.collectedUsd / r.targetUsd) * 100 : 0;
                return (
                  <TableRow
                    key={`${r.debtorType}:${r.debtorId}`}
                    className="hover:bg-[oklch(0.985_0.003_250)]"
                  >
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-medium">
                      {r.debtorName}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatNumber(r.ordersCount)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatNumber(r.lotesCount)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatUsd(r.targetUsd)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right">
                      {formatBs(r.targetBs)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                      {formatUsd(r.collectedUsd)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-success">
                      {formatBs(r.collectedBs)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-warning">
                      {formatUsd(r.pendingUsd)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-warning">
                      {formatBs(r.pendingBs)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono text-right text-muted-foreground">
                      {formatPercent(pct)}
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
