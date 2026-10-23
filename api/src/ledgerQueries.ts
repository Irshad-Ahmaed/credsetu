import type { Pool, PoolClient } from 'pg';
import { isLoanOverdue } from './dates.js';

type Database = Pool | PoolClient;

export function loanJson(row: Record<string, unknown>, today: string) {
  return {
    id: row.id, friend_name: row.friend_name, amount_paise: String(row.amount_paise), currency: row.currency,
    due_on: row.due_on, lent_on: row.lent_on, status: row.status, repaid_on: row.repaid_on,
    is_overdue: isLoanOverdue(row.status, row.due_on, today),
    receipt_available: Boolean(row.receipt_size), created_at: row.created_at, updated_at: row.updated_at,
  };
}

export async function getLoanPage(db: Database, userId: string, today: string, page = 1, limit = 20) {
  const result = await db.query(
    `WITH ledger_state AS (
       SELECT COUNT(*)::text || ':' || (COUNT(*) FILTER(WHERE status='repaid'))::text || ':' ||
         (COUNT(*) FILTER(WHERE deleted_at IS NOT NULL))::text AS ledger_version FROM loans WHERE user_id=$1
     ), page_rows AS (
     SELECT id,friend_name,amount_paise,currency,due_on,lent_on,status,repaid_on,receipt_size,created_at,updated_at FROM loans WHERE user_id=$1 AND deleted_at IS NULL
     ORDER BY CASE WHEN status='pending' AND due_on<$2::date THEN 0 WHEN status='pending' THEN 1 ELSE 2 END,
       CASE WHEN status='pending' THEN due_on END ASC NULLS LAST, created_at DESC, id
     LIMIT $3 OFFSET $4)
     SELECT page_rows.*,ledger_state.ledger_version FROM ledger_state LEFT JOIN page_rows ON true
     ORDER BY CASE WHEN status='pending' AND due_on<$2::date THEN 0 WHEN status='pending' THEN 1 ELSE 2 END,
       CASE WHEN status='pending' THEN due_on END ASC NULLS LAST, created_at DESC, id`, [userId, today, limit + 1, (page - 1) * limit],
  );
  const rows = result.rows.filter((row) => row.id !== null);
  return {
    data: rows.slice(0, limit).map((row) => loanJson(row, today)),
    meta: { page, limit, has_more: rows.length > limit, ledger_version: result.rows[0].ledger_version,
      business_today: today, business_time_zone: 'Asia/Kolkata' },
  };
}

export async function getLedgerSummary(db: Database, userId: string, today: string) {
  const result = await db.query(
    `SELECT COUNT(*)::text || ':' || (COUNT(*) FILTER(WHERE status='repaid'))::text || ':' ||
         (COUNT(*) FILTER(WHERE deleted_at IS NOT NULL))::text ledger_version,
       COALESCE(SUM(amount_paise) FILTER(WHERE deleted_at IS NULL),0)::text total_lent_paise,
       COALESCE(SUM(amount_paise) FILTER(WHERE status='repaid' AND deleted_at IS NULL),0)::text total_repaid_paise,
       COALESCE(SUM(amount_paise) FILTER(WHERE status='pending' AND deleted_at IS NULL),0)::text total_pending_paise,
       COALESCE(SUM(amount_paise) FILTER(WHERE status='pending' AND due_on<$2::date AND deleted_at IS NULL),0)::text total_overdue_paise
     FROM loans WHERE user_id=$1`, [userId, today],
  );
  return { ...result.rows[0], business_today: today, business_time_zone: 'Asia/Kolkata' };
}
