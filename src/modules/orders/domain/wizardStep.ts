import type { Order, OrderStatus } from './models/order';

export type OrderWizardStep = 'register' | 'attention' | 'report' | 'billing';

export const ORDER_WIZARD_STEPS: OrderWizardStep[] = [
  'register',
  'attention',
  'report',
  'billing',
];

export interface OrderStagePermissions {
  attention: boolean;
  report: boolean;
  billing: boolean;
}

/** Paso "natural" dado el estado de la orden. */
export function stepForStatus(status: OrderStatus): OrderWizardStep {
  switch (status) {
    case 'draft':
      return 'register';
    case 'in_progress':
      return 'attention';
    case 'attended':
      return 'report';
    case 'report_issued':
    case 'finalized':
      return 'billing';
    case 'cancelled':
    default:
      return 'register';
  }
}

function stepAvailable(
  step: OrderWizardStep,
  status: OrderStatus,
  perms: OrderStagePermissions,
): boolean {
  if (step === 'register') return true;
  if (step === 'attention') return perms.attention;
  if (step === 'report')
    return (
      perms.report &&
      (status === 'attended' || status === 'report_issued' || status === 'finalized')
    );
  if (step === 'billing')
    return perms.billing && (status === 'report_issued' || status === 'finalized');
  return false;
}

/** Último paso accesible según estado + permisos. Fallback a 'register'. */
export function lastAccessibleStep(
  order: Pick<Order, 'status'>,
  perms: OrderStagePermissions,
): OrderWizardStep {
  const target = stepForStatus(order.status);
  const idx = ORDER_WIZARD_STEPS.indexOf(target);
  for (let i = idx; i >= 0; i--) {
    const s = ORDER_WIZARD_STEPS[i];
    if (stepAvailable(s, order.status, perms)) return s;
  }
  return 'register';
}

export function isWizardStep(v: string | null | undefined): v is OrderWizardStep {
  return v === 'register' || v === 'attention' || v === 'report' || v === 'billing';
}
