import type { Express, RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { uuidV4Schema } from './validators.js';

export async function deleteOwnedLoan(db: Pool | PoolClient, id: string, userId: string): Promise<boolean> {
  const deleted = await db.query(
    `UPDATE loans SET deleted_at=now(),updated_at=now(),receipt_bytes=NULL,receipt_mime=NULL,receipt_size=NULL
     WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id`, [id, userId],
  );
  if (deleted.rowCount) return true;
  // Repeating an owned delete is safe after a lost response; foreign entries still look absent.
  const existing = await db.query('SELECT id FROM loans WHERE id=$1 AND user_id=$2 AND deleted_at IS NOT NULL', [id, userId]);
  return !!existing.rowCount;
}

export function registerDeleteLoan(app: Express, authenticate: RequestHandler, db: Pool | PoolClient) {
  app.delete('/v1/loans/:id', authenticate, async (req, res) => {
    const id = req.params.id;
    if (!uuidV4Schema.safeParse(id).success || !await deleteOwnedLoan(db, id as string, req.userId!)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Entry not found.' } });
      return;
    }
    res.json({ data: { id, deleted: true } });
  });
}
