import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Pencil, Power, Landmark, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { ConfirmDialog, DialogIconHeader } from '@/components/ui/confirm-dialog';
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
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { Can } from '@/modules/auth/presentation/components/Can';
import { PERMISSIONS } from '@/modules/auth/domain/models/permissions';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { bankSchema, type BankValues } from '@/lib/validations/schemas';
import { cn } from '@/lib/utils';
import { bankGateway } from '../../infrastructure/bankGateway';
import type { Bank } from '../../domain/models/bank';

type StatusFilter = 'all' | 'active' | 'inactive';

const BANK_LABELS = { code: 'Código', name: 'Nombre' };

function StatusBadge({ bank }: { bank: Bank }) {
  if (!bank.isActive)
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-warning-soft text-warning text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-warning" /> Deshabilitado
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success-soft text-success text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-success" /> Habilitado
    </span>
  );
}

export function BankList() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [editTarget, setEditTarget] = useState<Bank | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<Bank | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BankValues>({
    resolver: zodResolver(bankSchema),
    mode: 'onBlur',
    defaultValues: { code: '', name: '' },
  });

  const fetch = useCallback(
    () =>
      bankGateway
        .list()
        .then((list) => {
          setBanks(list);
          setError(null);
        })
        .catch(() => {
          setError('No se pudieron cargar los bancos.');
        })
        .finally(() => {
          setIsLoading(false);
        }),
    [],
  );

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return banks.filter((b) => {
      if (status === 'active' && !b.isActive) return false;
      if (status === 'inactive' && b.isActive) return false;
      if (s && !b.code.includes(s) && !b.name.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [banks, search, status]);

  const hasActiveFilters = search.trim() !== '' || status !== 'all';
  const clearFilters = () => {
    setSearch('');
    setStatus('all');
  };

  const openCreate = () => {
    setEditTarget(null);
    reset({ code: '', name: '' });
    setDialogOpen(true);
  };

  const openEdit = (bank: Bank) => {
    setEditTarget(bank);
    reset({ code: bank.code, name: bank.name });
    setDialogOpen(true);
  };

  const onSubmit = async (values: BankValues) => {
    try {
      if (editTarget) {
        await bankGateway.update(editTarget.id, values);
        notify.success('Banco actualizado');
      } else {
        await bankGateway.create(values);
        notify.success('Banco creado');
      }
      setDialogOpen(false);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo guardar el banco.');
    }
  };

  const confirmToggle = async () => {
    if (!toggleTarget) return;
    try {
      setActionLoading(true);
      await bankGateway.toggleActive(toggleTarget.id);
      notify.success(`Banco ${toggleTarget.isActive ? 'deshabilitado' : 'habilitado'}`);
      setToggleTarget(null);
      await fetch();
    } catch (e) {
      notify.fromError(e, 'No se pudo cambiar el estado.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">Bancos</h1>
          <p className="text-sm text-muted-foreground">
            {banks.length.toLocaleString()} bancos en el catálogo. Se usan en métodos de pago y
            cuentas bancarias.
          </p>
        </div>
        <Can permission={PERMISSIONS.BANKS.CREATE}>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo banco
          </Button>
        </Can>
      </div>

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <DataTableToolbar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por código o nombre…"
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
          filters={
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Estado: todos</SelectItem>
                <SelectItem value="active">Solo habilitados</SelectItem>
                <SelectItem value="inactive">Solo deshabilitados</SelectItem>
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
                  Código
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Nombre
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Estado
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-center">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <SkeletonTableRows rows={5} columns={4} />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="p-0">
                    <EmptyState
                      icon={Landmark}
                      title={hasActiveFilters ? 'Sin resultados' : 'Aún no hay bancos'}
                      description={
                        hasActiveFilters
                          ? 'Ajusta los filtros para ver más resultados.'
                          : 'Crea el primer banco del catálogo.'
                      }
                      action={
                        hasActiveFilters ? (
                          <Button variant="outline" size="sm" onClick={clearFilters}>
                            Limpiar filtros
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((b) => (
                  <TableRow key={b.id} className="hover:bg-[oklch(0.985_0.003_250)]">
                    <TableCell className="py-3.5 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-brand-cyan-soft text-brand-cyan-strong flex items-center justify-center shrink-0">
                          <Landmark className="w-4 h-4" />
                        </div>
                        <span className="font-semibold text-foreground font-mono">{b.code}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm">{b.name}</TableCell>
                    <TableCell className="py-3.5 px-4">
                      <StatusBadge bank={b} />
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-center gap-0.5">
                        <Can permission={PERMISSIONS.BANKS.UPDATE}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar"
                            onClick={() => openEdit(b)}
                            className="w-8 h-8"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </Can>
                        <Can permission={PERMISSIONS.BANKS.TOGGLE_ACTIVE}>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={b.isActive ? 'Deshabilitar' : 'Habilitar'}
                            onClick={() => setToggleTarget(b)}
                            disabled={actionLoading}
                            className="w-8 h-8"
                          >
                            <Power className="w-4 h-4" />
                          </Button>
                        </Can>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setDialogOpen(false);
        }}
      >
        <AlertDialogContent className="sm:max-w-[460px] rounded-xl gap-4 p-0">
          <DialogIconHeader
            tone="info"
            icon={editTarget ? Pencil : Landmark}
            title={editTarget ? 'Editar banco' : 'Nuevo banco'}
            description={
              editTarget
                ? 'Cambiar el código actualiza los métodos de pago y cuentas bancarias que lo usan.'
                : 'Agrega un banco al catálogo para usarlo en métodos de pago y cuentas bancarias.'
            }
            onClose={() => setDialogOpen(false)}
          />
          <form
            onSubmit={handleSubmit(onSubmit, (errs) =>
              notifyFormErrors(errs, { labels: BANK_LABELS }),
            )}
            className="space-y-4"
          >
            <div className="px-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bank-code" className="text-sm font-medium">
                  Código <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="bank-code"
                  placeholder="0102"
                  maxLength={4}
                  inputMode="numeric"
                  {...register('code')}
                  className={cn('h-9 font-mono', errors.code && 'border-destructive')}
                />
                {errors.code ? (
                  <p className="text-xs text-destructive">{errors.code.message}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-name" className="text-sm font-medium">
                  Nombre <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="bank-name"
                  placeholder="Ej. Banco de Venezuela (BDV)"
                  {...register('name')}
                  className={cn('h-9', errors.name && 'border-destructive')}
                />
                {errors.name ? (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                ) : null}
              </div>
            </div>
            <AlertDialogFooter className="px-6 pb-5 pt-2 flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
                className="sm:mr-auto"
              >
                <X className="w-4 h-4 mr-1.5" />
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando…' : editTarget ? 'Guardar cambios' : 'Crear banco'}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(open) => {
          if (!open) setToggleTarget(null);
        }}
        tone={toggleTarget?.isActive ? 'warning' : 'success'}
        icon={Power}
        title={toggleTarget?.isActive ? '¿Deshabilitar banco?' : '¿Habilitar banco?'}
        description={
          toggleTarget ? (
            <>
              <strong>
                {toggleTarget.code} — {toggleTarget.name}
              </strong>{' '}
              {toggleTarget.isActive
                ? 'dejará de aparecer como opción en métodos de pago y cuentas bancarias. Los registros que ya lo usan no se modifican.'
                : 'volverá a aparecer como opción en métodos de pago y cuentas bancarias.'}
            </>
          ) : null
        }
        confirmLabel={toggleTarget?.isActive ? 'Deshabilitar' : 'Habilitar'}
        confirmVariant={toggleTarget?.isActive ? 'destructive' : 'default'}
        loading={actionLoading}
        onConfirm={confirmToggle}
      />
    </div>
  );
}
