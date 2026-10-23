import type { Express, RequestHandler } from 'express';
import { pool } from './db/pool.js';
import { businessToday } from './dates.js';
import { getLedgerSummary, getLoanPage } from './ledgerQueries.js';

export function registerDashboard(app: Express, authenticate: RequestHandler) {
  app.get('/v1/dashboard', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      // Both queries see the same committed data, including during concurrent repayments.
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const today = businessToday();
      const summary = await getLedgerSummary(client, req.userId!, today);
      const entries = await getLoanPage(client, req.userId!, today);
      await client.query('COMMIT');
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ data: { summary, entries } });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  });
}
