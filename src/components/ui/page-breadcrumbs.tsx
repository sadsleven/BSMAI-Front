import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BreadcrumbItem = { label: string; to?: string };

const PATH_LABELS: Record<string, string> = {
  '': 'AFMI',
  users: 'Usuarios',
  roles: 'Roles y permisos',
  profile: 'Mi perfil',
  create: 'Nuevo',
  edit: 'Editar',
  'change-password': 'Cambiar contraseña',
  orders: 'Órdenes',
  patients: 'Pacientes',
  doctors: 'Doctores',
  insurers: 'Aseguradoras',
  insurances: 'Seguros',
  pathologies: 'Patologías',
  'service-types': 'Tipos de servicio',
  services: 'Servicios médicos',
  specialties: 'Especialidades',
  'care-centers': 'Centros de atención',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_ID_RE = /^\d+$/;

function isIdSegment(seg: string) {
  return UUID_RE.test(seg) || NUMERIC_ID_RE.test(seg);
}

function autoCrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: BreadcrumbItem[] = [{ label: 'AFMI', to: '/' }];
  let acc = '';
  segments.forEach((seg, idx) => {
    acc += `/${seg}`;
    if (isIdSegment(seg)) return;
    const label = PATH_LABELS[seg] ?? seg;
    const isLast = idx === segments.length - 1;
    crumbs.push({ label, to: isLast ? undefined : acc });
  });
  return crumbs;
}

export type PageBreadcrumbsProps = {
  /** Override auto-derived crumbs. Provide full chain including home. */
  items?: BreadcrumbItem[];
  className?: string;
};

export function PageBreadcrumbs({ items, className }: PageBreadcrumbsProps) {
  const location = useLocation();
  const crumbs = items ?? autoCrumbs(location.pathname);
  if (crumbs.length <= 1) return null;

  return (
    <nav
      aria-label="breadcrumb"
      className={cn('flex items-center gap-1.5 mb-3 min-w-0', className)}
    >
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <div key={`${c.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && (
              <ChevronRight className="w-3.5 h-3.5 text-[oklch(0.80_0.005_250)] shrink-0" />
            )}
            {c.to && !isLast ? (
              <Link
                to={c.to}
                className="text-[13px] text-muted-foreground hover:text-foreground truncate"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={cn(
                  'text-[13px] truncate',
                  isLast ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {c.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
