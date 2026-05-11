function buildResource<T extends string>(resource: T) {
  return {
    VIEW: `${resource}.view`,
    LIST: `${resource}.list`,
    CREATE: `${resource}.create`,
    UPDATE: `${resource}.update`,
    TOGGLE_ACTIVE: `${resource}.toggle-active`,
    SOFT_DELETE: `${resource}.soft-delete`,
    HARD_DELETE: `${resource}.hard-delete`,
    RESTORE: `${resource}.restore`,
  } as const;
}

export const PERMISSIONS = {
  USERS: {
    VIEW: 'users.view',
    LIST: 'users.list',
    CREATE: 'users.create',
    UPDATE: 'users.update',
    CHANGE_PASSWORD: 'users.change-password',
    TOGGLE_ACTIVE: 'users.toggle-active',
    SOFT_DELETE: 'users.soft-delete',
    HARD_DELETE: 'users.hard-delete',
    RESTORE: 'users.restore',
  },
  ROLES: {
    VIEW: 'roles.view',
    LIST: 'roles.list',
    CREATE: 'roles.create',
    UPDATE: 'roles.update',
    TOGGLE_ACTIVE: 'roles.toggle-active',
    SOFT_DELETE: 'roles.soft-delete',
    HARD_DELETE: 'roles.hard-delete',
    RESTORE: 'roles.restore',
    ASSIGN_PERMISSIONS: 'roles.assign-permissions',
  },
  PERMISSIONS: {
    LIST: 'permissions.list',
  },
  SPECIALTIES: buildResource('specialties'),
  PATIENTS: buildResource('patients'),
  DOCTORS: buildResource('doctors'),
  CARE_CENTERS: buildResource('care-centers'),
  INSURANCES: buildResource('insurances'),
  PATHOLOGIES: buildResource('pathologies'),
  SERVICE_TYPES: buildResource('service-types'),
  CONTRACTORS: buildResource('contractors'),
  EXCHANGE_RATES: buildResource('exchange-rates'),
  BRANCHES: buildResource('branches'),
  ORDERS: {
    LIST: 'orders.list',
    VIEW: 'orders.view',
    CREATE: 'orders.create',
    UPDATE: 'orders.update',
    SOFT_DELETE: 'orders.soft-delete',
    HARD_DELETE: 'orders.hard-delete',
    RESTORE: 'orders.restore',
  },
  ACCOUNTS_PAYABLE: {
    LIST: 'accounts-payable.list',
    VIEW: 'accounts-payable.view',
    UPDATE: 'accounts-payable.update',
  },
  ACCOUNTS_RECEIVABLE: {
    LIST: 'accounts-receivable.list',
    VIEW: 'accounts-receivable.view',
    UPDATE: 'accounts-receivable.update',
  },
} as const;
