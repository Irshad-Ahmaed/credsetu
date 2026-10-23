import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().refine((value) => {
    try {
      const url = new URL(value);
      return ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname) && url.pathname.length > 1;
    } catch { return false; }
  }, 'DATABASE_URL must be a valid postgres:// URL.'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must contain at least 32 characters.')
    .refine((value) => value !== 'replace-this-with-a-random-secret-at-least-32-characters', 'Replace the example SESSION_SECRET with a random value.'),
  OTP_MODE: z.enum(['mock']).default('mock'),
});

export const config = schema.parse(process.env);
