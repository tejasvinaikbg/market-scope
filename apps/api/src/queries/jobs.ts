/**
 * All SQL for the jobs table: the in-database queue. claim() is the interesting one — one UPDATE that picks the oldest due
 * job and marks it running, with FOR UPDATE SKIP LOCKED so two workers can never take the same row.
 */
import { db, type Db } from '../db/knex.ts';
import { config } from '../config.ts';

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';
export interface JobRow {
  id: number;
  type: string;
  marketId: number | null;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  runAfter: Date;
  lastError: string | null;
}

const toJob = (r: Record<string, any>): JobRow => ({
  id: r.id,
  type: r.type,
  marketId: r.market_id,
  payload: r.payload,
  status: r.status,
  attempts: r.attempts,
  runAfter: r.run_after,
  lastError: r.last_error,
});

export const jobsQueries = {
  /** Queue a job. Called inside the transaction that creates the thing the job works on, so both exist or neither does. */
  async enqueue(type: string, marketId: number | null, payload: Record<string, unknown>, k: Db = db): Promise<number> {
    const [row] = await k('jobs').insert({ type, market_id: marketId, payload }).returning('id');
    return row.id;
  },

  /**
   * Take the oldest due job and mark it running, in one statement. SKIP LOCKED: a row another worker holds is passed over,
   * not waited for. A job still 'running' after JOB_STALE_MINUTES belongs to a worker that died mid-run; it is due again.
   */
  async claim(k: Db = db, staleMinutes = config.JOB_STALE_MINUTES): Promise<JobRow | null> {
    const { rows } = await k.raw(
      `
      UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = now()
       WHERE id = (SELECT id FROM jobs
                    WHERE (status = 'pending' AND run_after <= now())
                       OR (status = 'running' AND updated_at < now() - (? * interval '1 minute'))
                    ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING *`,
      [staleMinutes],
    );
    return rows[0] ? toJob(rows[0]) : null;
  },

  /** How deep the queue is: what an operator or an autoscaler reads. */
  async depth(k: Db = db): Promise<{ pending: number; running: number; failed: number }> {
    const rows = await k('jobs').select('status').count('* as n').groupBy('status');
    const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
    return { pending: by.pending ?? 0, running: by.running ?? 0, failed: by.failed ?? 0 };
  },

  async complete(id: number, k: Db = db): Promise<void> {
    await k('jobs').where({ id }).update({ status: 'done', updated_at: k.fn.now() });
  },

  /** Record a failure: try again after `retryInMs` (pending, with a later run_after), or park it as failed when null. */
  async fail(id: number, error: string, retryInMs: number | null, k: Db = db): Promise<void> {
    await k('jobs')
      .where({ id })
      .update({
        status: retryInMs == null ? 'failed' : 'pending',
        last_error: error.slice(0, 1000),
        run_after: retryInMs == null ? k.fn.now() : k.raw(`now() + (? * interval '1 millisecond')`, [retryInMs]),
        updated_at: k.fn.now(),
      });
  },

  async byId(id: number, k: Db = db): Promise<JobRow | null> {
    const r = await k('jobs').where({ id }).first();
    return r ? toJob(r) : null;
  },

  async forMarket(marketId: number, k: Db = db): Promise<JobRow[]> {
    return (await k('jobs').where({ market_id: marketId }).orderBy('id')).map(toJob);
  },
};
