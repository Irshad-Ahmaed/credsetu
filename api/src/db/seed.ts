import { randomUUID } from 'node:crypto';
import { pool } from './pool.js';
import { businessToday } from '../dates.js';

const today = businessToday();
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const demoUsers = [
      { phone: '+919999000001', entries: [
        ['Amit Kumar', '10000', shift(today, -1), 'pending'],
        ['Sana Khan', '15000', today, 'pending'],
        ['Priya Shah', '20000', shift(today, 1), 'pending'],
        ['Rohan Mehta', '5000', shift(today, -2), 'repaid'],
      ] },
      { phone: '+919999000002', entries: [
        ['Neha Verma', '8000', shift(today, -3), 'pending'],
        ['Kabir Rao', '12000', shift(today, 2), 'pending'],
      ] },
    ] as const;

    for (const demo of demoUsers) {
      const user = await client.query('INSERT INTO users(phone_e164) VALUES($1) ON CONFLICT(phone_e164) DO UPDATE SET phone_e164 = EXCLUDED.phone_e164 RETURNING id', [demo.phone]);
      const userId = user.rows[0].id as string;
      await client.query('DELETE FROM loans WHERE user_id = $1', [userId]);
      for (const [name, amount, due, status] of demo.entries) {
        await client.query(
          `INSERT INTO loans(user_id, friend_name, amount_paise, due_on, lent_on, status, repaid_on, submission_key, payload_fingerprint)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [userId, name, amount, due, today, status, status === 'repaid' ? today : null, randomUUID(), `seed:${demo.phone}:${name}`],
        );
      }
      console.log(`Seeded ${demo.phone} (${demo.entries.length} entries).`);
    }
    await client.query('COMMIT');
    console.log('Sign in with either demo number and read its OTP from the API terminal.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
