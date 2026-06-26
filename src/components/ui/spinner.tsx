import { LoaderIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <LoaderIcon
      role="status"
      aria-label="Cargando"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

/**
 * Cargando centrado para páginas/secciones: spinner + texto, centrado vertical y
 * horizontalmente dentro del área de contenido. Reemplaza el patrón antiguo
 * `<div className="text-sm text-muted-foreground">Cargando…</div>`.
 */
function PageLoader({
  label = 'Cargando…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 text-center',
        className,
      )}
    >
      <Spinner className="size-8 text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export { Spinner, PageLoader };
