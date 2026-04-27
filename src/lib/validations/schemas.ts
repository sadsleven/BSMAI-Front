import { z } from 'zod';
import {
  cedulaSchema,
  phoneNumberSchema,
  phonesArraySchema,
  rifSchema,
} from './ve-formats';

const NAME_REGEX = /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/;
const PHONE_REGEX = /^\d+$/;
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,100}$/;

export const emailSchema = z
  .string({ error: 'El email es obligatorio' })
  .min(1, 'El email es obligatorio')
  .max(200, 'El email no puede superar 200 caracteres')
  .email('El email no tiene un formato válido');

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

export const patientSchema = z.object({
  cedula: cedulaSchema,
  email: emailSchema,
  firstName: nameSchema('El nombre'),
  lastName: nameSchema('El apellido'),
  birthDate: z
    .string({ error: 'La fecha de nacimiento es obligatoria' })
    .min(1, 'La fecha de nacimiento es obligatoria'),
  address: z
    .string({ error: 'La dirección es obligatoria' })
    .min(3, 'La dirección debe tener al menos 3 caracteres')
    .max(500, 'La dirección no puede superar 500 caracteres'),
  phones: phonesArraySchema,
  isActive: z.boolean().optional(),
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
    email: emailSchema,
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
  name: z
    .string({ error: 'El nombre es obligatorio' })
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(200, 'El nombre no puede superar 200 caracteres'),
  email: emailSchema,
  rif: rifSchema,
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
