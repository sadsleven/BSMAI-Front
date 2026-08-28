import { z } from 'zod';
import {
  cedulaSchema,
  optionalRifSchema,
  PATIENT_CEDULA_REGEX,
  patientCedulaSchema,
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

/**
 * True when `v` tiene a lo sumo 2 decimales. Tolerante a error de coma flotante
 * (`19.99 * 100 !== 1999` en IEEE 754): compara contra el valor reconstruido en
 * vez de `Math.round(v*100) === v*100`, que rechaza montos válidos como 19,99.
 */
function hasAtMostTwoDecimals(v: number): boolean {
  return Math.abs(v - Math.round(v * 100) / 100) < 1e-9;
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

/**
 * Lista FE-only de grados académicos venezolanos. La columna BE acepta texto
 * libre ≤40 chars; este whitelist sólo controla el selector.
 */
export const ACADEMIC_DEGREES = [
  'Br.',    // Bachiller
  'TSU',    // Técnico Superior Universitario
  'Lic.',   // Licenciado
  'Ing.',   // Ingeniero
  'Esp.',   // Especialista
  'Mg.',    // Magíster
  'PhD',    // Doctor (PhD)
] as const;
export type AcademicDegree = (typeof ACADEMIC_DEGREES)[number];

export const academicDegreeSchema = z
  .string()
  .max(40, 'El grado académico no puede superar 40 caracteres')
  .optional();

export const jobTitleSchema = z
  .string()
  .max(100, 'El cargo no puede superar 100 caracteres')
  .optional();

export const profileSchema = z.object({
  firstName: nameSchema('El nombre'),
  lastName: nameSchema('El apellido'),
  email: emailSchema,
  phoneNumber: phoneSchema,
  academicDegree: academicDegreeSchema,
  jobTitle: jobTitleSchema,
});
export type ProfileValues = z.infer<typeof profileSchema>;

export const createUserSchema = z
  .object({
    firstName: nameSchema('El nombre'),
    lastName: nameSchema('El apellido'),
    email: emailSchema,
    phoneNumber: phoneSchema,
    academicDegree: academicDegreeSchema,
    jobTitle: jobTitleSchema,
    password: passwordSchema,
    confirmPassword: z.string({ error: 'Confirma la contraseña' }),
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
  academicDegree: academicDegreeSchema,
  jobTitle: jobTitleSchema,
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
    confirmNewPassword: z.string({ error: 'Confirma la nueva contraseña' }),
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
      confirmNewPassword: z.string({ error: 'Confirma la nueva contraseña' }),
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
      error: 'Selecciona un tipo de persona',
    }),
    cedula: z.string().optional().or(z.literal('')),
    firstName: z.string().optional().or(z.literal('')),
    lastName: z.string().optional().or(z.literal('')),
    businessName: z.string().optional().or(z.literal('')),
    rif: z.string().optional().or(z.literal('')),
    email: optionalEmailSchema,
    birthDate: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || isoDateNotFuture(v), {
        message: 'La fecha no puede ser posterior a hoy',
      }),
    address: z
      .string()
      .max(500, 'La dirección no puede superar 500 caracteres')
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || v.length >= 3, {
        message: 'La dirección debe tener al menos 3 caracteres',
      }),
    phones: phonesArraySchema,
    contractorIds: z
      .array(z.string().uuid())
      .max(50, 'Máximo 50 contratistas por paciente')
      .optional(),
    directInsuranceIds: z
      .array(z.string().uuid())
      .max(50, 'Máximo 50 seguros directos por paciente')
      .optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.personType === 'natural') {
      if (val.cedula && !PATIENT_CEDULA_REGEX.test(val.cedula)) {
        ctx.addIssue({
          code: 'custom',
          path: ['cedula'],
          message: 'Formato inválido. Ej: V-12.345.678 o M-12.345.678 (menores)',
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
      } else if (!/^[JGVE]-\d{7,8}-\d$/.test(val.rif)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rif'],
          message: 'Formato inválido. Ej: J-12345678-9',
        });
      }
    }
  });
export type PatientValues = z.infer<typeof patientSchema>;

// Re-export VE schemas for convenience
export { cedulaSchema, patientCedulaSchema, rifSchema, phonesArraySchema };

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

/**
 * Tipo de Servicio: nombre + precio Particular (USD y EUR, ambos obligatorios).
 * Los precios por Seguro/Doctor/Centro viven en sus propios formularios.
 */
export const serviceTypeSchema = z.object({
  name: z
    .string({ error: 'El nombre es obligatorio' })
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(200, 'El nombre no puede superar 200 caracteres'),
  description: z
    .string()
    .max(500, 'La descripción no puede superar 500 caracteres')
    .optional(),
  isActive: z.boolean().optional(),
  particularPriceUsd: z
    .number()
    .positive('Debe ser > 0')
    .refine((v) => hasAtMostTwoDecimals(v), { message: 'Máximo 2 decimales' })
    .optional(),
});
export type ServiceTypeValues = z.infer<typeof serviceTypeSchema>;

/**
 * Lista de precios por Tipo de Servicio (Seguro/Doctor/Centro). USD obligatorio
 * y > 0. Sin duplicados por serviceTypeId.
 */
const servicePriceRowSchema = z.object({
  serviceTypeId: z.string().uuid({ message: 'Selecciona un servicio' }),
  priceUsd: z
    .number({ error: 'Precio USD requerido' })
    .positive('Debe ser > 0')
    .refine((v) => hasAtMostTwoDecimals(v), { message: 'Máximo 2 decimales' }),
});

export const servicePricesArraySchema = z
  .array(servicePriceRowSchema)
  .max(5000, 'Máximo 5000 precios')
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      if (!r.serviceTypeId) return;
      if (seen.has(r.serviceTypeId)) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'serviceTypeId'],
          message: 'Servicio duplicado',
        });
      }
      seen.add(r.serviceTypeId);
    });
  })
  .optional();
export type ServicePricesArrayValues = z.infer<typeof servicePricesArraySchema>;

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
  currency: z.enum(['USD', 'EUR'], { error: 'Selecciona una moneda' }),
  amountBs: z
    .number({ error: 'El monto es obligatorio' })
    .positive('El monto debe ser mayor a 0')
    .max(999_999_999.99, 'Monto excede el máximo permitido')
    .refine((v) => hasAtMostTwoDecimals(v), {
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

/**
 * Unidad Tributaria. `amountBs` numérico; `effectiveDate` es date (sin hora) —
 * la UT se publica por Gaceta Oficial con vigencia desde un día calendario.
 */
export const taxUnitSchema = z.object({
  amountBs: z
    .number({ error: 'El monto es obligatorio' })
    .positive('El monto debe ser mayor a 0')
    .max(999_999_999.99, 'Monto excede el máximo permitido')
    .refine((v) => hasAtMostTwoDecimals(v), { message: 'Máximo 2 decimales' }),
  effectiveDate: z
    .string({ error: 'La fecha efectiva es obligatoria' })
    .min(1, 'La fecha efectiva es obligatoria'),
  isActive: z.boolean().optional(),
});
export type TaxUnitValues = z.infer<typeof taxUnitSchema>;

export const insuranceSchema = z.object({
  name: z
    .string({ error: 'El nombre es obligatorio' })
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(200, 'El nombre no puede superar 200 caracteres'),
  shortName: z
    .string()
    .max(100, 'El nombre corto no puede superar 100 caracteres')
    .optional(),
  description: z
    .string()
    .max(500, 'La descripción no puede superar 500 caracteres')
    .optional(),
  email: optionalEmailSchema,
  fiscalAddress: z
    .string()
    .max(500, 'El dirección fiscal no puede superar 500 caracteres')
    .optional(),
  rif: optionalRifSchema,
  phones: phonesArraySchema,
  servicePrices: servicePricesArraySchema,
  isActive: z.boolean().optional(),
  isIndexed: z.boolean().optional(),
});
export type InsuranceValues = z.infer<typeof insuranceSchema>;

// ---- Doctores y Centros de Atención (métodos de pago compartidos) ----

const PAYMENT_METHOD_TYPES = ['mobile_payment', 'bank_transfer', 'other'] as const;

/**
 * Tipos de cuenta propia (PaymentAccount). Incluye `card` (Punto / POS de
 * tarjeta) — exclusivo de cuentas propias para pagos entrantes. NO se comparte
 * con los métodos de pago de doctores/centros (`PAYMENT_METHOD_TYPES`).
 */
const PAYMENT_ACCOUNT_TYPES = [
  'mobile_payment',
  'bank_transfer',
  'bank_transfer_usd',
  'card',
  'other',
] as const;

const optString = (max: number) => z.string().max(max).optional();

export const paymentMethodSchema = z
  .object({
    id: z.string().uuid().optional(),
    type: z.enum(PAYMENT_METHOD_TYPES, { error: 'Selecciona un tipo' }),
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

// ---- Bank (catálogo de bancos administrable) ----
export const bankSchema = z.object({
  code: z
    .string({ error: 'El código es obligatorio' })
    .trim()
    .regex(/^\d{3,4}$/, 'El código debe tener 3 o 4 dígitos'),
  name: z
    .string({ error: 'El nombre es obligatorio' })
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(200, 'El nombre no puede superar 200 caracteres'),
});
export type BankValues = z.infer<typeof bankSchema>;

// ---- PaymentAccount (cuenta propia del negocio donde se recibe dinero) ----
export const paymentAccountSchema = z
  .object({
    name: z
      .string({ error: 'El nombre es obligatorio' })
      .min(1, 'El nombre es obligatorio')
      .max(200, 'El nombre no puede superar 200 caracteres'),
    type: z.enum(PAYMENT_ACCOUNT_TYPES, { error: 'Selecciona un tipo' }),
    isActive: z.boolean().optional(),
    bankCode: optString(8),
    phoneNumber: optString(11),
    idDocument: optString(24),
    accountNumber: optString(20),
    accountHolderName: optString(200),
    description: optString(500),
  })
  .superRefine((val, ctx) => {
    const trim = (v?: string) => (v ?? '').trim();
    if (val.type === 'card') {
      if (!trim(val.bankCode))
        ctx.addIssue({ code: 'custom', path: ['bankCode'], message: 'Banco requerido' });
      if (!trim(val.accountHolderName))
        ctx.addIssue({
          code: 'custom',
          path: ['accountHolderName'],
          message: 'Titular requerido',
        });
    } else if (val.type === 'mobile_payment') {
      if (!trim(val.bankCode))
        ctx.addIssue({ code: 'custom', path: ['bankCode'], message: 'Banco requerido' });
      if (!/^\d{11}$/.test(trim(val.phoneNumber)))
        ctx.addIssue({
          code: 'custom',
          path: ['phoneNumber'],
          message: 'Teléfono de 11 dígitos',
        });
      if (!trim(val.idDocument))
        ctx.addIssue({ code: 'custom', path: ['idDocument'], message: 'Cédula/RIF requerido' });
      if (!trim(val.accountHolderName))
        ctx.addIssue({
          code: 'custom',
          path: ['accountHolderName'],
          message: 'Titular requerido',
        });
    } else if (
      val.type === 'bank_transfer' ||
      val.type === 'bank_transfer_usd'
    ) {
      if (!trim(val.bankCode))
        ctx.addIssue({ code: 'custom', path: ['bankCode'], message: 'Banco requerido' });
      if (!/^\d{20}$/.test(trim(val.accountNumber)))
        ctx.addIssue({
          code: 'custom',
          path: ['accountNumber'],
          message: 'Cuenta de 20 dígitos',
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
export type PaymentAccountValues = z.infer<typeof paymentAccountSchema>;

/**
 * Valida el par contraseña/confirmación opcional de proveedores (doctor/centro).
 * Si `password` viene no vacío: exige fuerza (PASSWORD_REGEX) y que coincida con
 * `confirmPassword`. Vacío → sin acceso, no valida nada.
 */
function refineOptionalPassword(
  val: { password?: string; confirmPassword?: string },
  ctx: z.RefinementCtx,
): void {
  const pwd = (val.password ?? '').trim();
  if (!pwd) return;
  if (!PASSWORD_REGEX.test(pwd)) {
    ctx.addIssue({
      code: 'custom',
      path: ['password'],
      message:
        'La contraseña debe tener mín. 8 caracteres con mayúscula, minúscula, número y carácter especial',
    });
  }
  if (val.password !== val.confirmPassword) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'Las contraseñas no coinciden',
    });
  }
}

/**
 * El email del proveedor es opcional, pero si define contraseña (acceso al
 * sistema) el email pasa a ser su usuario y se vuelve obligatorio.
 */
function refineAccessEmail(
  val: { email?: string; password?: string },
  ctx: z.RefinementCtx,
): void {
  const pwd = (val.password ?? '').trim();
  if (pwd && !(val.email ?? '').trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['email'],
      message: 'El email es requerido para habilitar el acceso al sistema',
    });
  }
}

export const doctorSchema = z
  .object({
    cedula: cedulaSchema,
    email: optionalEmailSchema,
    firstName: nameSchema('El nombre'),
    lastName: nameSchema('El apellido'),
    isLegalEntity: z.boolean(),
    rif: z.string().optional().or(z.literal('')),
    centerAddress: z
      .string()
      .max(500, 'La dirección del centro no puede superar 500 caracteres')
      .optional(),
    phones: phonesArraySchema,
    specialtyIds: z
      .array(z.string().uuid())
      .min(1, 'Asigna al menos una especialidad')
      .max(20, 'Máximo 20 especialidades'),
    paymentMethods: paymentMethodsArraySchema,
    servicePrices: servicePricesArraySchema,
    isActive: z.boolean().optional(),
    /** Acceso al sistema (opcional). Si se define, habilita login del proveedor. */
    password: z.string().optional().or(z.literal('')),
    confirmPassword: z.string().optional().or(z.literal('')),
  })
  .superRefine((val, ctx) => {
    if (val.isLegalEntity) {
      if (!val.rif) {
        ctx.addIssue({
          code: 'custom',
          path: ['rif'],
          message: 'El RIF es requerido cuando es persona jurídica',
        });
      } else if (!/^[JGVE]-\d{7,8}-\d$/.test(val.rif)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rif'],
          message: 'Formato inválido. Ej: J-12345678-9',
        });
      }
    } else if (val.rif) {
      ctx.addIssue({
        code: 'custom',
        path: ['rif'],
        message: 'No se admite RIF para persona natural',
      });
    }
    refineOptionalPassword(val, ctx);
    refineAccessEmail(val, ctx);
  });
export type DoctorValues = z.infer<typeof doctorSchema>;

export const careCenterSchema = z
  .object({
    businessName: z
      .string({ error: 'La razón social es obligatoria' })
      .min(2, 'La razón social debe tener al menos 2 caracteres')
      .max(200, 'La razón social no puede superar 200 caracteres'),
    email: optionalEmailSchema,
    rif: optionalRifSchema,
    centerAddress: z
      .string()
      .max(500, 'La dirección del centro no puede superar 500 caracteres')
      .optional(),
    phones: phonesArraySchema,
    specialtyIds: z
      .array(z.string().uuid())
      .min(1, 'Asigna al menos una especialidad')
      .max(50, 'Máximo 50 especialidades'),
    paymentMethods: paymentMethodsArraySchema,
    servicePrices: servicePricesArraySchema,
    isActive: z.boolean().optional(),
    /** Acceso al sistema (opcional). Si se define, habilita login del proveedor. */
    password: z.string().optional().or(z.literal('')),
    confirmPassword: z.string().optional().or(z.literal('')),
  })
  .superRefine((val, ctx) => {
    refineOptionalPassword(val, ctx);
    refineAccessEmail(val, ctx);
  });
export type CareCenterValues = z.infer<typeof careCenterSchema>;

// re-export phoneNumberSchema for convenience
export { phoneNumberSchema };

// ---- Orders ----

const ORDER_TYPES = ['cash', 'credit', 'insurance', 'cashea'] as const;
const PROVIDER_TYPES = ['doctor', 'care_center'] as const;
const PAYMENT_TYPES_ORDER = [
  'mobile_payment',
  'bank_transfer',
  'bank_transfer_usd',
  'card',
  'cash_usd',
  'cash_eur',
  'cash_bs',
  'other',
] as const;

/**
 * Factory del schema de pago. `requirePaymentAccount` exige una cuenta propia
 * de AFMI (`paymentAccountId`) para los tipos mobile_payment/bank_transfer/other.
 * Aplica a pagos ENTRANTES (órdenes, cuentas por cobrar). Los flujos de EGRESO
 * (cuentas por pagar, retenciones) no usan cuenta propia → `false`.
 *
 * `requireBsRate` (def true) exige `exchangeRateId` en pagos BS
 * (mobile_payment/bank_transfer/cash_bs y `other` en BS) para snapshotear la
 * tasa USD/Bs. Las retenciones se pagan al SENIAT en Bs fijos sin conversión →
 * `false` (no se pide tasa).
 */
function makeOrderPaymentSchema(
  requirePaymentAccount: boolean,
  requireBsRate = true,
) {
  return z
    .object({
      id: z.string().uuid().optional(),
      type: z.enum(PAYMENT_TYPES_ORDER, { error: 'Tipo de pago requerido' }),
      paymentDate: z.string().min(1, 'Fecha requerida'),
      referenceNumber: z.string().max(20).optional().or(z.literal('')),
      bankCode: z.string().max(8).optional().or(z.literal('')),
      exchangeRateId: z.string().uuid().optional().or(z.literal('')),
      paymentAccountId: z.string().uuid().optional().or(z.literal('')),
      accountNumber: z.string().max(40).optional().or(z.literal('')),
      amountCurrency: z.enum(['USD', 'EUR', 'BS'], { error: 'Moneda requerida' }),
      amountValue: z
        .number({ error: 'Monto requerido' })
        .positive('Monto debe ser > 0')
        .refine((v) => hasAtMostTwoDecimals(v), { message: 'Máximo 2 decimales' }),
    })
    .superRefine((val, ctx) => {
      const trim = (v?: string) => (v ?? '').trim();
      const needsAccount =
        val.type === 'mobile_payment' ||
        val.type === 'bank_transfer' ||
        val.type === 'bank_transfer_usd' ||
        val.type === 'card' ||
        val.type === 'other';
      if (requirePaymentAccount && needsAccount && !trim(val.paymentAccountId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['paymentAccountId'],
          message: 'Cuenta bancaria requerida',
        });
      }
      if (
        val.type === 'mobile_payment' ||
        val.type === 'bank_transfer' ||
        val.type === 'card'
      ) {
        if (!trim(val.referenceNumber))
          ctx.addIssue({
            code: 'custom',
            path: ['referenceNumber'],
            message: 'Referencia requerida',
          });
        if (requireBsRate && !trim(val.exchangeRateId))
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
      } else if (val.type === 'bank_transfer_usd') {
        if (!trim(val.referenceNumber))
          ctx.addIssue({
            code: 'custom',
            path: ['referenceNumber'],
            message: 'Referencia requerida',
          });
        if (val.amountCurrency !== 'USD')
          ctx.addIssue({
            code: 'custom',
            path: ['amountCurrency'],
            message: 'Debe ser USD',
          });
      } else if (val.type === 'cash_bs') {
        if (requireBsRate && !trim(val.exchangeRateId))
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
      } else if (val.type === 'cash_usd') {
        if (val.amountCurrency !== 'USD')
          ctx.addIssue({
            code: 'custom',
            path: ['amountCurrency'],
            message: 'Debe ser USD',
          });
      } else if (val.type === 'cash_eur') {
        if (!trim(val.exchangeRateId))
          ctx.addIssue({
            code: 'custom',
            path: ['exchangeRateId'],
            message: 'Tasa EUR requerida',
          });
        if (val.amountCurrency !== 'EUR')
          ctx.addIssue({
            code: 'custom',
            path: ['amountCurrency'],
            message: 'Debe ser EUR',
          });
      } else if (val.type === 'other') {
        if (!trim(val.referenceNumber))
          ctx.addIssue({
            code: 'custom',
            path: ['referenceNumber'],
            message: 'Referencia requerida',
          });
        if (
          ((val.amountCurrency === 'BS' && requireBsRate) ||
            val.amountCurrency === 'EUR') &&
          !trim(val.exchangeRateId)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['exchangeRateId'],
            message: 'Tasa requerida',
          });
        }
      }
    });
}

/** Pagos ENTRANTES (órdenes, cuentas por cobrar): requieren cuenta propia. */
export const orderPaymentSchema = makeOrderPaymentSchema(true);
/** Pagos de EGRESO a proveedores (cuentas por pagar): sin cuenta propia, con tasa. */
export const egressPaymentSchema = makeOrderPaymentSchema(false);
/**
 * Pagos de RETENCIONES al SENIAT: Bs fijos, sin cuenta propia y sin tasa
 * (el monto ya está denominado en Bs por la retención).
 */
export const taxPaymentSchema = makeOrderPaymentSchema(false, false);
export type OrderPaymentValues = z.infer<typeof orderPaymentSchema>;

export const orderSchema = z
  .object({
    branchId: z.string().uuid({ message: 'Sucursal requerida' }),
    type: z.enum(ORDER_TYPES, { error: 'Tipo requerido' }),
    holderId: z.string().uuid({ message: 'Titular requerido' }),
    patientId: z.string().uuid({ message: 'Paciente requerido' }),
    contractorId: z.string().uuid().optional().or(z.literal('')),
    insuranceId: z.string().uuid().optional().or(z.literal('')),
    insuranceSource: z
      .enum(['direct', 'via_contractor'])
      .optional()
      .or(z.literal('')),
    serviceKey: z
      .string()
      .max(30, 'La clave de servicio no puede superar 30 caracteres')
      .optional()
      .or(z.literal('')),
    isReimbursement: z.boolean().optional(),
    // Número de orden manual (órdenes históricas). El tope (< ORDER_NUMBER_START)
    // lo conoce el backend; el form lo valida contra el valor consultado y el
    // backend lo rechaza igual si no cuadra.
    customOrderNumber: z
      .number()
      .int('El número de orden debe ser un entero')
      .min(1, 'Debe ser mayor o igual a 1')
      .optional(),
    serviceTypes: z
      .array(
        z.object({
          serviceTypeId: z.string().uuid({ message: 'Tipo de servicio requerido' }),
          providerType: z.enum(PROVIDER_TYPES, { error: 'Proveedor requerido' }),
          // Especialidad por fila: una orden puede combinar varias (ej.
          // laboratorio en un centro + rayos X en otro). El backend deriva la
          // principal de la orden desde la primera fila.
          specialtyId: z.string().uuid({ message: 'Especialidad requerida' }),
          doctorId: z.string().uuid().optional().or(z.literal('')),
          careCenterId: z.string().uuid().optional().or(z.literal('')),
          quantity: z
            .number()
            .int('La cantidad debe ser un entero')
            .min(1, 'La cantidad debe ser ≥ 1')
            .max(100000, 'Cantidad demasiado alta')
            .optional(),
          customName: z
            .string({ error: 'El nombre para la orden es obligatorio' })
            .trim()
            .min(1, 'El nombre para la orden es obligatorio')
            .max(300, 'Máximo 300 caracteres'),
          // ST indexado (tasa del día del cobro). Sólo con seguro no indexado.
          isIndexed: z.boolean().optional(),
        }),
      )
      .min(1, 'Asigna al menos un tipo de servicio')
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
    priceAmount: z
      .number({ error: 'Monto requerido' })
      .positive('Debe ser > 0')
      .refine((v) => hasAtMostTwoDecimals(v), { message: 'Máximo 2 decimales' }),
    // Monto base = suma de los precios de catálogo (baremo del seguro o
    // Particular). FE-only: no viaja al BE, que lo recalcula. Sirve para
    // detectar el ajuste (descuento/recargo) y exigir su motivo.
    priceBaseAmount: z.number().optional(),
    priceAdjustmentNote: z
      .string()
      .trim()
      .max(500, 'Máximo 500 caracteres')
      .optional(),
    casheaFirstInstallmentAmount: z
      .number()
      .min(0, 'No puede ser negativo')
      .refine((v) => hasAtMostTwoDecimals(v), { message: 'Máximo 2 decimales' })
      .optional(),
    // % de inicial Cashea (FE-only, no viaja al BE): el monto de la inicial se
    // deriva readonly como round2(priceAmount × pct / 100).
    casheaInitialPercent: z
      .number()
      .min(0, 'No puede ser negativo')
      .refine((v) => hasAtMostTwoDecimals(v), { message: 'Máximo 2 decimales' })
      .optional(),
    // Derivado del flag `isIndexed` del seguro. La tasa fija en sí se elige en
    // el Paso 4 (Facturación), junto con la tasa de la factura.
    useFixedRate: z.boolean().optional(),
    payments: z.array(orderPaymentSchema).max(50).optional(),
  })
  .superRefine((val, ctx) => {
    // Validación de provider por fila — exactamente uno de doctorId/careCenterId.
    val.serviceTypes.forEach((row, i) => {
      if (row.providerType === 'doctor') {
        if (!row.doctorId) {
          ctx.addIssue({
            code: 'custom',
            path: ['serviceTypes', i, 'doctorId'],
            message: 'Doctor requerido',
          });
        }
        if (row.careCenterId) {
          ctx.addIssue({
            code: 'custom',
            path: ['serviceTypes', i, 'careCenterId'],
            message: 'Fila Doctor no admite Centro',
          });
        }
      } else if (row.providerType === 'care_center') {
        if (!row.careCenterId) {
          ctx.addIssue({
            code: 'custom',
            path: ['serviceTypes', i, 'careCenterId'],
            message: 'Centro requerido',
          });
        }
        if (row.doctorId) {
          ctx.addIssue({
            code: 'custom',
            path: ['serviceTypes', i, 'doctorId'],
            message: 'Fila Centro no admite Doctor',
          });
        }
      }
    });
    // Sin STs duplicados.
    const stSet = new Set<string>();
    val.serviceTypes.forEach((row, i) => {
      if (!row.serviceTypeId) return;
      if (stSet.has(row.serviceTypeId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['serviceTypes', i, 'serviceTypeId'],
          message: 'Tipo de servicio duplicado',
        });
      }
      stSet.add(row.serviceTypeId);
    });
    if (val.type === 'insurance') {
      if (!val.insuranceId)
        ctx.addIssue({
          code: 'custom',
          path: ['insuranceId'],
          message: 'Seguro requerido',
        });
      if (!val.insuranceSource)
        ctx.addIssue({
          code: 'custom',
          path: ['insuranceSource'],
          message: 'Elige un seguro del titular (directo o vía contratista)',
        });
      if (val.insuranceSource === 'via_contractor' && !val.contractorId)
        ctx.addIssue({
          code: 'custom',
          path: ['contractorId'],
          message: 'Contratista requerido para seguro vía contratista',
        });
      if (val.insuranceSource === 'direct' && val.contractorId)
        ctx.addIssue({
          code: 'custom',
          path: ['contractorId'],
          message: 'Seguro directo no admite contratista',
        });
    } else if (val.serviceKey && val.serviceKey.trim() !== '') {
      ctx.addIssue({
        code: 'custom',
        path: ['serviceKey'],
        message: 'La clave de servicio solo aplica a órdenes tipo seguro',
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
    if (val.type === 'cashea') {
      // La inicial se ingresa como % del total (el monto se deriva readonly).
      // Puede ser 0% (sin pago en el Paso 1) pero nunca 100% o más: Cashea debe
      // financiar un restante > 0.
      if (val.casheaInitialPercent == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['casheaInitialPercent'],
          message: 'Ingresa el % de inicial',
        });
      } else if (val.casheaInitialPercent >= 100) {
        ctx.addIssue({
          code: 'custom',
          path: ['casheaInitialPercent'],
          message: 'La inicial debe ser menor al 100%',
        });
      } else if (
        typeof val.priceAmount === 'number' &&
        val.priceAmount > 0 &&
        val.casheaFirstInstallmentAmount != null &&
        val.casheaFirstInstallmentAmount >= val.priceAmount
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['casheaInitialPercent'],
          message: 'La inicial no puede igualar o superar el precio total',
        });
      }
    }
    // Ajuste de monto (descuento o recargo respecto del precio de catálogo):
    // el motivo es obligatorio para dejar trazabilidad de quién y por qué.
    if (
      typeof val.priceBaseAmount === 'number' &&
      typeof val.priceAmount === 'number' &&
      Math.round(val.priceBaseAmount * 100) !==
        Math.round(val.priceAmount * 100) &&
      !(val.priceAdjustmentNote ?? '').trim()
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['priceAdjustmentNote'],
        message: 'Indica el motivo del ajuste de monto',
      });
    }
    if (val.useFixedRate) {
      if (val.type !== 'insurance') {
        ctx.addIssue({
          code: 'custom',
          path: ['useFixedRate'],
          message: 'La tasa fija solo aplica a órdenes tipo seguro',
        });
      }
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
