import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { specialtyGateway } from '../../infrastructure/specialtyGateway';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormSwitch } from '@/components/ui/form-switch';
import { FormSection, FormGrid } from '@/components/ui/form-section';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';
import { specialtySchema, type SpecialtyValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SpecialtyEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fetching, setFetching] = useState(true);
  const [displayName, setDisplayName] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SpecialtyValues>({
    resolver: zodResolver(specialtySchema),
    mode: 'onBlur',
    defaultValues: { name: '', description: '', isActive: true },
  });

  const isActive = watch('isActive') ?? true;

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const s = await specialtyGateway.getById(id);
        reset({
          name: s.name,
          description: s.description ?? '',
          isActive: s.isActive ?? true,
        });
        setDisplayName(s.name);
      } catch (e) {
        notify.fromError(e, 'No se pudo cargar la especialidad.');
      } finally {
        setFetching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onSubmit = async (values: SpecialtyValues) => {
    if (!id) return;
    try {
      await specialtyGateway.update(id, {
        name: values.name,
        description: values.description ?? null,
        isActive: values.isActive,
      });
      notify.success('Especialidad actualizada');
      navigate('/specialties');
    } catch (err) {
      notify.fromError(err, 'No se pudo actualizar la especialidad.');
    }
  };

  if (fetching) {
    return <div className="text-sm text-muted-foreground">Cargando especialidad…</div>;
  }

  const invalid = (k: 'name' | 'description') =>
    errors[k] ? 'border-destructive focus-visible:ring-destructive/30' : '';

  return (
    <div className="max-w-3xl mx-auto">
      <PageBreadcrumbs />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
              Editar especialidad
            </h1>
            {displayName && <p className="text-sm text-muted-foreground">{displayName}</p>}
          </div>
          <button
            type="button"
            onClick={() => navigate('/specialties')}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Volver a especialidades
          </button>
        </div>

        <FormSection title="Información">
          <FormGrid>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input id="name" {...register('name')} className={cn('h-9', invalid('name'))} />
              {errors.name ? (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {errors.name.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description" className="text-sm font-medium">
                Descripción
              </Label>
              <Textarea
                id="description"
                rows={3}
                {...register('description')}
                className={invalid('description')}
              />
              {errors.description ? (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {errors.description.message}
                </p>
              ) : null}
            </div>
          </FormGrid>
        </FormSection>

        <FormSection title="Estado">
          <FormSwitch
            label="Habilitada"
            description="Si está deshabilitada, no aparecerá como opción al asignar especialidades."
            checked={isActive}
            onCheckedChange={(v) =>
              setValue('isActive', v, { shouldDirty: true, shouldValidate: true })
            }
          />
        </FormSection>

        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> Campos obligatorios
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => navigate('/specialties')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
