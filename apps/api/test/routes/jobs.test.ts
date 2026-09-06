/** The queue against the real database: claim marks running, done and failure are recorded, retries wait, then the job is parked. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../src/db/knex.ts';
import { jobsQueries } from '../../src/queries/jobs.ts';
import { createJobRunner } from '../../src/jobs/runner.ts';

const created: number[] = [];
after(async () => { if (created.length) await db('jobs').whereIn('id', created).del(); await db.destroy(); });
const enqueue = async (type: string) => { const id = await jobsQueries.enqueue(type, null, { hello: 'world' }); created.push(id); return id; };

test('a job is claimed once, run, and marked done', async () => {
  const id = await enqueue('test.ok');
  const seen: unknown[] = [];
  const runner = createJobRunner({ 'test.ok': async (payload) => { seen.push(payload); } });
  assert.equal(await runner.runOnce(), true);
  assert.deepEqual(seen, [{ hello: 'world' }]);
  assert.equal((await jobsQueries.byId(id))?.status, 'done');
});

test('a failing job is retried with a delay, and parked as failed after the last attempt', async () => {
  const id = await enqueue('test.fail');
  let calls = 0;
  const runner = createJobRunner({ 'test.fail': async () => { calls++; throw new Error(`boom ${calls}`); } }, { maxAttempts: 2, retryDelayMs: () => 0 });
  await runner.runOnce();
  const afterFirst = (await jobsQueries.byId(id))!;
  assert.deepEqual([afterFirst.status, afterFirst.attempts, afterFirst.lastError], ['pending', 1, 'boom 1']);   // back in the queue
  await runner.runOnce();
  const afterSecond = (await jobsQueries.byId(id))!;
  assert.deepEqual([afterSecond.status, afterSecond.attempts, afterSecond.lastError], ['failed', 2, 'boom 2']);   // parked
  assert.equal(await runner.runOnce(), false);                                                                       // nothing due
});

test('a job left running by a dead worker is taken over once it is stale', async () => {
  const id = await enqueue('test.stale');
  await db('jobs').where({ id }).update({ status: 'running', attempts: 1, updated_at: db.raw("now() - interval '20 minutes'") });
  assert.equal(await jobsQueries.claim(db, 60), null);                                                          // not stale yet at a 60-minute threshold
  const reclaimed = await jobsQueries.claim(db, 15);
  assert.deepEqual([reclaimed?.id, reclaimed?.status, reclaimed?.attempts], [id, 'running', 2]);
  await jobsQueries.complete(id);
});

test('a job of a type nobody handles is parked at once, and a retry is not due before its time', async () => {
  const id = await enqueue('test.unknown');
  await createJobRunner({}).runOnce();
  assert.match((await jobsQueries.byId(id))?.lastError ?? '', /no handler/);
  const later = await enqueue('test.later');
  await createJobRunner({ 'test.later': async () => { throw new Error('x'); } }, { retryDelayMs: () => 60_000 }).runOnce();
  assert.equal((await jobsQueries.byId(later))?.status, 'pending');
  assert.equal(await createJobRunner({ 'test.later': async () => { } }).runOnce(), false);                           // run_after is a minute away
});