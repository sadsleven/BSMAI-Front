import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonTableRows } from '@/components/ui/skeleton';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ChevronLeft, Play, Trash2, AlertTriangle, FileEdit } from 'lucide-react';
import { orderDraftGateway } from '../../infrastructure/orderDraftGateway';
import type { OrderDraft } from '../../domain/models/orderDraft';
import { ORDER_TYPE_LABEL, type OrderType } from '../../domain/models/order';
import { formatCreatedDateTime } from '@/lib/dates';
import { notify } from '@/lib/notifications/toast';

export function OrderDraftsPage() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<OrderDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState<OrderDraft | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Carga una vez al montar. `loading` ya arranca en true, así que el efecto no
  // setea estado de forma síncrona (setState ocurre recién tras el await).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await orderDraftGateway.list();
        if (!cancelled) setDrafts(list);
      } catch (e) {
        notify.fromError(e, 'No se pudieron cargar los borradores.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await orderDraftGateway.remove(toDelete.id);
      setDrafts((prev) => prev.filter((d) => d.id !== toDelete.id));
      notify.success('Borrador eliminado.');
      setToDelete(null);
    } catch (e) {
      notify.fromError(e, 'No se pudo eliminar el borrador.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            Borradores de órdenes
          </h1>
          <p className="text-sm text-muted-foreground">
            Órdenes guardadas a medias en el Paso 1. Reanuda una para continuar
            donde la dejaste.
          </p>
        </div>
        <Link to="/orders">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Volver a órdenes
          </button>
        </Link>
      </div>

      <div className="bg-card rounded-xl border shadow-xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Borrador
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Tipo
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Última edición
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-center">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonTableRows rows={4} columns={4} />
            ) : drafts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="p-0">
                  <EmptyState
                    title="No hay borradores"
                    description="Cuando guardes una orden a medias desde el Paso 1, aparecerá aquí."
                    action={
                      <Link to="/orders/create">
                        <Button size="sm">Nueva orden</Button>
                      </Link>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              drafts.map((draft) => {
                const type = (draft.payload?.type ?? undefined) as
                  | OrderType
                  | undefined;
                return (
                  <TableRow
                    key={draft.id}
                    className="hover:bg-[oklch(0.985_0.003_250)]"
                  >
                    <TableCell className="py-3.5 px-4">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileEdit className="w-4 h-4 text-muted-foreground shrink-0" />
                        {draft.label || 'Orden sin titular'}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      {type ? (
                        <Badge variant="secondary">{ORDER_TYPE_LABEL[type]}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-sm text-muted-foreground whitespace-nowrap">
                      {formatCreatedDateTime(draft.updatedAt)}
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          onClick={() =>
                            navigate(`/orders/create?draft=${draft.id}`)
                          }
                          className="gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Reanudar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setToDelete(draft)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        tone="destructive"
        icon={AlertTriangle}
        title="Eliminar borrador"
        description="Se eliminará este borrador de forma permanente. Esta acción no se puede deshacer."
        confirmLabel={deleting ? 'Eliminando…' : 'Eliminar'}
        confirmVariant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
