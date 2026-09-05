/**
 * The process entry point: the only file with side effects at startup (listen, and a clean shutdown on Ctrl+C / SIGTERM).
 */
import { buildApp } from "./app.ts";
import { config } from "./config.ts";
import { db } from './db/knex.ts'
import { logger } from "./lib/logger.ts";


const server = buildApp().listen(config.PORT, () => logger.info(`Server is running on PORT:${config.PORT}`))

const shutdown = async () => {
  logger.info('Shutting Down')
  await db.destroy()
  server.close(() => process.exit(0))
}

process.once('SIGINT', shutdown)
process.once("SIGTERM", shutdown)

