/**
 * The worker as its own process: the job runner and nothing else — no HTTP. Locally one process runs both (server.ts with
 * JOBS=on); deployed, the API instances run with JOBS=off and one or more of these take the queue. Same code, same
 * database, and because claim() uses SKIP LOCKED, several of them share the queue safely.
 */
import { config } from './config.ts';
import { db } from './db/knex.ts';
import { logger } from './lib/logger.ts';
import { createJobRunner } from './jobs/runner.ts';
import { MARKET_PIPELINE, runPipeline } from './jobs/pipeline.ts';

const jobs = createJobRunner(
  { [MARKET_PIPELINE]: ({ marketId }) => runPipeline(Number(marketId)) },
  { log: (message, meta) => logger.info(meta ?? {}, message) },
);
jobs.start();
logger.info(`Worker started (places: ${config.PLACES}, geocoder: ${config.GEOCODER})`);

const shutdown = async () => {
  logger.info('Worker shutting down');
  jobs.stop();
  await db.destroy();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
