import pg from 'pg';
import { config } from '../config.js';

// Keep BIGINT and NUMERIC values as strings; JavaScript Number cannot represent all totals exactly.
pg.types.setTypeParser(20, (value) => value);
pg.types.setTypeParser(1700, (value) => value);
// PostgreSQL DATE is a calendar day, not an instant. Keep it as YYYY-MM-DD
// so comparisons and JSON payloads do not depend on the API host timezone.
pg.types.setTypeParser(1082, (value) => value);

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});
