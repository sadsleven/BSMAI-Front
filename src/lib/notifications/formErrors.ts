import type { FieldErrors, FieldError } from 'react-hook-form';
import { notify } from './toast';

export type FieldLabelMap = Record<string, string>;

/**
 * Diccionario por defecto path → label visible. Cubre todos los campos
 * comunes del sistema. Forms pueden override pasando `labels` con
 * sobreescrituras locales.
 */
export const COMMON_LABELS: FieldLabelMap = {
  // Auth + perfil
  firstName: 'Nombre',
  lastName: 'Apellido',
  email: 'Email',
  phoneNumber: 'Teléfono',
  password: 'Contraseña',
  confirmPassword: 'Confirmar contraseña',
  currentPassword: 'Contraseña actual',
  newPassword: 'Nueva contraseña',
  confirmNewPassword: 'Confirmar nueva contraseña',
  isActive: 'Estado',
  isSuperAdmin: 'Super Admin',
  roleIds: 'Roles',
  branchIds: 'Sucursales',
  permissionIds: 'Permisos',
  // VE / personas
  cedula: 'Cédula',
  rif: 'RIF',
  businessName: 'Razón social',
  birthDate: 'Fecha de nacimiento',
  address: 'Dirección',
  fiscalAddress: 'Dirección fiscal',
  personType: 'Tipo de persona',
  // Catálogo
  name: 'Nombre',
  description: 'Descripción',
  // Teléfonos (sub-form)
  phones: 'Teléfonos',
  number: 'Número de teléfono',
  label: 'Etiqueta',
  // Doctor / CareCenter / Insurance assignments
  isLegalEntity: 'Persona jurídica',
  insuranceIds: 'Seguros',
  contractorIds: 'Contratistas',
  specialtyIds: 'Especialidades',
  paymentMethods: 'Métodos de pago',
  bankCode: 'Banco',
  accountNumber: 'Número de cuenta',
  accountHolderName: 'Titular',
  idDocument: 'Cédula/RIF',
  // Exchange Rate
  currency: 'Moneda',
  amountBs: 'Monto en bolívares',
  effectiveDate: 'Fecha efectiva',
  // Order
  branchId: 'Sucursal',
  type: 'Tipo de orden',
  holderId: 'Titular',
  patientId: 'Paciente',
  contractorId: 'Contratista',
  insuranceId: 'Seguro',
  providerType: 'Tipo de proveedor',
  doctorId: 'Doctor',
  careCenterId: 'Centro de atención',
  specialtyId: 'Especialidad',
  serviceTypeIds: 'Tipos de servicio',
  serviceTypeId: 'Tipo de servicio',
  customName: 'Nombre para la orden',
  quantity: 'Cantidad',
  pathologyIds: 'Patologías',
  orderDate: 'Fecha de la orden',
  appointmentDate: 'Fecha de atención',
  priceAmount: 'Monto',
  casheaInitialPercent: 'Inicial (%)',
  casheaFirstInstallmentAmount: 'Monto de la inicial',
  // Order payments
  payments: 'Pagos',
  paymentDate: 'Fecha del pago',
  referenceNumber: 'Referencia',
  paymentAccountId: 'Cuenta bancaria',
  exchangeRateId: 'Tasa de cambio',
  amountCurrency: 'Moneda del pago',
  amountValue: 'Monto del pago',
  // Service type prices
  prices: 'Precios',
  priceUsd: 'Precio USD',
};

type AnyError = Record<string, unknown>;

function isFieldError(v: unknown): v is FieldError {
  return (
    !!v &&
    typeof v === 'object' &&
    'message' in (v as AnyError) &&
    typeof (v as AnyError).message === 'string'
  );
}

/**
 * Flatten react-hook-form `FieldErrors` to a list of `{path, label, message}`.
 * Recurses into objects and arrays. Skips RHF internals (`ref`, `type`, `types`).
 */
export function collectFormErrors(
  errors: FieldErrors,
  labels: FieldLabelMap = {},
  prefix = '',
): Array<{ path: string; label: string; message: string }> {
  const out: Array<{ path: string; label: string; message: string }> = [];
  if (!errors || typeof errors !== 'object') return out;
  for (const [key, value] of Object.entries(errors)) {
    if (key === 'ref' || key === 'type' || key === 'types') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (!item) return;
        if (isFieldError(item)) {
          out.push({
            path: `${path}.${i}`,
            label: labels[`${path}.${i}`] ?? labels[path] ?? labels[key] ?? key,
            message: item.message ?? '',
          });
        } else if (typeof item === 'object') {
          out.push(
            ...collectFormErrors(item as FieldErrors, labels, `${path}.${i}`),
          );
        }
      });
      continue;
    }
    if (isFieldError(value)) {
      const label =
        labels[path] ?? labels[key] ?? humanize(path);
      out.push({ path, label, message: value.message ?? '' });
      continue;
    }
    if (typeof value === 'object') {
      out.push(...collectFormErrors(value as FieldErrors, labels, path));
    }
  }
  return out;
}

/** Best-effort path → label fallback (`patient.firstName` → `Patient · First name`). */
function humanize(path: string): string {
  return path
    .split('.')
    .map((seg) => seg.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()))
    .join(' · ');
}

export type NotifyFormErrorsOpts = {
  labels?: FieldLabelMap;
  /** Texto cuando no se pudo extraer detalle. */
  fallback?: string;
  /** Prefijo del toast. Default: "No se pudo guardar. Revisa:" */
  heading?: string;
  /** Máximo de líneas a mostrar (resto se resume). Default 5. */
  maxItems?: number;
};

/**
 * Show a single error toast listing field-level validation problems.
 * Usage: `handleSubmit(onValid, (errs) => notifyFormErrors(errs, { labels }))`.
 */
export function notifyFormErrors(
  errors: FieldErrors,
  opts: NotifyFormErrorsOpts = {},
): void {
  const {
    labels: extraLabels = {},
    fallback = 'Revisa los campos marcados.',
    heading = 'No se pudo guardar. Revisa:',
    maxItems = 5,
  } = opts;
  const labels = { ...COMMON_LABELS, ...extraLabels };
  const items = collectFormErrors(errors, labels);
  if (items.length === 0) {
    notify.error(fallback);
    return;
  }
  const seen = new Set<string>();
  const filtered = items.filter((it) => {
    const k = `${it.label}::${it.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const top = filtered.slice(0, maxItems);
  const more = filtered.length - top.length;
  const lines = top.map((it) => `• ${it.label}: ${it.message || 'Inválido'}`);
  if (more > 0) lines.push(`…y ${more} más`);
  notify.error(heading, {
    description: lines.join('\n'),
    duration: 7000,
    style: { whiteSpace: 'pre-wrap' },
  });
}
