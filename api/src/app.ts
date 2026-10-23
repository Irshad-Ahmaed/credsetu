import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { createHmac, createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { pool } from './db/pool.js';
import { config } from './config.js';
import { businessToday, isCalendarDate } from './dates.js';
import { getLedgerSummary, getLoanPage, loanJson } from './ledgerQueries.js';
import { registerDashboard } from './dashboard.js';
import { registerDeleteLoan } from './deleteLoan.js';
import { createLoanSchema, phoneSchema, uuidV4Schema } from './validators.js';

declare global {
  namespace Express { interface Request { userId?: string; sessionId?: string } }
}

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'] }));
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => { res.setHeader('X-Request-Id', randomUUID()); next(); });
app.use((req, res, next) => {
  if (config.NODE_ENV !== 'development' || req.method !== 'POST' || req.path !== '/v1/loans') return next();
  const startedAt = Date.now();
  const bodyType = req.is('multipart/form-data') ? 'multipart' : req.is('application/json') ? 'json' : 'other';
  console.info(`[DEV SAVE] ${bodyType} request started`);
  req.once('aborted', () => console.warn('[DEV SAVE] request aborted before completion'));
  res.once('finish', () => console.info(`[DEV SAVE] status=${res.statusCode} elapsed_ms=${Date.now() - startedAt}`));
  next();
});

const mockOtpAllowed = config.NODE_ENV === 'development' && config.OTP_MODE === 'mock';
if (!mockOtpAllowed) throw new Error('This assignment build only supports mock OTP in development mode.');
const secret = config.SESSION_SECRET;

const digest = (value: string) => createHmac('sha256', secret).update(value).digest('hex');
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const sendError = (res: Response, status: number, code: string, message: string, field_errors?: Record<string, string>) =>
  res.status(status).json({ error: { code, message, ...(field_errors ? { field_errors } : {}) } });

const windows = new Map<string, { count: number; until: number }>();
function limited(key: string, max: number, ms: number): number {
  const now = Date.now();
  let window = windows.get(key);
  if (!window || window.until <= now) {
    window = { count: 0, until: now + ms };
    windows.set(key, window);
  }
  window.count += 1;
  return window.count > max ? Math.max(1, Math.ceil((window.until - now) / 1000)) : 0;
}
setInterval(() => { const now = Date.now(); for (const [key, value] of windows) if (value.until <= now) windows.delete(key); }, 60_000).unref();

function normalizePhone(input: string): string | null {
  const phone = input.trim().replace(/[\s()-]/g, '');
  if (phone.startsWith('+')) return phoneSchema.safeParse(phone).success ? phone : null;
  const digits = phone.replace(/^0+/, '');
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  return phoneSchema.safeParse(digits).success ? `+${digits}` : null;
}

app.get('/v1/health', (_req, res) => res.json({ data: { status: 'ok' } }));
app.get('/v1/ready', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ data: { status: 'ready' } }); }
  catch { sendError(res, 503, 'DATABASE_UNAVAILABLE', 'The database is not ready.'); }
});

app.post('/v1/auth/request-otp', async (req, res) => {
  const normalized = typeof req.body?.phone === 'string' ? normalizePhone(req.body.phone) : null;
  if (!normalized) return sendError(res, 422, 'VALIDATION_ERROR', 'Enter a valid phone number.', { phone: 'Enter a valid phone number.' });
  const ip = req.ip ?? 'unknown';
  const phoneWait = limited(`otp:phone:${normalized}`, 3, 15 * 60_000);
  const ipWait = limited(`otp:ip:${ip}`, 20, 60 * 60_000);
  if (phoneWait || ipWait) {
    res.setHeader('Retry-After', String(Math.max(phoneWait, ipWait)));
    return sendError(res, 429, 'RATE_LIMITED', 'Too many code requests. Wait a minute and try again.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [normalized]);
    const prior = await client.query('SELECT created_at FROM otp_challenges WHERE phone_e164=$1 ORDER BY created_at DESC LIMIT 1', [normalized]);
    const last = prior.rows[0]?.created_at as Date | undefined;
    if (last && Date.now() - last.getTime() < 30_000) {
      await client.query('ROLLBACK');
      res.setHeader('Retry-After', String(Math.ceil((30_000 - (Date.now() - last.getTime())) / 1000)));
      return sendError(res, 429, 'RESEND_COOLDOWN', 'Wait before requesting another code.');
    }
    await client.query('UPDATE otp_challenges SET invalidated_at=now() WHERE phone_e164=$1 AND consumed_at IS NULL AND invalidated_at IS NULL', [normalized]);
    const challengeId = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await client.query('INSERT INTO otp_challenges(id,phone_e164,otp_digest,expires_at) VALUES($1,$2,$3,now()+interval \'5 minutes\')', [challengeId, normalized, digest(`${challengeId}:${code}`)]);
    await client.query('COMMIT');
    if (mockOtpAllowed) console.info(`[DEV OTP] challenge=${challengeId} code=${code}`);
    return res.status(202).json({ data: { challenge_id: challengeId, expires_at: new Date(Date.now() + 300_000).toISOString(), resend_available_at: new Date(Date.now() + 30_000).toISOString() } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
});

app.post('/v1/auth/verify-otp', async (req, res) => {
  const { challenge_id, code } = req.body ?? {};
  if (!uuidV4Schema.safeParse(challenge_id).success || typeof code !== 'string' || !/^\d{6}$/.test(code)) return sendError(res, 422, 'VALIDATION_ERROR', 'Enter the six-digit code and use the latest challenge.');
  const verifyWait = limited(`verify:ip:${req.ip ?? 'unknown'}`, 30, 15 * 60_000);
  if (verifyWait) {
    res.setHeader('Retry-After', String(verifyWait));
    return sendError(res, 429, 'RATE_LIMITED', 'Too many attempts. Try again later.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM otp_challenges WHERE id=$1 FOR UPDATE', [challenge_id]);
    const challenge = result.rows[0];
    if (!challenge || challenge.consumed_at || challenge.invalidated_at || new Date(challenge.expires_at).getTime() <= Date.now() || challenge.attempts >= 5) {
      await client.query('ROLLBACK');
      return sendError(res, 401, 'INVALID_OTP', 'That code is invalid or expired. Request a new one.');
    }
    const supplied = Buffer.from(digest(`${challenge_id}:${code}`), 'hex');
    const expected = Buffer.from(challenge.otp_digest as string, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      await client.query('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1', [challenge_id]);
      await client.query('COMMIT');
      return sendError(res, 401, 'INVALID_OTP', 'That code is invalid or expired. Request a new one.');
    }
    const user = await client.query('INSERT INTO users(phone_e164) VALUES($1) ON CONFLICT(phone_e164) DO UPDATE SET phone_e164=EXCLUDED.phone_e164 RETURNING id,phone_e164', [challenge.phone_e164]);
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    await client.query('UPDATE otp_challenges SET consumed_at=now() WHERE id=$1', [challenge_id]);
    await client.query('INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)', [user.rows[0].id, tokenHash(rawToken), expiresAt]);
    await client.query('COMMIT');
    return res.json({ data: { token: rawToken, expires_at: expiresAt.toISOString(), user: { id: user.rows[0].id, phone_e164: user.rows[0].phone_e164 } } });
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { client.release(); }
});

async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return sendError(res, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
  try {
    const result = await pool.query('SELECT id,user_id FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()', [tokenHash(token)]);
    if (!result.rowCount) return sendError(res, 401, 'UNAUTHENTICATED', 'Your session expired. Sign in again.');
    req.sessionId = result.rows[0].id as string;
    req.userId = result.rows[0].user_id as string;
    next();
  } catch (error) { next(error); }
}

app.get('/v1/auth/me', authenticate, async (req, res) => {
  const result = await pool.query('SELECT id, phone_e164 FROM users WHERE id=$1', [req.userId]);
  res.json({ data: { user: result.rows[0], business_today: businessToday(), business_time_zone: 'Asia/Kolkata' } });
});
app.post('/v1/auth/logout', authenticate, async (req, res) => {
  await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [req.sessionId]);
  res.json({ data: { logged_out: true } });
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5, parts: 6 } });
function inspectImage(file?: Express.Multer.File): { mime: string; digest: string } | null {
  if (!file) return null;
  const b = file.buffer;
  let mime = '';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) mime = 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
  if (!mime || file.mimetype !== mime) throw Object.assign(new Error('Upload a JPEG, PNG or WebP receipt photo.'), { status: 422, code: 'INVALID_RECEIPT' });
  return { mime, digest: createHash('sha256').update(b).digest('hex') };
}

app.post('/v1/loans', authenticate, upload.single('receipt'), async (req, res) => {
  const parsed = createLoanSchema.safeParse({ friend_name: req.body.friend_name, amount_paise: req.body.amount_paise, due_on: req.body.due_on });
  if (!parsed.success) return sendError(res, 422, 'VALIDATION_ERROR', 'Check the highlighted fields.', Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0] ?? 'form'), issue.message])));
  if (!isCalendarDate(parsed.data.due_on)) return sendError(res, 422, 'VALIDATION_ERROR', 'Choose a valid due date.', { due_on: 'Choose a valid calendar date.' });
  const key = req.header('idempotency-key');
  if (!uuidV4Schema.safeParse(key).success) return sendError(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Save this entry again to generate a submission key.');
  let image: ReturnType<typeof inspectImage>;
  try { image = inspectImage(req.file); } catch (error) { return sendError(res, 422, 'INVALID_RECEIPT', (error as Error).message); }
  const data = parsed.data;
  const fingerprint = createHash('sha256').update(JSON.stringify({ ...data, receipt_sha256: image?.digest ?? null })).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lentOn = businessToday();
    const inserted = await client.query(
      `INSERT INTO loans(user_id,friend_name,amount_paise,due_on,lent_on,submission_key,payload_fingerprint,receipt_bytes,receipt_mime,receipt_size)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(user_id,submission_key) DO NOTHING
       RETURNING id,friend_name,amount_paise,currency,due_on,lent_on,status,repaid_on,receipt_size,created_at,updated_at`,
      [req.userId, data.friend_name, data.amount_paise, data.due_on, lentOn, key, fingerprint, req.file?.buffer ?? null, image?.mime ?? null, req.file?.size ?? null],
    );
    if (inserted.rowCount) {
      await client.query('COMMIT');
      return res.status(201).json({ data: loanJson(inserted.rows[0], businessToday()) });
    }
    const existing = await client.query('SELECT id,friend_name,amount_paise,currency,due_on,lent_on,status,repaid_on,receipt_size,created_at,updated_at,payload_fingerprint,deleted_at FROM loans WHERE user_id=$1 AND submission_key=$2', [req.userId, key]);
    await client.query('ROLLBACK');
    if (existing.rows[0]?.deleted_at) return sendError(res, 409, 'ENTRY_DELETED', 'This entry was deleted. Start a new entry to save it again.');
    if (existing.rows[0]?.payload_fingerprint !== fingerprint) return sendError(res, 409, 'IDEMPOTENCY_CONFLICT', 'This save key belongs to a different entry.');
    return res.json({ data: loanJson(existing.rows[0], businessToday()) });
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { client.release(); }
});

registerDashboard(app, authenticate);
registerDeleteLoan(app, authenticate, pool);

app.get('/v1/loans', authenticate, async (req, res) => {
  const page = Number(req.query.page ?? 1), limit = Number(req.query.limit ?? 20);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return sendError(res, 400, 'INVALID_PAGINATION', 'Page must be positive and limit must be 1–100.');
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(await getLoanPage(pool, req.userId!, businessToday(), page, limit));
});

app.patch('/v1/loans/:id/repay', authenticate, async (req, res) => {
  if (!uuidV4Schema.safeParse(req.params.id).success) return sendError(res, 404, 'NOT_FOUND', 'Entry not found.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const today = businessToday();
    const updated = await client.query("UPDATE loans SET status='repaid',repaid_on=$3,updated_at=now() WHERE id=$1 AND user_id=$2 AND status='pending' AND deleted_at IS NULL RETURNING *", [req.params.id, req.userId, today]);
    if (updated.rowCount) { await client.query('COMMIT'); return res.json({ data: loanJson(updated.rows[0], today) }); }
    const current = await client.query('SELECT status FROM loans WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL', [req.params.id, req.userId]);
    await client.query('ROLLBACK');
    if (!current.rowCount) return sendError(res, 404, 'NOT_FOUND', 'Entry not found.');
    return sendError(res, 409, 'ALREADY_REPAID', 'This entry has already been marked repaid.');
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { client.release(); }
});

app.get('/v1/loans/:id/receipt', authenticate, async (req, res) => {
  if (!uuidV4Schema.safeParse(req.params.id).success) return sendError(res, 404, 'NOT_FOUND', 'Receipt not found.');
  const result = await pool.query('SELECT receipt_bytes,receipt_mime FROM loans WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL', [req.params.id, req.userId]);
  if (!result.rowCount) return sendError(res, 404, 'NOT_FOUND', 'Receipt not found.');
  const row = result.rows[0];
  if (!row.receipt_bytes) return sendError(res, 404, 'NO_RECEIPT', 'This entry has no receipt photo.');
  res.setHeader('Content-Type', row.receipt_mime as string);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(row.receipt_bytes);
});

app.get('/v1/dashboard/summary', authenticate, async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: await getLedgerSummary(pool, req.userId!, businessToday()) });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError) return sendError(res, 422, 'UPLOAD_LIMIT', error.code === 'LIMIT_FILE_SIZE' ? 'Receipt must be 5 MB or smaller.' : 'Attach one receipt photo at a time.');
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 500;
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'INTERNAL_ERROR';
  if (status < 500) return sendError(res, status, code, (error as Error).message);
  console.error(`[API ERROR] request=${String(res.getHeader('X-Request-Id') ?? 'unknown')} code=${code}`);
  return sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Try again.');
});

export { app };
