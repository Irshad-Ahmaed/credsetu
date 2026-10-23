import { z } from 'zod';

export const phoneSchema = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number.');
export const uuidV4Schema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Enter a valid identifier.');
export const createLoanSchema = z.object({
  friend_name: z.string().trim().refine((value) => Array.from(value).length >= 2 && Array.from(value).length <= 80, 'Enter 2 to 80 characters.'),
  amount_paise: z.string().regex(/^[1-9]\d*$/, 'Enter a positive amount in paise.')
    .refine((value) => value.length <= 10 && /^[1-9]\d*$/.test(value) && BigInt(value) <= 1_000_000_000n, 'Maximum loan amount is ₹1,00,00,000.00.'),
  due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a due date.'),
}).strict();
