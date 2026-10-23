import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';

const port = config.API_PORT;
const server = app.listen(port, '0.0.0.0', () => console.log(`MiniLedger API listening on http://0.0.0.0:${port}`));

async function shutdown(signal: string) {
  console.log(`${signal}: shutting down MiniLedger API…`);
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
