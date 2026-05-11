import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { SortableHeader, type SortDir } from '@/components/ui/sortable-header';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { notify } from '@/lib/notifications/toast';
import { getHttpErrorMessage } from '@/lib/api';
import { accountsReceivableGateway } from '../../infrastructure/accountsReceivableGateway';
import {
  STATUS_LABEL,
  type AccountsReceivable,
  type AccountsReceivableStatus,
} from '../../domain/models/accountsReceivable';

type SortBy = 'orderNumber' | 'createdAt' | 'updatedAt';

function readQuery(sp: URLSearchParams) {
  return {
    page: Number(sp.get('page') ?? 1) || 1,
    limit: Number(sp.get('limit') ?? 10) || 10,
    search: sp.get('search') ?? '',
    status: (sp.get('status') ?? '') as '' | AccountsReceivableStatus,
    sortBy: (sp.get('sortBy') ?? 'createdAt') as SortBy,
    sortDir: (sp.get('sortDir') ?? 'DESC') as SortDir,
  };
}

export function AccountsReceivableList() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const filters = useMemo(() => readQuery(sp), [sp]);
  const [searchInput, setSearchInput] = useState(filters.search);

  const [data, setData] = useState<AccountsReceivable[]>([]);
  const [metadata, setMetadata] = useState({ total: 0, page: 1, lastPage: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const updateParam = useCallback(
    (patch: Record<string, string | number | undefined>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || v === null) next.delete(k);
        else next.set(k, String(v));
      }
      if (!('page' in patch)) next.set('page', '1');
      setSp(next, { replace: true });
    },
    [sp, setSp],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== filters.search) updateParam({ search: searchInput });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await accountsReceivableGateway.list({
        page: filters.page,
        limit: filters.limit,
        search: filters.search || undefined,
        status: filters.status || undefined,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
      });
      setData(res.data);
      setMetadata(res.metadata);
    } catch (e) {
      setError(getHttpErrorMessage(e, 'No se pudieron cargar las cuentas'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const onSort = (column: SortBy, dir: SortDir) =>
    updateParam({ sortBy: column, sortDir: dir });

  const clearFilters = () => {
    setSearchInput('');
    setSp(new URLSearchParams(), { replace: true });
  };

  const hasActiveFilters = !!(filters.search || filters.status);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedAccounts = useMemo(
    () => data.filter((a) => selected.has(a.id)),
    [data, selected],
  );

  const goRegister = () => {
    if (selectedAccounts.length === 0) {
      notify.warning('Seleccioná al menos una cuenta');
      return;
    }
    navigate('/accounts-receivable/register-collection', {
      state: { receivableIds: selectedAccounts.map((a) => a.id) },
    });
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            Cuentas por cobrar
          </h1>
          <p className="text-sm text-muted-foreground">
            {metadata.total.toLocaleString()} cuenta{metadata.total === 1 ? '' : 's'} en total
          </p>
        </div>
        <Can permission={PERMISSIONS.ACCOUNTS_RECEIVABLE.UPDATE}>
          <Button onClick={goRegister} disabled={selectedAccounts.length === 0}>
            <Plus className="w-4 h-4 mr-1.5" />
            Registrar cobro
            {selectedAccounts.length > 0 && (
              <span className="ml-1 text-[11px] opacity-80">
                ({selectedAccounts.length})
              </span>
            )}
          </Button>
        </Can>
      </div>

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Buscar por número de orden…"
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <Select
              value={filters.status || 'all'}
              onValueChange={(v) =>
                updateParam({ status: v === 'all' ? undefined : v })
              }
            >
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Estado: todos</SelectItem>
                <SelectItem value="uncollected">No cobrada</SelectItem>
                <SelectItem value="collected">Cobrada</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        {error ? (
          <div className="px-4 py-2 text-sm text-destructive border-b bg-destructive-soft">
            {error}
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow className="bg-[oklch(0.985_0.003_250)] hover:bg-[oklch(0.985_0.003_250)]">
              <TableHead className="w-10"></TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                N° cuenta
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="orderNumber"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  N° orden
                </SortableHeader>
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Seguro
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Monto orden
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Estado
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <SortableHeader<SortBy>
                  column="createdAt"
                  activeColumn={filters.sortBy}
                  direction={filters.sortDir}
                  onSort={onSort}
                >
                  Creación
                </SortableHeader>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={5} columns={7} />
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={HandCoins}
                    title={
                      hasActiveFilters
                        ? 'Sin resultados con esos filtros'
                        : 'Sin cuentas por cobrar'
                    }
                    description={
                      hasActiveFilters
                        ? 'Limpiá los filtros para ver todas las cuentas.'
                        : 'Las cuentas se generan al crear órdenes tipo seguro.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              data.map((a) => {
                // Permite seleccionar mientras no esté completamente cobrada.
                // Receivable sin cap: 'overcollected' / 'collected' bloquean para evitar más cobros.
                const isUncollected =
                  a.status === 'uncollected' || a.status === 'partially_collected';
                return (
                  <TableRow key={a.id} className="hover:bg-muted/30">
                    <TableCell className="py-3.5 px-4">
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        disabled={!isUncollected}
                        onChange={() => isUncollected && toggleSelect(a.id)}
                        aria-label="Seleccionar cuenta"
                      />
                    </TableCell>
                    <TableCell className="py-3.5 px-4 font-mono text-sm font-semibold">
                      {a.receivableNumber}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 font-mono text-sm">
                      <Link
                        to={`/orders/edit/${a.orderId}`}
                        className="text-brand-blue hover:underline"
                      >
                        {a.order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">
                      {a.insurance?.name ?? '—'}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm font-mono">
                      {Number(a.order.priceAmount).toFixed(2)}{' '}
                      {a.order.priceCurrency}
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      {(() => {
                        const colorMap: Record<
                          typeof a.status,
                          { bg: string; dot: string }
                        > = {
                          collected: {
                            bg: 'bg-success-soft text-success',
                            dot: 'bg-success',
                          },
                          partially_collected: {
                            bg: 'bg-brand-cyan-soft text-brand-blue-strong',
                            dot: 'bg-brand-cyan',
                          },
                          overcollected: {
                            bg: 'bg-brand-blue-soft text-brand-blue-strong',
                            dot: 'bg-brand-blue',
                          },
                          uncollected: {
                            bg: 'bg-warning-soft text-warning',
                            dot: 'bg-warning',
                          },
                        };
                        const c = colorMap[a.status];
                        return (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full ${c.bg} px-2 py-0.5 text-xs font-medium`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                            {STATUS_LABEL[a.status]}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground">
                      {a.createdAt
                        ? new Date(a.createdAt).toLocaleDateString('es-VE')
                        : '—'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <DataTablePagination
          page={filters.page}
          pageSize={filters.limit}
          total={metadata.total}
          lastPage={metadata.lastPage}
          onPageChange={(p) => updateParam({ page: p })}
          itemLabel="cuentas"
        />
      </div>
    </div>
  );
}
