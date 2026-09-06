/**
 * The process entry point: the only file with side effects at startup — listen, start the job runner, and a clean
 * shutdown on Ctrl+C / SIGTERM (stop taking jobs, close the database, close the server).
 */
import { buildApp } from './app.ts';
import { config } from './config.ts';
import { db } from './db/knex.ts';
import { logger } from './lib/logger.ts';
import { createJobRunner } from './jobs/runner.ts';
import { MARKET_PIPELINE, runPipeline } from './jobs/pipeline.ts';

const server = buildApp().listen(config.PORT, () => logger.info(`Server is running on PORT:${config.PORT}`));

// The worker lives in this process for now. JOBS=off keeps the API answering without running any discovery.
const jobs = createJobRunner(
  { [MARKET_PIPELINE]: ({ marketId }) => runPipeline(Number(marketId)) },
  { log: (message, meta) => logger.info(meta ?? {}, message) },
);
if (config.JOBS === 'on') jobs.start();

const shutdown = async () => {
  logger.info('Shutting Down');
  jobs.stop();
  await db.destroy();
  server.close(() => process.exit(0));
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
