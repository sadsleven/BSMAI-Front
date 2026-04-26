import { z } from 'zod';

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
