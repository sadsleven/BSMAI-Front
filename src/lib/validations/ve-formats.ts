import { z } from 'zod';

/**
 * Formatos venezolanos compartidos: cédula, RIF, teléfono.
 * Reglas reflejadas en el backend (`src/shared/validators/ve-formats.ts`).
 */

export const CEDULA_REGEX = /^[VE]-\d{1,2}\.\d{3}\.\d{3}$/;
export const RIF_REGEX = /^[JGVE]-\d{1,2}\.\d{3}\.\d{3}-\d$/;
export const PHONE_REGEX = /^\d{11}$/;

export const cedulaSchema = z
  .string({ message: 'La cédula es requerida' })
  .regex(CEDULA_REGEX, 'Formato inválido. Ej: V-12.345.678');

export const rifSchema = z
  .string({ message: 'El RIF es requerido' })
  .regex(RIF_REGEX, 'Formato inválido. Ej: J-12.345.678-9');

/** RIF opcional. Empty/undefined passes; if filled, must match RIF_REGEX. */
export const optionalRifSchema = z
  .string()
  .optional()
  .refine((v) => !v || RIF_REGEX.test(v), {
    message: 'Formato inválido. Ej: J-12.345.678-9',
  });

export const phoneNumberSchema = z
  .string({ message: 'El teléfono es requerido' })
  .regex(PHONE_REGEX, 'Debe tener exactamente 11 dígitos');

export const phoneItemSchema = z.object({
  number: phoneNumberSchema,
  label: z.string().max(80).optional().or(z.literal('')),
});

export const phonesArraySchema = z
  .array(phoneItemSchema)
  .max(10, 'Máximo 10 teléfonos');

export type PhoneItemValue = z.infer<typeof phoneItemSchema>;

// ---- Formatters (auto-format mientras el usuario tipea) ----

/**
 * Formatea cédula a `V-XX.XXX.XXX` (acepta 7-8 dígitos).
 * Acepta input parcial; devuelve la mejor representación posible.
 */
export function formatCedula(input: string): string {
  if (!input) return '';
  const upper = input.toUpperCase();
  const prefixMatch = upper.match(/^([VE])/);
  const prefix = prefixMatch ? prefixMatch[1] : 'V';
  const digits = upper.replace(/[^0-9]/g, '').slice(0, 8);
  if (!digits) return prefix === upper.trim() || upper.startsWith(prefix) ? `${prefix}-` : '';
  let body: string;
  if (digits.length <= 3) body = digits;
  else if (digits.length <= 6)
    body = `${digits.slice(0, digits.length - 3)}.${digits.slice(-3)}`;
  else
    body = `${digits.slice(0, digits.length - 6)}.${digits.slice(-6, -3)}.${digits.slice(-3)}`;
  return `${prefix}-${body}`;
}

/**
 * Formatea RIF a `J-XX.XXX.XXX-D` (acepta 8-9 dígitos: base + verificador).
 * Cuando el usuario completa 8+ dígitos, separa el último como verificador.
 */
export function formatRif(input: string): string {
  if (!input) return '';
  const upper = input.toUpperCase();
  const prefixMatch = upper.match(/^([JGVE])/);
  const prefix = prefixMatch ? prefixMatch[1] : 'J';
  const digits = upper.replace(/[^0-9]/g, '').slice(0, 9);
  if (!digits) return upper.startsWith(prefix) ? `${prefix}-` : '';
  let baseDigits = digits;
  let verifier = '';
  if (digits.length >= 8) {
    baseDigits = digits.slice(0, -1);
    verifier = digits.slice(-1);
  }
  let body: string;
  if (baseDigits.length <= 3) body = baseDigits;
  else if (baseDigits.length <= 6)
    body = `${baseDigits.slice(0, baseDigits.length - 3)}.${baseDigits.slice(-3)}`;
  else
    body = `${baseDigits.slice(0, baseDigits.length - 6)}.${baseDigits.slice(
      -6,
      -3,
    )}.${baseDigits.slice(-3)}`;
  return verifier ? `${prefix}-${body}-${verifier}` : `${prefix}-${body}`;
}

/** Limita el número de teléfono a 11 dígitos. */
export function formatPhoneDigits(input: string): string {
  return (input ?? '').replace(/\D/g, '').slice(0, 11);
}
