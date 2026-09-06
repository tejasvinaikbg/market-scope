/**
 * The worker: polls the jobs table, runs due jobs one at a time, records each outcome. It runs inside the API process today
 * (server.ts starts it); because claim() uses SKIP LOCKED, a second process running the same loop would share the queue safely.
 */
import { jobsQueries, type JobRow } from '../queries/jobs.ts';

export type JobHandler = (payload: Record<string, unknown>, job: JobRow) => Promise<unknown>;
export interface RunnerOptions {
  pollMs?: number; // how often to look for due jobs
  maxAttempts?: number; // after this many failures the job is parked as failed
  retryDelayMs?: (attempt: number) => number; // how long to wait before attempt n + 1
  log?: (message: string, meta?: Record<string, unknown>) => void;
}

export function createJobRunner(handlers: Record<string, JobHandler>, opts: RunnerOptions = {}) {
  const pollMs = opts.pollMs ?? 2000;
  const maxAttempts = opts.maxAttempts ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? ((attempt) => 30_000 * attempt); // 30 s, then 60 s, then parked
  const log = opts.log ?? (() => {});
  let timer: NodeJS.Timeout | null = null;
  let busy = false;

  /** Claim and run one due job. Returns false when there was nothing to do. */
  async function runOnce(): Promise<boolean> {
    const job = await jobsQueries.claim();
    if (!job) return false;
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`no handler for job type "${job.type}"`);
      await handler(job.payload, job);
      await jobsQueries.complete(job.id);
      log('job done', { id: job.id, type: job.type, attempt: job.attempts });
    } catch (err) {
      const message = (err as Error).message;
      const retry = handler && job.attempts < maxAttempts ? retryDelayMs(job.attempts) : null; // an unknown type is never retried
      await jobsQueries.fail(job.id, message, retry);
      log('job failed', { id: job.id, type: job.type, attempt: job.attempts, retryInMs: retry, error: message });
    }
    return true;
  }

  /** One poll: drain everything that is due, one job at a time. Never overlaps with itself. */
  async function tick(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      while (await runOnce()) {
        /* keep draining */
      }
    } catch (err) {
      log('job runner error', { error: (err as Error).message });
    } finally {
      // the queue itself failed (e.g. database down); the next tick retries
      busy = false;
    }
  }

  return {
    runOnce,
    start() {
      if (!timer) {
        timer = setInterval(() => {
          void tick();
        }, pollMs);
        void tick();
      }
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
