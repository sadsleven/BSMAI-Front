import { z } from 'zod';
import {
  cedulaSchema,
  optionalRifSchema,
  phoneNumberSchema,
  phonesArraySchema,
  rifSchema,
} from './ve-formats';

const NAME_REGEX = /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/;
const PHONE_REGEX = /^\d+$/;
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,100}$/;

/** True when ISO `YYYY-MM-DD` (or longer) is today or earlier. Empty passes. */
function isoDateNotFuture(v: string | undefined): boolean {
  if (!v) return true;
  const d = new Date();
  const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return v.slice(0, 10) <= todayIso;
}

/** True when ISO datetime is now or earlier. Empty passes. */
function isoDateTimeNotFuture(v: string | undefined): boolean {
  if (!v) return true;
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return true;
  return t <= Date.now();
}

export const emailSchema = z
  .string({ error: 'El email es obligatorio' })
  .min(1, 'El email es obligatorio')
  .max(200, 'El email no puede superar 200 caracteres')
  .email('El email no tiene un formato válido');

/** Email opcional. Empty string passes; if filled, must be valid email ≤ 200. */
export const optionalEmailSchema = z
  .string()
  .optional()
  .refine((v) => !v || v.length <= 200, {
    message: 'El email no puede superar 200 caracteres',
  })
  .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: 'El email no tiene un formato válido',
  });

export const nameSchema = (label: string) =>
  z
    .string({ error: `${label} es obligatorio` })
    .min(1, `${label} es obligatorio`)
    .max(150, `${label} no puede superar 150 caracteres`)
    .regex(NAME_REGEX, `${label} solo admite letras y espacios`);

/**
 * Phone is optional. Empty string passes; if filled, must be 11 digits exactly.
 * Kept as plain string (not transformed) so RHF input/output types match.
 */
export const phoneSchema = z
  .string()
  .optional()
  .refine((v) => !v || PHONE_REGEX.test(v), { message: 'El teléfono solo admite dígitos' })
  .refine((v) => !v || v.length === 11, {
    message: 'El teléfono debe tener exactamente 11 dígitos',
  });

export const passwordSchema = z
  .string({ error: 'La contraseña es obligatoria' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(100, 'La contraseña no puede superar 100 caracteres')
  .regex(
    PASSWORD_REGEX,
    'La contraseña debe incluir mayúscula, minúscula, número y carácter especial',
  );

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: 'La contraseña es obligatoria' })
    .min(1, 'La contraseña es obligatoria'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const profileSchema = z.object({
  firstName: nameSchema('El nombre'),
  lastName: nameSchema('El apellido'),
  email: emailSchema,
  phoneNumber: phoneSchema,
});
export type ProfileValues = z.infer<typeof profileSchema>;

export const createUserSchema = z
  .object({
    firstName: nameSchema('El nombre'),
    lastName: nameSchema('El apellido'),
    email: emailSchema,
    phoneNumber: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string({ error: 'Confirmá la contraseña' }),
    isActive: z.boolean().optional(),
    isSuperAdmin: z.boolean().optional(),
    roleIds: z.array(z.string().uuid()).optional(),
    branchIds: z.array(z.string().uuid()).optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden',
  });
export type CreateUserValues = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  firstName: nameSchema('El nombre'),
  lastName: nameSchema('El apellido'),
  email: emailSchema,
  phoneNumber: phoneSchema,
  isActive: z.boolean().optional(),
  isSuperAdmin: z.boolean().optional(),
  roleIds: z.array(z.string().uuid()).optional(),
  branchIds: z.array(z.string().uuid()).optional(),
});
export type UpdateUserValues = z.infer<typeof updateUserSchema>;

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: 'La contraseña actual es obligatoria' })
      .min(1, 'La contraseña actual es obligatoria'),
    newPassword: passwordSchema,
    confirmNewPassword: z.string({ error: 'Confirmá la nueva contraseña' }),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    path: ['confirmNewPassword'],
    message: 'Las contraseñas nuevas no coinciden',
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ['newPassword'],
    message: 'La nueva contraseña debe ser distinta a la actual',
  });
export type ChangeOwnPasswordValues = z.infer<typeof changeOwnPasswordSchema>;

export const adminChangePasswordSchema = (requireCurrent: boolean) =>
  z
    .object({
      currentPassword: requireCurrent
        ? z
            .string({ error: 'La contraseña actual es obligatoria' })
            .min(1, 'La contraseña actual es obligatoria')
        : z.string().optional(),
      newPassword: passwordSchema,
      confirmNewPassword: z.string({ error: 'Confirmá la nueva contraseña' }),
    })
    .refine((d) => d.newPassword === d.confirmNewPassword, {
      path: ['confirmNewPassword'],
      message: 'Las contraseñas nuevas no coinciden',
    });

/**
 * Paciente: persona natural o jurídica.
 *
 * - `natural` exige cédula + firstName + lastName.
 * - `legal_entity` exige businessName + RIF.
 *
 * Cross-validation con superRefine. Los campos del tipo opuesto no se envían
 * al backend (ver Form), pero el schema deja todos opcionales para no chocar
 * con resets parciales mientras el usuario cambia de tipo.
 */
export const patientSchema = z
  .object({
    personType: z.enum(['natural', 'legal_entity'], {
      error: 'Seleccioná un tipo de persona',
    }),
    cedula: z.string().optional().or(z.literal('')),
    firstName: z.string().optional().or(z.literal('')),
    lastName: z.string().optional().or(z.literal('')),
    businessName: z.string().optional().or(z.literal('')),
    rif: z.string().optional().or(z.literal('')),
    email: optionalEmailSchema,
    birthDate: z
      .string({ error: 'La fecha de nacimiento es obligatoria' })
      .min(1, 'La fecha de nacimiento es obligatoria')
      .refine(isoDateNotFuture, {
        message: 'La fecha no puede ser posterior a hoy',
      }),
    address: z
      .string({ error: 'La dirección es obligatoria' })
      .min(3, 'La dirección debe tener al menos 3 caracteres')
      .max(500, 'La dirección no puede superar 500 caracteres'),
    phones: phonesArraySchema,
    contractorIds: z
      .array(z.string().uuid())
      .max(50, 'Máximo 50 contratistas por paciente')
      .optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.personType === 'natural') {
      if (!val.cedula) {
        ctx.addIssue({ code: 'custom', path: ['cedula'], message: 'La cédula es obligatoria' });
      } else if (!/^[VE]-\d{1,2}\.\d{3}\.\d{3}$/.test(val.cedula)) {
        ctx.addIssue({
          code: 'custom',
          path: ['cedula'],
          message: 'Formato inválido. Ej: V-12.345.678',
        });
      }
      const NAME_RE = /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/;
      if (!val.firstName) {
        ctx.addIssue({ code: 'custom', path: ['firstName'], message: 'El nombre es obligatorio' });
      } else if (!NAME_RE.test(val.firstName)) {
        ctx.addIssue({
          code: 'custom',
          path: ['firstName'],
          message: 'El nombre solo admite letras y espacios',
        });
      }
      if (!val.lastName) {
        ctx.addIssue({ code: 'custom', path: ['lastName'], message: 'El apellido es obligatorio' });
      } else if (!NAME_RE.test(val.lastName)) {
        ctx.addIssue({
          code: 'custom',
          path: ['lastName'],
          message: 'El apellido solo admite letras y espacios',
        });
      }
    } else {
      if (!val.businessName) {
        ctx.addIssue({
          code: 'custom',
          path: ['businessName'],
          message: 'La razón social es obligatoria',
        });
      } else if (val.businessName.length > 200) {
        ctx.addIssue({
          code: 'custom',
          path: ['businessName'],
          message: 'Máximo 200 caracteres',
        });
      }
      if (!val.rif) {
        ctx.addIssue({ code: 'custom', path: ['rif'], message: 'El RIF es obligatorio' });
      } else if (!/^[JGVE]-\d{1,2}\.\d{3}\.\d{3}-\d$/.test(val.rif)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rif'],
          message: 'Formato inválido. Ej: J-12.345.678-9',
        });
      }
    }
  });
export type PatientValues = z.infer<typeof patientSchema>;

// Re-export VE schemas for convenience
export { cedulaSchema, rifSchema, phonesArraySchema };

export const specialtySchema = z.object({
  name: z
    .string({ error: 'El nombre es obligatorio' })
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(120, 'El nombre no puede superar 120 caracteres'),
  description: z
    .string()
    .max(500, 'La descripción no puede superar 500 caracteres')
    .optional(),
  isActive: z.boolean().optional(),
});
export type SpecialtyValues = z.infer<typeof specialtySchema>;

const simpleNamedSchema = (max: number) =>
  z.object({
    name: z
      .string({ error: 'El nombre es obligatorio' })
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(max, `El nombre no puede superar ${max} caracteres`),
    description: z
      .string()
      .max(500, 'La descripción no puede superar 500 caracteres')
      .optional(),
    isActive: z.boolean().optional(),
  });

export const pathologySchema = simpleNamedSchema(200);
export type PathologyValues = z.infer<typeof pathologySchema>;

export const branchSchema = simpleNamedSchema(200);
export type BranchValues = z.infer<typeof branchSchema>;

export const serviceTypeSchema = simpleNamedSchema(200);
export type ServiceTypeValues = z.infer<typeof serviceTypeSchema>;

/**
 * Contractor name. Reglas relajadas a propósito: cualquier carácter permitido
 * (números, símbolos, etc.). Distinto a `nameSchema` de personas.
 */
export const contractorSchema = z.object({
  name: z
    .string({ error: 'El nombre es obligatorio' })
    .min(1, 'El nombre es obligatorio')
    .max(200, 'El nombre no puede superar 200 caracteres'),
  description: z
    .string()
    .max(500, 'La descripción no puede superar 500 caracteres')
    .optional(),
  insuranceIds: z
    .array(z.string().uuid())
    .max(50, 'Máximo 50 seguros por contratista')
    .optional(),
  isActive: z.boolean().optional(),
});
export type ContractorValues = z.infer<typeof contractorSchema>;

/**
 * ExchangeRate. `amountBs` es el monto numérico (no string formateado VE);
 * el FE convierte 485,22 → 485.22 antes de enviarlo. 2 decimales máx.
 */
export const exchangeRateSchema = z.object({
  currency: z.enum(['USD', 'EUR'], { error: 'Seleccioná una moneda' }),
  amountBs: z
    .number({ error: 'El monto es obligatorio' })
    .positive('El monto debe ser mayor a 0')
    .max(999_999_999.99, 'Monto excede el máximo permitido')
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: 'Máximo 2 decimales',
    }),
  effectiveDate: z
    .string({ error: 'La fecha efectiva es obligatoria' })
    .min(1, 'La fecha efectiva es obligatoria')
    .refine(isoDateTimeNotFuture, {
      message: 'La fecha no puede ser posterior al momento actual',
    }),
  isActive: z.boolean().optional(),
});
export type ExchangeRateValues = z.infer<typeof exchangeRateSchema>;

export const insuranceSchema = z.object({
  name: z
    .string({ error: 'El nombre es obligatorio' })
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(200, 'El nombre no puede superar 200 caracteres'),
  description: z
    .string()
    .max(500, 'La descripción no puede superar 500 caracteres')
    .optional(),
  email: optionalEmailSchema,
  fiscalAddress: z
    .string()
    .max(500, 'El domicilio fiscal no puede superar 500 caracteres')
    .optional(),
  policyNumber: z
    .string()
    .max(64, 'El número de póliza no puede superar 64 caracteres')
    .optional(),
  phones: phonesArraySchema,
  isActive: z.boolean().optional(),
});
export type InsuranceValues = z.infer<typeof insuranceSchema>;

// ---- Doctores y Centros de Atención (métodos de pago compartidos) ----

const PAYMENT_METHOD_TYPES = ['mobile_payment', 'bank_transfer', 'other'] as const;

const optString = (max: number) => z.string().max(max).optional();

export const paymentMethodSchema = z
  .object({
    id: z.string().uuid().optional(),
    type: z.enum(PAYMENT_METHOD_TYPES, { error: 'Seleccioná un tipo' }),
    isActive: z.boolean().optional(),
    bankCode: optString(8),
    phoneNumber: optString(11),
    idDocument: optString(20),
    accountNumber: optString(40),
    accountHolderName: optString(150),
    description: optString(255),
  })
  .superRefine((val, ctx) => {
    const trim = (v?: string) => (v ?? '').trim();
    if (val.type === 'mobile_payment') {
      if (!trim(val.bankCode))
        ctx.addIssue({
          code: 'custom',
          path: ['bankCode'],
          message: 'Banco requerido',
        });
      if (!/^\d{11}$/.test(trim(val.phoneNumber)))
        ctx.addIssue({
          code: 'custom',
          path: ['phoneNumber'],
          message: 'Teléfono de 11 dígitos',
        });
      if (!trim(val.idDocument))
        ctx.addIssue({
          code: 'custom',
          path: ['idDocument'],
          message: 'Cédula/RIF requerido',
        });
    } else if (val.type === 'bank_transfer') {
      if (!trim(val.bankCode))
        ctx.addIssue({
          code: 'custom',
          path: ['bankCode'],
          message: 'Banco requerido',
        });
      if (!trim(val.accountNumber))
        ctx.addIssue({
          code: 'custom',
          path: ['accountNumber'],
          message: 'Número de cuenta requerido',
        });
      if (!trim(val.accountHolderName))
        ctx.addIssue({
          code: 'custom',
          path: ['accountHolderName'],
          message: 'Titular requerido',
        });
      if (!trim(val.idDocument))
        ctx.addIssue({
          code: 'custom',
          path: ['idDocument'],
          message: 'Cédula/RIF del titular',
        });
    } else if (val.type === 'other') {
      if (trim(val.description).length < 3)
        ctx.addIssue({
          code: 'custom',
          path: ['description'],
          message: 'Descripción mínima 3 caracteres',
        });
    }
  });
export type PaymentMethodValues = z.infer<typeof paymentMethodSchema>;

export const paymentMethodsArraySchema = z
  .array(paymentMethodSchema)
  .max(20, 'Máximo 20 métodos de pago')
  .optional();

export const doctorSchema = z
  .object({
    cedula: cedulaSchema,
    email: optionalEmailSchema,
    firstName: nameSchema('El nombre'),
    lastName: nameSchema('El apellido'),
    isLegalEntity: z.boolean(),
    rif: z.string().optional().or(z.literal('')),
    phones: phonesArraySchema,
    specialtyIds: z
      .array(z.string().uuid())
      .min(1, 'Asigná al menos una especialidad')
      .max(20, 'Máximo 20 especialidades'),
    paymentMethods: paymentMethodsArraySchema,
    isActive: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.isLegalEntity) {
      if (!val.rif) {
        ctx.addIssue({
          code: 'custom',
          path: ['rif'],
          message: 'El RIF es requerido cuando es persona jurídica',
        });
      } else if (!/^[JGVE]-\d{1,2}\.\d{3}\.\d{3}-\d$/.test(val.rif)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rif'],
          message: 'Formato inválido. Ej: J-12.345.678-9',
        });
      }
    } else if (val.rif) {
      ctx.addIssue({
        code: 'custom',
        path: ['rif'],
        message: 'No se admite RIF para persona natural',
      });
    }
  });
export type DoctorValues = z.infer<typeof doctorSchema>;

export const careCenterSchema = z.object({
  businessName: z
    .string({ error: 'La razón social es obligatoria' })
    .min(2, 'La razón social debe tener al menos 2 caracteres')
    .max(200, 'La razón social no puede superar 200 caracteres'),
  email: optionalEmailSchema,
  rif: optionalRifSchema,
  phones: phonesArraySchema,
  specialtyIds: z
    .array(z.string().uuid())
    .min(1, 'Asigná al menos una especialidad')
    .max(50, 'Máximo 50 especialidades'),
  paymentMethods: paymentMethodsArraySchema,
  isActive: z.boolean().optional(),
});
export type CareCenterValues = z.infer<typeof careCenterSchema>;

// re-export phoneNumberSchema for convenience
export { phoneNumberSchema };

// ---- Orders ----

const ORDER_TYPES = ['cash', 'credit', 'insurance', 'cashea'] as const;
const PROVIDER_TYPES = ['doctor', 'care_center'] as const;
const ORDER_CURRENCIES = ['USD', 'EUR'] as const;
const PAYMENT_TYPES_ORDER = [
  'mobile_payment',
  'bank_transfer',
  'cash_foreign',
  'cash_bs',
  'other',
] as const;

export const orderPaymentSchema = z
  .object({
    id: z.string().uuid().optional(),
    type: z.enum(PAYMENT_TYPES_ORDER, { error: 'Tipo de pago requerido' }),
    paymentDate: z.string().min(1, 'Fecha requerida'),
    referenceNumber: z.string().max(20).optional().or(z.literal('')),
    bankCode: z.string().max(8).optional().or(z.literal('')),
    exchangeRateId: z.string().uuid().optional().or(z.literal('')),
    accountNumber: z.string().max(40).optional().or(z.literal('')),
    amountCurrency: z.enum(['USD', 'EUR', 'BS'], { error: 'Moneda requerida' }),
    amountValue: z
      .number({ error: 'Monto requerido' })
      .positive('Monto debe ser > 0')
      .refine((v) => Math.round(v * 100) === v * 100, { message: 'Máximo 2 decimales' }),
  })
  .superRefine((val, ctx) => {
    const trim = (v?: string) => (v ?? '').trim();
    if (val.type === 'mobile_payment' || val.type === 'bank_transfer') {
      if (!trim(val.bankCode))
        ctx.addIssue({ code: 'custom', path: ['bankCode'], message: 'Banco requerido' });
      if (!trim(val.referenceNumber))
        ctx.addIssue({
          code: 'custom',
          path: ['referenceNumber'],
          message: 'Referencia requerida',
        });
      if (!trim(val.exchangeRateId))
        ctx.addIssue({
          code: 'custom',
          path: ['exchangeRateId'],
          message: 'Tasa requerida',
        });
      if (val.amountCurrency !== 'BS')
        ctx.addIssue({
          code: 'custom',
          path: ['amountCurrency'],
          message: 'Debe ser BS',
        });
    } else if (val.type === 'cash_bs') {
      if (!trim(val.exchangeRateId))
        ctx.addIssue({
          code: 'custom',
          path: ['exchangeRateId'],
          message: 'Tasa requerida',
        });
      if (val.amountCurrency !== 'BS')
        ctx.addIssue({
          code: 'custom',
          path: ['amountCurrency'],
          message: 'Debe ser BS',
        });
    } else if (val.type === 'other') {
      if (!trim(val.referenceNumber))
        ctx.addIssue({
          code: 'custom',
          path: ['referenceNumber'],
          message: 'Referencia requerida',
        });
    }
  });
export type OrderPaymentValues = z.infer<typeof orderPaymentSchema>;

export const orderSchema = z
  .object({
    branchId: z.string().uuid({ message: 'Sucursal requerida' }),
    type: z.enum(ORDER_TYPES, { error: 'Tipo requerido' }),
    holderId: z.string().uuid({ message: 'Titular requerido' }),
    patientId: z.string().uuid({ message: 'Paciente requerido' }),
    contractorId: z.string().uuid().optional().or(z.literal('')),
    insuranceId: z.string().uuid().optional().or(z.literal('')),
    providerType: z.enum(PROVIDER_TYPES, { error: 'Proveedor requerido' }),
    doctorId: z.string().uuid().optional().or(z.literal('')),
    careCenterId: z.string().uuid().optional().or(z.literal('')),
    specialtyId: z.string().uuid({ message: 'Especialidad requerida' }),
    serviceTypeIds: z
      .array(z.string().uuid())
      .min(1, 'Asigná al menos un tipo de servicio')
      .max(50, 'Máximo 50 tipos de servicio'),
    pathologyIds: z
      .array(z.string().uuid())
      .max(50, 'Máximo 50 patologías')
      .optional(),
    orderDate: z
      .string()
      .min(1, 'Fecha de orden requerida')
      .refine(isoDateNotFuture, {
        message: 'La fecha no puede ser posterior a hoy',
      }),
    appointmentDate: z.string().min(1, 'Fecha de atención requerida'),
    priceCurrency: z.enum(ORDER_CURRENCIES, { error: 'Moneda requerida' }),
    priceAmount: z
      .number({ error: 'Monto requerido' })
      .positive('Debe ser > 0')
      .refine((v) => Math.round(v * 100) === v * 100, { message: 'Máximo 2 decimales' }),
    payments: z.array(orderPaymentSchema).max(50).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.providerType === 'doctor') {
      if (!val.doctorId)
        ctx.addIssue({ code: 'custom', path: ['doctorId'], message: 'Doctor requerido' });
    } else {
      if (!val.careCenterId)
        ctx.addIssue({
          code: 'custom',
          path: ['careCenterId'],
          message: 'Centro requerido',
        });
    }
    if (val.type === 'insurance') {
      if (!val.contractorId)
        ctx.addIssue({
          code: 'custom',
          path: ['contractorId'],
          message: 'Contratista requerido',
        });
      if (!val.insuranceId)
        ctx.addIssue({
          code: 'custom',
          path: ['insuranceId'],
          message: 'Seguro requerido',
        });
    }
    if (val.orderDate && val.appointmentDate) {
      if (new Date(val.appointmentDate) < new Date(val.orderDate))
        ctx.addIssue({
          code: 'custom',
          path: ['appointmentDate'],
          message: 'Fecha de atención debe ser ≥ fecha de orden',
        });
    }
  });
export type OrderValues = z.infer<typeof orderSchema>;

export const roleSchema = z.object({
  name: z
    .string({ error: 'El nombre del rol es obligatorio' })
    .min(1, 'El nombre del rol es obligatorio')
    .max(80, 'El nombre del rol no puede superar 80 caracteres'),
  description: z
    .string()
    .max(255, 'La descripción no puede superar 255 caracteres')
    .optional(),
  isActive: z.boolean().optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});
export type RoleValues = z.infer<typeof roleSchema>;
